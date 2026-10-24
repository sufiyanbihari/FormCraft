import { prisma } from '@/lib/db/prisma';

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_REGISTER'
  | 'USER_LOGOUT'
  | 'FORM_CREATE'
  | 'FORM_UPDATE'
  | 'FORM_DELETE'
  | 'FORM_PUBLISH'
  | 'FORM_UNPUBLISH'
  | 'FORM_DUPLICATE'
  | 'QUESTION_CREATE'
  | 'QUESTION_UPDATE'
  | 'QUESTION_DELETE'
  | 'QUESTION_REORDER'
  | 'SECTION_CREATE'
  | 'SECTION_DELETE'
  | 'SUBMISSION_CREATE'
  | 'SUBMISSION_EXPORT'
  | 'SUBMISSION_DELETE'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'COLLABORATOR_ADD'
  | 'COLLABORATOR_UPDATE_ROLE'
  | 'COLLABORATOR_REMOVE'
  | string;

export type AuditCategory =
  | 'AUTH'
  | 'FORM'
  | 'QUESTION'
  | 'SUBMISSION'
  | 'FILE'
  | 'COLLABORATOR'
  | 'SECURITY';

export interface LogActivityParams {
  action: AuditAction;
  category?: AuditCategory;
  status?: 'SUCCESS' | 'FAILED' | 'WARNING';
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;
  formId?: string | null;
  formTitle?: string | null;
  publicId?: string | null;
  details?: Record<string, any>;
  req?: Request | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function extractClientInfo(req?: Request | null): { ipAddress: string; userAgent: string } {
  if (!req) {
    return { ipAddress: '127.0.0.1', userAgent: 'Direct / System' };
  }
  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) || '127.0.0.1';
  const ua = headers.get('user-agent') || 'Unknown Device';
  return { ipAddress: ip, userAgent: ua };
}

/**
 * Universal activity audit logger
 * Safely persists user, form, submission, file, and security events.
 * Never throws an error or interrupts the calling transaction/route.
 */
export async function logActivity(params: LogActivityParams) {
  try {
    const { ipAddress: detectedIp, userAgent: detectedUa } = extractClientInfo(params.req);
    const ipAddress = params.ipAddress || detectedIp;
    const userAgent = params.userAgent || detectedUa;

    let userEmail = params.userEmail;
    let userName = params.userName;
    let userRole = params.userRole;

    if (params.userId && (!userEmail || !userName)) {
      const u = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, name: true, role: true },
      });
      if (u) {
        userEmail = userEmail || u.email;
        userName = userName || u.name;
        userRole = userRole || u.role;
      }
    }

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

    // Determine category based on action prefix if not explicitly provided
    let category = params.category;
    if (!category) {
      if (params.action.startsWith('USER_')) {
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

    const payload = {
      category,
      status: params.status || 'SUCCESS',
      userEmail: userEmail || 'Anonymous Respondent',
      userName: userName || null,
      userRole: userRole || null,
      formTitle: formTitle || null,
      publicId: publicId || null,
      ipAddress,
      userAgent,
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

    return record;
  } catch (err) {
    console.error('[AuditLog] Error recording activity:', err);
    return null;
  }
}
