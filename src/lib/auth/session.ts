import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyToken } from './jwt';

export const SESSION_COOKIE_NAME = 'formcraft_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
  sessionId?: string | null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload?.userId) return null;

    if (payload.sessionId) {
      const dbSession = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { id: true, status: true },
      });
      if (dbSession && (dbSession.status === 'TERMINATED' || dbSession.status === 'LOGGED_OUT')) {
        return null;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      sessionId: payload.sessionId || null,
    } as AuthUser;
  } catch {
    return null;
  }
}

export async function getAuthUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  try {
    let token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload?.userId) return null;

    if (payload.sessionId) {
      const dbSession = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { id: true, status: true },
      });
      if (dbSession && (dbSession.status === 'TERMINATED' || dbSession.status === 'LOGGED_OUT')) {
        return null;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      sessionId: payload.sessionId || null,
    } as AuthUser;
  } catch {
    return null;
  }
}
