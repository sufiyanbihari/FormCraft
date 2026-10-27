import { z } from 'zod';

export const QuestionTypeEnum = z.enum([
  'SHORT_ANSWER',
  'PARAGRAPH',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'FILE_UPLOAD',
  'LINEAR_SCALE',
  'MULTIPLE_CHOICE_GRID',
  'CHECKBOX_GRID',
  'DATE',
  'TIME',
  'RATING',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'WEBSITE',
  'SECTION_HEADER',
  'TEXT_BLOCK',
  'IMAGE_BLOCK',
  'VIDEO_EMBED',
]);

export type QuestionType = z.infer<typeof QuestionTypeEnum>;

export const questionOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string().default(''),
  value: z.string().optional(),
  orderIndex: z.number().int().default(0),
  isOther: z.boolean().default(false),
  goToSectionId: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});

export const questionValidationSchema = z.object({
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  minVal: z.number().optional(),
  maxVal: z.number().optional(),
  regex: z.string().optional(),
  minSelect: z.number().int().optional(),
  maxSelect: z.number().int().optional(),
  customError: z.string().optional(),
});

export const questionConfigSchema = z.object({
  scaleMin: z.number().int().default(1),
  scaleMax: z.number().int().default(5),
  scaleMinLabel: z.string().optional(),
  scaleMaxLabel: z.string().optional(),
  rows: z.array(z.string()).optional(),
  cols: z.array(z.string()).optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  maxFileSizeMb: z.number().int().min(1).max(51200).default(10),
  maxImageSizeMb: z.number().int().min(1).max(51200).default(10),
  maxVideoSizeMb: z.number().int().min(1).max(51200).default(50),
  maxFiles: z.number().int().default(1),
  embedUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAlt: z.string().optional(),
  videoUrl: z.string().optional(),
  imageAlignment: z.enum(['left', 'center', 'right']).optional().default('center'),
  ratingMax: z.number().int().default(5),
  ratingIcon: z.enum(['STAR', 'HEART', 'THUMB', 'NUMBER']).default('STAR'),
});

export const createQuestionSchema = z.object({
  sectionId: z.string(),
  title: z.string().optional().default('Untitled Question'),
  description: z.string().nullable().optional().default(''),
  type: QuestionTypeEnum.default('SHORT_ANSWER'),
  isRequired: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
  validation: questionValidationSchema.optional().default({}),
  config: questionConfigSchema.optional().default({
    scaleMin: 1,
    scaleMax: 5,
    maxFileSizeMb: 10,
    maxImageSizeMb: 10,
    maxVideoSizeMb: 50,
    maxFiles: 1,
    imageAlignment: 'center',
    ratingMax: 5,
    ratingIcon: 'STAR',
  }),
  quizPoints: z.number().int().min(0).default(0),
  quizAnswer: z.any().optional().default({}),
  quizExplanation: z.string().nullable().optional().default(''),
  timeLimitSeconds: z.number().int().min(0).optional().default(0),
  options: z.array(questionOptionSchema).optional().default([]),
});

export const updateQuestionSchema = z.object({
  sectionId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  type: QuestionTypeEnum.optional(),
  isRequired: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
  validation: questionValidationSchema.optional(),
  config: questionConfigSchema.partial().optional(),
  quizPoints: z.number().int().min(0).optional(),
  quizAnswer: z.any().optional(),
  quizExplanation: z.string().nullable().optional(),
  timeLimitSeconds: z.number().int().min(0).optional(),
  options: z.array(questionOptionSchema).optional(),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;
