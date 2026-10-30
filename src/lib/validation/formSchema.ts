import { z } from 'zod';

export const formThemeSchema = z.object({
  primaryColor: z.string().default('#004B6E'),
  backgroundColor: z.string().default('#004B6E'),
  cardColor: z.string().default('#ffffff'),
  fontFamily: z.string().default('Inter'),
  headerImageUrl: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  borderRadius: z.string().default('rounded-xl'),
});

export const rawFormSettingsShape = {
  isAcceptingResponses: z.boolean().optional(),
  startDate: z
    .union([z.string(), z.date(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : !v ? null : new Date(v).toISOString())),
  endDate: z
    .union([z.string(), z.date(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : !v ? null : new Date(v).toISOString())),
  maxResponses: z
    .union([z.number().int().positive(), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  closedMessage: z.string().optional(),
  showProgressBar: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  confirmationMessage: z.string().optional(),
  allowMultipleSubmissions: z.boolean().optional(),
  requireAuth: z.boolean().optional(),
  collectEmail: z.boolean().optional(),
  restrictOneResponse: z.boolean().optional(),
  allowResponseEditing: z.boolean().optional(),
  showSummaryToRespondents: z.boolean().optional(),
  accessMode: z.enum(['PUBLIC', 'AUTHENTICATED', 'RESTRICTED']).optional(),
  // Advanced Quiz Settings
  quizReleaseGrade: z.enum(['IMMEDIATE', 'AFTER_REVIEW']).optional(),
  quizShowCorrectAnswers: z.boolean().optional(),
  quizShowPointsEarned: z.boolean().optional(),
  quizShowFeedback: z.boolean().optional(),
  quizPassPercentage: z.number().min(0).max(100).nullable().optional(),
  quizPassMessage: z.string().optional(),
  quizFailMessage: z.string().optional(),
  quizDefaultPoints: z.number().int().min(0).optional(),
  quizTimerMode: z.enum(['NONE', 'QUESTION', 'OVERALL', 'BOTH']).optional(),
  quizDurationMinutes: z
    .union([z.number().min(0.01).max(1440), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  quizQuestionTimeLimitSeconds: z
    .union([z.number().int().min(1).max(86400), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  quizNavigationPolicy: z.enum(['BACKWARD_ENABLED', 'FORWARD_ONLY']).optional(),
  quizTimeoutBehavior: z.enum(['AUTO_FINALIZE']).optional(),
  quizIdentityQuestionId: z.string().nullable().optional(),
  quizExpectedParticipants: z
    .union([z.number().int().min(1), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  quizRosterMode: z.enum(['COUNT_ONLY', 'ROSTER']).optional(),
  // Duplicate Response Prevention - Only IP_ADDRESS is supported
  duplicateIdentifierMethod: z.enum(['IP_ADDRESS']).optional(),
  duplicateIdentifierQuestionId: z.string().nullable().optional(),
  duplicateRestrictionScope: z.enum(['ONCE_PER_FORM', 'PERIODIC']).optional(),
  duplicateRestrictionPeriod: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_HOURS']).optional(),
  duplicateCustomHours: z
    .union([z.number().int().min(1).max(8760), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  // Controlled Response Editing
  editingAuthMethod: z.enum(['SECURE_EDIT_LINK']).optional(),
  editingWindowMode: z.enum(['WITHIN_WINDOW']).optional(),
  editingTimeDuration: z
    .union([z.number(), z.string(), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v)))
    .refine((v) => v === undefined || v === null || (!isNaN(v) && v > 0), {
      message: 'Duration must be a positive number',
    }),
  editingTimeUnit: z
    .enum(['Minutes', 'Hours', 'Days', 'MINUTES', 'HOURS', 'DAYS', 'minutes', 'hours', 'days'])
    .optional(),
  maxEditCount: z
    .union([z.number().int(), z.string(), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Math.floor(Number(v))))
    .refine((v) => v === undefined || v === null || (!isNaN(v) && v >= 1), {
      message: 'Maximum number of edits must be at least 1',
    }),
  editingWindowMinutes: z
    .union([z.number().int().min(1).max(525600), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v))),
  editingDeadline: z
    .union([z.string(), z.date(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : !v ? null : new Date(v).toISOString())),
};

export function calculateEditingWindowMinutes(
  duration?: number | null,
  unit?: string | null
): number {
  const d = Number(duration) || 24;
  const u = String(unit || 'Hours').trim().toLowerCase();
  if (u.startsWith('minute')) {
    return Math.max(1, Math.round(d));
  }
  if (u.startsWith('day')) {
    return Math.max(1, Math.round(d * 1440));
  }
  // default hours
  return Math.max(1, Math.round(d * 60));
}

export const baseFormSettingsSchema = z.object({
  ...rawFormSettingsShape,
  closedMessage: z.string().optional().default('This form is no longer accepting responses.'),
  showProgressBar: z.boolean().default(true),
  shuffleQuestions: z.boolean().default(false),
  confirmationMessage: z.string().default('Your response has been recorded.'),
  allowMultipleSubmissions: z.boolean().default(true),
  requireAuth: z.boolean().default(false),
  collectEmail: z.boolean().optional().default(false),
  restrictOneResponse: z.boolean().default(false),
  allowResponseEditing: z.boolean().default(false),
  showSummaryToRespondents: z.boolean().default(false),
  accessMode: z.enum(['PUBLIC', 'AUTHENTICATED', 'RESTRICTED']).default('PUBLIC'),
  quizReleaseGrade: z.enum(['IMMEDIATE', 'AFTER_REVIEW']).optional().default('IMMEDIATE'),
  quizShowCorrectAnswers: z.boolean().optional().default(true),
  quizShowPointsEarned: z.boolean().optional().default(true),
  quizShowFeedback: z.boolean().optional().default(true),
  quizPassMessage: z.string().optional().default('Congratulations! You passed the quiz.'),
  quizFailMessage: z.string().optional().default('Unfortunately, you did not reach the passing score.'),
  quizDefaultPoints: z.number().int().min(0).optional().default(1),
  quizTimerMode: z.enum(['NONE', 'QUESTION', 'OVERALL', 'BOTH']).optional().default('NONE'),
  quizNavigationPolicy: z.enum(['BACKWARD_ENABLED', 'FORWARD_ONLY']).optional().default('BACKWARD_ENABLED'),
  quizTimeoutBehavior: z.enum(['AUTO_FINALIZE']).optional().default('AUTO_FINALIZE'),
  quizRosterMode: z.enum(['COUNT_ONLY', 'ROSTER']).optional().default('ROSTER'),
  duplicateIdentifierMethod: z.enum(['IP_ADDRESS']).optional().default('IP_ADDRESS'),
  duplicateRestrictionScope: z.enum(['ONCE_PER_FORM', 'PERIODIC']).optional().default('ONCE_PER_FORM'),
  duplicateRestrictionPeriod: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_HOURS']).optional().default('DAILY'),
  editingAuthMethod: z.enum(['SECURE_EDIT_LINK']).optional().default('SECURE_EDIT_LINK'),
  editingWindowMode: z.enum(['WITHIN_WINDOW']).optional().default('WITHIN_WINDOW'),
  editingTimeDuration: z.number().positive().optional().default(24),
  editingTimeUnit: z.enum(['Minutes', 'Hours', 'Days', 'MINUTES', 'HOURS', 'DAYS', 'minutes', 'hours', 'days']).optional().default('Hours'),
  maxEditCount: z.number().int().min(1).optional().default(1),
  editingWindowMinutes: z.number().int().min(1).optional().default(1440),
});

export function validateBothTimersConstraint(
  data: {
    quizTimerMode?: string;
    quizDurationMinutes?: number | null;
    quizQuestionTimeLimitSeconds?: number | null;
  },
  ctx: z.RefinementCtx
) {
  if (data.quizTimerMode === 'BOTH') {
    const durationMin = data.quizDurationMinutes;
    const questionSec = data.quizQuestionTimeLimitSeconds;

    if (questionSec !== null && questionSec !== undefined) {
      if (questionSec <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Per-question time limit must be greater than zero.',
          path: ['quizQuestionTimeLimitSeconds'],
        });
      }
      if (durationMin !== null && durationMin !== undefined && durationMin > 0) {
        const maxSec = durationMin * 60;
        if (questionSec > maxSec) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Per-question time limit cannot exceed overall quiz duration (${maxSec} seconds).`,
            path: ['quizQuestionTimeLimitSeconds'],
          });
        }
      }
    }
  }
}

export const formSettingsSchema = baseFormSettingsSchema.superRefine(validateBothTimersConstraint);
export const partialFormSettingsSchema = z.object(rawFormSettingsShape).superRefine(validateBothTimersConstraint);

export const createFormSchema = z.object({
  title: z.string().min(1, 'Form title is required').max(200).default('Untitled form'),
  description: z.string().max(2000).optional().default(''),
  isQuiz: z.boolean().optional().default(false),
  templateId: z.string().optional(),
  settings: partialFormSettingsSchema.optional(),
});

export const updateFormSchema = z.object({
  title: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : 'Untitled form')),
  description: z.string().max(2000).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED']).optional(),
  isQuiz: z.boolean().optional(),
  theme: formThemeSchema.partial().nullable().optional(),
  settings: partialFormSettingsSchema.optional(),
});

export const createSectionSchema = z.object({
  title: z.string().min(1, 'Section title is required').default('Section'),
  description: z.string().optional().default(''),
  orderIndex: z.number().int().default(0),
  nextSectionId: z.string().optional().default('NEXT'),
});

export const updateSectionSchema = createSectionSchema.partial();

export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type FormThemeInput = z.infer<typeof formThemeSchema>;
export type FormSettingsInput = z.infer<typeof formSettingsSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
