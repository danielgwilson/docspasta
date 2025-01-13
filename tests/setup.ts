import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';

export const server = setupServer();

beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error',
  });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => server.close());

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Silence console warnings
console.warn = vi.fn();

const originalFetch = global.fetch;
global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url =
      input instanceof URL
        ? input.href
        : typeof input === 'string'
        ? input
        : input.url;
    const response = await originalFetch(url, {
      ...init,
      // @ts-ignore
      insecureHTTPParser: true,
      rejectUnauthorized: false,
    });
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};
