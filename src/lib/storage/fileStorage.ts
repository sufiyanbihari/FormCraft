import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { prisma } from '@/lib/db/prisma';
import { formatBytes, formatSizeMb } from '@/lib/utils';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

export const PRIMARY_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
export const FALLBACK_UPLOAD_DIR = path.join(os.tmpdir(), 'formcraft-uploads');

let cachedUploadDir: string | null = null;

export async function getEffectiveUploadDir(): Promise<string> {
  if (cachedUploadDir) {
    try {
      await fs.access(cachedUploadDir);
      return cachedUploadDir;
    } catch {
      cachedUploadDir = null;
    }
  }

  // 1. Try primary public/uploads directory
  try {
    await fs.mkdir(PRIMARY_UPLOAD_DIR, { recursive: true });
    const probe = path.join(PRIMARY_UPLOAD_DIR, `.write-probe-${Date.now()}`);
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
    cachedUploadDir = PRIMARY_UPLOAD_DIR;
    return PRIMARY_UPLOAD_DIR;
  } catch (err) {
    // Primary upload dir unavailable/read-only on serverless environments
  }

  // 2. Fallback to os.tmpdir()/formcraft-uploads
  try {
    await fs.mkdir(FALLBACK_UPLOAD_DIR, { recursive: true });
    cachedUploadDir = FALLBACK_UPLOAD_DIR;
    return FALLBACK_UPLOAD_DIR;
  } catch (err) {
    console.error('[FileStorage] Failed to initialize fallback upload directory:', err);
    throw new Error('Upload directory is not writable on this system');
  }
}

export const EXTENSION_MIME_MAP: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',

  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/x-m4a',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',

  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/x-m4v',
  '.wmv': 'video/x-ms-wmv',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
};

// Explicitly blocked dangerous executable / script files
export const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.vbs',
  '.js',
  '.mjs',
  '.php',
  '.py',
  '.com',
  '.scr',
  '.msi',
  '.dll',
  '.bin',
  '.wsf',
  '.jar',
]);

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-m4v',
  'video/x-ms-wmv',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'application/pdf',
  'application/x-pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
]);

export type StorageProviderType = 'vercel-blob' | 's3' | 'database' | 'local';

export function getActiveStorageProvider(): StorageProviderType {
  const explicit = process.env.STORAGE_PROVIDER?.toLowerCase() as StorageProviderType | undefined;
  if (explicit && ['vercel-blob', 's3', 'database', 'local'].includes(explicit)) {
    return explicit;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return 'vercel-blob';
  }
  if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) {
    return 's3';
  }
  // If running in production on Vercel or when DATABASE_URL is available
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return 'database';
  }
  return 'local';
}

export interface SaveFileResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl: string;
  provider?: StorageProviderType;
  directUrl?: string;
}

export interface GetFileResult {
  buffer?: Buffer;
  stream?: ReadableStream | NodeJS.ReadableStream;
  fileSize: number;
  mimeType: string;
  fileName?: string;
  redirectUrl?: string;
}

// -------------------------------------------------------------
// Database Storage Provider (PostgreSQL via Neon / Prisma)
// -------------------------------------------------------------
let dbTableEnsured = false;

export async function ensureDatabaseStorageTable(): Promise<void> {
  if (dbTableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS uploaded_file_data (
        file_key VARCHAR(255) PRIMARY KEY,
        file_name VARCHAR(255),
        mime_type VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_uploaded_file_data_created ON uploaded_file_data(created_at);
    `);

    // Ensure table for temporary chunks (for bypassing Vercel 4.5MB serverless payload limit)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS uploaded_file_chunks (
        file_key VARCHAR(255) NOT NULL,
        chunk_index INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (file_key, chunk_index)
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_uploaded_file_chunks_key ON uploaded_file_chunks(file_key);
    `);
    dbTableEnsured = true;
  } catch (err) {
    console.warn('[FileStorage] Could not ensure uploaded_file_data / chunks table:', err);
  }
}

