import { z } from 'zod';

export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  value: z.any(), // string, string[], number, grid object { [rowId: string]: string }, file object
});

export const cattleOwnerEntrySchema = z.object({
  id: z.string(),
  ownerName: z.string().trim().min(1, 'Cattle Owner Full Name is required'),
  ownerMobile: z.string().trim().regex(/^\d{10}$/, 'Owner Mobile Number must be exactly 10 digits'),
  largeCattleCount: z.coerce.number().min(0, 'Large cattle count cannot be negative'),
  smallCattleCount: z.coerce.number().min(0, 'Small cattle count cannot be negative'),
  flooringType: z.string().trim().min(1, 'Flooring Type is required'),
  supplyDung: z.string().trim().min(1, 'Supply Dung agreement is required'),
});

export type CattleOwnerEntryInput = z.infer<typeof cattleOwnerEntrySchema>;

export const submitFormSchema = z.object({
  answers: z.array(answerSubmissionSchema),
  cattleOwners: z.array(cattleOwnerEntrySchema).optional(),
  respondentEmail: z.string().email().optional().or(z.literal('')),
  idempotencyKey: z.string().optional(),
  visitedSectionIds: z.array(z.string()).optional(), // used to verify reachable path & conditional logic
});

export type SubmitFormInput = z.infer<typeof submitFormSchema>;
