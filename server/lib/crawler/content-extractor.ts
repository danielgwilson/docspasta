/**
 * content-extractor.ts — ULTRA EDITION
 *
 * A robust, token-efficient, human-readable HTML→Markdown content extractor,
 * heavily inspired by node-html-to-text's best ideas, plus your existing code structure:
 * - `extractTitle(doc)`: get a page title
 * - `extractContent(doc)`: find main doc area, remove noise, transform to a "clean" Markdown-ish text
 *
 * Key Highlights:
 * 1. Removes redundant elements (scripts, style, navigation, etc.).
 * 2. Converts headings <h1>...<h6> → `#`, `##`, etc.
 * 3. Strips links to `[link text]` form (optionally removing or rewriting the href).
 * 4. Images become `[IMAGE: alt]`.
 * 5. Omits or transforms repeated whitespace, line breaks, “export,” “copy,” “powered by,” etc.
 * 6. Retains code blocks <pre> ... </pre> as fenced code blocks (` ``` `).
 * 7. Preserves minimal Markdown for lists, blockquotes, etc. if needed.
 *
 * Built for "paste into LLM" usage (concise, no huge URLs).
 */

import { JSDOM } from 'jsdom';

////////////////////////////////////////////////////////////////////////////////
// #region Main exported functions
////////////////////////////////////////////////////////////////////////////////

/**
 * Attempt to extract a "logical" title from the document:
 * - <title> if present
 * - <meta name="title"> or <meta property="og:title"> fallback
 * - Otherwise, the first <h1>
 */
export function extractTitle(doc: Document): string {
  // 1. <title> in <head>
  const docTitle = doc.querySelector('title');
  if (docTitle?.textContent) {
    return docTitle.textContent.trim();
  }

  // 2. <meta name="title"> or <meta property="og:title">
  const metaTitle = doc
    .querySelector('meta[name="title"]')
    ?.getAttribute('content');
  if (metaTitle) {
    return metaTitle.trim();
  }
  const ogTitle = doc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content');
  if (ogTitle) {
    return ogTitle.trim();
  }

  // 3. first <h1>
  const h1 = doc.querySelector('h1');
  if (h1?.textContent) {
    return h1.textContent.trim();
  }

  // fallback
  return '';
}

/**
 * The big function that:
 * 1. Finds main doc region (body or a known content container).
 * 2. Cleans out nav, footers, scripts, styles, etc.
 * 3. Applies specialized transformations (heading → `#`, images → `[IMAGE: alt]`, etc.).
 * 4. Returns final content as Markdown-ish text string.
 */
export function extractContent(doc: Document): string {
  // 1. Find main content
  let main = findMainElement(doc);

  // fallback to <body> if nothing found
  if (!main) {
    main = doc.querySelector('body');
  }
  if (!main) {
    return '';
  }

  // 2. Clone so we don’t modify the original DOM
  const clone = main.cloneNode(true) as Element;

  // 3. Clean up the DOM (remove scripts, style, inline style, data-*, images? etc.)
  cleanupDom(clone);

  // 4. Convert headings <h1>...<h6> → markdown, images → `[IMAGE: alt]`, links → `[text]`, etc.
  transformHeadings(clone);
  transformImages(clone);
  transformLinks(clone);
  transformLists(clone);
  transformBlockquotes(clone);
  transformHorizontalRules(clone);

  // 5. Convert <pre> blocks into triple backticks code blocks
  transformPreToCodeBlock(clone);

  // 6. Remove leftover empty or “useless” elements
  removeEmptyElements(clone);

  // 7. Produce final string
  let html = clone.innerHTML;

  // 8. Basic cleanup: reduce repeated newlines/spaces, fix br tags if any
  html = normalizeOutput(html);

  return html.trim();
}

////////////////////////////////////////////////////////////////////////////////
// #endregion
// #region Implementation Details
////////////////////////////////////////////////////////////////////////////////

//
// Attempt to find a “main” doc region
//
function findMainElement(doc: Document): Element | null {
  // Try some known content wrappers
  const knownSelectors = [
    'article[role="main"]', // priority
    'main[role="main"]',
    'main',
    'article',
    '.content-body',
    '.documentation-content',
    '#content',
    '.docs-content',
  ];
  for (const sel of knownSelectors) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}