export async function saveToDatabase(
  fileKey: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  await ensureDatabaseStorageTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO uploaded_file_data (file_key, file_name, mime_type, file_size, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (file_key) DO UPDATE SET data = $5, file_size = $4, mime_type = $3`,
    fileKey,
    fileName,
    mimeType,
    buffer.length,
    buffer
  );
}

export async function getFromDatabase(fileKey: string): Promise<GetFileResult | null> {
  try {
    await ensureDatabaseStorageTable();
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        file_key: string;
        file_name: string;
        mime_type: string;
        file_size: number;
        data: Buffer;
      }>
    >(
      `SELECT file_key, file_name, mime_type, file_size, data FROM uploaded_file_data WHERE file_key = $1`,
      fileKey
    );
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    return {
      buffer: buf,
      fileSize: row.file_size || buf.length,
      mimeType: row.mime_type || 'application/octet-stream',
      fileName: row.file_name,
    };
  } catch (err) {
    console.error('[FileStorage] Error fetching from database:', err);
    return null;
  }
}

export async function deleteFromDatabase(fileKey: string): Promise<boolean> {
  try {
    await ensureDatabaseStorageTable();
    const count = await prisma.$executeRawUnsafe(
      `DELETE FROM uploaded_file_data WHERE file_key = $1`,
      fileKey
    );
    return count > 0;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// S3-Compatible Storage Provider (AWS S3, Cloudflare R2, MinIO)
// -------------------------------------------------------------
let cachedS3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (cachedS3Client) return cachedS3Client;
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  cachedS3Client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    forcePathStyle,
  });
  return cachedS3Client;
}

export async function saveToS3(
  fileKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not configured');

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  const publicUrl = process.env.S3_PUBLIC_URL
    ? `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${fileKey}`
    : `https://${bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${fileKey}`;
  return publicUrl;
}

export async function getFromS3(
  fileKey: string,
  range?: string | null
): Promise<GetFileResult | null> {
  try {
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    if (!bucket) return null;

    if (process.env.S3_PUBLIC_URL) {
      return {
        redirectUrl: `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${fileKey}`,
        fileSize: 0,
        mimeType:
          EXTENSION_MIME_MAP[path.extname(fileKey).toLowerCase()] ||
          'application/octet-stream',
      };
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Range: range || undefined,
    });
    const response = await s3.send(command);
    if (!response.Body) return null;

    const byteArray = await response.Body.transformToByteArray();
    const buffer = Buffer.from(byteArray);
    return {
      buffer,
      fileSize: response.ContentLength || buffer.length,
      mimeType:
        response.ContentType ||
        EXTENSION_MIME_MAP[path.extname(fileKey).toLowerCase()] ||
        'application/octet-stream',
    };
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error('[FileStorage] S3 get error:', err);
    return null;
  }
}

