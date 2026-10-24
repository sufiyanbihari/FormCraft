import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }

  return secret;
}

export const AUDIT_AUTH_COOKIE = 'formcraft_audit_auth';

export const AUDIT_REQUIRED_EMAIL =
  process.env.AUDIT_REQUIRED_EMAIL || '';

export const AUDIT_REQUIRED_PASSWORD =
  process.env.AUDIT_REQUIRED_PASSWORD || '';

export interface AuditAuthPayload {
  userId: string;
  email: string;
  scope: 'audit_logs_access';
}

export function signAuditAuthToken(
  userId: string,
  email: string
): string {
  const payload: AuditAuthPayload = {
    userId,
    email,
    scope: 'audit_logs_access',
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: '4h',
  });
}

export function verifyAuditAuthFromRequest(
  request: NextRequest
): boolean {
  try {
    if (!AUDIT_REQUIRED_EMAIL?.trim() || !AUDIT_REQUIRED_PASSWORD) {
      return false;
    }

    let token = request.cookies.get(AUDIT_AUTH_COOKIE)?.value;

    if (!token) {
      token = request.headers.get('x-audit-auth-token') || undefined;
    }

    if (!token) {
      return false;
    }

    const payload = jwt.verify(token, getJwtSecret()) as AuditAuthPayload;

    return (
      payload?.scope === 'audit_logs_access' &&
      typeof payload.email === 'string' &&
      payload.email.toLowerCase().trim() ===
        AUDIT_REQUIRED_EMAIL.toLowerCase().trim()
    );
  } catch {
    return false;
  }
}