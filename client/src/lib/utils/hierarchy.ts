/**
 * Utility class for managing documentation hierarchy
 */
interface HierarchyItem {
  text: string;
  level: number;
}

export class Hierarchy {
  /**
   * Returns the radio hierarchy where only one level is filled
   * and others are empty
   */
  static getHierarchyRadio(
    hierarchy: Record<string, string | null>,
    currentLevel: string,
    levels: string[]
  ): Record<string, string | null> {
    const hierarchyRadio: Record<string, string | null> = {};
    let isFound = false;

    // Process levels in reverse order
    for (const level of [...levels].reverse()) {
      if (level === 'content') continue;

      const value = hierarchy[level];
      if (!isFound && value !== null && currentLevel !== 'content') {
        isFound = true;
        hierarchyRadio[level] = value;
        continue;
      }

      hierarchyRadio[level] = null;
    }

    return hierarchyRadio;
  }

  /**
   * Generates an empty hierarchy object
   */
  static generateEmptyHierarchy(): Record<string, string | null> {
    return {
      lvl0: null,
      lvl1: null,
      lvl2: null,
      lvl3: null,
      lvl4: null,
      lvl5: null,
      lvl6: null,
    };
  }

  /**
   * Extract hierarchy from a DOM element by finding all heading tags
   * and mapping them to the appropriate level
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

  /**
   * Extract text content from a DOM element, normalizing whitespace
   * and removing any unwanted characters
   */
  static extractContent(element: Element): string {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  }
}
