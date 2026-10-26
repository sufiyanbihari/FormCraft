import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileKey, fileName, fileSize, mimeType, formId: formIdRaw, directUrl } = body;

    if (!fileKey || typeof fileKey !== 'string') {
      return NextResponse.json({ error: 'fileKey is required' }, { status: 400 });
    }

    const user = await getAuthUserFromRequest(request);

    // Validate formId if provided (supports Form.id and Form.publicId)
    let validFormId: string | null = null;
    if (
      formIdRaw &&
      typeof formIdRaw === 'string' &&
      formIdRaw.trim() !== '' &&
      formIdRaw !== 'undefined' &&
      formIdRaw !== 'null'
    ) {
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

    const publicUrl = `/uploads/${fileKey}`;

    // Create or update uploadedFile record in database
    const fileRecord = await prisma.uploadedFile.upsert({
      where: { fileKey },
      create: {
        formId: validFormId,
        fileName: fileName || fileKey,
        fileKey,
        fileSize: typeof fileSize === 'number' ? fileSize : 0,
        mimeType: mimeType || 'application/octet-stream',
        publicUrl,
        uploadedByUserId: user?.id || null,
      },
      update: {
        formId: validFormId,
        fileName: fileName || fileKey,
        fileSize: typeof fileSize === 'number' ? fileSize : 0,
        mimeType: mimeType || 'application/octet-stream',
        publicUrl,
      },
    });

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
        fileName: fileRecord.fileName,
        fileSize: fileRecord.fileSize,
        mimeType: fileRecord.mimeType,
        publicUrl: fileRecord.publicUrl,
        directUrl: directUrl || publicUrl,
      },
    });

    return NextResponse.json({
      success: true,
      file: fileRecord,
      publicUrl,
      directUrl: directUrl || publicUrl,
      fileName: fileRecord.fileName,
      fileSize: fileRecord.fileSize,
      mimeType: fileRecord.mimeType,
    });
  } catch (err: any) {
    console.error('[Upload Complete] Error completing upload record:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to complete upload' },
      { status: 500 }
    );
  }
}
