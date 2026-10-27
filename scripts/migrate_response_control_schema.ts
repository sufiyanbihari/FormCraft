import { ensureResponseControlSchema } from '../src/lib/db/ensureResponseControlSchema';
import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('Applying Response Control schema migration...');
  await ensureResponseControlSchema();
  console.log('Response Control schema successfully applied to PostgreSQL database!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
