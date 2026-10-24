import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/auth/session';
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
        {
          error: 'Password protection required to access audit logs.',
          requiresPassword: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const category = searchParams.get('category')?.trim().toUpperCase() || 'ALL';
    const status = searchParams.get('status')?.trim().toUpperCase() || 'ALL';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build parameterized conditions
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

    // Fetch total matching records and current page
    const [countResult, rawRows] = await Promise.all([
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int as total
        FROM form_audit_logs l
        LEFT JOIN users u ON l."userId" = u.id
        LEFT JOIN forms f ON l."formId" = f.id
        ${whereClause};
      `,
      prisma.$queryRaw<
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
          userAvatarUrl: string | null;
          formTitle: string | null;
          formPublicId: string | null;
          formStatus: string | null;
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
          u."avatarUrl" as "userAvatarUrl",
          f.title as "formTitle",
          f."publicId" as "formPublicId",
          f.status as "formStatus"
        FROM form_audit_logs l
        LEFT JOIN users u ON l."userId" = u.id
        LEFT JOIN forms f ON l."formId" = f.id
        ${whereClause}
        ORDER BY l."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset};
      `,
    ]);

    const total = countResult[0]?.total || 0;

    // Calculate system-wide KPIs
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [allLogsCountRes, todayCountRes, distinctUsersRes, securityCountRes] = await Promise.all([
      prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int as count FROM form_audit_logs;`,
      prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int as count FROM form_audit_logs WHERE "createdAt" >= ${startOfToday};`,
      prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(DISTINCT "userId")::int as count FROM form_audit_logs WHERE "userId" IS NOT NULL;`,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM form_audit_logs
        WHERE details->>'status' = 'FAILED'
           OR details->>'category' = 'SECURITY'
           OR action ILIKE '%FAILED%';
      `,
    ]);

    const formattedLogs = rawRows.map((row) => {
      const details = (row.details as Record<string, any>) || {};
      return {
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        category: details.category || 'FORM',
        status: details.status || 'SUCCESS',
        ipAddress: details.ipAddress || '127.0.0.1',
        userAgent: details.userAgent || 'Direct / API',
        user: {
          id: row.userId,
          name: row.userName || details.userName || 'Anonymous Respondent',
          email: row.userEmail || details.userEmail || null,
          role: row.userRole || details.userRole || null,
          avatarUrl: row.userAvatarUrl || null,
        },
        form: {
          id: row.formId || details.deletedFormId || null,
          title: row.formTitle || details.formTitle || null,
          publicId: row.formPublicId || details.publicId || null,
          status: row.formStatus || null,
        },
        details,
      };
    });

    return NextResponse.json({
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        totalLogs: allLogsCountRes[0]?.count || 0,
        todayLogs: todayCountRes[0]?.count || 0,
        activeUsersCount: distinctUsersRes[0]?.count || 0,
        securityAlertsCount: securityCountRes[0]?.count || 0,
      },
    });
  } catch (error: any) {
    console.error('Failed to fetch admin audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
        {
          error: 'Password protection required to reset audit logs.',
          requiresPassword: true,
        },
        { status: 403 }
      );
    }

    const result = await prisma.formAuditLog.deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Successfully reset and deleted ${result.count} audit logs.`,
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error('Failed to reset audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to reset audit logs' },
      { status: 500 }
    );
  }
}
