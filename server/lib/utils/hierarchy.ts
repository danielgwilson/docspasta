/**
 * Represents a heading or hierarchical element within a document.
 */
export interface HierarchyItem {
  /** The text content of the heading. */
  text: string;
  /** The heading level (e.g., 1 for h1, 2 for h2, etc.). */
  level: number;
}

/**
 * Utility class to extract heading hierarchy (e.g., for building table of contents).
 */
export class Hierarchy {
  /**
   * Extracts all headings (h1-h6) from a DOM element and returns them
   * as an array of HierarchyItem objects.
   *
   * @param element - The DOM element to scan for headings.
   * @returns A list of heading text + level objects.
   */
  static extractHierarchy(element: Element): HierarchyItem[] {
    const headings = Array.from(
      element.querySelectorAll('h1, h2, h3, h4, h5, h6')
    );

    return headings.map((heading) => ({
      text: heading.textContent?.trim() || '',
      level: parseInt(heading.tagName[1], 10),
    }));
  }
}
