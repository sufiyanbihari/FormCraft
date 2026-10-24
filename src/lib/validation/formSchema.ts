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
