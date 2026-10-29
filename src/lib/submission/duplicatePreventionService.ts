import { PrismaClient } from '@prisma/client';

export type DuplicateIdentifierMethod = 'AUTH_USER' | 'VERIFIED_EMAIL' | 'QUESTION_FIELD' | 'IP_ADDRESS';
export type DuplicateRestrictionScope = 'ONCE_PER_FORM' | 'PERIODIC';
export type DuplicateRestrictionPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM_HOURS';

export interface ResolvedIdentifier {
  method: DuplicateIdentifierMethod;
  identifier: string;
  questionId?: string;
  label: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  message?: string;
  existingSubmissionId?: string;
  existingSubmittedAt?: Date;
  canEdit?: boolean;
  editToken?: string;
}

/**
 * Resolves the participant identifier based on the form's configured duplicate prevention method.
 */
export function resolveParticipantIdentifier({
  settings,
  authenticatedUser,
  respondentEmail,
  answers,
  ipHash,
}: {
  settings: any;
  authenticatedUser?: { id: string; email?: string | null; name?: string | null } | null;
  respondentEmail?: string | null;
  answers: Array<{ questionId: string; value: any }>;
  ipHash?: string | null;
}): { success: true; identity: ResolvedIdentifier } | { success: false; error: string; statusCode: number } {
  // Resolve identification method, falling back removed methods (AUTH_USER, VERIFIED_EMAIL) or empty values to IP_ADDRESS
  let method: DuplicateIdentifierMethod = (settings?.duplicateIdentifierMethod as DuplicateIdentifierMethod) || 'IP_ADDRESS';
  if (method === 'AUTH_USER' || method === 'VERIFIED_EMAIL' || !method) {
    method = 'IP_ADDRESS';
  }

  if (method === 'QUESTION_FIELD') {
    const qId = settings?.duplicateIdentifierQuestionId || settings?.quizIdentityQuestionId;
    if (qId) {
      const targetAnswer = answers.find((a) => a.questionId === qId);
      const rawVal = targetAnswer?.value;
      if (rawVal !== undefined && rawVal !== null && (typeof rawVal !== 'string' || rawVal.trim())) {
        const stringVal = typeof rawVal === 'string' ? rawVal.trim().toLowerCase() : String(rawVal).trim().toLowerCase();
        return {
          success: true,
          identity: {
            method: 'QUESTION_FIELD',
            identifier: stringVal,
            questionId: qId,
            label: stringVal,
          },
        };
      }
    }
    // If identity question is missing or unanswered, fall back gracefully
    if (authenticatedUser?.id) {
      return {
        success: true,
        identity: {
          method: 'AUTH_USER',
          identifier: authenticatedUser.id,
          label: authenticatedUser.email || authenticatedUser.name || authenticatedUser.id,
        },
      };
    }
    const email = respondentEmail?.trim().toLowerCase();
    if (email) {
      return {
        success: true,
        identity: {
          method: 'VERIFIED_EMAIL',
          identifier: email,
          label: email,
        },
      };
    }
    return {
      success: true,
      identity: {
        method: 'IP_ADDRESS',
        identifier: ipHash || 'anonymous-device',
        label: 'Client Device',
      },
    };
  }

  // Supported method: IP_ADDRESS (Client Device / IP)
  return {
    success: true,
    identity: {
      method: 'IP_ADDRESS',
      identifier: ipHash || 'anonymous-device',
      label: 'Client Device',
    },
  };

  return {
    success: false,
    error: 'Unsupported identification method for duplicate prevention.',
    statusCode: 400,
  };
}

/**
 * Calculates the start boundary of the active restriction window based on the configured scope and period.
 */
export function calculateRestrictionWindowStart(settings: any, now: Date = new Date()): Date | null {
  const scope: DuplicateRestrictionScope = settings?.duplicateRestrictionScope || 'ONCE_PER_FORM';
  if (scope === 'ONCE_PER_FORM') {
    return null; // All time
  }

  const period: DuplicateRestrictionPeriod = settings?.duplicateRestrictionPeriod || 'DAILY';

  if (period === 'DAILY') {
    // Calendar day start in UTC
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  }

  if (period === 'WEEKLY') {
    // Calendar week start (Sunday at 00:00:00 UTC)
    const day = now.getUTCDay(); // 0 is Sunday
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, 0, 0, 0, 0));
    return weekStart;
  }

  if (period === 'MONTHLY') {
    // Calendar month start (1st of month at 00:00:00 UTC)
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  if (period === 'CUSTOM_HOURS') {
    // Rolling X hours
    const hours = Math.max(1, settings?.duplicateCustomHours || 24);
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }

  return null;
}

/**
 * Formats a clear user-facing explanation when duplicate submission is rejected.
 */