//
// Remove scripts, style, iframes, plus inline style/data attributes, etc.
//
function cleanupDom(root: Element): void {
  // Remove scripts, styles, iframes
  root.querySelectorAll('script, style, iframe').forEach((el) => el.remove());

  // Remove inline style attributes
  root.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));

  // Remove data-* attributes
  root.querySelectorAll('*').forEach((el) => {
    const toRemove: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        toRemove.push(attr.name);
      }
    }
    toRemove.forEach((r) => el.removeAttribute(r));
  });

  // Remove known nav/footers/etc. that are typically not “documentation content”
  const removeSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    '.sidebar',
    '.nav',
    '.navigation',
    '.header',
    '.footer',
    '.on-this-page',
    '.page-outline',
    '.table-of-contents',
    '.menu',
    '.comment-section',
    'form',
    'noscript',
    '[role="navigation"]',
  ];
  removeSelectors.forEach((sel) => {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Remove elements with suspicious “copy” or “export” classes
  const suspicious = ['.copy-button', '.export-button', '.powered-by'];
  suspicious.forEach((sel) => {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Remove leftover <meta> or <link> or anything in the <body> that is worthless
  root.querySelectorAll('meta, link').forEach((el) => el.remove());
}

//
// HEADINGS -> #, ##, etc.
//
function transformHeadings(root: Element): void {
  for (let level = 1; level <= 6; level++) {
    const tag = `h${level}`;
    root.querySelectorAll(tag).forEach((h) => {
      const text = (h.textContent || '').trim();
      const prefix = '#'.repeat(level);
      const replacement = `${prefix} ${text}\n\n`;
      h.replaceWith(root.ownerDocument.createTextNode(replacement));
    });
  }
}

//
// IMAGES -> [IMAGE: alt]
//
function transformImages(root: Element): void {
  root.querySelectorAll('img').forEach((img) => {
    // If we want to preserve the URL, we do so, but here we choose not to
    const alt = img.getAttribute('alt') || 'image';
    const placeholder = `[IMAGE: ${alt.trim()}]`;
    img.replaceWith(root.ownerDocument.createTextNode(placeholder));
  });
}

//
// LINKS -> [text]
//
// If link has text, we keep the text in brackets. We omit or rewrite the href if we want.
function transformLinks(root: Element): void {
  root.querySelectorAll('a').forEach((a) => {
    // Potentially skip anchor links (#something) or do something with them
    const text = (a.textContent || '').trim();
    if (!text) {
      a.remove(); // no text? remove
      return;
    }
    // If you want to keep the link as `[text](url)`, do that. But here we only keep text
    // If you want minimal LLM tokens, ignoring the URL is typical
    a.replaceWith(root.ownerDocument.createTextNode(`[${text}]`));
  });
}

//
// Lists <ul>, <ol>, <li>, we do a minimal transform to bullet them
// node-html-to-text has a more advanced approach, but we keep it short
//
function transformLists(root: Element): void {
  // Ordered lists (ol)
  root.querySelectorAll('ol').forEach((ol) => {
    // We'll just flatten it with numeric prefix. Or do actual replacements in child <li>...
    const lis = Array.from(ol.querySelectorAll('li'));
    let i = 1;
    for (const li of lis) {
      const itemText = (li.textContent || '').trim();
      // Insert a textual bullet
      const bullet = `${i++}. `;
      // Replace the entire <li> with bullet + text
      li.replaceWith(
        root.ownerDocument.createTextNode(`${bullet}${itemText}\n`)
      );
    }
    // Now remove the <ol> but keep the child text
    unwrapElement(ol);
  });

  // Unordered lists (ul)
  root.querySelectorAll('ul').forEach((ul) => {
    const lis = Array.from(ul.querySelectorAll('li'));
    for (const li of lis) {
      const itemText = (li.textContent || '').trim();
      const bullet = `- `;
      li.replaceWith(
        root.ownerDocument.createTextNode(`${bullet}${itemText}\n`)
      );
    }
    unwrapElement(ul);
  });
}

//
// BLOCKQUOTES -> prefix each line with >
//
function transformBlockquotes(root: Element): void {
  root.querySelectorAll('blockquote').forEach((bq) => {
    const content = (bq.textContent || '').trim();
    const lines = content.split('\n');
    const replaced = lines.map((line) => `> ${line}`).join('\n') + '\n\n';
    bq.replaceWith(root.ownerDocument.createTextNode(replaced));
  });
}

//
// HR -> "----"
//
function transformHorizontalRules(root: Element): void {
  root.querySelectorAll('hr').forEach((hr) => {
    // typical markdown: "----"
    hr.replaceWith(root.ownerDocument.createTextNode('\n\n----\n\n'));
  });
}

//
// PRE -> code fences
//
function transformPreToCodeBlock(root: Element): void {
  root.querySelectorAll('pre').forEach((pre) => {
    const text = (pre.textContent || '').replace(/\r?\n/g, '\n');
    // triple backtick fence
    const replaced = `\n\`\`\`\n${text}\n\`\`\`\n`;
    pre.replaceWith(root.ownerDocument.createTextNode(replaced));
  });
}

//
// Remove empty or meaningless elements
//
function removeEmptyElements(root: Element): void {
  const all = Array.from(root.querySelectorAll('*'));
  for (const el of all) {
    // if it has no text or meaningful sub-nodes
    if (!el.textContent?.trim()) {
      // but keep <br> or <hr> if you want
      if (!['br', 'hr'].includes(el.tagName.toLowerCase())) {
        el.remove();
      }
    }
  }
}

//
// Flatten the final HTML string -> reduce repeated newlines, spaces, etc.
//
function normalizeOutput(content: string): string {
  // Remove multiple blank lines
  // Turn <br> into single newline
  content = content.replace(/<br\s*\/?>/gi, '\n');

  // Convert multiple newlines => 2 newlines max
  content = content.replace(/\n{3,}/g, '\n\n');

  // Remove extra spaces between tags
  content = content.replace(/>\s+</g, '><');

  // Possibly remove leftover HTML tags, if any remain
  // (though ideally we've replaced them all)
  content = content.replace(/<[^>]+>/g, '');

  // Trim each line's trailing spaces
  content = content
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n');

  return content;
}

//
// Helper to unwrap an element but keep its child text
//
function unwrapElement(el: Element): void {
  // Instead of removing the element entirely, we can move its children up
  // then remove the element
  while (el.firstChild) {
    el.parentNode?.insertBefore(el.firstChild, el);
  }
  el.remove();
}

////////////////////////////////////////////////////////////////////////////////
// #endregion
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// OPTIONAL: In case you do hashing or further transformations
////////////////////////////////////////////////////////////////////////////////

/**
 * (Optional) Basic hashing function if you want to detect duplicates.
 */
export function hashContent(content: string): string {
  const normalized = content
    .replace(/\s+/g, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim()
    .toLowerCase();

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}
