import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(d);
}

/**
 * Defends against CSV / Spreadsheet formula injection (CWE-1236)
 */
export function sanitizeSpreadsheetField(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // If the cell begins with formula prefixes =, +, -, @, \t, \r, prepend a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/**
 * Resolves video URLs into direct HTML5 video stream or embeddable iframe URL
 */
export function getVideoEmbedUrl(url?: string): { isDirectVideo: boolean; url: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('/uploads/') ||
    /\.(mp4|webm|ogg|mov|mkv)$/i.test(trimmed)
  ) {
    return { isDirectVideo: true, url: trimmed };
  }

  // YouTube match
  const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return { isDirectVideo: false, url: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }

  // Vimeo match
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return { isDirectVideo: false, url: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  return { isDirectVideo: false, url: trimmed };
}

/**
 * Formats a megabyte value into a readable string (e.g. 500 MB, 1 GB, 5 GB, 10 GB)
 */
export function formatSizeMb(mb: number): string {
  if (!mb || mb <= 0) return '10 MB';
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * Formats a byte number into a human-readable string (e.g. 429.2 MB, 1.2 GB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Checks if a string looks like a valid image URL or path
 */
export function isLikelyImageSource(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 3) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:')
  );
}

/**
 * Checks if a string looks like a valid video URL or embed
 */
export function isLikelyVideoSource(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 4) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:video/') ||
    trimmed.startsWith('blob:') ||
    trimmed.includes('youtube.com') ||
    trimmed.includes('youtu.be') ||
    trimmed.includes('vimeo.com')
  );
}

/**
 * Generates sequential default titles for newly created sections during question import.
 * Follows the project's naming pattern: "Questions 1", "question 2", "question 3", etc.
 */
export function generateImportSectionTitle(customBaseTitle: string | undefined | null, index: number): string {
  const trimmed = (customBaseTitle || '').trim();

  // If empty, standard placeholder, or variants of question/questions
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'imported questions' ||
    /^questions?\s*\d*$/i.test(trimmed)
  ) {
    return index === 0 ? 'Questions 1' : `question ${index + 1}`;
  }

  // If user provided a custom title (e.g. "Biology" or "Unit 1")
  const match = trimmed.match(/^(.*?)\s*\d+$/);
  const base = match ? match[1].trim() : trimmed;
  return `${base} ${index + 1}`;
}

