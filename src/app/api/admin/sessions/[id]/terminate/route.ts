import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { verifyAuditAuthFromRequest } from '@/lib/auth/auditAuth';
import { logActivity } from '@/lib/audit/auditLogger';
import { broadcastSessionEvent } from '@/lib/audit/auditEventBroker';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await getAuthUserFromRequest(request);
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (adminUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin privileges required' }, { status: 403 });
    }

    if (!verifyAuditAuthFromRequest(request)) {
      return NextResponse.json(
        { error: 'Password verification required to terminate sessions', requiresPassword: true },
        { status: 403 }
      );
    }

    const { id: sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'TERMINATED',
        logoutAt: new Date(),
      },
    });

    // Record administrator-initiated session termination in audit history
    await logActivity({
      action: 'SESSION_TERMINATE',
      category: 'SECURITY',
      status: 'WARNING',
      userId: adminUser.id,
      userEmail: adminUser.email,
      userName: adminUser.name || adminUser.email,
      userRole: adminUser.role,
      req: request,
      details: {
        terminatedSessionId: session.id,
        targetUserId: session.userId,
        targetUserName: session.userName || session.user.name,
        targetUserEmail: session.userEmail || session.user.email,
        targetDevice: session.deviceType,
        targetBrowser: session.browser,
        targetIp: session.ipAddress,
        summary: `Administrator ${adminUser.name || adminUser.email} terminated active session for ${session.userName || session.userEmail} (${session.deviceType} / ${session.browser})`,
      },
    });

    broadcastSessionEvent('SESSION_TERMINATED', {
      sessionId: session.id,
      userId: session.userId,
      terminatedBy: adminUser.email,
    });

    return NextResponse.json({
      success: true,
      message: `Session for ${session.userName || session.userEmail} terminated successfully.`,
      session: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('Failed to terminate session:', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}
