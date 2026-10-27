import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';
import {
  ensureDatabaseStorageTable,
  saveToDatabase,
  saveToS3,
  saveToVercelBlob,
  getEffectiveUploadDir,
} from '@/lib/storage/fileStorage';

export const maxDuration = 300;

/**
 * Chunked Upload Endpoint (/api/uploads/chunk)
 * Bypasses Vercel 4.5MB Serverless Body Limit by accepting sliced chunks (3MB each),
 * storing them temporarily, and atomically reassembling them once all parts are received.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunkBlob = formData.get('chunk') as File | null;
    const fileKey = (formData.get('fileKey') as string | null)?.trim();
    const fileName = (formData.get('fileName') as string | null)?.trim() || 'uploaded_file';
    const mimeType = (formData.get('mimeType') as string | null)?.trim() || 'application/octet-stream';
    const chunkIndexStr = formData.get('chunkIndex') as string | null;
    const totalChunksStr = formData.get('totalChunks') as string | null;
    const formIdRaw = formData.get('formId') as string | null;

    if (!chunkBlob || !fileKey || chunkIndexStr === null || totalChunksStr === null) {
      return NextResponse.json(
        { error: 'Missing required parameters: chunk, fileKey, chunkIndex, totalChunks' },
        { status: 400 }
      );
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const totalChunks = parseInt(totalChunksStr, 10);

    if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks) {
      return NextResponse.json(
        { error: `Invalid chunk coordinates: index ${chunkIndexStr} of ${totalChunksStr}` },
        { status: 400 }
      );
    }

    // Ensure database chunk table exists
    await ensureDatabaseStorageTable();

    // Read chunk bytes
    const arrayBuffer = await chunkBlob.arrayBuffer();
    const chunkBuffer = Buffer.from(arrayBuffer);

    // Store chunk in PostgreSQL table
    await prisma.$executeRawUnsafe(
      `INSERT INTO uploaded_file_chunks (file_key, chunk_index, total_chunks, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (file_key, chunk_index) DO UPDATE SET data = $4`,
      fileKey,
      chunkIndex,
      totalChunks,
      chunkBuffer
    );

    // Check count of chunks currently uploaded for this fileKey
    const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*)::int as count FROM uploaded_file_chunks WHERE file_key = $1`,
      fileKey
    );
    const chunkCount = Number(countRows?.[0]?.count || 0);

    // If still waiting for more chunks, return interim success
    if (chunkCount < totalChunks) {
      return NextResponse.json({
        success: true,
        isComplete: false,
        fileKey,
        chunkIndex,
        chunkCount,
        totalChunks,
      });
    }

    // ------------------------------------------------------------------
    // ALL CHUNKS RECEIVED: Reassemble and finalize file
    // ------------------------------------------------------------------
    const allChunks = await prisma.$queryRawUnsafe<Array<{ chunk_index: number; data: Buffer }>>(
      `SELECT chunk_index, data FROM uploaded_file_chunks WHERE file_key = $1 ORDER BY chunk_index ASC`,
      fileKey
    );

    if (allChunks.length < totalChunks) {
      return NextResponse.json({
        success: true,
        isComplete: false,
        fileKey,
        chunkIndex,
        chunkCount: allChunks.length,
        totalChunks,
      });
    }

    const chunkBuffers = allChunks.map((row) =>
      Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data)
    );
    const fullBuffer = Buffer.concat(chunkBuffers);

    // 1. Primary storage: Persist full file in uploaded_file_data (PostgreSQL)
    await saveToDatabase(fileKey, fileName, fullBuffer, mimeType);

    // 2. Also try writing to local disk cache (non-critical on serverless)
    try {
      const uploadDir = await getEffectiveUploadDir();
      await fs.writeFile(path.join(uploadDir, fileKey), fullBuffer);
    } catch {}

    // 3. If S3 configured, upload to S3 bucket
    let directUrl: string | undefined = undefined;
    if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) {
      try {
        directUrl = await saveToS3(fileKey, fullBuffer, mimeType);
      } catch (s3Err) {
        console.warn('[Chunk Upload] S3 persistence warning:', s3Err);
      }
    }

    // 4. If Vercel Blob configured, upload to Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        directUrl = await saveToVercelBlob(fileKey, fullBuffer, mimeType);
      } catch (blobErr) {
        console.warn('[Chunk Upload] Vercel Blob persistence warning:', blobErr);
      }
    }

    // Resolve optional formId
    let validFormId: string | null = null;
    if (formIdRaw && formIdRaw !== 'undefined' && formIdRaw !== 'null' && formIdRaw.trim() !== '') {
      const trimmed = formIdRaw.trim();
      const existingForm = await prisma.form.findFirst({
        where: {
          OR: [{ id: trimmed }, { publicId: trimmed }],
        },
        select: { id: true },
      });
      if (existingForm) {
        validFormId = existingForm.id;
      }
    }

    const user = await getAuthUserFromRequest(request);
    const publicUrl = `/uploads/${fileKey}`;

    // Register file record in database
    const fileRecord = await prisma.uploadedFile.upsert({
      where: { fileKey },
      create: {
        formId: validFormId,
        fileName,
        fileKey,
        fileSize: fullBuffer.length,
        mimeType,
        publicUrl,
        uploadedByUserId: user?.id || null,
      },
      update: {
        formId: validFormId,
        fileName,
        fileSize: fullBuffer.length,
        mimeType,
        publicUrl,
      },
    });

    // Clean up temporary chunks now that full file is safely assembled
    await prisma.$executeRawUnsafe(
      `DELETE FROM uploaded_file_chunks WHERE file_key = $1`,
      fileKey
    ).catch(() => {});

    // Clean up any abandoned chunks older than 24 hours
    await prisma.$executeRawUnsafe(
      `DELETE FROM uploaded_file_chunks WHERE created_at < NOW() - INTERVAL '24 hours'`
    ).catch(() => {});

    // Audit log
    await logActivity({
      action: 'FILE_UPLOAD',
      category: 'FILE',
      status: 'SUCCESS',
      formId: validFormId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name,
      userRole: user?.role,
      req: request,
      details: {
        fileName,
        fileSize: fullBuffer.length,
        mimeType,
        publicUrl,
        mode: 'chunked',
        totalChunks,
      },
    });

    return NextResponse.json({
      success: true,
      isComplete: true,
      file: fileRecord,
      publicUrl,
      directUrl: directUrl || publicUrl,
      fileName,
      fileSize: fullBuffer.length,
      mimeType,
    });
  } catch (error: any) {
    console.error('[Chunk Upload] Error handling chunk:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process file chunk' },
      { status: 500 }
    );
  }
}
