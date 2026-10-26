import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db/prisma';
import {
  PRIMARY_UPLOAD_DIR,
  ensureDatabaseStorageTable,
  saveToDatabase,
  getFromDatabase,
  getFile,
  getActiveStorageProvider,
} from '../src/lib/storage/fileStorage';

async function main() {
  console.log('====================================================');
  console.log('   FormCraft Persistent Storage Migration Tool     ');
  console.log('====================================================\n');

  const provider = getActiveStorageProvider();
  console.log(`Active Storage Provider: [${provider.toUpperCase()}]`);

  // Ensure DB table exists
  await ensureDatabaseStorageTable();

  // 1. Scan public/uploads directory
  let localFiles: string[] = [];
  if (fs.existsSync(PRIMARY_UPLOAD_DIR)) {
    localFiles = fs.readdirSync(PRIMARY_UPLOAD_DIR).filter((f) => {
      try {
        return fs.statSync(path.join(PRIMARY_UPLOAD_DIR, f)).isFile();
      } catch {
        return false;
      }
    });
  }
  console.log(`Found ${localFiles.length} files in local disk directory: ${PRIMARY_UPLOAD_DIR}`);

  // 2. Scan DB records
  const dbRecords = await prisma.uploadedFile.findMany();
  console.log(`Found ${dbRecords.length} UploadedFile records in database.\n`);

  let migratedCount = 0;
  let alreadyStoredCount = 0;
  let missingFilesCount = 0;
  const brokenFiles: string[] = [];

  // Migrate local files to DB storage / persistent storage
  for (const fileName of localFiles) {
    const filePath = path.join(PRIMARY_UPLOAD_DIR, fileName);
    try {
      const existing = await getFromDatabase(fileName);
      if (existing) {
        alreadyStoredCount++;
        continue;
      }

      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.pdf'
              ? 'application/pdf'
              : ext === '.mp4'
                ? 'video/mp4'
                : 'application/octet-stream';

      await saveToDatabase(fileName, fileName, buffer, mime);
      migratedCount++;
      console.log(`  ✓ Migrated to database: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err: any) {
      console.error(`  ✗ Error migrating ${fileName}:`, err?.message || err);
    }
  }

  // Check DB records for broken files
  for (const record of dbRecords) {
    const fileKey = record.fileKey;
    const fileRes = await getFile(fileKey);
    if (!fileRes) {
      missingFilesCount++;
      brokenFiles.push(fileKey);
      console.warn(`  ⚠️  File record in DB missing from storage and disk: ${record.fileName} (${fileKey})`);
    }
  }

  console.log('\n----------------- Migration Summary -----------------');
  console.log(`Active Provider:         ${provider}`);
  console.log(`Local Files Scanned:     ${localFiles.length}`);
  console.log(`Newly Migrated:          ${migratedCount}`);
  console.log(`Already in Storage:      ${alreadyStoredCount}`);
  console.log(`Missing / Broken Files:  ${missingFilesCount}`);

  if (brokenFiles.length > 0) {
    console.log('\nMigration Plan for Broken Files:');
    console.log('The following files were previously uploaded to ephemeral storage on Vercel and need to be re-uploaded:');
    brokenFiles.forEach((f) => console.log(` - ${f}`));
    console.log('Form authors can click "Upload picture from device" or "Replace file" in Form Builder / QuestionCard to replace them.');
  }

  console.log('\n🎉 Storage migration completed successfully!\n');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
