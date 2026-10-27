import { createPresignedUploadUrl, getFile, deleteUploadedFile, ensureDatabaseStorageTable } from '../src/lib/storage/fileStorage';
import { POST as chunkUploadHandler } from '../src/app/api/uploads/chunk/route';
import { GET as getUploadHandler } from '../src/app/uploads/[...path]/route';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db/prisma';
import assert from 'assert';
import crypto from 'crypto';

async function runChunkedTests() {
  console.log('====================================================');
  console.log('   FormCraft Chunked Video Upload Verification Tests');
  console.log('====================================================\n');

  // Test 1: Presigned URL returns chunked mode for large files (> 4MB)
  console.log('Test 1: createPresignedUploadUrl for a 32.2 MB video (User Screenshot Scenario)');
  const video32MbBytes = Math.round(32.2 * 1024 * 1024);
  const presignResult = await createPresignedUploadUrl({
    fileName: 'internal_job_posting_brief.mp4',
    fileSize: video32MbBytes,
    mimeType: 'video/mp4',
    maxSizeMb: 100,
  });

  assert.strictEqual(presignResult.mode, 'chunked', 'Mode must be "chunked" for files > 4MB without cloud tokens');
  assert.strictEqual(presignResult.uploadUrl, '/api/uploads/chunk', 'Upload URL must point to /api/uploads/chunk');
  assert(presignResult.fileKey.endsWith('.mp4'), 'FileKey must preserve .mp4 extension');
  assert.strictEqual(presignResult.publicUrl, `/uploads/${presignResult.fileKey}`);
  assert.strictEqual(presignResult.chunkSize, 3 * 1024 * 1024, 'Chunk size must be 3MB');
  assert.strictEqual(
    presignResult.totalChunks,
    Math.ceil(video32MbBytes / (3 * 1024 * 1024)),
    'Total chunks must match ceil(fileSize / 3MB)'
  );
  console.log('  ✓ Verified presign returns mode: "chunked" with 3MB chunks');
  console.log(`  ✓ Total chunks for 32.2 MB file: ${presignResult.totalChunks} chunks\n`);

  // Test 2: Multi-part chunked upload and server reassembly
  console.log('Test 2: Simulating 7.5 MB file upload in 3 chunks to /api/uploads/chunk');
  await ensureDatabaseStorageTable();

  // Create deterministic test buffer (7.5 MB = 7,864,320 bytes)
  const totalSizeBytes = 7.5 * 1024 * 1024;
  const originalBuffer = Buffer.alloc(totalSizeBytes);
  for (let i = 0; i < totalSizeBytes; i += 1024) {
    originalBuffer.write(`chunk-test-pattern-${i % 1000}`, i);
  }
  const originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

  const chunkSize = 3 * 1024 * 1024; // 3MB
  const totalChunks = Math.ceil(totalSizeBytes / chunkSize); // 3 chunks
  const testFileKey = presignResult.fileKey;

  console.log(`  - Uploading ${totalChunks} chunks for fileKey: ${testFileKey}`);

  let finalResponseData: any = null;

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const start = chunkIdx * chunkSize;
    const end = Math.min(start + chunkSize, totalSizeBytes);
    const chunkSlice = originalBuffer.subarray(start, end);

    const formData = new FormData();
    const chunkBlob = new Blob([chunkSlice], { type: 'video/mp4' });
    formData.append('chunk', chunkBlob, `video.mp4.part${chunkIdx}`);
    formData.append('fileKey', testFileKey);
    formData.append('fileName', 'internal_job_posting_brief.mp4');
    formData.append('mimeType', 'video/mp4');
    formData.append('chunkIndex', String(chunkIdx));
    formData.append('totalChunks', String(totalChunks));

    const req = new NextRequest('http://localhost:3000/api/uploads/chunk', {
      method: 'POST',
      body: formData,
    });

    const res = await chunkUploadHandler(req);
    assert.strictEqual(res.status, 200, `Chunk ${chunkIdx} POST must succeed with 200`);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    if (chunkIdx < totalChunks - 1) {
      assert.strictEqual(data.isComplete, false, `Chunk ${chunkIdx} should return isComplete: false`);
      console.log(`    ✓ Chunk ${chunkIdx + 1}/${totalChunks} stored successfully (${(chunkSlice.length / (1024 * 1024)).toFixed(1)} MB)`);
    } else {
      assert.strictEqual(data.isComplete, true, `Final chunk ${chunkIdx} must return isComplete: true`);
      finalResponseData = data;
      console.log(`    ✓ Final Chunk ${chunkIdx + 1}/${totalChunks} received, file reassembled successfully!`);
    }
  }

  assert(finalResponseData, 'Final response data must be present');
  assert.strictEqual(finalResponseData.fileSize, totalSizeBytes);
  assert.strictEqual(finalResponseData.publicUrl, `/uploads/${testFileKey}`);
  console.log('  ✓ Chunk upload completed. Public URL:', finalResponseData.publicUrl, '\n');

  // Test 3: Byte-for-byte integrity check on reassembled file
  console.log('Test 3: Byte-for-byte integrity and SHA-256 verification');
  const retrieved = await getFile(testFileKey);
  assert(retrieved, 'Reassembled file must exist and be retrievable');
  assert(retrieved.buffer, 'Reassembled file must have a buffer');
  assert.strictEqual(retrieved.fileSize, totalSizeBytes, 'File size must match exactly');
  assert.strictEqual(retrieved.mimeType, 'video/mp4', 'MIME type must be video/mp4');

  const retrievedHash = crypto.createHash('sha256').update(retrieved.buffer).digest('hex');
  assert.strictEqual(retrievedHash, originalHash, 'SHA-256 hash must match original file exactly');
  console.log('  ✓ Original SHA-256:  ', originalHash);
  console.log('  ✓ Reassembled SHA-256:', retrievedHash);
  console.log('  ✓ 100% Byte-for-byte hash match confirmed!\n');

  // Test 4: Verify uploaded_file_chunks temporary records are deleted
  console.log('Test 4: Verify temporary chunk cleanup in database');
  const leftoverChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    `SELECT COUNT(*)::int as count FROM uploaded_file_chunks WHERE file_key = $1`,
    testFileKey
  );
  const leftoverCount = Number(leftoverChunks?.[0]?.count || 0);
  assert.strictEqual(leftoverCount, 0, 'Temporary chunks should be cleared after reassembly');
  console.log('  ✓ Database temporary chunks table cleaned up (0 residual records)\n');

  // Test 5: HTTP Range Request streaming on reassembled video (seeking/playback in video player)
  console.log('Test 5: HTTP Range Request streaming (HTTP 206 Partial Content)');
  const rangeReq = new NextRequest(`http://localhost:3000/uploads/${testFileKey}`, {
    headers: { Range: 'bytes=0-1048575' }, // First 1MB slice
  });
  const rangeRes = await getUploadHandler(rangeReq, {
    params: Promise.resolve({ path: [testFileKey] }),
  });
  assert.strictEqual(rangeRes.status, 206, 'Should return HTTP 206 Partial Content for video seeking');
  assert.strictEqual(rangeRes.headers.get('Content-Range'), `bytes 0-1048575/${totalSizeBytes}`);
  assert.strictEqual(rangeRes.headers.get('Content-Length'), '1048576');
  assert.strictEqual(rangeRes.headers.get('Accept-Ranges'), 'bytes');
  assert.strictEqual(rangeRes.headers.get('Content-Type'), 'video/mp4');
  console.log('  ✓ Range request streaming verified with status 206 and correct Content-Range\n');

  // Clean up
  console.log('Cleaning up test files...');
  await deleteUploadedFile(testFileKey);
  await prisma.uploadedFile.deleteMany({ where: { fileKey: testFileKey } });
  console.log('  ✓ Cleaned up test files');

  console.log('\n🎉 ALL CHUNKED UPLOAD AND VIDEO STREAMING TESTS PASSED 100%!');
}

runChunkedTests()
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
