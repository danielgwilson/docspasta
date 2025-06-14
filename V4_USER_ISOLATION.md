# V4 API User Isolation Implementation

This document describes the user isolation implementation for the V4 API to prevent users from accessing each other's data.

## Overview

The V4 API has been updated to implement complete user isolation at both the database and Redis levels. All operations are now scoped to individual users, ensuring data privacy and security.

## Key Changes

### 1. Database Schema Updates

All V4 tables now include a `user_id` column:

- **jobs**: Tracks which user owns each crawl job
- **url_cache**: Isolates cached content per user
- **job_queue**: Ensures queue items are user-specific
- **sse_events**: Separates event streams by user

New indexes ensure efficient querying by user:
```sql
CREATE INDEX idx_jobs_user ON jobs (user_id, created_at DESC);
CREATE INDEX idx_jobs_user_status ON jobs (user_id, status);
CREATE INDEX idx_job_queue_user_pending ON job_queue (user_id, job_id, status);
CREATE INDEX idx_url_cache_user_lookup ON url_cache (user_id, url_hash);
CREATE INDEX idx_sse_events_user_job ON sse_events (user_id, job_id, created_at);
```

### 2. Authentication Module

Created `src/lib/serverless/auth.ts` with:

- `getUserId(request)`: Extracts user ID from requests
- `validateUserAccess()`: Validates user has access to resources
- `getUserNamespacedKey()`: Creates user-namespaced Redis keys
- `getUserJobKey()`: Creates job-specific Redis keys with user namespace

**Current Implementation**: Uses header-based authentication (`x-test-user-id`) for testing.

**TODO**: Replace with proper authentication:
- JWT token validation
- Session-based authentication
- OAuth integration
- API key authentication

### 3. Database Operations Updates

All database operations in `db-operations.ts` now require `userId`:

```typescript
// Before
createJob(url: string): Promise<string>

// After
createJob(userId: string, url: string): Promise<string>
```

All queries include user filtering:
```sql
WHERE id = ${jobId} AND user_id = ${userId}
```

### 4. Redis Key Namespacing

All Redis keys are now namespaced by user:

```typescript
// Before
`job:${jobId}`
`stream:${jobId}`

// After
`user:${userId}:job:${jobId}`
`user:${userId}:stream:${jobId}`
```

### 5. API Route Updates

All V4 API routes now:
1. Extract user ID from requests
2. Pass user ID to all database operations
3. Include user ID in internal API calls via headers

Example:
```typescript
export async function POST(request: NextRequest) {
  const userId = await getUserId(request)
  const jobId = await createJob(userId, url)
  // ...
}
```

## Migration Guide

### Running the Migration

1. **Backup your database** before running migrations

2. Run the migration script:
```bash
pnpm tsx src/lib/db/migrate-v4-user-isolation.ts
```

3. Verify the migration:
```bash
# Check that all tables have user_id columns
# The migration script will output verification results
```

### Testing User Isolation

1. Create jobs with different user IDs:
```bash
# User 1
curl -X POST http://localhost:3000/api/v4/jobs \
  -H "Content-Type: application/json" \
  -H "x-test-user-id: user-001" \
  -d '{"url": "https://example.com"}'

# User 2
curl -X POST http://localhost:3000/api/v4/jobs \
  -H "Content-Type: application/json" \
  -H "x-test-user-id: user-002" \
  -d '{"url": "https://example.com"}'
```

2. Verify isolation:
```bash
# User 1 can only see their jobs
curl http://localhost:3000/api/v4/jobs \
  -H "x-test-user-id: user-001"

# User 2 can only see their jobs
curl http://localhost:3000/api/v4/jobs \
  -H "x-test-user-id: user-002"
```

## Security Considerations

1. **Default User**: The migration adds a default `user_id` of `'default-user'` to existing records. Update these to proper user IDs before removing the default.

2. **Authentication**: The current header-based auth is for testing only. Implement proper authentication before production use.

3. **Cross-User Access**: All database queries are filtered by user_id, preventing any cross-user data access.

4. **Cache Isolation**: The URL cache is now user-specific, preventing information leakage through cached content.

## Future Enhancements

1. **Row Level Security (RLS)**: Consider enabling PostgreSQL RLS for defense in depth
2. **User Quotas**: Implement per-user rate limiting and resource quotas
3. **Audit Logging**: Add audit trails for all user actions
4. **Multi-Tenant Optimization**: Consider partitioning large tables by user_id

## API Changes Summary

All V4 endpoints now require authentication and respect user isolation:

- `POST /api/v4/jobs` - Creates jobs for authenticated user only
- `GET /api/v4/jobs` - Returns only authenticated user's jobs
- `GET /api/v4/jobs/[id]` - Returns job only if owned by authenticated user
- `GET /api/v4/jobs/[id]/stream` - Streams events only for authenticated user's jobs
- `POST /api/v4/crawl` - Processes URLs for authenticated user's jobs only
- `POST /api/v4/process` - Processes content for authenticated user's jobs only

## Testing Checklist

- [ ] User A cannot see User B's jobs
- [ ] User A cannot access User B's job streams
- [ ] User A cannot retrieve User B's job results
- [ ] Cached content is isolated per user
- [ ] Redis keys are properly namespaced
- [ ] No database queries can return cross-user data