import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { verifyAuditAuthFromRequest } from '@/lib/auth/auditAuth';
import { getSessionInactivityTimeoutMs } from '@/lib/auth/sessionConfig';

export async function GET(request: NextRequest) {
  const INACTIVITY_TIMEOUT_MS = getSessionInactivityTimeoutMs();
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
        { error: 'Password verification required for session administration', requiresPassword: true },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const statusFilter = searchParams.get('status')?.trim().toUpperCase() || 'ALL';
    const deviceFilter = searchParams.get('device')?.trim() || 'ALL';
    const roleFilter = searchParams.get('role')?.trim().toUpperCase() || 'ALL';
    const sortBy = searchParams.get('sortBy') === 'loginAt' ? 'loginAt' : 'lastActiveAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const now = new Date();
    const cutoff = new Date(now.getTime() - INACTIVITY_TIMEOUT_MS);

    // Build Prisma where filter
    const where: any = {};

    if (roleFilter !== 'ALL') {
      where.userRole = roleFilter;
    }

    if (deviceFilter !== 'ALL') {
      where.deviceType = deviceFilter;
    }

    if (statusFilter === 'ACTIVE') {
      where.status = 'ACTIVE';
      where.lastActiveAt = { gte: cutoff };
      where.expiresAt = { gt: now };
    } else if (statusFilter === 'EXPIRED') {
      where.OR = [
        { status: 'EXPIRED' },
        { status: 'ACTIVE', lastActiveAt: { lt: cutoff } },
        { status: 'ACTIVE', expiresAt: { lte: now } },
      ];
    } else if (statusFilter === 'LOGGED_OUT') {
      where.status = 'LOGGED_OUT';
    } else if (statusFilter === 'TERMINATED') {
      where.status = 'TERMINATED';
    }

    if (search) {
      where.OR = [
        { userName: { contains: search, mode: 'insensitive' } },
        { userEmail: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { browser: { contains: search, mode: 'insensitive' } },
        { os: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rawSessions, activeCount] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
      }),
      // Authoritative count of currently active sessions across all devices
      prisma.session.count({
        where: {
          status: 'ACTIVE',
          lastActiveAt: { gte: cutoff },
          expiresAt: { gt: now },
        },
      }),
    ]);

    const formattedSessions = rawSessions.map((s) => {
      let computedStatus = s.status;
      if (s.status === 'ACTIVE') {
        const isExpired = s.lastActiveAt < cutoff || s.expiresAt <= now;
        if (isExpired) {
          computedStatus = 'EXPIRED';
        }
      }

      return {
        id: s.id,
        userId: s.userId,
        userName: s.userName || 'Administrator',
        userEmail: s.userEmail || '',
        userRole: s.userRole,
        ipAddress: s.ipAddress || '127.0.0.1',
        deviceType: s.deviceType || 'Desktop',
        browser: s.browser || 'Unknown',
        os: s.os || 'Unknown',
        userAgent: s.userAgent || '',
        status: computedStatus,
        loginAt: s.loginAt.toISOString(),
        lastActiveAt: s.lastActiveAt.toISOString(),
        logoutAt: s.logoutAt ? s.logoutAt.toISOString() : null,
        expiresAt: s.expiresAt.toISOString(),
      };
    });

    return NextResponse.json({
      sessions: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        activeSessionsCount: activeCount,
        totalSessionsCount: total,
      },
    });
  } catch (error) {
    console.error('Failed to query sessions:', error);
    return NextResponse.json({ error: 'Failed to retrieve sessions' }, { status: 500 });
  }
}
