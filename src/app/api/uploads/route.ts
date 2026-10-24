import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { saveUploadedFile } from '@/lib/storage/fileStorage';
import { logActivity } from '@/lib/audit/auditLogger';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const formIdRaw = (formData.get('formId') as string) || null;
    const maxSizeMbRaw = formData.get('maxSizeMb');
    const maxSizeMb = maxSizeMbRaw ? Number(maxSizeMbRaw) : undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided in request' }, { status: 400 });
    }

    const user = await getAuthUserFromRequest(request);

    // Safely resolve valid formId if provided (supports both Form.id and Form.publicId)
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

    const saved = await saveUploadedFile(file, maxSizeMb);

    const fileRecord = await prisma.uploadedFile.create({
      data: {
        formId: validFormId,
        fileName: saved.fileName,
        fileKey: saved.fileKey,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        publicUrl: saved.publicUrl,
        uploadedByUserId: user?.id || null,
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
        fileName: saved.fileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        publicUrl: saved.publicUrl,
      },
    });

    return NextResponse.json({
      file: fileRecord,
      publicUrl: saved.publicUrl,
      fileName: saved.fileName,
      fileSize: saved.fileSize,
      mimeType: saved.mimeType,
    });
  } catch (error: any) {
    console.error('File upload failed:', error);
    await logActivity({
      action: 'FILE_UPLOAD_FAILED',
      category: 'FILE',
      status: 'FAILED',
      req: request,
      details: {
        error: error?.message || 'File upload failed',
      },
    });
    return NextResponse.json(
      { error: error?.message || 'File upload failed' },
      { status: 500 }
    );
  }
}
