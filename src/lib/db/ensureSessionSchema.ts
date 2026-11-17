import { prisma } from './prisma';

let sessionSchemaEnsured = false;
let ensuringPromise: Promise<void> | null = null;

export const SESSION_MIGRATION_STATEMENTS = [
  // Ensure UserRole enum type exists in PostgreSQL
  `DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`,

  // Add additive session tracking columns to sessions table
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userName" TEXT`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userEmail" TEXT`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userRole" "UserRole" DEFAULT 'USER'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT DEFAULT '127.0.0.1'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "userAgent" TEXT`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "deviceType" TEXT DEFAULT 'Desktop'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "browser" TEXT DEFAULT 'Unknown'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "os" TEXT DEFAULT 'Unknown'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE'`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "loginAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "logoutAt" TIMESTAMP(3)`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,

  // Performance and query indexes
  `CREATE INDEX IF NOT EXISTS "sessions_status_lastActiveAt_idx" ON "sessions"("status", "lastActiveAt")`,
  `CREATE INDEX IF NOT EXISTS "sessions_sessionToken_idx" ON "sessions"("sessionToken")`,
];

/**
 * Idempotently applies all additive session columns and indexes to PostgreSQL.
 * Rethrows errors if database execution fails so migrations fail loudly and visibly.
 */
export async function ensureSessionSchema(): Promise<void> {
  if (sessionSchemaEnsured) return;
  if (ensuringPromise) return ensuringPromise;

  ensuringPromise = (async () => {
    for (const statement of SESSION_MIGRATION_STATEMENTS) {
      await prisma.$executeRawUnsafe(statement);
    }
    sessionSchemaEnsured = true;
  })();

  return ensuringPromise;
}
