/**
 * A utility class that processes <code> or <pre><code> blocks
 * to format and highlight code based on detected or assigned languages.
 */
export class CodeBlockHandler {
  /**
   * Maps recognized language class names to canonical short names.
   */
  private static readonly languageMap: Record<string, string> = {
    'language-js': 'javascript',
    'language-javascript': 'javascript',
    'language-ts': 'typescript',
    'language-typescript': 'typescript',
    'language-jsx': 'jsx',
    'language-tsx': 'tsx',
    'language-py': 'python',
    'language-python': 'python',
    'language-rb': 'ruby',
    'language-ruby': 'ruby',
    'language-java': 'java',
    'language-cs': 'csharp',
    'language-csharp': 'csharp',
    'language-go': 'go',
    'language-rust': 'rust',
    'language-rs': 'rust',
    'language-cpp': 'cpp',
    'language-c++': 'cpp',
    'language-c': 'c',
    'language-php': 'php',
    'language-sh': 'shell',
    'language-bash': 'shell',
    'language-shell': 'shell',
    'language-yml': 'yaml',
    'language-yaml': 'yaml',
    'language-json': 'json',
    'language-xml': 'xml',
    'language-html': 'html',
    'language-css': 'css',
    'language-scss': 'scss',
    'language-sql': 'sql',
    'language-md': 'markdown',
    'language-markdown': 'markdown',
  };

  /**
   * Attempts to determine the language of a given <code> block by
   * inspecting class attributes, data attributes, or content heuristics.
   */
  private static getLanguage(element: Element): string {
    // Check class names
    const classes = Array.from(element.classList);
    for (const cls of classes) {
      const normalized = cls.toLowerCase();
      if (this.languageMap[normalized]) {
        return this.languageMap[normalized];
      }
      if (normalized.startsWith('language-')) {
        return normalized.replace('language-', '');
      }
    }

    // Check data attributes
    const dataLang =
      element.getAttribute('data-language') ||
      element.getAttribute('data-lang') ||
      element.getAttribute('data-code-language');
    if (dataLang) {
      const normalized = `language-${dataLang.toLowerCase()}`;
      return this.languageMap[normalized] || dataLang.toLowerCase();
    }

    // Try to detect from content heuristics
    const content = element.textContent || '';
    if (
      content.includes('function') ||
      content.includes('var') ||
      content.includes('const')
    ) {
      return 'javascript';
    }
    if (
      content.includes('def ') ||
      content.includes('import ') ||
      content.includes('from ')
    ) {
      return 'python';
    }
    if (content.includes('<?php')) {
      return 'php';
    }
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return 'html';
    }
    if (content.includes('@import') || content.includes('{')) {
      return 'css';
    }

    // Default: no identifiable language
    return '';
  }

  /**
   * Removes excessive whitespace, normalizes indentation, and trims code.
   */
  private static formatCode(code: string, _language: string): string {
    // Remove excessive blank lines
    code = code.replace(/\n{3,}/g, '\n\n');

    // Split into lines
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) return '';

    // Find minimum indentation from non-empty lines
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
      })
    );

    // Remove the common indentation
    const formattedLines = lines.map((line) => {
      if (line.trim().length === 0) return '';
      return line.slice(minIndent);
    });

    // Trim start/end whitespace but keep internal formatting
    return formattedLines.join('\n').trim();
  }

  /**
   * Finds all code blocks inside a given DOM element and formats them
   * for more consistent code representation. Injects language-specific classes
   * and data attributes to help external formatters or highlighters.
   *
   * @param element - The root element containing code blocks to process.
   */
  public static processCodeBlocks(element: Element): void {
    const codeBlocks = element.querySelectorAll(
      'pre code, code[class*="language-"]'
    );

    codeBlocks.forEach((block) => {
      // Get the language
      const language = this.getLanguage(block);

      // Format the code
      const formattedCode = this.formatCode(block.textContent || '', language);

      // Update the element text
      block.textContent = formattedCode;

      // Set proper class for syntax highlighting
      if (language) {
        block.className = `language-${language}`;
      }

      // Add data attributes for additional metadata
      block.setAttribute('data-processed', 'true');
      if (language) {
        block.setAttribute('data-language', language);
      }
    });
  }
}
