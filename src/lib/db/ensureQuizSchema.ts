import { prisma } from './prisma';

let quizSchemaEnsured = false;
let ensuringPromise: Promise<void> | null = null;

const MIGRATION_STATEMENTS = [
  // FormSettings: Advanced Quiz Settings
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizReleaseGrade" TEXT DEFAULT 'IMMEDIATE'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowCorrectAnswers" BOOLEAN DEFAULT true`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowPointsEarned" BOOLEAN DEFAULT true`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowFeedback" BOOLEAN DEFAULT true`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizPassPercentage" DOUBLE PRECISION`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizPassMessage" TEXT DEFAULT 'Congratulations! You passed the quiz.'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizFailMessage" TEXT DEFAULT 'Unfortunately, you did not reach the passing score.'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizDefaultPoints" INTEGER DEFAULT 1`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizTimerMode" TEXT DEFAULT 'NONE'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizDurationMinutes" INTEGER`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizQuestionTimeLimitSeconds" INTEGER`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizNavigationPolicy" TEXT DEFAULT 'BACKWARD_ENABLED'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizTimeoutBehavior" TEXT DEFAULT 'AUTO_FINALIZE'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizIdentityQuestionId" TEXT`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizExpectedParticipants" INTEGER`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizRosterMode" TEXT DEFAULT 'COUNT_ONLY'`,

  // FormQuestion: Per-question time limit in seconds
  `ALTER TABLE "form_questions" ADD COLUMN IF NOT EXISTS "timeLimitSeconds" INTEGER DEFAULT 0`,

  // QuestionOption: Inline Image URL
  `ALTER TABLE "question_options" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,

  // FormSubmission: Grade Release Status and Timestamp
  `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "isGradeReleased" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "gradeReleasedAt" TIMESTAMP(3)`,

  // SubmissionAnswer: Reviewer Feedback for Manual / Advanced Grading
  `ALTER TABLE "submission_answers" ADD COLUMN IF NOT EXISTS "reviewerFeedback" TEXT`,

  // UploadedFileData: Persistent Storage Table
  `CREATE TABLE IF NOT EXISTS "uploaded_file_data" (
    "file_key" VARCHAR(255) PRIMARY KEY,
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_uploaded_file_data_created" ON "uploaded_file_data"("created_at")`,

  // QuizParticipantRoster: Authorized Participant Roster Table
  `CREATE TABLE IF NOT EXISTS "quiz_participant_rosters" (
    "id" TEXT PRIMARY KEY,
    "formId" TEXT NOT NULL REFERENCES "forms"("id") ON DELETE CASCADE,
    "participantId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_participant_rosters_formId_participantId_key" UNIQUE ("formId", "participantId")
  )`,
  `CREATE INDEX IF NOT EXISTS "quiz_participant_rosters_formId_idx" ON "quiz_participant_rosters"("formId")`,

  // QuizAttempt: Persistent Quiz Attempt Table
  `CREATE TABLE IF NOT EXISTS "quiz_attempts" (
    "id" TEXT PRIMARY KEY,
    "formId" TEXT NOT NULL REFERENCES "forms"("id") ON DELETE CASCADE,
    "formVersionId" TEXT,
    "participantIdentity" TEXT NOT NULL,
    "participantName" TEXT,
    "rosterEntryId" TEXT REFERENCES "quiz_participant_rosters"("id") ON DELETE SET NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallDeadline" TIMESTAMP(3),
    "currentQuestionId" TEXT,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "currentQuestionStartedAt" TIMESTAMP(3),
    "currentQuestionDeadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "timeoutReason" TEXT,
    "earnedScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "savedAnswers" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "questionTiming" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "lockedQuestionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "questionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "submissionId" TEXT REFERENCES "form_submissions"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_attempts_formId_participantIdentity_key" UNIQUE ("formId", "participantIdentity")
  )`,
  `CREATE INDEX IF NOT EXISTS "quiz_attempts_formId_status_idx" ON "quiz_attempts"("formId", "status")`,
  `CREATE INDEX IF NOT EXISTS "quiz_attempts_formId_participantIdentity_idx" ON "quiz_attempts"("formId", "participantIdentity")`,
  `CREATE INDEX IF NOT EXISTS "quiz_attempts_formId_startedAt_idx" ON "quiz_attempts"("formId", "startedAt")`,

  // QuizAttempt: Per-attempt shuffled question sequence persistence
  `ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "questionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
];

import { ensureResponseControlSchema } from './ensureResponseControlSchema';

/**
 * Automatically ensures that all additive columns required by the Prisma schema
 * exist in the database. Runs idempotently and caches success in memory.
 */
export async function ensureQuizSchema(): Promise<void> {
  await ensureResponseControlSchema();
  if (quizSchemaEnsured) return;

  if (ensuringPromise) {
    return ensuringPromise;
  }

  ensuringPromise = (async () => {
    try {
      for (const statement of MIGRATION_STATEMENTS) {
        await prisma.$executeRawUnsafe(statement);
      }
      quizSchemaEnsured = true;
    } catch (err: unknown) {
      console.warn('[ensureQuizSchema] Schema migration warning:', err);
    } finally {
      ensuringPromise = null;
    }
  })();

  return ensuringPromise;
}
