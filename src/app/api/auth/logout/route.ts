import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { SESSION_COOKIE_NAME, getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';
import { parseClientInfo } from '@/lib/auth/deviceParser';
import { broadcastSessionEvent } from '@/lib/audit/auditEventBroker';

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  const clientInfo = parseClientInfo(request);

  if (user) {
    if (user.sessionId) {
      // Terminate ONLY this specific session in the database
      try {
        await prisma.session.update({
          where: { id: user.sessionId },
          data: {
            status: 'LOGGED_OUT',
            logoutAt: new Date(),
          },
        });

        broadcastSessionEvent('SESSION_TERMINATED', {
          sessionId: user.sessionId,
          userId: user.id,
          reason: 'USER_LOGOUT',
        });
      } catch (err) {
        console.error('Failed to mark session logged out:', err);
      }
    }

    await logActivity({
      action: 'USER_LOGOUT',
      category: 'AUTH',
      status: 'SUCCESS',
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
      userRole: user.role,
      sessionId: user.sessionId,
      req: request,
      details: {
        sessionId: user.sessionId,
        deviceType: clientInfo.deviceType,
        browser: clientInfo.browser,
        os: clientInfo.os,
        summary: `${user.name || user.email} logged out from ${clientInfo.deviceType} (${clientInfo.browser})`,
      },
    });
  }

  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
  return response;
}
