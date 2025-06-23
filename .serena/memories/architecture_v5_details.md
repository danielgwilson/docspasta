# V5 Architecture Details

## Clean 3-Table Database Schema
- **`crawlingJobs`**: Main job metadata with JSONB config, user isolation, status tracking
- **`crawledPages`**: Individual page discovery and crawling status with quality scoring  
- **`pageContentChunks`**: Efficient content storage with chunking for large pages

## QStash Job Processing
- **Start Crawl Jobs**: Discover URLs from sitemaps and robots.txt
- **Process URL Jobs**: Crawl individual URLs with content quality assessment
- **Finalize Jobs**: Combine results and generate final markdown

## Real-time Progress with Resumable Stream
- **Correctly Implemented**: Uses `resumable-stream` library with proper idempotent `resumableStream()` method
- **Database-driven**: SSE streams reconstruct state from database (NOT event replay)  
- **State Versioning**: Efficient polling with version-based updates
- **Clean Implementation**: ~50 lines vs previous 567-line monster

## Modern Component Architecture
- **CrawlJobCard.tsx**: Single, consolidated component for job display
- **useActiveJobs Hook**: Database-driven active jobs fetching (replaces localStorage)
- **useCrawlJob Hook**: Real-time SSE progress updates per job
- **Clean State Management**: No localStorage persistence, backend is source of truth

## Modular Library Structure
```
src/lib/
├── crawler/                   # Core crawling logic
│   ├── discovery.ts          # URL and sitemap discovery
│   ├── page-processor.ts     # Individual page processing
│   ├── job-finalizer.ts      # Result combination
│   └── index.ts              # Exports
├── queue/                     # QStash operations
│   ├── operations.ts         # Queue management
│   ├── types.ts              # Queue type definitions
│   └── index.ts              # Exports
├── db/                        # Database operations
├── auth/                      # Authentication middleware
└── v5-state-management.ts    # Job state management
```

## User Isolation & Security
- All database operations are user-scoped
- Application-level filtering for multi-tenancy
- SSRF protection and input validation
- Idempotency patterns for queue processing

## Dependencies Cleaned Up
- **Removed**: Legacy `redis` dependency (resumable-stream uses ioredis internally)
- **Core**: `resumable-stream`, `@upstash/qstash`, `@neondatabase/serverless`
- **No Legacy Files**: Removed obsolete jobs.ts, types.ts, and redundant components