export function formatDuplicateErrorMessage(settings: any, identity: ResolvedIdentifier): string {
  const scope: DuplicateRestrictionScope = settings?.duplicateRestrictionScope || 'ONCE_PER_FORM';
  const period: DuplicateRestrictionPeriod = settings?.duplicateRestrictionPeriod || 'DAILY';

  if (scope === 'ONCE_PER_FORM') {
    if (identity.method === 'AUTH_USER') {
      return 'You have already submitted a response for this form. Multiple submissions are not allowed.';
    }
    if (identity.method === 'VERIFIED_EMAIL') {
      return `A response has already been submitted with the email address "${identity.label}". Multiple submissions are not allowed for this form.`;
    }
    if (identity.method === 'QUESTION_FIELD') {
      return `A response has already been submitted with identifier "${identity.label}". Multiple submissions are not allowed for this form.`;
    }
    return 'You have already submitted a response for this form. Multiple submissions are not allowed.';
  }

  // Periodic window messages
  if (period === 'DAILY') {
    return 'You have already submitted a response today. This form accepts only one submission per calendar day.';
  }
  if (period === 'WEEKLY') {
    return 'You have already submitted a response this week. This form accepts only one submission per week.';
  }
  if (period === 'MONTHLY') {
    return 'You have already submitted a response this month. This form accepts only one submission per month.';
  }
  if (period === 'CUSTOM_HOURS') {
    const hrs = settings?.duplicateCustomHours || 24;
    return `You have already submitted a response recently. This form allows only one submission every ${hrs} hours.`;
  }

  return 'You have already submitted a response for this form within the restricted period.';
}

/**
 * Checks whether an eligible duplicate submission exists inside a database transaction.
 * Concurrency protected via advisory lock on (formId + identity).
 */
export async function checkDuplicateSubmission(
  tx: any,
  {
    formId,
    settings,
    identity,
    now = new Date(),
  }: {
    formId: string;
    settings: any;
    identity: ResolvedIdentifier;
    now?: Date;
  }
): Promise<DuplicateCheckResult> {
  // If duplicate prevention is disabled (neither restrictOneResponse nor duplicateIdentifierMethod is active), allow
  const isEnabled = Boolean(settings?.restrictOneResponse);
  if (!isEnabled) {
    return { isDuplicate: false };
  }

  // 1. Acquire transaction-level advisory lock to serialize concurrent submissions for this form & identity
  const lockKey = `${formId}:${identity.method}:${identity.identifier}`;
  try {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      lockKey
    );
  } catch (err) {
    // If advisory locking fails (e.g. non-postgres in test), continue gracefully
    console.warn('Advisory lock non-fatal warning:', err);
  }

  // 2. Compute restriction window start
  const windowStart = calculateRestrictionWindowStart(settings, now);

  // 3. Query existing submission based on identity method
  let existing: any = null;

  if (identity.method === 'AUTH_USER') {
    existing = await tx.formSubmission.findFirst({
      where: {
        formId,
        respondentUserId: identity.identifier,
        ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
      },
      select: { id: true, editToken: true, submittedAt: true, respondentUserId: true },
      orderBy: { submittedAt: 'desc' },
    });
  } else if (identity.method === 'VERIFIED_EMAIL') {
    existing = await tx.formSubmission.findFirst({
      where: {
        formId,
        respondentEmail: { equals: identity.identifier, mode: 'insensitive' },
        ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
      },
      select: { id: true, editToken: true, submittedAt: true, respondentUserId: true },
      orderBy: { submittedAt: 'desc' },
    });
  } else if (identity.method === 'QUESTION_FIELD' && identity.questionId) {
    existing = await tx.formSubmission.findFirst({
      where: {
        formId,
        ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
        answers: {
          some: {
            questionId: identity.questionId,
            textAnswer: { equals: identity.identifier, mode: 'insensitive' },
          },
        },
      },
      select: { id: true, editToken: true, submittedAt: true, respondentUserId: true },
      orderBy: { submittedAt: 'desc' },
    });
  } else if (identity.method === 'IP_ADDRESS') {
    existing = await tx.formSubmission.findFirst({
      where: {
        formId,
        ipHash: identity.identifier,
        ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
      },
      select: { id: true, editToken: true, submittedAt: true, respondentUserId: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  if (existing) {
    const message = formatDuplicateErrorMessage(settings, identity);
    const allowEditing = Boolean(settings?.allowResponseEditing);
    return {
      isDuplicate: true,
      message,
      existingSubmissionId: existing.id,
      existingSubmittedAt: existing.submittedAt,
      canEdit: allowEditing,
      editToken: allowEditing ? existing.editToken : undefined,
    };
  }

  return { isDuplicate: false };
}
