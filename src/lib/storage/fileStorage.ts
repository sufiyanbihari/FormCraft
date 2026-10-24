import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { formatBytes, formatSizeMb } from '@/lib/utils';

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
    console.warn('[FileStorage] Primary upload dir unavailable/read-only, using fallback tmp directory:', err);
  }

  // 2. Fallback to os.tmpdir()/formcraft-uploads (writable in all serverless/container environments)
  try {
    await fs.mkdir(FALLBACK_UPLOAD_DIR, { recursive: true });
    cachedUploadDir = FALLBACK_UPLOAD_DIR;
    return FALLBACK_UPLOAD_DIR;
  } catch (err) {
    console.error('[FileStorage] Failed to initialize fallback upload directory:', err);
    throw new Error('Upload directory is not writable on this system');
  }
}

const EXTENSION_MIME_MAP: Record<string, string> = {
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
const BLOCKED_EXTENSIONS = new Set([
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

const ALLOWED_MIME_TYPES = new Set([
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

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB system maximum limit

export interface SaveFileResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl: string;
}

export async function saveUploadedFile(file: File, maxSizeMb?: number): Promise<SaveFileResult> {
  const uploadDir = await getEffectiveUploadDir();

  const effectiveMaxMb = maxSizeMb && maxSizeMb > 0 ? maxSizeMb : 10240;
  const maxAllowedBytes = effectiveMaxMb * 1024 * 1024;
  if (file.size > maxAllowedBytes) {
    throw new Error(`File size (${formatBytes(file.size)}) exceeds maximum allowed limit of ${formatSizeMb(effectiveMaxMb)}`);
  }

  const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (path.extname(sanitizedOriginalName) || '').toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`File extension "${ext}" is not permitted for security reasons`);
  }

  // Determine effective MIME type: infer from extension if empty or octet-stream
  let effectiveMimeType = (file.type || '').trim().toLowerCase();
  if (!effectiveMimeType || effectiveMimeType === 'application/octet-stream') {
    effectiveMimeType = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  }

  // Infer extension from MIME type if original mobile upload had no extension
  let safeExt = ext;
  if (!safeExt) {
    if (effectiveMimeType.includes('jpeg')) safeExt = '.jpg';
    else if (effectiveMimeType.includes('png')) safeExt = '.png';
    else if (effectiveMimeType.includes('pdf')) safeExt = '.pdf';
    else if (effectiveMimeType.includes('webp')) safeExt = '.webp';
    else if (effectiveMimeType.includes('mp4')) safeExt = '.mp4';
    else if (effectiveMimeType.includes('webm')) safeExt = '.webm';
    else if (effectiveMimeType.includes('quicktime')) safeExt = '.mov';
    else if (effectiveMimeType.includes('heic') || effectiveMimeType.includes('heif')) safeExt = '.heic';
    else if (effectiveMimeType.includes('word') || effectiveMimeType.includes('officedocument')) safeExt = '.docx';
    else if (effectiveMimeType.includes('text/plain')) safeExt = '.txt';
    else safeExt = '.bin';
  }

  // Generate randomized unguessable file key
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const fileKey = `${Date.now()}-${randomSuffix}${safeExt}`;
  const destinationPath = path.join(uploadDir, fileKey);

  // Ensure upload directory exists
  await fs.mkdir(uploadDir, { recursive: true });

  // Write file: use arrayBuffer for files <= 50MB (fast, atomic, zero stream lock issues)
  // and streaming only for massive files (> 50MB)
  try {
    if (file.size <= 50 * 1024 * 1024 || typeof file.stream !== 'function') {
      const bytes = await file.arrayBuffer();
      await fs.writeFile(destinationPath, Buffer.from(bytes));
    } else {
      const webStream = file.stream();
      const nodeReadable = Readable.fromWeb(webStream as any);
      const writeStream = fsSync.createWriteStream(destinationPath);
      await pipeline(nodeReadable, writeStream);
    }

    // Verify written file
    const stat = await fs.stat(destinationPath);
    if (stat.size === 0 && file.size > 0) {
      throw new Error('Uploaded file was saved with 0 bytes');
    }
  } catch (writeErr: any) {
    console.error('[FileStorage] Error saving file to destination:', writeErr);
    try { await fs.unlink(destinationPath); } catch {}
    throw new Error(`Failed to save uploaded file: ${writeErr?.message || 'I/O error'}`);
  }

  const publicUrl = `/uploads/${fileKey}`;

  return {
    fileKey,
    fileName: file.name,
    fileSize: file.size,
    mimeType: effectiveMimeType,
    publicUrl,
  };
}

export async function deleteUploadedFile(fileKey: string): Promise<boolean> {
  const safeFilename = path.basename(fileKey);
  const candidates = [
    path.join(PRIMARY_UPLOAD_DIR, safeFilename),
    path.join(FALLBACK_UPLOAD_DIR, safeFilename),
  ];
  for (const candidate of candidates) {
    try {
      await fs.unlink(candidate);
      return true;
    } catch {
      // try next location
    }
  }
  return false;
}
