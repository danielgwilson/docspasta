export class Anchor {
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
