# Documentation Crawler - Development Status

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