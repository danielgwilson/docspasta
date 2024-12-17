/**
 * Utility class for extracting anchors from DOM elements
 */
export class Anchor {
  private static getAnchorStringFromElement(element: Element): string | null {
    return element.getAttribute('name') || element.getAttribute('id') || null;
  }

  /**
   * Gets the nearest anchor for an element by traversing up the DOM tree
   */
  static getAnchor(element: Element | null): string | null {
    if (!element) return null;

    // Check the element itself
    let anchor = this.getAnchorStringFromElement(element);
    if (anchor) return anchor;

    // Check children with name or id
    const children = Array.from(element.querySelectorAll('[name], [id]'));
    if (children.length > 0) {
      anchor = this.getAnchorStringFromElement(children[children.length - 1]);
      if (anchor) return anchor;
    }

    let el: Element | null = element;
    
    // Traverse up the DOM tree
    while (el) {
      // Check previous siblings
      let sibling = el.previousElementSibling;
      while (sibling) {
        anchor = this.getAnchorStringFromElement(sibling);
        if (anchor) return anchor;
        sibling = sibling.previousElementSibling;
      }

      // Go up to parent
      el = el.parentElement;
      if (el) {
        anchor = this.getAnchorStringFromElement(el);
        if (anchor) return anchor;
      }
    }

    return null;
  }
}
