import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { sanitizeSpreadsheetField } from '@/lib/utils';
import { verifyAuditAuthFromRequest } from '@/lib/auth/auditAuth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin privileges required' }, { status: 403 });
    }

    if (!verifyAuditAuthFromRequest(request)) {
      return NextResponse.json(
        { error: 'Password protection required for audit logs', requiresPassword: true },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const category = searchParams.get('category')?.trim().toUpperCase() || 'ALL';
    const status = searchParams.get('status')?.trim().toUpperCase() || 'ALL';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const whereConditions: Prisma.Sql[] = [];

    if (category !== 'ALL') {
      whereConditions.push(Prisma.sql`l.details->>'category' = ${category}`);
    }

    if (status !== 'ALL') {
      whereConditions.push(Prisma.sql`l.details->>'status' = ${status}`);
    }

    if (startDate) {
      whereConditions.push(Prisma.sql`l."createdAt" >= ${new Date(startDate)}`);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push(Prisma.sql`l."createdAt" <= ${end}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      whereConditions.push(Prisma.sql`(
        l.action ILIKE ${pattern} OR
        u.name ILIKE ${pattern} OR
        u.email ILIKE ${pattern} OR
        f.title ILIKE ${pattern} OR
        l.details->>'userEmail' ILIKE ${pattern} OR
        l.details->>'userName' ILIKE ${pattern} OR
        l.details->>'formTitle' ILIKE ${pattern} OR
        l.details->>'summary' ILIKE ${pattern} OR
        l.details->>'ipAddress' ILIKE ${pattern}
      )`);
    }

    const whereClause =
      whereConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`
        : Prisma.empty;

    const rawRows = await prisma.$queryRaw<
      Array<{
        id: string;
        formId: string | null;
        userId: string | null;
        action: string;
        details: any;
        createdAt: Date;
        userName: string | null;
        userEmail: string | null;
        userRole: string | null;
        formTitle: string | null;
      }>
    >`
      SELECT
        l.id,
        l."formId",
        l."userId",
        l.action,
        l.details,
        l."createdAt",
        u.name as "userName",
        u.email as "userEmail",
        u.role as "userRole",
        f.title as "formTitle"
      FROM form_audit_logs l
      LEFT JOIN users u ON l."userId" = u.id
      LEFT JOIN forms f ON l."formId" = f.id
      ${whereClause}
      ORDER BY l."createdAt" DESC
      LIMIT 5000;
    `;

    const headers = [
      'Log ID',
      'Timestamp (UTC)',
      'Action',
      'Category',
      'Status',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Form Title',
      'Form ID',
      'IP Address',
      'User Agent',
      'Details (JSON)',
    ];

    const rows = rawRows.map((log) => {
      const details = (log.details as Record<string, any>) || {};
      const actorName = log.userName || details.userName || 'Anonymous Respondent';
      const actorEmail = log.userEmail || details.userEmail || 'N/A';
      const actorRole = log.userRole || details.userRole || 'ANONYMOUS';
      const formTitle = log.formTitle || details.formTitle || 'N/A';
      const formId = log.formId || details.deletedFormId || 'N/A';
      const ipAddress = details.ipAddress || '127.0.0.1';
      const userAgent = details.userAgent || 'Direct';
      const categoryVal = details.category || 'FORM';
      const statusVal = details.status || 'SUCCESS';

      return [
        log.id,
        log.createdAt.toISOString(),
        log.action,
        categoryVal,
        statusVal,
        actorName,
        actorEmail,
        actorRole,
        formTitle,
        formId,
        ipAddress,
        userAgent,
        JSON.stringify(details),
      ];
    });

    const csvRows = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const sanitized = sanitizeSpreadsheetField(cell);
            return `"${sanitized.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ];

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const timestamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="formcraft_audit_logs_${timestamp}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Failed to export audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to export audit logs', details: error?.message },
      { status: 500 }
    );
  }
}
