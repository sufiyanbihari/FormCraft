import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { verifyAuditAuthFromRequest } from '@/lib/auth/auditAuth';
import {
  migrateLocalFilesToStorage,
  getActiveStorageProvider,
  ensureDatabaseStorageTable,
} from '@/lib/storage/fileStorage';
import { prisma } from '@/lib/db/prisma';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    const isAuditAuth = verifyAuditAuthFromRequest(request);

    if (user?.role !== 'ADMIN' && !isAuditAuth) {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    await ensureDatabaseStorageTable();
    const provider = getActiveStorageProvider();
    const dbUploadedFilesCount = await prisma.uploadedFile.count();

    let dbStoredFilesCount = 0;
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
        `SELECT COUNT(*) as count FROM uploaded_file_data`
      );
      dbStoredFilesCount = Number(rows[0]?.count || 0);
    } catch {}

    return NextResponse.json({
      activeProvider: provider,
      dbUploadedFilesCount,
      dbStoredFilesCount,
      status: 'ready',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to get storage status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    const isAuditAuth = verifyAuditAuthFromRequest(request);

    if (user?.role !== 'ADMIN' && !isAuditAuth) {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const summary = await migrateLocalFilesToStorage();
    return NextResponse.json({
      success: true,
      activeProvider: getActiveStorageProvider(),
      summary,
    });
  } catch (error: any) {
    console.error('Storage migration endpoint failed:', error);
    return NextResponse.json({ error: error?.message || 'Storage migration failed' }, { status: 500 });
  }
}
