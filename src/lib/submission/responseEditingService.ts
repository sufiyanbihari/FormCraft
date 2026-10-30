import { calculateEditingWindowMinutes } from '@/lib/validation/formSchema';

export type EditingAuthMethod = 'SECURE_EDIT_LINK' | 'AUTH_USER' | 'ADMIN_ONLY' | 'BOTH_LINK_AND_AUTH';
export type EditingWindowMode = 'WITHIN_WINDOW' | 'ALWAYS' | 'UNTIL_DEADLINE';

export interface VerifyEditEligibilityParams {
  submission: {
    editToken?: string | null;
    submittedAt: Date | string;
    editCount?: number | null;
    respondentUserId?: string | null;
    [key: string]: unknown;
  };
  form: {
    settings?: {
      allowResponseEditing?: boolean | null;
      isAcceptingResponses?: boolean | null;
      closedMessage?: string | null;
      endDate?: Date | string | null;
      editingAuthMethod?: string | null;
      editingWindowMode?: string | null;
      editingWindowMinutes?: number | null;
      editingTimeDuration?: number | null;
      editingTimeUnit?: string | null;
      maxEditCount?: number | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  };
  editToken?: string | null;
  authenticatedUser?: { id: string; email?: string; role?: string } | null;
  userRole?: string | null;
  now?: Date;
}

export interface EditEligibilityResult {
  allowed: boolean;
  reason?: string;
  statusCode?: number;
  actorType?: 'RESPONDENT' | 'ADMIN';
}

/**
 * Validates whether a participant or admin is eligible to edit an existing submission.
 */
export function verifyEditEligibility({
  submission,
  form,
  editToken,
  authenticatedUser,
  userRole,
  now = new Date(),
}: VerifyEditEligibilityParams): EditEligibilityResult {
  const settings = form.settings;

  // 1. Admin Override: Form owners / admins can edit if permitted by RBAC
  const isAdmin = userRole === 'OWNER' || userRole === 'EDITOR' || authenticatedUser?.role === 'ADMIN';
  if (isAdmin) {
    return { allowed: true, actorType: 'ADMIN' };
  }

  // 2. Check if response editing is enabled on the form
  if (!settings?.allowResponseEditing) {
    return {
      allowed: false,
      reason: 'Response editing is not enabled for this form.',
      statusCode: 403,
    };
  }

  // 3. Check Form Status (if form is closed or past deadline)
  if (settings.isAcceptingResponses === false) {
    return {
      allowed: false,
      reason: settings.closedMessage || 'This form is no longer accepting responses or edits.',
      statusCode: 403,
    };
  }
  if (settings.endDate && new Date(settings.endDate) < now) {
    return {
      allowed: false,
      reason: 'The deadline for this form has passed. Edits are no longer accepted.',
      statusCode: 403,
    };
  }

  // 4. Verify Authorization Method: Only Secure Edit Link is supported for respondents
  if (!editToken || editToken !== submission.editToken) {
    return {
      allowed: false,
      reason: 'Invalid or missing edit link token. You do not have permission to edit this response.',
      statusCode: 401,
    };
  }

  // 5. Verify Maximum Number of Edits
  const maxEdits = Number(settings?.maxEditCount) || 1;
  const currentEditCount = Number(submission?.editCount) || 0;
  if (currentEditCount >= maxEdits) {
    return {
      allowed: false,
      reason: `This response has already reached the maximum allowed limit of ${maxEdits} edit${maxEdits === 1 ? '' : 's'}. Further edits are not permitted.`,
      statusCode: 403,
    };
  }

  // 6. Verify Editing Window (Within time limit after submission)
  let windowMinutes = settings?.editingWindowMinutes;
  if (!windowMinutes && settings?.editingTimeDuration) {
    windowMinutes = calculateEditingWindowMinutes(settings.editingTimeDuration, settings.editingTimeUnit);
  }
  if (!windowMinutes || windowMinutes <= 0) {
    windowMinutes = 1440; // Default 24 hours
  }

  const submissionTime = new Date(submission.submittedAt).getTime();
  const expiryTime = submissionTime + windowMinutes * 60 * 1000;

  if (now.getTime() > expiryTime) {
    return {
      allowed: false,
      reason: 'The editing window for this response has expired. Edits are no longer accepted.',
      statusCode: 403,
    };
  }

  return { allowed: true, actorType: 'RESPONDENT' };
}
