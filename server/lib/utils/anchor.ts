/**
 * A utility class to help find relevant anchor IDs within DOM elements.
 *
 * @remarks
 * Particularly useful for mapping headings or elements in documentation
 * to anchor-based navigation links.
 */
export class Anchor {
  /**
   * Retrieves the nearest anchor-like ID within a given DOM element.
   *
   * @param element - The DOM element to scan for anchor IDs.
   * @returns The found anchor ID, or null if none is found.
   */
  static getAnchor(element: Element): string | null {
    // Try to find the closest heading with an ID
    const heading = element.querySelector(
      'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'
    );
    if (heading?.id) {
      return heading.id;
    }

    // Try to find any element with an ID
    const idElement = element.querySelector('[id]');
    if (idElement?.id) {
      return idElement.id;
    }

    return null;
  }
}
