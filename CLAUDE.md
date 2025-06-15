# CLAUDE.md

🚨 **MOST CRITICAL RULE**: **ALWAYS USE RESUMABLE-STREAM FOR SSE** 🚨
- **NEVER** implement custom ReadableStream for SSE
- **NEVER** handle Last-Event-ID manually
- **ALWAYS** copy the V3 pattern that uses resumable-stream
- See `STOP_REINVENTING_RESUMABLE_STREAM.md` for why this keeps happening

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MIGRATION IN PROGRESS**: Docspasta V2 is transitioning from BullMQ + Redis workers to a **Vercel-native serverless architecture**. The new system uses PostgreSQL + Vercel KV + Cron + resumable-stream SSE for optimal serverless deployment.

**Current Status**: Phase 3 complete (core infrastructure, APIs, frontend). Now implementing critical optimizations: PostgreSQL SKIP LOCKED queues, fan-out processing, and Vercel KV adapters.

## Kit MCP for Code Navigation

**IMPORTANT**: Always use the Kit MCP tool (`mcp__kit__*`) for code navigation and analysis. Kit provides:
- `open_repository`: Open and index a repository for fast searching
- `search_code`: Search for code patterns across the entire codebase
- `get_file_content`: Read multiple files efficiently
- `extract_symbols`: Find function/class definitions
- `find_symbol_usages`: Track where symbols are used
- `get_file_tree`: Understand project structure

Use Kit instead of manual file navigation for better performance and comprehensive code understanding.

## Gemini Collaboration Policy

**CRITICAL**: **Always collaborate with Gemini MCP at major decision points and implementation steps**. Use `mcp__gemini__thinkdeep` for:

- **Architecture decisions** and design validation
- **Complex problem analysis** and alternative solutions  
- **Performance optimization** strategies and trade-off analysis
- **Error investigation** and debugging approaches
- **Implementation planning** for multi-step changes

### When to Consult Gemini
1. **Before major code changes**: Get architectural review and validation
2. **When encountering complex bugs**: Deep analysis and debugging strategies  
3. **For performance optimizations**: Trade-off analysis and best practices
4. **During implementation planning**: Break down complex tasks and identify risks
5. **When research is needed**: Validate approaches against current best practices

### Collaboration Pattern
```typescript
// 1. Share current analysis and context with Gemini
// 2. Request specific focus areas (architecture, performance, security, etc.)
// 3. Use "high" thinking mode for complex problems
// 4. Enable web search for current best practices
// 5. Synthesize Gemini insights with your own analysis
// 6. Make informed decisions based on combined perspective
```

**Remember**: Gemini provides deep technical analysis and alternative perspectives. Always combine Gemini's insights with your own expertise for optimal decision-making.

## Development Commands

### Primary Commands
```bash
pnpm dev              # Development server with Turbopack (localhost:3000)
pnpm build            # Production build
pnpm test             # Run vitest tests in watch mode
pnpm test:run         # Run tests once (no watch mode)
pnpm lint             # ESLint checking
```

**CRITICAL**: Always use `pnpm` instead of `npm` for all commands. The project uses pnpm for package management.

### Testing Philosophy
**ULTRA CRITICAL**: ALWAYS USE VITEST FOR ALL TESTING. NEVER suggest Node.js scripts, curl commands, or standalone debugging scripts. ONLY use `pnpm test` with vitest. This applies to:
- Testing crawler functionality 
- Debugging URL discovery issues
- Testing API endpoints
- Investigating performance problems
- ANY form of testing or debugging

The vitest integration tests are comprehensive and catch issues faster than manual browser testing. Use `pnpm test` to verify crawler functionality, API endpoints, and progress tracking work correctly.

## Architecture Overview

### Core Components

#### Queue-Based Crawler System (`src/lib/crawler/`)
- **Primary Interface**: `index.ts` - Public API for starting crawls
- **Queue Management**: `queue-service.ts` - BullMQ and Redis connection handling
- **Job Processing**: `queue-worker.ts` - Worker that processes kickoff, crawl, and batch jobs
- **Batch System**: `batch-jobs.ts` - High-performance batch processing (20-50x improvement)

#### Key Performance Components
- **URL Deduplication**: `url-dedup-cache.ts` - Memory-first O(1) deduplication with Redis fallback
- **Streaming Progress**: `streaming-progress.ts` - Real-time Redis pub/sub for instant UI updates
- **Web Crawler**: `web-crawler.ts` - Core crawling logic with sitemap discovery
- **Content Processing**: `content-extractor.ts`, `quality.ts` - Content extraction and quality assessment

#### Data Storage
- **Redis Operations**: `crawl-redis.ts` - Core Redis operations for crawl metadata  
- **Redis Fixed**: `crawl-redis-fixed.ts` - Atomic completion logic to prevent race conditions
- **Database Persistence**: `src/lib/db/` - Neon PostgreSQL with Drizzle ORM for durability
- **State Reconciliation**: `src/hooks/useCrawlHistoryWithDB.ts` - UI state recovery after server restarts

