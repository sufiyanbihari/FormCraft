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

export const formSettingsSchema = z.object({
  isAcceptingResponses: z.boolean().default(true),
  startDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (!v ? null : new Date(v).toISOString())),
  endDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (!v ? null : new Date(v).toISOString())),
  maxResponses: z
    .union([z.number().int().positive(), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
  closedMessage: z.string().optional().default('This form is no longer accepting responses.'),
  showProgressBar: z.boolean().default(true),
  shuffleQuestions: z.boolean().default(false),
  confirmationMessage: z.string().default('Your response has been recorded.'),
  allowMultipleSubmissions: z.boolean().default(true),
  requireAuth: z.boolean().default(false),
  collectEmail: z.boolean().default(false),
  restrictOneResponse: z.boolean().default(false),
  allowResponseEditing: z.boolean().default(false),
  showSummaryToRespondents: z.boolean().default(false),
  accessMode: z.enum(['PUBLIC', 'AUTHENTICATED', 'RESTRICTED']).default('PUBLIC'),
  // Advanced Quiz Settings
  quizReleaseGrade: z.enum(['IMMEDIATE', 'AFTER_REVIEW']).optional().default('IMMEDIATE'),
  quizShowCorrectAnswers: z.boolean().optional().default(true),
  quizShowPointsEarned: z.boolean().optional().default(true),
  quizShowFeedback: z.boolean().optional().default(true),
  quizPassPercentage: z.number().min(0).max(100).nullable().optional(),
  quizPassMessage: z.string().optional().default('Congratulations! You passed the quiz.'),
  quizFailMessage: z.string().optional().default('Unfortunately, you did not reach the passing score.'),
  quizDefaultPoints: z.number().int().min(0).optional().default(1),
  quizTimerMode: z.enum(['NONE', 'QUESTION', 'OVERALL', 'BOTH']).optional().default('NONE'),
  quizDurationMinutes: z.union([z.number().int().min(1).max(1440), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
  quizQuestionTimeLimitSeconds: z.union([z.number().int().min(1).max(3600), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
  quizNavigationPolicy: z.enum(['BACKWARD_ENABLED', 'FORWARD_ONLY']).optional().default('BACKWARD_ENABLED'),
  quizTimeoutBehavior: z.enum(['AUTO_FINALIZE']).optional().default('AUTO_FINALIZE'),
  quizIdentityQuestionId: z.string().nullable().optional(),
  quizExpectedParticipants: z.union([z.number().int().min(1), z.null(), z.literal('')]).optional().transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
  quizRosterMode: z.enum(['COUNT_ONLY', 'ROSTER']).optional().default('ROSTER'),
  // Duplicate Response Prevention
  duplicateIdentifierMethod: z
    .enum(['AUTH_USER', 'VERIFIED_EMAIL', 'QUESTION_FIELD', 'IP_ADDRESS'])
    .optional()
    .default('AUTH_USER'),
  duplicateIdentifierQuestionId: z.string().nullable().optional(),
  duplicateRestrictionScope: z
    .enum(['ONCE_PER_FORM', 'PERIODIC'])
    .optional()
    .default('ONCE_PER_FORM'),
  duplicateRestrictionPeriod: z
    .enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_HOURS'])
    .optional()
    .default('DAILY'),
  duplicateCustomHours: z
    .union([z.number().int().min(1).max(8760), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? 24 : Number(v))),
  // Controlled Response Editing
  editingAuthMethod: z
    .enum(['SECURE_EDIT_LINK', 'AUTH_USER', 'ADMIN_ONLY', 'BOTH_LINK_AND_AUTH'])
    .optional()
    .default('SECURE_EDIT_LINK'),
  editingWindowMode: z
    .enum(['ALWAYS', 'WITHIN_WINDOW', 'UNTIL_DEADLINE'])
    .optional()
    .default('ALWAYS'),
  editingWindowMinutes: z
    .union([z.number().int().min(1).max(525600), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? 1440 : Number(v))),
  editingDeadline: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (!v ? null : new Date(v).toISOString())),
});

export const createFormSchema = z.object({
  title: z.string().min(1, 'Form title is required').max(200).default('Untitled form'),
  description: z.string().max(2000).optional().default(''),
  isQuiz: z.boolean().optional().default(false),
  templateId: z.string().optional(),
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
  theme: formThemeSchema.partial().optional(),
  settings: formSettingsSchema.partial().optional(),
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
