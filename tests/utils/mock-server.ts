import { HttpResponse, http } from 'msw';
import { server } from '../setup';

interface MockPage {
  url: string;
  title: string;
  content: string;
  links: string[];
}

interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body: string;
}

export function setupMockServer(initialPages: MockPage[]) {
  const requestCounts = new Map<string, number>();
  const responses = new Map<string, MockResponse>();
  const errorResponses = new Map<string, { status: number; message: string }>();

  // Set up initial pages
  initialPages.forEach((page) => {
    responses.set(page.url, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${page.title}</title>
            <meta charset="utf-8">
          </head>
          <body>
            <main>
              ${page.content}
              <nav>
                ${page.links
                  .map((link) => `<a href="${link}">Link to ${link}</a>`)
                  .join('\n')}
              </nav>
            </main>
          </body>
        </html>
      `.trim(),
    });
  });

  // Create request handler
  const handler = http.get('https://test.com*', async ({ request }) => {
    try {
      const url = new URL(request.url).href;
      const urlWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;
      const urlWithSlash = url.endsWith('/') ? url : `${url}/`;

      console.log('Mock server received request for:', url);
      console.log('Available responses:', Array.from(responses.keys()));

      const count = (requestCounts.get(url) || 0) + 1;
      requestCounts.set(url, count);

      // Check for error responses
      const errorResponse =
        errorResponses.get(url) ||
        errorResponses.get(urlWithoutSlash) ||
        errorResponses.get(urlWithSlash);
      if (errorResponse) {
        console.log('Returning error response for:', url);
        return new HttpResponse(errorResponse.message, {
          status: errorResponse.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      // Get normal response
      const response =
        responses.get(url) ||
        responses.get(urlWithoutSlash) ||
        responses.get(urlWithSlash);
      if (!response) {
        console.log('No response found for:', url);
        return new HttpResponse('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      console.log('Returning normal response for:', url);
      return new HttpResponse(response.body, {
        status: response.status ?? 200,
        headers: {
          'Content-Type':
            response.headers?.['Content-Type'] ?? 'text/html; charset=utf-8',
          ...response.headers,
        },
      });
    } catch (error) {
      console.error('Mock server error:', error);
      return new HttpResponse('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  });

  // Use the handler
  server.use(handler);

  return {
    server,
    reset: () => {
      console.log('Resetting mock server...');
      requestCounts.clear();
      errorResponses.clear();
      responses.clear();

      // Re-add initial pages
      initialPages.forEach((page) => {
        console.log('Adding initial page:', page.url);
        responses.set(page.url, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: `
            <!DOCTYPE html>
            <html>
              <head>
                <title>${page.title}</title>
                <meta charset="utf-8">
              </head>
              <body>
                <main>
                  ${page.content}
                  <nav>
                    ${page.links
                      .map((link) => `<a href="${link}">Link to ${link}</a>`)
                      .join('\n')}
                  </nav>
                </main>
              </body>
            </html>
          `.trim(),
        });
      });

      // Reset MSW handlers
      server.resetHandlers(handler);
      console.log('Mock server reset complete');
    },
    addResponse: (url: string, response: MockResponse) => {
      responses.set(url, {
        ...response,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...response.headers,
        },
      });
    },
    addErrorResponse: (url: string, status: number, message: string) => {
      errorResponses.set(url, { status, message });
    },
    getRequestCount: (url: string) => requestCounts.get(url) || 0,
  };
}
