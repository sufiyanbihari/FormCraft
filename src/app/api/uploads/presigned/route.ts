import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { createPresignedUploadUrl } from '@/lib/storage/fileStorage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileSize, mimeType, formId: formIdRaw, maxSizeMb } = body;

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json({ error: 'Valid fileSize in bytes is required' }, { status: 400 });
    }

    const user = await getAuthUserFromRequest(request);

    // Validate formId if supplied (supports Form.id and Form.publicId)
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
        select: { id: true, ownerId: true },
      });
      if (existingForm) {
        validFormId = existingForm.id;
      }
    }

    const presigned = await createPresignedUploadUrl({
      fileName,
      fileSize,
      mimeType: mimeType || '',
      maxSizeMb: maxSizeMb ? Number(maxSizeMb) : undefined,
    });

    return NextResponse.json({
      success: true,
      ...presigned,
      formId: validFormId,
    });
  } catch (err: any) {
    console.error('[Presigned Upload] Error generating upload URL:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate signed upload URL' },
      { status: 400 }
    );
  }
}