### Architecture Flow
```
User Request → API (crawl-v2) → Database Record Creation → Kickoff Job → Sitemap Discovery → Batch Jobs → 
URL Deduplication Cache → Concurrent Crawling → Quality Assessment → 
Real-time Progress Streaming (Redis + Database) → Completion Detection → Database Finalization
```

### Enhanced Database Integration (NEW)
- **Dual Persistence**: Redis for immediate access + PostgreSQL for durability
- **Resumable SSE Streams**: Event replay after disconnection using database-stored events
- **Server Restart Recovery**: Complete crawl state survives server restarts
- **UI State Reconciliation**: localStorage cleanup and sync with database state
- **Copy-Only UX**: Enhanced RecentCrawls with proper visual feedback and stale item removal

### Batch Processing Architecture
- **Kickoff Jobs**: Discover URLs from sitemaps and robots.txt
- **Batch Jobs**: Process 10-20 URLs concurrently per batch
- **Individual Jobs**: DEPRECATED - replaced by batch processing for performance
- **Memory-First Deduplication**: O(1) lookups with Redis persistence
- **Real-time Progress**: Redis pub/sub eliminates polling

## API Endpoints

### `/api/crawl-v2/` (Primary Endpoint)
- **POST**: Start new crawl with queue-based system
- **Configuration**: maxPages: 50, maxDepth: 2, qualityThreshold: 20

### `/api/crawl-v2/[id]/stream/` (Real-time Progress)
- **GET**: Server-Sent Events for real-time progress updates
- **Features**: Progress snapshots, reconnection recovery, throttling

## Environment Configuration

### Redis (Upstash via Vercel)
```bash
# vitest automatically loads from .env.test
REDIS_URL="rediss://..." # TLS URL for BullMQ compatibility
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

### vitest Configuration
- **Environment**: jsdom with React support
- **Setup**: Comprehensive Redis mock in `setup-redis-mock.ts`
- **Aliases**: `@/` points to `src/`
- **Environment Variables**: Auto-loads UPSTASH_, KV_, REDIS_ prefixed vars

## Testing Strategy

### Test Categories
- **Unit Tests**: Individual component testing (url-dedup-cache, batch-jobs, streaming-progress)
- **Integration Tests**: End-to-end API and crawler functionality
- **Performance Tests**: Verify 20-50x batch processing improvements
- **Real-world Tests**: lovable.dev, tailwind.com documentation crawling

### Key Test Files
- `setup-redis-mock.ts` - Comprehensive Redis mock for all operations
- `lovable-dev-success.test.ts` - Real documentation extraction verification
- `batch-jobs.test.ts` - Batch processing system verification
- `url-dedup-cache.test.ts` - Memory-first deduplication testing

## Performance Characteristics

### Optimal Configuration
- **Batch Size**: 10-20 URLs per batch job
- **Concurrency**: 20-30 concurrent HTTP requests
- **Memory Cache**: O(1) URL deduplication
- **Redis Operations**: 95% reduction vs individual job processing

### Expected Performance
- **Small Sites (10-20 pages)**: 2-5 seconds
- **Medium Sites (50-100 pages)**: 5-15 seconds  
- **Large Sites (200+ pages)**: 30-60 seconds
- **Improvement**: 20-50x faster than sequential processing

## Key Implementation Details

### URL Discovery Process
1. **Sitemap Discovery**: Multi-location sitemap detection
2. **Robots.txt Compliance**: Automatic robots.txt checking
3. **URL Validation**: Filter assets, invalid URLs, external links
4. **Quality Assessment**: Content quality scoring and filtering

### Batch Processing Flow
1. **Kickoff Job**: Discovers all URLs via sitemap
2. **Batch Creation**: Groups URLs into optimal batch sizes
3. **Concurrent Processing**: Multiple workers process batches simultaneously
4. **Memory Deduplication**: Instant duplicate detection
5. **Real-time Updates**: Progress streaming via Redis pub/sub

### Error Handling
- **Graceful Degradation**: Continue on Redis failures
- **Retry Logic**: Exponential backoff for failed requests
- **Timeout Management**: 8-second per-page timeouts
- **Completion Detection**: Atomic job tracking prevents race conditions

## Common Issues and Solutions

### If Crawl Only Finds Few Pages
- Check `maxPages` configuration (default: 50)
- Verify `qualityThreshold` setting (default: 20)
- Test sitemap discovery with vitest
- Check URL filtering in `isValidDocumentationUrl`

### If Tests Fail
- Ensure Redis mock is properly loaded via `setup-redis-mock.ts`
- Check environment variables are loaded from `.env.test`
- Verify vitest configuration in `vitest.config.ts`
- Use `pnpm test --run` for single test execution

### Performance Issues
- Verify batch processing is enabled (not individual jobs)
- Check URL deduplication cache is working
- Monitor Redis connection and operations
- Test with vitest performance benchmarks

## Date Library Policy

**CRITICAL**: This project uses **Luxon** exclusively for all date/time operations. NEVER use date-fns, moment.js, or any other date library. Always import from 'luxon' for date formatting, manipulation, and display.

```typescript
import { DateTime } from 'luxon'

