import { SESSION_MIGRATION_STATEMENTS } from '../src/lib/db/ensureSessionSchema';
import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('====================================================');
  console.log(' FormCraft Additive Session Schema Migration Runner ');
  console.log('====================================================\n');

  console.log(`Executing ${SESSION_MIGRATION_STATEMENTS.length} additive session migration statements...`);

  for (const statement of SESSION_MIGRATION_STATEMENTS) {
    const preview = statement.split('\n')[0].trim();
    console.log(`Executing: ${preview}...`);
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('\nMigration completed successfully! All session tracking columns and indexes are active.');
}

main()
  .catch((e) => {
    console.error('Session migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
