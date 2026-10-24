import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create upload directory:', err);
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

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max default limit

export interface SaveFileResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl: string;
}

export async function saveUploadedFile(file: File, maxSizeMb?: number): Promise<SaveFileResult> {
  await ensureUploadDir();

  const maxAllowedBytes = (maxSizeMb ? maxSizeMb : 100) * 1024 * 1024;
  if (file.size > maxAllowedBytes) {
    throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowed limit of ${maxSizeMb || 100}MB`);
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
    else if (effectiveMimeType.includes('heic') || effectiveMimeType.includes('heif')) safeExt = '.heic';
    else if (effectiveMimeType.includes('word') || effectiveMimeType.includes('officedocument')) safeExt = '.docx';
    else if (effectiveMimeType.includes('text/plain')) safeExt = '.txt';
    else safeExt = '.bin';
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Generate randomized unguessable file key
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const fileKey = `${Date.now()}-${randomSuffix}${safeExt}`;

  const destinationPath = path.join(UPLOAD_DIR, fileKey);
  await fs.writeFile(destinationPath, buffer);

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
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(fileKey));
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
