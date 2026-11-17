import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/lib/validation/authSchema';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';
import { parseClientInfo } from '@/lib/auth/deviceParser';
import { broadcastSessionEvent } from '@/lib/audit/auditEventBroker';

export async function POST(request: NextRequest) {
  try {
    const clientInfo = parseClientInfo(request);
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email or password format' },
        { status: 400 }
      );
    }

    const { email, password } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await logActivity({
        action: 'USER_LOGIN_FAILED',
        category: 'SECURITY',
        status: 'FAILED',
        userEmail: normalizedEmail,
        req: request,
        details: {
          reason: 'Account not found',
          summary: `Failed login attempt for ${email} (Account not found)`,
          attemptedEmail: normalizedEmail,
          deviceType: clientInfo.deviceType,
          browser: clientInfo.browser,
          os: clientInfo.os,
        },
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await logActivity({
        action: 'USER_LOGIN_FAILED',
        category: 'SECURITY',
        status: 'FAILED',
        userId: user.id,
        userEmail: user.email,
        userName: user.name || user.email,
        userRole: user.role,
        req: request,
        details: {
          reason: 'Incorrect password',
          summary: `Failed login attempt for ${user.email} (Incorrect password)`,
          attemptedEmail: user.email,
          deviceType: clientInfo.deviceType,
          browser: clientInfo.browser,
          os: clientInfo.os,
        },
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create a new persistent session record in database (strictly required for valid login)
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        userRole: user.role,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        deviceType: clientInfo.deviceType,
        browser: clientInfo.browser,
        os: clientInfo.os,
        status: 'ACTIVE',
        loginAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    await logActivity({
      action: 'USER_LOGIN',
      category: 'AUTH',
      status: 'SUCCESS',
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
      userRole: user.role,
      sessionId: session.id,
      req: request,
      details: {
        role: user.role,
        sessionId: session.id,
        summary: `${user.name || user.email} signed in successfully from ${clientInfo.deviceType} (${clientInfo.browser})`,
        deviceType: clientInfo.deviceType,
        browser: clientInfo.browser,
        os: clientInfo.os,
      },
    });

    // Notify real-time subscribers of new active session
    broadcastSessionEvent('SESSION_UPDATED', {
      session: {
        id: session.id,
        userId: user.id,
        userName: session.userName || user.name || user.email,
        userEmail: session.userEmail || user.email,
        userRole: session.userRole || user.role,
        ipAddress: session.ipAddress || clientInfo.ipAddress,
        deviceType: session.deviceType || clientInfo.deviceType,
        browser: session.browser || clientInfo.browser,
        os: session.os || clientInfo.os,
        status: session.status || 'ACTIVE',
        loginAt: session.loginAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
      },
    });

    const response = NextResponse.json({
      message: 'Login successful',
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    );
  }
}
