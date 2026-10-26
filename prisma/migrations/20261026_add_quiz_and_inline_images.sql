-- ==============================================================================
-- FormCraft Additive Migration: Advanced Quiz Mode & Inline Question Images
-- Compatible with PostgreSQL (Neon / AWS RDS / Local)
-- Completely non-destructive: Safe to run on production without data loss.
-- ==============================================================================

-- 1. FormSettings: Advanced Quiz Settings
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizReleaseGrade" TEXT DEFAULT 'IMMEDIATE';
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowCorrectAnswers" BOOLEAN DEFAULT true;
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowPointsEarned" BOOLEAN DEFAULT true;
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizShowFeedback" BOOLEAN DEFAULT true;
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizPassPercentage" DOUBLE PRECISION;
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizPassMessage" TEXT DEFAULT 'Congratulations! You passed the quiz.';
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizFailMessage" TEXT DEFAULT 'Unfortunately, you did not reach the passing score.';
ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "quizDefaultPoints" INTEGER DEFAULT 1;

-- 2. QuestionOption: Inline Image URL
ALTER TABLE "question_options" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- 3. FormSubmission: Grade Release Status and Timestamp
ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "isGradeReleased" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "gradeReleasedAt" TIMESTAMP(3);

-- 4. SubmissionAnswer: Reviewer Feedback for Manual / Advanced Grading
ALTER TABLE "submission_answers" ADD COLUMN IF NOT EXISTS "reviewerFeedback" TEXT;

-- 5. UploadedFileData: Persistent Storage Table (Idempotent)
CREATE TABLE IF NOT EXISTS "uploaded_file_data" (
  "file_key" VARCHAR(255) PRIMARY KEY,
  "file_name" VARCHAR(255),
  "mime_type" VARCHAR(255) NOT NULL,
  "file_size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_uploaded_file_data_created" ON "uploaded_file_data"("created_at");
