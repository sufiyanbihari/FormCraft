import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getFile } from '@/lib/storage/fileStorage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('File not specified', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      });
    }

    // Sanitize path to prevent directory traversal
    const safeFilename = path.basename(pathSegments.join('/'));
    const rangeHeader = request.headers.get('range');

    const file = await getFile(safeFilename, rangeHeader);

    if (!file) {
      return new NextResponse('File not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      });
    }

    // 1. If provider returned a direct redirect URL (Vercel Blob / S3 CDN)
    if (file.redirectUrl) {
      return NextResponse.redirect(file.redirectUrl, {
        status: 307,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 2. Handle HTTP Range Requests (essential for video/audio seeking and streaming)
    if (file.buffer && rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.fileSize - 1;

      if (start >= file.fileSize || end >= file.fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${file.fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const chunk = file.buffer.subarray(start, end + 1);

      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          'Content-Type': file.mimeType,
          'Content-Range': `bytes ${start}-${end}/${file.fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 3. Return full file buffer (fast, atomic, zero stream lock issues)
    if (file.buffer) {
      return new NextResponse(new Uint8Array(file.buffer), {
        status: 200,
        headers: {
          'Content-Type': file.mimeType,
          'Content-Length': file.buffer.length.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 4. Return stream if buffer not present
    if (file.stream) {
      return new NextResponse(file.stream as any, {
        status: 200,
        headers: {
          'Content-Type': file.mimeType,
          'Content-Length': file.fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new NextResponse('File not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  } catch (err: any) {
    console.error('[Uploads Route] Failed to serve uploaded file:', err);
    return new NextResponse('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
}