export async function deleteFromS3(fileKey: string): Promise<boolean> {
  try {
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    if (!bucket) return false;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// Vercel Blob Storage Provider
// -------------------------------------------------------------
export async function saveToVercelBlob(
  fileKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const { put } = await import('@vercel/blob');
  const blob = await put(fileKey, buffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType: mimeType,
  });
  return blob.url;
}

export async function getFromVercelBlob(fileKey: string): Promise<GetFileResult | null> {
  try {
    const { head } = await import('@vercel/blob');
    const blobDetails = await head(fileKey).catch(() => null);
    if (blobDetails?.url) {
      return {
        redirectUrl: blobDetails.url,
        fileSize: blobDetails.size,
        mimeType: blobDetails.contentType,
      };
    }

    // Check DB uploaded_files record in case publicUrl contains the full blob URL
    const fileRecord = await prisma.uploadedFile.findUnique({
      where: { fileKey },
      select: { publicUrl: true, mimeType: true, fileSize: true },
    });
    if (fileRecord?.publicUrl && fileRecord.publicUrl.startsWith('https://')) {
      return {
        redirectUrl: fileRecord.publicUrl,
        fileSize: fileRecord.fileSize || 0,
        mimeType: fileRecord.mimeType || 'application/octet-stream',
      };
    }
    return null;
  } catch (err) {
    console.error('[FileStorage] Vercel blob get error:', err);
    return null;
  }
}

export async function deleteFromVercelBlob(fileKey: string): Promise<boolean> {
  try {
    const { del } = await import('@vercel/blob');
    await del(fileKey);
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// Local Filesystem Provider (Local Dev & Temporary Buffer)
// -------------------------------------------------------------
export async function saveToLocal(fileKey: string, buffer: Buffer): Promise<void> {
  const dir = await getEffectiveUploadDir();
  const filePath = path.join(/*turbopackIgnore: true*/ dir, fileKey);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ filePath, buffer);
}

export async function getFromLocal(fileKey: string): Promise<GetFileResult | null> {
  const safeFilename = path.basename(fileKey);
  const candidates = [
    path.join(PRIMARY_UPLOAD_DIR, safeFilename),
    path.join(FALLBACK_UPLOAD_DIR, safeFilename),
  ];
  for (const cp of candidates) {
    try {
      const stat = await fs.stat(/*turbopackIgnore: true*/ cp);
      if (stat.isFile()) {
        const buffer = await fs.readFile(/*turbopackIgnore: true*/ cp);
        const ext = path.extname(safeFilename).toLowerCase();
        return {
          buffer,
          fileSize: stat.size,
          mimeType: EXTENSION_MIME_MAP[ext] || 'application/octet-stream',
          fileName: safeFilename,
        };
      }
    } catch {}
  }
  return null;
}

export async function deleteFromLocal(fileKey: string): Promise<boolean> {
  const safeFilename = path.basename(fileKey);
  const candidates = [
    path.join(PRIMARY_UPLOAD_DIR, safeFilename),
    path.join(FALLBACK_UPLOAD_DIR, safeFilename),
  ];
  let deleted = false;
  for (const candidate of candidates) {
    try {
      await fs.unlink(/*turbopackIgnore: true*/ candidate);
      deleted = true;
    } catch {}
  }
  return deleted;
}

// -------------------------------------------------------------
// Unified Storage Orchestration: Save, Get, Delete
// -------------------------------------------------------------

export async function saveUploadedFile(
  file: File,
  maxSizeMb?: number
): Promise<SaveFileResult> {
  const effectiveMaxMb = maxSizeMb && maxSizeMb > 0 ? maxSizeMb : 10240;
  const maxAllowedBytes = effectiveMaxMb * 1024 * 1024;
  if (file.size > maxAllowedBytes) {
    throw new Error(
      `File size (${formatBytes(file.size)}) exceeds maximum allowed limit of ${formatSizeMb(effectiveMaxMb)}`
    );
  }

  const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (path.extname(sanitizedOriginalName) || '').toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`File extension "${ext}" is not permitted for security reasons`);
  }

  let effectiveMimeType = (file.type || '').trim().toLowerCase();
  if (!effectiveMimeType || effectiveMimeType === 'application/octet-stream') {
    effectiveMimeType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  }

  let safeExt = ext;
  if (!safeExt) {
    if (effectiveMimeType.includes('jpeg')) safeExt = '.jpg';
    else if (effectiveMimeType.includes('png')) safeExt = '.png';
    else if (effectiveMimeType.includes('pdf')) safeExt = '.pdf';
    else if (effectiveMimeType.includes('webp')) safeExt = '.webp';
    else if (effectiveMimeType.includes('mp4')) safeExt = '.mp4';
    else if (effectiveMimeType.includes('webm')) safeExt = '.webm';
    else if (effectiveMimeType.includes('quicktime')) safeExt = '.mov';
    else if (
      effectiveMimeType.includes('heic') ||
      effectiveMimeType.includes('heif')
    )
      safeExt = '.heic';
    else if (
      effectiveMimeType.includes('word') ||
      effectiveMimeType.includes('officedocument')
    )
      safeExt = '.docx';
    else if (effectiveMimeType.includes('text/plain')) safeExt = '.txt';
    else safeExt = '.bin';
  }

  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const fileKey = `${Date.now()}-${randomSuffix}${safeExt}`;

  const arrayBuf = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuf);

  if (fileBuffer.length === 0 && file.size > 0) {
    throw new Error('Uploaded file buffer is empty');
  }

  const provider = getActiveStorageProvider();
  let directUrl: string | undefined = undefined;

  if (provider === 'vercel-blob') {
    try {
      directUrl = await saveToVercelBlob(fileKey, fileBuffer, effectiveMimeType);
    } catch (err: any) {
      console.warn('[FileStorage] Vercel Blob failed, falling back to database:', err);
      await saveToDatabase(fileKey, file.name, fileBuffer, effectiveMimeType);
    }
  } else if (provider === 's3') {
    try {
      directUrl = await saveToS3(fileKey, fileBuffer, effectiveMimeType);
    } catch (err: any) {
      console.warn('[FileStorage] S3 upload failed, falling back to database:', err);
      await saveToDatabase(fileKey, file.name, fileBuffer, effectiveMimeType);
    }
  } else if (provider === 'database') {
    await saveToDatabase(fileKey, file.name, fileBuffer, effectiveMimeType);
    try {
      await saveToLocal(fileKey, fileBuffer);
    } catch {}
  } else {
    // Local provider
    await saveToLocal(fileKey, fileBuffer);
    // Also mirror to database if database connection is available
    try {
      await saveToDatabase(fileKey, file.name, fileBuffer, effectiveMimeType);
    } catch {}
  }

  const publicUrl = `/uploads/${fileKey}`;

  return {
    fileKey,
    fileName: file.name,
    fileSize: file.size,
    mimeType: effectiveMimeType,
    publicUrl,
    provider,
    directUrl,
  };
}

