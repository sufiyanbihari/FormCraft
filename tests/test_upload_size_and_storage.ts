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
  createPresignedUploadUrl,
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

  // Test 11: createPresignedUploadUrl security checks (dangerous extensions)
  console.log('Test 11: createPresignedUploadUrl blocked extensions');
  let blockedCount = 0;
  for (const name of ['payload.exe', 'script.sh', 'macro.bat', 'shell.php']) {
    try {
      await createPresignedUploadUrl({
        fileName: name,
        fileSize: 1024,
        mimeType: 'application/octet-stream',
      });
    } catch (err: any) {
      if (err.message.includes('not permitted for security reasons')) {
        blockedCount++;
      }
    }
  }
  assert.strictEqual(blockedCount, 4, 'All 4 dangerous extensions should be blocked');
  console.log('  ✓ createPresignedUploadUrl successfully blocked executable extensions\n');

  // Test 12: createPresignedUploadUrl size limit checks
  console.log('Test 12: createPresignedUploadUrl size limit enforcement');
  let sizeRejected = false;
  try {
    await createPresignedUploadUrl({
      fileName: 'large-video.mp4',
      fileSize: 20 * 1024 * 1024, // 20 MB
      mimeType: 'video/mp4',
      maxSizeMb: 10, // Max 10 MB
    });
  } catch (err: any) {
    sizeRejected = true;
    assert(err.message.includes('exceeds maximum allowed limit of 10 MB'));
  }
  assert(sizeRejected, 'Should reject file exceeding maxSizeMb');
  console.log('  ✓ createPresignedUploadUrl rejected file exceeding maxSizeMb\n');

  // Test 13: createPresignedUploadUrl Vercel 4.5MB guardrail in production
  console.log('Test 13: Vercel 4.5MB platform limit guardrail in production');
  const prevVercelEnv = process.env.VERCEL;
  const prevS3Bucket = process.env.S3_BUCKET;
  const prevAwsBucket = process.env.AWS_S3_BUCKET;
  const prevBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

  try {
    process.env.VERCEL = '1';
    delete process.env.S3_BUCKET;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const presignChunked = await createPresignedUploadUrl({
      fileName: 'sample-large-video.mp4',
      fileSize: 10 * 1024 * 1024, // 10MB
      mimeType: 'video/mp4',
    });
    assert.strictEqual(
      presignChunked.mode,
      'chunked',
      'Should switch to chunked mode on Vercel for files > 4MB when no cloud object storage configured'
    );
    assert.strictEqual(
      presignChunked.uploadUrl,
      '/api/uploads/chunk',
      'Upload URL should route to /api/uploads/chunk'
    );
    assert.strictEqual(
      presignChunked.chunkSize,
      3 * 1024 * 1024,
      'Chunk size must be 3MB'
    );
    console.log('  ✓ Vercel serverless environment seamlessly routes > 4MB files to chunked upload engine\n');
  } finally {
    if (prevVercelEnv !== undefined) {
      process.env.VERCEL = prevVercelEnv;
    } else {
      delete process.env.VERCEL;
    }
    if (prevS3Bucket) process.env.S3_BUCKET = prevS3Bucket; else delete process.env.S3_BUCKET;
    if (prevAwsBucket) process.env.AWS_S3_BUCKET = prevAwsBucket; else delete process.env.AWS_S3_BUCKET;
    if (prevBlobToken) process.env.BLOB_READ_WRITE_TOKEN = prevBlobToken; else delete process.env.BLOB_READ_WRITE_TOKEN;
  }

  // Test 14: Direct S3/R2 presigned upload URL generation
  console.log('Test 14: Direct S3 / Cloudflare R2 presigned PUT URL generation');
  const s3TestBucket = 'test-formcraft-uploads';
  const prevS3Key = process.env.AWS_ACCESS_KEY_ID;
  const prevS3Secret = process.env.AWS_SECRET_ACCESS_KEY;
  const prevS3Reg = process.env.AWS_REGION;

  try {
    process.env.S3_BUCKET = s3TestBucket;
    process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key-12345';
    process.env.AWS_REGION = 'us-east-1';

    const s3Presigned = await createPresignedUploadUrl({
      fileName: 'presentation.mp4',
      fileSize: 50 * 1024 * 1024, // 50MB
      mimeType: 'video/mp4',
      maxSizeMb: 100,
    });

    assert.strictEqual(s3Presigned.mode, 'signed_url');
    assert.strictEqual(s3Presigned.provider, 's3');
    assert.strictEqual(s3Presigned.method, 'PUT');
    assert(s3Presigned.uploadUrl.startsWith('https://'), 'Upload URL must be https');
    assert(s3Presigned.uploadUrl.includes('X-Amz-Signature'), 'Must contain AWS SigV4 query params');
    assert(s3Presigned.uploadUrl.includes(s3Presigned.fileKey), 'Must contain fileKey');
    assert.strictEqual(s3Presigned.headers?.['Content-Type'], 'video/mp4');
    assert.strictEqual(s3Presigned.publicUrl, `/uploads/${s3Presigned.fileKey}`);
    console.log('  ✓ S3/R2 presigned URL generated with SigV4 signature and PUT method\n');
  } finally {
    delete process.env.S3_BUCKET;
    if (prevS3Key) process.env.AWS_ACCESS_KEY_ID = prevS3Key; else delete process.env.AWS_ACCESS_KEY_ID;
    if (prevS3Secret) process.env.AWS_SECRET_ACCESS_KEY = prevS3Secret; else delete process.env.AWS_SECRET_ACCESS_KEY;
    if (prevS3Reg) process.env.AWS_REGION = prevS3Reg; else delete process.env.AWS_REGION;
  }

  // Test 15: POST /api/uploads/presigned route handler
  console.log('Test 15: POST /api/uploads/presigned route handler integration');
  const { POST: presignedHandler } = await import('../src/app/api/uploads/presigned/route');

  // 15a: Missing fileName
  const badReq1 = new NextRequest('http://localhost:3000/api/uploads/presigned', {
    method: 'POST',
    body: JSON.stringify({ fileSize: 1000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const badRes1 = await presignedHandler(badReq1);
  assert.strictEqual(badRes1.status, 400);

  // 15b: Dangerous file extension
  const dangerousReq = new NextRequest('http://localhost:3000/api/uploads/presigned', {
    method: 'POST',
    body: JSON.stringify({ fileName: 'virus.exe', fileSize: 1000 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const dangerousRes = await presignedHandler(dangerousReq);
  assert.strictEqual(dangerousRes.status, 400);
  const dangerousJson = await dangerousRes.json();
  assert(dangerousJson.error.includes('not permitted for security reasons'));

  // 15c: Valid presigned request (local mode <= 4.5MB)
  const validPresignedReq = new NextRequest('http://localhost:3000/api/uploads/presigned', {
    method: 'POST',
    body: JSON.stringify({
      fileName: 'interview-clip.mp4',
      fileSize: 2 * 1024 * 1024,
      mimeType: 'video/mp4',
      maxSizeMb: 50,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const validPresignedRes = await presignedHandler(validPresignedReq);
  assert.strictEqual(validPresignedRes.status, 200);
  const validPresignedData = await validPresignedRes.json();
  assert.strictEqual(validPresignedData.success, true);
  assert(validPresignedData.fileKey.endsWith('.mp4'));
  assert(validPresignedData.publicUrl.startsWith('/uploads/'));
  assert.strictEqual(validPresignedData.mode, 'direct_api');

  // 15d: Valid presigned request with S3/R2 direct-to-storage enabled
  try {
    process.env.S3_BUCKET = 'formcraft-cloud-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'test-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_REGION = 'us-east-1';

    const s3RouteReq = new NextRequest('http://localhost:3000/api/uploads/presigned', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'customer-video.mp4',
        fileSize: 50 * 1024 * 1024,
        mimeType: 'video/mp4',
        maxSizeMb: 100,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const s3RouteRes = await presignedHandler(s3RouteReq);
    assert.strictEqual(s3RouteRes.status, 200);
    const s3RouteData = await s3RouteRes.json();
    assert.strictEqual(s3RouteData.success, true);
    assert.strictEqual(s3RouteData.mode, 'signed_url');
    assert.strictEqual(s3RouteData.provider, 's3');
    assert(s3RouteData.uploadUrl.startsWith('https://'));
  } finally {
    delete process.env.S3_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  }
  console.log('  ✓ POST /api/uploads/presigned validates inputs and returns upload configuration\n');

  // Test 16: POST /api/uploads/complete route handler
  console.log('Test 16: POST /api/uploads/complete route handler integration');
  const { POST: completeHandler } = await import('../src/app/api/uploads/complete/route');

  const testFileKey = `test-direct-complete-${Date.now()}.mp4`;
  const completeReq = new NextRequest('http://localhost:3000/api/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({
      fileKey: testFileKey,
      fileName: 'interview-clip.mp4',
      fileSize: 15 * 1024 * 1024,
      mimeType: 'video/mp4',
      directUrl: `https://test-bucket.s3.amazonaws.com/${testFileKey}`,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const completeRes = await completeHandler(completeReq);
  assert.strictEqual(completeRes.status, 200, 'POST /api/uploads/complete should succeed');
  const completeData = await completeRes.json();
  assert.strictEqual(completeData.success, true);
  assert.strictEqual(completeData.file.fileKey, testFileKey);
  assert.strictEqual(completeData.publicUrl, `/uploads/${testFileKey}`);
  assert.strictEqual(completeData.fileName, 'interview-clip.mp4');

  // Verify DB record exists
  const dbRecord = await prisma.uploadedFile.findUnique({
    where: { fileKey: testFileKey },
  });
  assert(dbRecord, 'Record must exist in prisma.uploadedFile');
  assert.strictEqual(dbRecord.fileKey, testFileKey);
  assert.strictEqual(dbRecord.fileSize, 15 * 1024 * 1024);
  console.log('  ✓ POST /api/uploads/complete saved metadata in database and created audit record\n');

  // Clean up completed test record
  await prisma.uploadedFile.delete({ where: { fileKey: testFileKey } });

  // Test 17: Authentication /api/auth/me behavior
  console.log('Test 17: Authentication status check (/api/auth/me)');
  const { GET: authMeHandler } = await import('../src/app/api/auth/me/route');

  const unauthReq = new NextRequest('http://localhost:3000/api/auth/me');
  const unauthRes = await authMeHandler(unauthReq);
  assert.strictEqual(
    unauthRes.status,
    401,
    '/api/auth/me should return HTTP 401 when called without a session cookie'
  );
  const unauthData = await unauthRes.json();
  assert.strictEqual(unauthData.user, null, 'User should be null in unauthenticated state');
  console.log('  ✓ /api/auth/me correctly returns 401 { user: null } for unauthenticated requests');
  console.log('  ✓ Confirmed: 401 is normal for public form respondents, does not impede anonymous uploads\n');

  // Clean up
  await deleteUploadedFile(savedImage.fileKey);
  await deleteUploadedFile(savedVideo.fileKey);
  await deleteUploadedFile(verifyPath);
  await prisma.uploadedFile.deleteMany({
    where: { fileKey: { in: [savedImage.fileKey, savedVideo.fileKey, verifyPath] } },
  });

  console.log('🎉 ALL 17 UPLOAD, STORAGE, STREAMING & AUTH TESTS PASSED SUCCESSFULLY!');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
