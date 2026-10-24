import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit/auditLogger';
import {
  AUDIT_AUTH_COOKIE,
  AUDIT_REQUIRED_EMAIL,
  AUDIT_REQUIRED_PASSWORD,
  signAuditAuthToken,
  verifyAuditAuthFromRequest,
} from '@/lib/auth/auditAuth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isVerified = verifyAuditAuthFromRequest(request);

    return NextResponse.json({
      verified: isVerified,
    });
  } catch {
    return NextResponse.json(
      { error: 'Verification check failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin session required' },
        { status: 401 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Admin role required' },
        { status: 403 }
      );
    }

    if (!AUDIT_REQUIRED_EMAIL?.trim() || !AUDIT_REQUIRED_PASSWORD) {
      console.error('Audit access credentials are not configured');

      return NextResponse.json(
        { error: 'Audit access is not configured.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const email =
      typeof body?.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    const password =
      typeof body?.password === 'string'
        ? body.password
        : '';

    const isEmailValid =
      email === AUDIT_REQUIRED_EMAIL.trim().toLowerCase();

    const isPasswordValid =
      password === AUDIT_REQUIRED_PASSWORD;

    if (!isEmailValid || !isPasswordValid) {
      await logActivity({
        action: 'AUDIT_LOG_UNLOCK_FAILED',
        category: 'SECURITY',
        status: 'WARNING',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        req: request,
        details: {
          attemptedEmail: email,
          reason: !isEmailValid
            ? 'Email mismatch'
            : 'Invalid audit password',
        },
      });

      return NextResponse.json(
        {
          error:
            'Invalid credentials. Please enter the correct audit log email and password.',
        },
        { status: 401 }
      );
    }

    const token = signAuditAuthToken(user.id, user.email);

    await logActivity({
      action: 'AUDIT_LOG_UNLOCKED',
      category: 'SECURITY',
      status: 'SUCCESS',
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      req: request,
      details: {
        verifiedEmail: email,
        scope: 'audit_logs_access',
      },
    });

    const response = NextResponse.json({
      success: true,
      message: 'Audit log access granted.',
    });

    response.cookies.set(AUDIT_AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 4 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err) {
    console.error('Audit verification error:', err);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Audit logs access locked.',
    });

    response.cookies.set(AUDIT_AUTH_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Failed to lock audit logs' },
      { status: 500 }
    );
  }
}