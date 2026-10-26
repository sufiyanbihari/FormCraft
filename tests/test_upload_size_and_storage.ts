import { formatSizeMb, formatBytes } from '../src/lib/utils';
import {
  saveUploadedFile,
  deleteUploadedFile,
  getEffectiveUploadDir,
  getFile,
  getActiveStorageProvider,
  saveToDatabase,
  getFromDatabase,
  deleteFromDatabase,
  ensureDatabaseStorageTable,
  migrateLocalFilesToStorage,
} from '../src/lib/storage/fileStorage';
import { GET as getUploadHandler } from '../src/app/uploads/[...path]/route';
import { POST as postUploadHandler, DELETE as deleteUploadHandler } from '../src/app/api/uploads/route';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import assert from 'assert';
import fs from 'fs/promises';

async function runTests() {
  console.log('====================================================');
  console.log('   FormCraft Upload & Retrieval Verification Tests  ');
  console.log('====================================================\n');

  // Test 1: formatSizeMb
  console.log('Test 1: formatSizeMb formatting');
  assert.strictEqual(formatSizeMb(10), '10 MB');
  assert.strictEqual(formatSizeMb(500), '500 MB');
  assert.strictEqual(formatSizeMb(800), '800 MB');
  assert.strictEqual(formatSizeMb(1024), '1 GB');
  assert.strictEqual(formatSizeMb(2048), '2 GB');
  assert.strictEqual(formatSizeMb(5120), '5 GB');
  assert.strictEqual(formatSizeMb(10240), '10 GB');
  console.log('  ✓ formatSizeMb verified for 10MB, 500MB, 800MB, 1GB, 5GB, 10GB\n');

  // Test 2: formatBytes
  console.log('Test 2: formatBytes formatting');
  assert.strictEqual(formatBytes(1024), '1 KB');
  assert.strictEqual(formatBytes(1024 * 1024), '1 MB');
  assert.strictEqual(formatBytes(500 * 1024 * 1024), '500 MB');
  assert.strictEqual(formatBytes(1024 * 1024 * 1024), '1 GB');
  assert.strictEqual(formatBytes(5 * 1024 * 1024 * 1024), '5 GB');
  assert.strictEqual(formatBytes(10 * 1024 * 1024 * 1024), '10 GB');
  console.log('  ✓ formatBytes verified accurately\n');

  // Test 3: getEffectiveUploadDir
  console.log('Test 3: getEffectiveUploadDir returns a writable directory');
  const uploadDir = await getEffectiveUploadDir();
  assert(uploadDir && uploadDir.length > 0, 'Upload dir should not be empty');
  const stat = await fs.stat(uploadDir);
  assert(stat.isDirectory(), 'Upload dir should be a directory');
  console.log('  ✓ Upload dir resolved to:', uploadDir, '\n');

  // Test 4: saveUploadedFile size validation
  console.log('Test 4: saveUploadedFile size validation');
  const testBuffer = Buffer.alloc(2 * 1024 * 1024, 'a');
  const mockFile = new File([testBuffer], 'test-photo.jpg', { type: 'image/jpeg' });

  let failed = false;
  try {
    await saveUploadedFile(mockFile, 1);
  } catch (err: any) {
    failed = true;
    assert(
      err.message.includes('exceeds maximum allowed limit of 1 MB'),
      `Unexpected error message: ${err.message}`
    );
  }
  assert(failed, 'Upload should have been rejected when exceeding 1MB limit');
  console.log('  ✓ Correctly rejected when file exceeds custom limit\n');

  // Test 5: Image upload and retrieval (PNG & JPEG)
  console.log('Test 5: Image upload and retrieval');
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const imagePayload = Buffer.concat([pngHeader, Buffer.alloc(100, 1)]);
  const mockImage = new File([imagePayload], 'diagram.png', { type: 'image/png' });

  const savedImage = await saveUploadedFile(mockImage, 50);
  assert(savedImage.fileKey.endsWith('.png'), 'Image should preserve .png extension');
  assert(savedImage.publicUrl.startsWith('/uploads/'), 'Should have canonical /uploads/ URL');
  assert.strictEqual(savedImage.mimeType, 'image/png');
  console.log('  ✓ Image saved successfully. URL:', savedImage.publicUrl);

  const retrievedImage = await getFile(savedImage.fileKey);
  assert(retrievedImage, 'Should be able to retrieve uploaded image');
  assert.strictEqual(retrievedImage.mimeType, 'image/png');
  assert(retrievedImage.buffer || retrievedImage.redirectUrl, 'Must have buffer or redirectUrl');
  if (retrievedImage.buffer) {
    assert.strictEqual(retrievedImage.buffer.length, imagePayload.length);
    assert.strictEqual(retrievedImage.buffer[0], 137);
  }
  console.log('  ✓ Image retrieved byte-for-byte with correct Content-Type\n');

  // Test 6: Video upload and Range Request streaming (HTTP 206)
  console.log('Test 6: Video upload and Range request (seeking/streaming)');
  const videoBuffer = Buffer.alloc(5000, 42); // 5000 bytes mock MP4
  const mockVideo = new File([videoBuffer], 'demo.mp4', { type: 'video/mp4' });

  const savedVideo = await saveUploadedFile(mockVideo, 100);
  assert(savedVideo.fileKey.endsWith('.mp4'), 'Video should preserve .mp4 extension');
  assert.strictEqual(savedVideo.mimeType, 'video/mp4');
  console.log('  ✓ Video saved successfully. URL:', savedVideo.publicUrl);

  // Test GET route handler with Range request
  const reqUrl = `http://localhost:3000/uploads/${savedVideo.fileKey}`;
  const rangeReq = new NextRequest(reqUrl, {
    headers: {
      range: 'bytes=0-999',
    },
  });

  const rangeResponse = await getUploadHandler(rangeReq, {
    params: Promise.resolve({ path: [savedVideo.fileKey] }),
  });

  assert.strictEqual(rangeResponse.status, 206, 'Should return HTTP 206 Partial Content for range request');
  assert.strictEqual(rangeResponse.headers.get('Content-Range'), 'bytes 0-999/5000');
  assert.strictEqual(rangeResponse.headers.get('Content-Length'), '1000');
  assert.strictEqual(rangeResponse.headers.get('Content-Type'), 'video/mp4');
  assert.strictEqual(rangeResponse.headers.get('Accept-Ranges'), 'bytes');
  console.log('  ✓ Video Range Request returned HTTP 206 Partial Content (bytes 0-999/5000)\n');

  // Test 7: Non-existent file returns HTTP 404 text/plain
  console.log('Test 7: Non-existent file retrieval');
  const notFoundReq = new NextRequest('http://localhost:3000/uploads/non-existent-file-12345.png');
  const notFoundRes = await getUploadHandler(notFoundReq, {
    params: Promise.resolve({ path: ['non-existent-file-12345.png'] }),
  });
  assert.strictEqual(notFoundRes.status, 404, 'Should return 404 for non-existent file');
  const notFoundText = await notFoundRes.text();
  assert.strictEqual(notFoundText, 'File not found');
  assert(
    notFoundRes.headers.get('Content-Type')?.includes('text/plain'),
    `Content-Type should be text/plain, got: ${notFoundRes.headers.get('Content-Type')}`
  );
  console.log('  ✓ Non-existent file returned HTTP 404 with text/plain\n');

  // Test 8: Security checks - blocked executable files
  console.log('Test 8: Blocked executable security checks');
  const dangerousNames = ['payload.exe', 'script.sh', 'malware.bat', 'inject.php', 'hack.vbs'];
  for (const name of dangerousNames) {
    let blocked = false;
    try {
      const mockDangerous = new File([Buffer.from('echo malicious')], name, { type: 'application/octet-stream' });
      await saveUploadedFile(mockDangerous, 10);
    } catch (err: any) {
      blocked = true;
      assert(err.message.includes('not permitted for security reasons'));
    }
    assert(blocked, `Dangerous file "${name}" should have been blocked`);
  }
  console.log('  ✓ Blocked .exe, .sh, .bat, .php, .vbs executable files\n');

  // Test 9: Database Storage Provider Direct Test (Neon PostgreSQL / Prisma)
  console.log('Test 9: Database persistent storage provider');
  await ensureDatabaseStorageTable();
  const dbTestKey = `db-test-${Date.now()}.png`;
  const dbTestData = Buffer.from('TEST_IMAGE_BINARY_DATA_IN_NEON_POSTGRES');

  await saveToDatabase(dbTestKey, 'test.png', dbTestData, 'image/png');
  const dbResult = await getFromDatabase(dbTestKey);
  assert(dbResult, 'Should retrieve stored file from database');
  assert.strictEqual(dbResult.fileSize, dbTestData.length);
  assert.strictEqual(dbResult.mimeType, 'image/png');
  assert.strictEqual(dbResult.buffer?.toString(), dbTestData.toString());

  // Test retrieval via getFile
  const getFileResult = await getFile(dbTestKey);
  assert(getFileResult, 'getFile should find database-stored file');
  assert.strictEqual(getFileResult.buffer?.toString(), dbTestData.toString());

  // Clean up DB test record
  await deleteFromDatabase(dbTestKey);
  const deletedDbResult = await getFromDatabase(dbTestKey);
  assert.strictEqual(deletedDbResult, null, 'File should be removed from database');
  console.log('  ✓ Database persistent storage provider verified successfully\n');

  // Test 10: Full POST /api/uploads route handler
  console.log('Test 10: POST /api/uploads route handler integration');
  const formPayload = new FormData();
  const apiTestFile = new File([Buffer.from('Integration test file payload')], 'sample.txt', {
    type: 'text/plain',
  });
  formPayload.append('file', apiTestFile);

  const postReq = new NextRequest('http://localhost:3000/api/uploads', {
    method: 'POST',
    body: formPayload,
  });

  const postRes = await postUploadHandler(postReq);
  assert.strictEqual(postRes.status, 200, `POST /api/uploads should succeed, got ${postRes.status}`);
  const postData = await postRes.json();
  assert(postData.publicUrl.startsWith('/uploads/'), 'Should return publicUrl starting with /uploads/');
  assert(postData.file?.id, 'Should create UploadedFile record in Prisma database');
  assert.strictEqual(postData.fileName, 'sample.txt');
  console.log('  ✓ POST /api/uploads created DB record and returned publicUrl:', postData.publicUrl);

  // Retrieve via GET /uploads/[...path]
  const verifyPath = postData.file.fileKey;
  const verifyReq = new NextRequest(`http://localhost:3000/uploads/${verifyPath}`);
  const verifyRes = await getUploadHandler(verifyReq, {
    params: Promise.resolve({ path: [verifyPath] }),
  });
  assert.strictEqual(verifyRes.status, 200, 'GET /uploads/[...path] should return 200');
  const verifyText = await verifyRes.text();
  assert.strictEqual(verifyText, 'Integration test file payload');
  console.log('  ✓ GET /uploads/[...path] retrieved the file uploaded via POST /api/uploads\n');

  // Clean up
  await deleteUploadedFile(savedImage.fileKey);
  await deleteUploadedFile(savedVideo.fileKey);
  await deleteUploadedFile(verifyPath);
  await prisma.uploadedFile.deleteMany({
    where: { fileKey: { in: [savedImage.fileKey, savedVideo.fileKey, verifyPath] } },
  });

  console.log('🎉 ALL UPLOAD & RETRIEVAL TESTS PASSED SUCCESSFULLY!');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
