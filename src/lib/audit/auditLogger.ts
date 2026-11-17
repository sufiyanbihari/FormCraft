import { prisma } from '@/lib/db/prisma';
import { parseClientInfo, ClientDeviceInfo } from '@/lib/auth/deviceParser';
import { broadcastAuditEvent } from '@/lib/audit/auditEventBroker';
import { verifyToken } from '@/lib/auth/jwt';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_REGISTER'
  | 'USER_LOGOUT'
  | 'SESSION_TERMINATE'
  | 'FORM_CREATE'
  | 'FORM_UPDATE'
  | 'FORM_DELETE'
  | 'FORM_PUBLISH'
  | 'FORM_UNPUBLISH'
  | 'FORM_CLOSED'
  | 'FORM_DUPLICATE'
  | 'QUESTION_CREATE'
  | 'QUESTION_UPDATE'
  | 'QUESTION_DELETE'
  | 'QUESTION_REORDER'
  | 'SECTION_CREATE'
  | 'SECTION_UPDATE'
  | 'SECTION_DELETE'
  | 'SUBMISSION_CREATE'
  | 'SUBMISSION_EDIT'
  | 'SUBMISSION_EXPORT'
  | 'SUBMISSION_DELETE'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'COLLABORATOR_ADD'
  | 'COLLABORATOR_UPDATE_ROLE'
  | 'COLLABORATOR_REMOVE'
  | 'SYSTEM_LOGS_RESET'
  | 'SYSTEM_LOGS_LOCK'
  | string;

export type AuditCategory =
  | 'AUTH'
  | 'FORM'
  | 'QUESTION'
  | 'SUBMISSION'
  | 'FILE'
  | 'COLLABORATOR'
  | 'SECURITY';

export interface AuditFieldChange {
  field: string;
  label?: string;
  before: any;
  after: any;
}

export interface LogActivityParams {
  action: AuditAction;
  category?: AuditCategory;
  status?: 'SUCCESS' | 'FAILED' | 'WARNING';
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;
  sessionId?: string | null;
  formId?: string | null;
  formTitle?: string | null;
  publicId?: string | null;
  details?: Record<string, any>;
  req?: Request | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  changes?: AuditFieldChange[] | null;
}

// In-memory deduplication cache: window of 1500ms prevents duplicate records from re-renders/retries
const recentAuditCache = new Map<string, number>();

function isDuplicateAction(dedupKey: string): boolean {
  const now = Date.now();
  const last = recentAuditCache.get(dedupKey);
  if (last && now - last < 1500) {
    return true;
  }
  recentAuditCache.set(dedupKey, now);

  if (recentAuditCache.size > 2000) {
    for (const [k, ts] of recentAuditCache.entries()) {
      if (now - ts > 10000) recentAuditCache.delete(k);
    }
  }
  return false;
}

export function extractClientInfo(req?: Request | null): { ipAddress: string; userAgent: string } {
  const parsed = parseClientInfo(req);
  return { ipAddress: parsed.ipAddress, userAgent: parsed.userAgent };
}

/**
 * Universal activity audit logger
 * Safely persists user, form, submission, file, and security events.
 * Never throws an error or interrupts the calling transaction/route.
 */
