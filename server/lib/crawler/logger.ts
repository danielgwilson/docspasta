/**
 * Simple logger utility with consistent formatting
 */

export const log = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data ?? '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error ?? '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data ?? '');
  },
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, data ?? '');
    }
  },
};
