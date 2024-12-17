# Documentation Crawler

An advanced web-based documentation crawler that intelligently processes, extracts, and optimizes programming documentation through sophisticated content analysis.

## Core Features

- **Intelligent Content Extraction**: Preserves meaningful documentation content while removing boilerplate and navigation elements
- **Smart Duplicate Detection**: Identifies and handles duplicate content across documentation pages
- **Navigation Structure Preservation**: Maintains document hierarchy and relationships
- **Code Block Handling**: Properly extracts and formats code examples
- **Whitespace Optimization**: Maintains readable formatting while removing unnecessary whitespace

## Content Processing Strategy

### 1. Main Content Identification
- Prioritizes semantic HTML elements (`<main>`, `<article>`)
- Falls back to documentation-specific class names (`.docs-content`, `.markdown-body`)
- Uses content heuristics for fallback (multiple paragraphs, headers, code blocks)

### 2. Navigation Element Handling
- Identifies navigation elements through:
  - Semantic markup (`<nav>`, `role="navigation"`)
  - Common class patterns (`.navigation`, `.menu`, `.sidebar`)
  - Content patterns (link density, location)
- Replaces with placeholder: `{{ NAVIGATION }}`
- Preserves important navigation when part of main content

### 3. Duplicate Detection
- Generates fingerprints for content sections
- Only applies to navigation and repeated elements
- Preserves unique content even if structure is similar
- Uses placeholders for common elements (navigation, footer)

### 4. Content Cleaning
- Preserves essential elements:
  - Headers (h1-h6)
  - Paragraphs
  - Code blocks
  - Lists
  - Tables
  - Images relevant to documentation
- Removes:
  - Scripts and styles
  - Advertisements
  - Social sharing widgets
  - Comment sections
  - Empty/decorative elements

### 5. Whitespace Handling
- Maintains semantic whitespace:
  - Paragraph separation
  - List formatting
  - Code block indentation
- Removes:
  - Excessive newlines
  - Redundant spaces
  - Empty blocks
  - Whitespace from removed elements

## Implementation Details

### Content Extraction Process

1. **Initial Page Load**
   - Fetch page with proper headers
   - Handle rate limiting
   - Process robots.txt

2. **DOM Processing**
   - Use JSDOM for parsing
   - Apply selectors in priority order
   - Fall back to content heuristics

3. **Content Cleaning**
   - Remove technical elements first
   - Process navigation and common sections
   - Clean remaining elements
   - Handle link whitespace

4. **Markdown Conversion**
   - Use Turndown with custom rules
   - Preserve code block formatting
   - Maintain list structure
   - Handle special characters

5. **Output Generation**
   - Structure output with metadata
   - Include content relationships
   - Preserve code blocks
   - Add content fingerprints

### Error Handling

- Retry failed requests
- Validate content extraction
- Report processing errors
- Maintain partial results

## Usage

The crawler is configured through the `CrawlerSettings` interface:

```typescript
interface CrawlerSettings {
  maxDepth: number;            // Maximum crawl depth
  includeCodeBlocks: boolean;  // Whether to include code blocks
  excludeNavigation: boolean;  // Whether to exclude navigation elements
  followExternalLinks: boolean; // Whether to follow external links
}
```

The crawler returns results in the `CrawlResult` format:

```typescript
interface CrawlResult {
  url: string;           // Page URL
  title: string;         // Page title
  content: string;       // Processed content
  status: string;        // Processing status
  error?: string;        // Error message if failed
  metadata?: {           // Optional metadata
    lastModified?: string;
    author?: string;
    tags?: string[];
    language?: string;
  };
  codeBlocks?: Array<{   // Extracted code blocks
    language: string;
    content: string;
    title?: string;
  }>;
  hierarchy?: {          // Navigation structure
    parent?: string;
    children?: string[];
    section?: string;
  };
}
```