export async function getFile(
  fileKey: string,
  range?: string | null
): Promise<GetFileResult | null> {
  const safeFilename = path.basename(fileKey);

  // 1. Check local disk first (instant in local dev or if cached)
  const localRes = await getFromLocal(safeFilename);
  if (localRes) return localRes;

  const provider = getActiveStorageProvider();

  // 2. Check active provider
  if (provider === 'vercel-blob') {
    const blobRes = await getFromVercelBlob(safeFilename);
    if (blobRes) return blobRes;
  } else if (provider === 's3') {
    const s3Res = await getFromS3(safeFilename, range);
    if (s3Res) return s3Res;
  } else if (provider === 'database') {
    const dbRes = await getFromDatabase(safeFilename);
    if (dbRes) return dbRes;
  }

  // 3. Fallback check across other persistent providers
  const dbFallback = await getFromDatabase(safeFilename);
  if (dbFallback) return dbFallback;

  if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) {
    const s3Fallback = await getFromS3(safeFilename, range);
    if (s3Fallback) return s3Fallback;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blobFallback = await getFromVercelBlob(safeFilename);
    if (blobFallback) return blobFallback;
  }

  // 4. Check DB uploaded_files metadata table for remote publicUrl
  try {
    const meta = await prisma.uploadedFile.findUnique({
      where: { fileKey: safeFilename },
      select: { publicUrl: true, mimeType: true, fileSize: true, fileName: true },
    });
    if (meta?.publicUrl && meta.publicUrl.startsWith('https://')) {
      return {
        redirectUrl: meta.publicUrl,
        fileSize: meta.fileSize || 0,
        mimeType: meta.mimeType || 'application/octet-stream',
        fileName: meta.fileName,
      };
    }
  } catch {}

  return null;
}

export async function deleteUploadedFile(fileKey: string): Promise<boolean> {
  const safeFilename = path.basename(fileKey);
  let anyDeleted = false;

  const localDeleted = await deleteFromLocal(safeFilename);
  if (localDeleted) anyDeleted = true;

  const dbDeleted = await deleteFromDatabase(safeFilename);
  if (dbDeleted) anyDeleted = true;

  if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) {
    const s3Deleted = await deleteFromS3(safeFilename);
    if (s3Deleted) anyDeleted = true;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blobDeleted = await deleteFromVercelBlob(safeFilename);
    if (blobDeleted) anyDeleted = true;
  }

  return anyDeleted;
}

// -------------------------------------------------------------
// Migration: Sync Local Files to Persistent Storage
// -------------------------------------------------------------
export async function migrateLocalFilesToStorage(
  onProgress?: (info: { fileName: string; status: 'migrated' | 'skipped' | 'error'; error?: string }) => void
): Promise<{ total: number; migrated: number; skipped: number; errors: string[] }> {
  const summary = { total: 0, migrated: 0, skipped: 0, errors: [] as string[] };

  let localFiles: string[] = [];
  try {
    const entries = await fs.readdir(PRIMARY_UPLOAD_DIR, { withFileTypes: true });
    localFiles = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    // PRIMARY_UPLOAD_DIR might not exist
  }

  summary.total = localFiles.length;

  for (const fileName of localFiles) {
    try {
      const existing = await getFromDatabase(fileName);
      if (existing) {
        summary.skipped++;
        onProgress?.({ fileName, status: 'skipped' });
        continue;
      }

      const localPath = path.join(PRIMARY_UPLOAD_DIR, fileName);
      const buffer = await fs.readFile(localPath);
      const ext = path.extname(fileName).toLowerCase();
      const mimeType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';

      // Always save to database as persistent baseline
      await saveToDatabase(fileName, fileName, buffer, mimeType);

      // If S3 configured, also upload to S3
      if (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET) {
        try {
          await saveToS3(fileName, buffer, mimeType);
        } catch {}
      }

      // If Vercel Blob configured, also upload to Vercel Blob
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await saveToVercelBlob(fileName, buffer, mimeType);
        } catch {}
      }

      summary.migrated++;
      onProgress?.({ fileName, status: 'migrated' });
    } catch (err: any) {
      const errorMsg = `Failed migrating ${fileName}: ${err?.message || err}`;
      summary.errors.push(errorMsg);
      onProgress?.({ fileName, status: 'error', error: errorMsg });
    }
  }

  return summary;
}

