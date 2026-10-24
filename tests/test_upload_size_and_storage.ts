import { formatSizeMb, formatBytes } from '../src/lib/utils';
import { saveUploadedFile, deleteUploadedFile, getEffectiveUploadDir } from '../src/lib/storage/fileStorage';
import assert from 'assert';
import fs from 'fs/promises';

async function runTests() {
  console.log('=== Running Upload Size Limit & Storage Tests ===\n');

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

  // Test 4: saveUploadedFile respects custom size limits
  console.log('Test 4: saveUploadedFile size validation');
  // Create a 2MB buffer
  const testBuffer = Buffer.alloc(2 * 1024 * 1024, 'a');
  const mockFile = new File([testBuffer], 'test-photo.jpg', { type: 'image/jpeg' });

  // Should fail if max limit is set to 1MB
  let failed = false;
  try {
    await saveUploadedFile(mockFile, 1);
  } catch (err: any) {
    failed = true;
    assert(err.message.includes('exceeds maximum allowed limit of 1 MB'), `Unexpected error message: ${err.message}`);
  }
  assert(failed, 'Upload should have been rejected when exceeding 1MB limit');
  console.log('  ✓ Correctly rejected when file exceeds custom limit');

  // Should succeed when admin sets limit to 500MB (or 5GB, 10GB)
  const saved = await saveUploadedFile(mockFile, 500);
  assert(saved.fileKey, 'Should return saved fileKey');
  assert(saved.publicUrl.startsWith('/uploads/'), 'Should return publicUrl starting with /uploads/');
  console.log('  ✓ Successfully saved file when limit is 500MB. Url:', saved.publicUrl);

  // Clean up
  const deleted = await deleteUploadedFile(saved.fileKey);
  assert(deleted, 'Should successfully delete uploaded test file');
  console.log('  ✓ Cleaned up test file\n');

  console.log('🎉 All Upload Size Limit & Storage Tests Passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
