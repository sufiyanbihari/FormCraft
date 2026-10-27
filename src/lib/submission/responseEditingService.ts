import { prisma } from '@/lib/db/prisma';

export type EditingAuthMethod = 'SECURE_EDIT_LINK' | 'AUTH_USER' | 'ADMIN_ONLY' | 'BOTH_LINK_AND_AUTH';
export type EditingWindowMode = 'ALWAYS' | 'WITHIN_WINDOW' | 'UNTIL_DEADLINE';

export interface VerifyEditEligibilityParams {
  submission: any;
  form: any;
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

  // 4. Verify Authorization Method
  const authMethod: EditingAuthMethod = settings.editingAuthMethod || 'SECURE_EDIT_LINK';

  let isAuthorized = false;

  if (authMethod === 'SECURE_EDIT_LINK') {
    if (editToken && editToken === submission.editToken) {
      isAuthorized = true;
    } else {
      return {
        allowed: false,
        reason: 'Invalid or missing edit link token. You do not have permission to edit this response.',
        statusCode: 401,
      };
    }
  } else if (authMethod === 'AUTH_USER') {
    if (!authenticatedUser?.id) {
      return {
        allowed: false,
        reason: 'You must be signed in to edit your response.',
        statusCode: 401,
      };
    }
    if (submission.respondentUserId === authenticatedUser.id) {
      isAuthorized = true;
    } else {
      return {
        allowed: false,
        reason: 'This response belongs to a different account. You cannot edit it.',
        statusCode: 403,
      };
    }
  } else if (authMethod === 'ADMIN_ONLY') {
    return {
      allowed: false,
      reason: 'Response editing for this form can only be performed by form administrators.',
      statusCode: 403,
    };
  } else if (authMethod === 'BOTH_LINK_AND_AUTH') {
    const tokenMatch = editToken && editToken === submission.editToken;
    const userMatch = authenticatedUser?.id && submission.respondentUserId === authenticatedUser.id;
    if (tokenMatch || userMatch) {
      isAuthorized = true;
    } else {
      return {
        allowed: false,
        reason: 'You do not have authorization to edit this response.',
        statusCode: 403,
      };
    }
  }

  if (!isAuthorized) {
    return {
      allowed: false,
      reason: 'Unauthorized edit request.',
      statusCode: 403,
    };
  }

  // 5. Verify Editing Window / Deadlines
  const windowMode: EditingWindowMode = settings.editingWindowMode || 'ALWAYS';

  if (windowMode === 'WITHIN_WINDOW') {
    const windowMinutes = settings.editingWindowMinutes ?? 1440; // Default 24 hours
    const submissionTime = new Date(submission.submittedAt).getTime();
    const expiryTime = submissionTime + windowMinutes * 60 * 1000;

    if (now.getTime() > expiryTime) {
      return {
        allowed: false,
        reason: `The response editing window of ${Math.round(windowMinutes / 60)} hour(s) has expired.`,
        statusCode: 403,
      };
    }
  } else if (windowMode === 'UNTIL_DEADLINE') {
    if (settings.editingDeadline && new Date(settings.editingDeadline) < now) {
      return {
        allowed: false,
        reason: 'The configured response editing deadline has passed.',
        statusCode: 403,
      };
    }
  }

  return { allowed: true, actorType: 'RESPONDENT' };
}
