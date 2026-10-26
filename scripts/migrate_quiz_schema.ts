import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('====================================================');
  console.log(' FormCraft Additive Schema Migration Runner        ');
  console.log('====================================================\n');

  const migrationFilePath = path.join(__dirname, '../prisma/migrations/20261026_add_quiz_and_inline_images.sql');
  if (!fs.existsSync(migrationFilePath)) {
    throw new Error(`Migration file not found at: ${migrationFilePath}`);
  }

  const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
  console.log('Executing additive migration SQL statements...');

  // Split statements by semicolon while ignoring comments
  const statements = sqlContent
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    console.log(`Executing: ${statement.split('\n')[0]}...`);
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('\nMigration completed successfully! All columns and tables are up to date.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
