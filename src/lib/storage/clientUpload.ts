export interface ClientUploadOptions {
  formId?: string | null;
  maxSizeMb?: number;
  onProgress?: (percent: number) => void;
}

export interface ClientUploadResult {
  file?: any;
  publicUrl: string;
  directUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Universal client-side file upload utility.
 * Automatically chooses direct-to-storage signed URLs for large files/videos
 * (bypassing Vercel's 4.5MB serverless limit) with automatic fallback for local development.
 */
export async function uploadFile(
  file: File,
  options?: ClientUploadOptions
): Promise<ClientUploadResult> {
  // 1. Request signed upload URL / mode from server
  let presignRes: Response;
  try {
    presignRes = await fetch('/api/uploads/presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        formId: options?.formId,
        maxSizeMb: options?.maxSizeMb,
      }),
    });
  } catch (netErr: any) {
    // If presigned endpoint is unreachable and file is small, try direct upload fallback
    if (file.size <= 4 * 1024 * 1024) {
      return uploadDirectApi(file, options);
    }
    throw new Error(
      `Network error connecting to upload service: ${netErr?.message || 'Check your connection'}`
    );
  }

  const presignData = await presignRes.json().catch(() => ({}));

  if (!presignRes.ok) {
    // If file is small, try direct API fallback
    if (file.size <= 4 * 1024 * 1024) {
      return uploadDirectApi(file, options);
    }
    throw new Error(
      presignData.error || `Upload authorization failed (${presignRes.status})`
    );
  }

  // 2. Mode: S3 / Cloudflare R2 Pre-Signed Direct Upload
  if (presignData.mode === 'signed_url' && presignData.uploadUrl) {
    await uploadDirectToSignedUrl(
      presignData.uploadUrl,
      file,
      presignData.headers,
      options?.onProgress
    );

    // Finalize upload record on server
    const completeRes = await fetch('/api/uploads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileKey: presignData.fileKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: presignData.mimeType || file.type || 'application/octet-stream',
        formId: options?.formId,
        directUrl: presignData.directUrl,
      }),
    });

    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      throw new Error(completeData.error || 'Failed to finalize uploaded file record');
    }

    return {
      file: completeData.file,
      publicUrl: completeData.publicUrl || presignData.publicUrl,
      directUrl: completeData.directUrl || presignData.directUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: presignData.mimeType || file.type,
    };
  }

  // 3. Mode: Direct API (local development, database storage, or small files)
  return uploadDirectApi(file, options);
}

/**
 * Uploads raw file bytes directly to a signed storage URL (S3, Cloudflare R2, MinIO)
 * with progress tracking via XMLHttpRequest.
 */
function uploadDirectToSignedUrl(
  url: string,
  file: File,
  headers?: Record<string, string>,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }
    } else if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(
          new Error(
            `Direct storage upload failed with status ${xhr.status} (${xhr.statusText || 'Upload rejected'})`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during direct storage upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Direct storage upload timed out'));
    };

    xhr.send(file);
  });
}

/**
 * Standard fallback upload via multipart/form-data to /api/uploads.
 */
async function uploadDirectApi(
  file: File,
  options?: ClientUploadOptions
): Promise<ClientUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.formId) formData.append('formId', options.formId);
  if (options?.maxSizeMb) formData.append('maxSizeMb', String(options.maxSizeMb));

  const res = await fetch('/api/uploads', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds Vercel serverless payload limits (4.5MB). Please configure S3_BUCKET or BLOB_READ_WRITE_TOKEN in Vercel to enable direct cloud uploads.`
      );
    }
    throw new Error(data.error || `Upload failed with status ${res.status}`);
  }

  if (options?.onProgress) {
    options.onProgress(100);
  }

  return {
    file: data.file,
    publicUrl: data.publicUrl,
    directUrl: data.directUrl || data.publicUrl,
    fileName: data.fileName || file.name,
    fileSize: data.fileSize || file.size,
    mimeType: data.mimeType || file.type,
  };
}