export async function logActivity(params: LogActivityParams) {
  try {
    // 1. Build deduplication key
    const summaryStr = params.details?.summary || '';
    const changesStr = params.details?.changes ? JSON.stringify(params.details.changes) : '';
    const dedupKey = `${params.action}::${params.userId || 'anon'}::${params.formId || 'sys'}::${summaryStr}::${changesStr}`;

    if (isDuplicateAction(dedupKey)) {
      return null;
    }

    // 2. Parse client & device info
    const parsedClient = parseClientInfo(params.req);
    const ipAddress = params.ipAddress || parsedClient.ipAddress;
    const userAgent = params.userAgent || parsedClient.userAgent;
    const deviceType = params.deviceType || parsedClient.deviceType;
    const browser = params.browser || parsedClient.browser;
    const os = params.os || parsedClient.os;

    // 3. Extract session ID from token if not explicitly provided
    let sessionId = params.sessionId || params.details?.sessionId || null;
    if (!sessionId && params.req) {
      try {
        const cookieHeader = params.req.headers.get('cookie') || '';
        const cookieMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
        let token = cookieMatch ? cookieMatch[1] : null;
        if (!token) {
          const authHeader = params.req.headers.get('authorization');
          if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          }
        }
        if (token) {
          const verified = verifyToken(token);
          if (verified?.sessionId) {
            sessionId = verified.sessionId;
          }
        }
      } catch {
        // ignore extraction error
      }
    }

    // 4. Resolve authenticated user identity
    let userEmail = params.userEmail;
    let userName = params.userName;
    let userRole = params.userRole;

    if (params.userId && (!userEmail || !userName || !userRole)) {
      const u = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, name: true, role: true },
      });
      if (u) {
        userEmail = userEmail || u.email;
        userName = userName || u.name || u.email;
        userRole = userRole || u.role;
      }
    }

    // Never leave an authenticated user with placeholder 'Anonymous Respondent'
    if (params.userId && !userName) {
      userName = userEmail || 'Administrator';
    }

    // 5. Resolve target Form
    let formTitle = params.formTitle;
    let validFormId: string | null = params.formId || null;
    let publicId = params.publicId || null;

    if (params.formId) {
      const f = await prisma.form.findFirst({
        where: {
          OR: [{ id: params.formId }, { publicId: params.formId }],
        },
        select: { id: true, title: true, publicId: true },
      });
      if (f) {
        validFormId = f.id;
        formTitle = formTitle || f.title;
        publicId = publicId || f.publicId;
      }
    }

    // 6. Determine Category
    let category = params.category;
    if (!category) {
      if (params.action.startsWith('USER_') || params.action.startsWith('SESSION_')) {
        category = params.action.includes('FAILED') ? 'SECURITY' : 'AUTH';
      } else if (params.action.startsWith('FORM_')) {
        category = 'FORM';
      } else if (params.action.startsWith('QUESTION_') || params.action.startsWith('SECTION_')) {
        category = 'QUESTION';
      } else if (params.action.startsWith('SUBMISSION_') || params.action.startsWith('RESPONSES_')) {
        category = 'SUBMISSION';
      } else if (params.action.startsWith('FILE_')) {
        category = 'FILE';
      } else if (params.action.startsWith('COLLABORATOR_')) {
        category = 'COLLABORATOR';
      } else {
        category = 'FORM';
      }
    }

    // 7. Assemble Structured Audit Payload
    const beforeData = params.before || params.details?.before || null;
    const afterData = params.after || params.details?.after || null;
    const changesData = params.changes || params.details?.changes || null;

    const payload = {
      category,
      status: params.status || 'SUCCESS',
      userEmail: userEmail || null,
      userName: userName || (params.userId ? userEmail : 'Anonymous Respondent'),
      userRole: userRole || null,
      actor: {
        id: params.userId || null,
        name: userName || (params.userId ? userEmail : 'Anonymous Respondent'),
        email: userEmail || null,
        role: userRole || null,
      },
      formTitle: formTitle || null,
      publicId: publicId || null,
      sessionId: sessionId || null,
      ipAddress,
      userAgent,
      deviceType,
      browser,
      os,
      before: beforeData,
      after: afterData,
      changes: changesData,
      ...(params.details || {}),
    };

    const record = await prisma.formAuditLog.create({
      data: {
        formId: validFormId,
        userId: params.userId || null,
        action: params.action,
        details: payload,
      },
    });

    // 8. Broadcast to active admin real-time SSE streams
    broadcastAuditEvent(params.action, {
      ...record,
      userName: payload.userName,
      userEmail: payload.userEmail,
      userRole: payload.userRole,
      formTitle: payload.formTitle,
      formPublicId: payload.publicId,
    });

    return record;
  } catch (err) {
    console.error('[AuditLog] Error recording activity:', err);
    return null;
  }
}
