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
