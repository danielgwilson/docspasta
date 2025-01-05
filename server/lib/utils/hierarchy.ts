export interface HierarchyItem {
  text: string;
  level: number;
}

export class Hierarchy {
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
