/**
 * Utility class for handling code block detection and language inference
 */
export class CodeBlockHandler {
  /**
   * Set of commonly used programming languages and their aliases
   */
  private static readonly commonLanguages = new Set([
    'javascript', 'js', 'typescript', 'ts',
    'python', 'py', 'java', 'c', 'cpp', 'cs',
    'ruby', 'rb', 'php', 'go', 'rust', 'rs',
    'html', 'css', 'sql', 'shell', 'bash', 'sh',
    'json', 'yaml', 'yml', 'xml', 'markdown', 'md'
  ]);

  /**
   * Process all code blocks in a DOM element, detecting languages and adding appropriate classes
   */
  static processCodeBlocks(element: Element): void {
    const codeBlocks = element.querySelectorAll('pre code');
    Array.from(codeBlocks).forEach(block => {
      if (!(block instanceof Element)) return;
      
      const detectedLang = this.detectLanguage(block);
      if (detectedLang) {
        block.classList.add(`language-${detectedLang}`);
        const preElement = block.parentElement;
        if (preElement instanceof Element) {
          preElement.classList.add(`language-${detectedLang}`);
        }
      }
    });
  }

  /**
   * Detect the programming language of a code block
   * Checks class names, data attributes, and content patterns
   */
  static detectLanguage(element: Element): string {
    // Check explicit language classes
    const classNames = Array.from(element.classList);
    for (const className of classNames) {
      const match = /^(?:language-|lang-|prism-|highlight-|code-)(\w+)/.exec(className);
      if (match && this.commonLanguages.has(match[1].toLowerCase())) {
        return match[1].toLowerCase();
      }
    }

    // Check data attributes
    const dataLang = element.getAttribute('data-language') || 
                    element.getAttribute('data-lang') ||
                    element.getAttribute('data-code-language');
    
    if (dataLang && this.commonLanguages.has(dataLang.toLowerCase())) {
      return dataLang.toLowerCase();
    }

    // Try to infer from content
    return this.inferLanguageFromContent(element.textContent || '');
  }

  /**
   * Attempt to identify the programming language based on code content patterns
   */
  private static inferLanguageFromContent(content: string): string {
    interface LanguagePattern {
      lang: string;
      pattern: RegExp;
    }

    // Common patterns that strongly indicate specific languages
    const patterns: LanguagePattern[] = [
      { 
        lang: 'python',
        pattern: /\b(?:def|import|class|if\s+__name__\s*==\s*['"]__main__['"])\b/
      },
      { 
        lang: 'javascript',
        pattern: /\b(?:const|let|var|function|=>)\b/
      },
      { 
        lang: 'typescript',
        pattern: /\b(?:interface|type|namespace)\b|:\s*(?:string|number|boolean)\b/
      },
      { 
        lang: 'java',
        pattern: /\b(?:public|private|protected|class|void)\b/
      },
      { 
        lang: 'ruby',
        pattern: /\b(?:def|end|module|require)\b/
      },
      { 
        lang: 'php',
        pattern: /(?:\$\w+|<\?php)/
      },
      { 
        lang: 'html',
        pattern: /<[a-z][\s\S]*>/i
      },
      { 
        lang: 'css',
        pattern: /[.#][\w-]+\s*\{/
      },
      { 
        lang: 'sql',
        pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i
      },
      { 
        lang: 'shell',
        pattern: /(?:^#!\/|\b(?:sudo|apt-get|yum|brew|chmod|chown)\b)/m
      }
    ];

    // Test each pattern against the content
    for (const { lang, pattern } of patterns) {
      if (pattern.test(content)) {
        return lang;
      }
    }

    return '';
  }
}
