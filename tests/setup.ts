import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';

// Create test server
export const server = setupServer();

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error',
  });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => server.close());

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Silence console warnings during tests
console.warn = vi.fn();

// Fix MSW URL handling
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
      // Disable SSL verification for tests
      //@ts-ignore
      insecureHTTPParser: true,
      rejectUnauthorized: false,
    });
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};
