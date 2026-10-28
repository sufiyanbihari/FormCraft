import { z } from 'zod';

export const startQuizAttemptSchema = z.object({
  participantIdentity: z.string().trim().min(1, 'Participant identity is required').max(100),
  participantName: z.string().trim().max(100).optional(),
});

export const saveQuizAnswerSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required'),
  questionId: z.string().min(1, 'Question ID is required'),
  value: z.any(),
});

export const quizNavigateSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required'),
  targetQuestionId: z.string().min(1, 'Target Question ID is required'),
  currentAnswer: z
    .object({
      questionId: z.string(),
      value: z.any(),
    })
    .optional(),
  direction: z.enum(['NEXT', 'PREV', 'JUMP']).default('NEXT'),
});

export const finalizeQuizAttemptSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required'),
  reason: z.enum(['MANUAL_SUBMISSION', 'OVERALL_TIMEOUT', 'QUESTION_TIMEOUT']).default('MANUAL_SUBMISSION'),
  finalAnswers: z
    .array(
      z.object({
        questionId: z.string(),
        value: z.any(),
      })
    )
    .optional(),
});

export const quizRosterItemSchema = z.object({
  participantId: z.string().trim().min(1, 'Participant ID is required').max(100),
  name: z.string().trim().max(100).optional().nullable(),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim() === '') return null;
      const trimmed = val.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(trimmed) ? trimmed : null;
    }),
});

export const batchQuizRosterSchema = z.object({
  participants: z.array(quizRosterItemSchema).min(1, 'At least one participant is required'),
});

export type StartQuizAttemptInput = z.infer<typeof startQuizAttemptSchema>;
export type SaveQuizAnswerInput = z.infer<typeof saveQuizAnswerSchema>;
export type QuizNavigateInput = z.infer<typeof quizNavigateSchema>;
export type FinalizeQuizAttemptInput = z.infer<typeof finalizeQuizAttemptSchema>;
export type QuizRosterItemInput = z.infer<typeof quizRosterItemSchema>;
export type BatchQuizRosterInput = z.infer<typeof batchQuizRosterSchema>;
