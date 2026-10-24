import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { PRIMARY_UPLOAD_DIR, FALLBACK_UPLOAD_DIR } from '@/lib/storage/fileStorage';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/x-m4a',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('File not specified', { status: 400 });
    }

    // Sanitize path to prevent directory traversal
    const safeFilename = path.basename(pathSegments.join('/'));

    // Check candidate storage directories
    const candidatePaths = [
      path.join(PRIMARY_UPLOAD_DIR, safeFilename),
      path.join(FALLBACK_UPLOAD_DIR, safeFilename),
    ];

    let resolvedPath: string | null = null;
    let fileStat: fsSync.Stats | null = null;

    for (const cp of candidatePaths) {
      try {
        const stat = await fs.stat(cp);
        if (stat.isFile()) {
          resolvedPath = cp;
          fileStat = stat;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!resolvedPath || !fileStat) {
      return new NextResponse('File not found', { status: 404 });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const fileSize = fileStat.size;

    // Support HTTP Range requests (crucial for video/audio seeking and streaming large media)
    const rangeHeader = request.headers.get('range');
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const readStream = fsSync.createReadStream(/*turbopackIgnore: true*/ resolvedPath, { start, end });
      const webStream = Readable.toWeb(readStream) as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // For files <= 50MB (images, documents, audio), return direct buffer for rock-solid reliability
    if (fileSize <= 50 * 1024 * 1024) {
      const fileBuffer = await fs.readFile(resolvedPath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Full file stream for large files (> 50MB, e.g. multi-gigabyte video)
    const readStream = fsSync.createReadStream(/*turbopackIgnore: true*/ resolvedPath);
    const webStream = Readable.toWeb(readStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    console.error('Failed to serve uploaded file:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