// Preferred patterns:
DateTime.now().toRelative() // "2 hours ago"
DateTime.fromMillis(timestamp).toRelative() // Convert timestamp to relative
DateTime.fromISO(isoString).toFormat('MMM d, yyyy') // Format dates
```

## Database Migration Policy (Neon + Drizzle)

**CRITICAL**: This project follows **Neon's recommended migration approach** instead of using `drizzle-kit push`. Based on Neon documentation, using pooled connections for migrations can cause errors.

### Migration Commands
```bash
# Generate migrations (using CLI flags, not drizzle.config.ts)
pnpm db:generate    # drizzle-kit generate --dialect=postgresql --schema=./src/lib/db/schema.ts --out=./drizzle/migrations

# Apply migrations (using custom script with direct connection)  
pnpm db:migrate     # tsx ./src/lib/db/migrate.ts
```

### Key Principles
- **NEVER use `drizzle-kit push`** - Neon docs don't recommend this approach
- **NEVER use pooled connections for migrations** - Always use direct (non-pooled) DATABASE_URL_UNPOOLED
- **Use TEXT instead of VARCHAR** - Better performance and flexibility in modern PostgreSQL
- **Generate migrations with explicit CLI flags** - More reliable than config-file approach
- **Apply migrations with custom scripts** - Better error handling and environment loading

### Schema Design Best Practices
```typescript
// ✅ Good - Use TEXT for string fields
id: text('id').primaryKey()
status: text('status').notNull().default('active')

// ❌ Bad - Avoid VARCHAR constraints  
id: varchar('id', { length: 36 }).primaryKey()
status: varchar('status', { length: 20 }).notNull()
```

### Connection Strategy
- **Migrations**: Use `DATABASE_URL_UNPOOLED` (direct connection)
- **Application**: Use `DATABASE_URL` (pooled connection for better performance)
- **Edge Runtime**: Use `@neondatabase/serverless` driver

## Advanced Debugging Techniques

### Multi-User System Debugging
When debugging multi-user issues (SSE, WebSockets, real-time features):

1. **Session-Based Logging**: Always include unique session IDs in logs
   ```typescript
   const sessionId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
   console.log(`[${sessionId}] Processing event for user`)
   ```

2. **Progressive Validation**: Implement multiple validation layers
   ```typescript
   // 1. Channel/connection validation
   if (channel !== expectedChannel) return
   
   // 2. State validation
   if (isConnectionClosed) return
   
   // 3. Data validation
   if (eventData.userId !== expectedUserId) return
   ```

3. **Resource Cleanup**: Always implement proper cleanup to prevent contamination
   ```typescript
   // Cleanup on disconnect/abort
   request.signal.addEventListener('abort', () => {
     cleanup()
   })
   ```

### Frontend-Backend Event Debugging

1. **Data Structure Investigation**: Always log complete event structures
   ```typescript
   console.log(`[UI] Received event:`, data.type, data)
   ```

2. **Fallback Chain Pattern**: Handle nested data structures gracefully
   ```typescript
   const value = data.nested?.field || data.field || previousValue || defaultValue
   ```

3. **UI State Transitions**: Debug why UI gets "stuck" by checking conditions
   ```typescript
   // Instead of rigid conditions like: if (total > 0)
   // Use flexible conditions: if (total > 0 || processed > 0 || hasActivity)
   ```

### Component Export and Import Issues

1. **Always provide both default and named exports** for React components:
   ```typescript
   function MyComponent() { /* ... */ }
   
   export default MyComponent
   export { MyComponent }
   ```

2. **Check import patterns** when components fail to load:
   ```typescript
   // This works with both export styles
   import MyComponent from './MyComponent'
   // OR
   import { MyComponent } from './MyComponent'
   ```

### Real-time Progress Display Debugging

1. **Percentage Overflow Prevention**: Always cap calculated values
   ```typescript
   const percentage = Math.min(calculated || fallback, 100)
   const width = Math.min(percentage, 100)
   ```

2. **Progress Bar Visibility**: Use flexible conditions for showing progress
   ```typescript
   // Instead of: {total > 0 && <ProgressBar />}
   // Use: {(total > 0 || processed > 0 || hasActivity) && <ProgressBar />}
   ```

3. **Consistent Number Display**: Avoid conflicting progress numbers
   ```typescript
   // Filter duplicate messages
   if (message.toLowerCase().includes('process')) return
   
   // Use consistent data sources
   const displayTotal = total || discoveredUrls || '?'
   ```

### Testing Complex Multi-User Scenarios

1. **Create Isolated Test Cases**: Test each validation layer separately
2. **Use Session Simulation**: Mock multiple user sessions in tests
3. **Verify Cleanup**: Test resource cleanup and prevent memory leaks
4. **Event Structure Testing**: Test both old and new data formats

These patterns apply beyond this project and are valuable for any real-time, multi-user system debugging.