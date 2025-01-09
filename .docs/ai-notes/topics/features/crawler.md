# Documentation Crawler

## Overview
A robust documentation crawler implementation for processing, caching, and testing documentation content. The system handles various documentation formats while maintaining performance and reliability.

## Current Status
- **Phase**: Testing & Debugging
- **Last Updated**: January 24, 2024
- **Status**: In Development

## Implementation Details

### Key Components
- `DocumentationCrawler`: Main crawler implementation
- `crawlerCache`: Cache management system
- `contentProcessor`: HTML to Markdown conversion

### Dependencies
- JSDOM for HTML parsing
- TurndownService for Markdown conversion
- p-queue for request management
- MSW for test mocking

### Core Features
1. Content Processing
   - HTML to Markdown conversion
   - Metadata extraction
   - Content deduplication
   - Hierarchy tracking

2. Cache System
   - Version-aware caching
   - Cache invalidation
   - Request deduplication

3. Testing Infrastructure
   - Vitest test framework
   - MSW for API mocking
   - Custom test utilities

## Development Progress

### Recent Achievements
- Fixed maxDepth handling in crawler
- Improved link extraction logic
- Enhanced queue processing
- Optimized content hash comparison

### Known Issues
1. Cache System
   - Cache versioning needs improvement
   - Cache invalidation strategy to be refined

2. Content Processing
   - Metadata extraction needs enhancement
   - Duplicate content detection requires tuning

3. Testing Infrastructure
   - Several failing tests need resolution
   - See [test-plan.md](../decisions/test-plan.md) for details

## Related Documents
- [Crawler Architecture](../decisions/crawler-architecture.md)
- [Testing Plan](../decisions/test-plan.md) 






## Quick Start for New Engineers
1. Read these docs in order:
   - Features: `/topics/features/crawler.md`
   - Architecture: `/topics/decisions/crawler-architecture.md`
   - Test Plan: `/topics/decisions/test-plan.md`

2. Key files:
   - `server/lib/crawler.ts` - Main crawler implementation
   - `server/lib/cache.ts` - Cache system
   - `tests/crawler.test.ts` - Test suite
   - `tests/utils/mock-server.ts` - Test mocks

## Current Development Status (January 24, 2024)

### Just Completed
- Fixed maxDepth handling in crawler
- Improved link extraction logic
- Set excludeNavigation to false by default
- Enhanced queue processing

### Active Development
Currently fixing test failures in priority order:

1. Cache Usage Test (Current Focus)
   - Issue: Request counting not working
   - Location: `tests/crawler.test.ts` - "should use cached results"
   - Next steps: Review cache hit/miss logic in cache.ts

2. Concurrent Request Test (On Deck)
   - Issue: Rate limiting not working
   - Location: `tests/crawler.test.ts` - "should respect maxConcurrentRequests"
   - Next steps: Fix queue configuration

3. Remaining Tests (Prioritized)
   - Duplicate content detection
   - Metadata extraction
   - Memory management

## Development Tips
1. Run specific tests:
   ```bash
   npx vitest run "tests/crawler.test.ts" -t "should use cached results"
   ```

2. Debug with logging:
   ```typescript
   import { log } from '../utils/logger';
   log.debug('Cache hit:', url);
   ```

3. Test workflow:
   - Run specific test
   - Check mock server responses
   - Add logging if needed
   - Fix implementation
   - Verify fix

## Recent Learnings
1. Navigation exclusion affects test coverage
2. Queue processing needs careful timing
3. Cache system needs request tracking
4. Mock server provides test URLs 