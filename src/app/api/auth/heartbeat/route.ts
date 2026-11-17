import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { broadcastSessionEvent } from '@/lib/audit/auditEventBroker';
import { getSessionInactivityTimeoutMs } from '@/lib/auth/sessionConfig';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.sessionId) {
      // Legacy session without explicit database record - treat as valid user session
      return NextResponse.json({ valid: true, legacy: true });
    }

    const session = await prisma.session.findUnique({
      where: { id: user.sessionId },
    });

    if (!session) {
      return NextResponse.json({ valid: false, status: 'NOT_FOUND' }, { status: 401 });
    }

    if (session.status === 'TERMINATED' || session.status === 'LOGGED_OUT') {
      return NextResponse.json(
        { valid: false, status: session.status, error: `Session has been ${session.status.toLowerCase()}` },
        { status: 401 }
      );
    }

    const now = new Date();
    // Update last activity timestamp on this session
    const updated = await prisma.session.update({
      where: { id: session.id },
      data: {
        lastActiveAt: now,
        status: 'ACTIVE',
      },
    });

    // Compute active sessions count (within inactivity window)
    const cutoff = new Date(now.getTime() - getSessionInactivityTimeoutMs());
    const activeSessionsCount = await prisma.session.count({
      where: {
        status: 'ACTIVE',
        lastActiveAt: { gte: cutoff },
        expiresAt: { gt: now },
      },
    });

    broadcastSessionEvent('SESSION_UPDATED', {
      session: {
        id: updated.id,
        userId: user.id,
        status: updated.status,
        lastActiveAt: updated.lastActiveAt.toISOString(),
      },
      activeSessionsCount,
    });

    return NextResponse.json({
      valid: true,
      sessionId: session.id,
      activeUsersCount: activeSessionsCount,
      lastActiveAt: updated.lastActiveAt.toISOString(),
    });
  } catch (error) {
    console.error('Session heartbeat error:', error);
    return NextResponse.json({ error: 'Heartbeat error' }, { status: 500 });
  }
}
