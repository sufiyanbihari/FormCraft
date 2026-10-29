import { prisma } from './prisma';

let schemaEnsured = false;
let ensuringPromise: Promise<void> | null = null;

const MIGRATION_STATEMENTS = [
  // FormSettings: Configurable Duplicate Response Prevention
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "duplicateIdentifierMethod" TEXT DEFAULT 'IP_ADDRESS'`,
  `UPDATE "form_settings" SET "duplicateIdentifierMethod" = 'IP_ADDRESS' WHERE "duplicateIdentifierMethod" IN ('AUTH_USER', 'VERIFIED_EMAIL')`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "duplicateIdentifierQuestionId" TEXT`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "duplicateRestrictionScope" TEXT DEFAULT 'ONCE_PER_FORM'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "duplicateRestrictionPeriod" TEXT DEFAULT 'DAILY'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "duplicateCustomHours" INTEGER DEFAULT 24`,

  // FormSettings: Controlled Response Editing
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "editingAuthMethod" TEXT DEFAULT 'SECURE_EDIT_LINK'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "editingWindowMode" TEXT DEFAULT 'ALWAYS'`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "editingWindowMinutes" INTEGER DEFAULT 1440`,
  `ALTER TABLE "form_settings" ADD COLUMN IF NOT EXISTS "editingDeadline" TIMESTAMP(3)`,

  // FormSubmission: Controlled Response Editing Metadata
  `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "editCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "lastEditedAt" TIMESTAMP(3)`,
  `ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "lastEditedBy" TEXT`,

  // Performance Indexes for Duplicate Checks
  `CREATE INDEX IF NOT EXISTS "form_submissions_formId_respondentUserId_submittedAt_idx" ON "form_submissions"("formId", "respondentUserId", "submittedAt")`,
  `CREATE INDEX IF NOT EXISTS "form_submissions_formId_respondentEmail_submittedAt_idx" ON "form_submissions"("formId", "respondentEmail", "submittedAt")`,
  `CREATE INDEX IF NOT EXISTS "form_submissions_formId_ipHash_submittedAt_idx" ON "form_submissions"("formId", "ipHash", "submittedAt")`,
];

export async function ensureResponseControlSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (ensuringPromise) return ensuringPromise;

  ensuringPromise = (async () => {
    for (const statement of MIGRATION_STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (err: any) {
        console.warn('[ensureResponseControlSchema] Statement notice:', err?.message || err);
      }
    }
    schemaEnsured = true;
  })();

  return ensuringPromise;
}
