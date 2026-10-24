import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);

  if (user) {
    await logActivity({
      action: 'USER_LOGOUT',
      category: 'AUTH',
      status: 'SUCCESS',
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        summary: `${user.name || user.email} logged out of system`,
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