// -------------------------------------------------------------
// Direct-to-Storage Pre-signed Upload URL Generation
// (Bypasses Vercel 4.5MB Serverless Payload Limits for Video)
// -------------------------------------------------------------
export interface PresignedUploadResult {
  mode: 'signed_url' | 'vercel_blob' | 'direct_api' | 'chunked';
  provider: StorageProviderType;
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  directUrl?: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
  clientToken?: string;
  chunkSize?: number;
  totalChunks?: number;
}

export async function createPresignedUploadUrl(params: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  maxSizeMb?: number;
}): Promise<PresignedUploadResult> {
  const sanitizedOriginalName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (path.extname(sanitizedOriginalName) || '').toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`File extension "${ext}" is not permitted for security reasons`);
  }

  const effectiveMaxMb = params.maxSizeMb && params.maxSizeMb > 0 ? params.maxSizeMb : 10240;
  const maxAllowedBytes = effectiveMaxMb * 1024 * 1024;
  if (params.fileSize > maxAllowedBytes) {
    throw new Error(
      `File size (${formatBytes(params.fileSize)}) exceeds maximum allowed limit of ${formatSizeMb(effectiveMaxMb)}`
    );
  }

  let effectiveMimeType = (params.mimeType || '').trim().toLowerCase();
  if (!effectiveMimeType || effectiveMimeType === 'application/octet-stream') {
    effectiveMimeType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  }

  let safeExt = ext;
  if (!safeExt) {
    if (effectiveMimeType.includes('mp4')) safeExt = '.mp4';
    else if (effectiveMimeType.includes('webm')) safeExt = '.webm';
    else if (effectiveMimeType.includes('quicktime')) safeExt = '.mov';
    else if (effectiveMimeType.includes('jpeg')) safeExt = '.jpg';
    else if (effectiveMimeType.includes('png')) safeExt = '.png';
    else if (effectiveMimeType.includes('pdf')) safeExt = '.pdf';
    else safeExt = '.bin';
  }

  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const fileKey = `${Date.now()}-${randomSuffix}${safeExt}`;
  const publicUrl = `/uploads/${fileKey}`;
  const provider = getActiveStorageProvider();

  // 1. S3-Compatible Direct Upload (AWS S3, Cloudflare R2, MinIO, Supabase)
  if (provider === 's3' || Boolean(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET)) {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = getS3Client();
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET!;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: effectiveMimeType,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 mins
    const directUrl = process.env.S3_PUBLIC_URL
      ? `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${fileKey}`
      : `https://${bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${fileKey}`;

    return {
      mode: 'signed_url',
      provider: 's3',
      uploadUrl: presignedUrl,
      method: 'PUT',
      headers: {
        'Content-Type': effectiveMimeType,
      },
      fileKey,
      publicUrl,
      directUrl,
    };
  }

  // 2. Vercel Blob Direct Client Upload
  if (provider === 'vercel-blob' || Boolean(process.env.BLOB_READ_WRITE_TOKEN)) {
    const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname: fileKey,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onUploadCompleted: {
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/uploads/complete`,
      },
    });

    return {
      mode: 'vercel_blob',
      provider: 'vercel-blob',
      uploadUrl: '',
      clientToken,
      fileKey,
      publicUrl,
      directUrl: `https://public.blob.vercel-storage.com/${fileKey}`,
    };
  }

  // 3. Fallback: Chunked Upload Engine
  // For files > 4MB (such as large videos or documents), slice into 3MB chunks
  // to safely bypass Vercel's 4.5MB serverless request body payload limit.
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3.0 MB per chunk (well under Vercel 4.5MB limit)
  if (params.fileSize > 4 * 1024 * 1024) {
    const totalChunks = Math.ceil(params.fileSize / CHUNK_SIZE);
    return {
      mode: 'chunked',
      provider,
      uploadUrl: '/api/uploads/chunk',
      method: 'POST',
      fileKey,
      publicUrl,
      chunkSize: CHUNK_SIZE,
      totalChunks,
    };
  }

  // 4. Fallback: Direct API route (for smaller files / images <= 4MB)
  return {
    mode: 'direct_api',
    provider,
    uploadUrl: '/api/uploads',
    method: 'POST',
    fileKey,
    publicUrl,
  };
}
