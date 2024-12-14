export async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}`);
  }
  return response.text();
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const links = Array.from(doc.querySelectorAll('a[href]'))
    .map(a => a.getAttribute('href'))
    .filter((href): href is string => !!href)
    .map(href => {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => {
      if (!url) return false;
      try {
        const parsedUrl = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        return parsedUrl.hostname === baseUrlObj.hostname &&
               url.includes('/docs/') || url.includes('/documentation/');
      } catch {
        return false;
      }
    });

  return Array.from(new Set(links));
}

export function extractTitle(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const title = doc.querySelector('title')?.textContent;
  return title || 'Untitled Page';
}
