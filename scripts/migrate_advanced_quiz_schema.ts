import { ensureQuizSchema } from '../src/lib/db/ensureQuizSchema';
import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('Ensuring Advanced Quiz schema in PostgreSQL...');
  await ensureQuizSchema();
  console.log('Schema migration completed successfully!');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
