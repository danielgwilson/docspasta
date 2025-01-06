import { DateTime } from 'luxon';

export function formatTimestamp(timestamp: number): string {
  const dt = DateTime.fromMillis(timestamp);
  const now = DateTime.now();
  const diff = now.diff(dt, ['weeks', 'days', 'hours', 'minutes', 'seconds']);

  if (diff.weeks >= 1)
    return `${Math.floor(diff.weeks)} week${diff.weeks === 1 ? '' : 's'} ago`;
  if (diff.days >= 1)
    return `${Math.floor(diff.days)} day${diff.days === 1 ? '' : 's'} ago`;
  if (diff.hours >= 1)
    return `${Math.floor(diff.hours)} hour${diff.hours === 1 ? '' : 's'} ago`;
  if (diff.minutes >= 1)
    return `${Math.floor(diff.minutes)} minute${
      diff.minutes === 1 ? '' : 's'
    } ago`;
  return 'just now';
}

export function formatNumber(
  num: number,
  notation: 'compact' | 'standard' = 'standard'
): string {
  return Intl.NumberFormat('en-US', { notation }).format(num);
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
