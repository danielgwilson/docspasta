# User Authentication Implementation

## Overview
Implemented a cookie-based user authentication system that:
- Automatically creates anonymous users on first visit
- Uses cookies to persist user identity
- Supports future authenticated users (auth token takes precedence over anonymous cookie)

## Implementation Details

### 1. Authentication Middleware (`src/lib/auth/middleware.ts`)
- `getCurrentUser()` - Gets current user (authenticated or anonymous)
- `getOrCreateAnonUser()` - Creates/retrieves anonymous user cookie (1 year expiration)
- `getAuthenticatedUser()` - Placeholder for real auth integration

### 2. Database Changes
- Added `user_id` column to all V4 tables: `jobs`, `url_cache`, `job_queue`, `sse_events`
- Created indexes for efficient user-based queries
- Updated unique constraints to include user_id for proper isolation

### 3. API Endpoints Updated
- `/api/v4/jobs` - Creates jobs with user_id, lists only user's jobs
- `/api/v4/jobs/[id]/stream` - Verifies job ownership before streaming
- `/api/v4/jobs/[id]/download` - Only allows downloading user's own jobs

### 4. Key Features
- **Zero-friction**: Users can start using immediately without signup
- **Privacy**: Each user only sees their own crawls
- **Future-proof**: Ready for real authentication when needed
- **Persistent**: Anonymous users keep their history for 1 year

## Cookie Structure
- **Anonymous Cookie**: `anon-user-id` = `anon-{uuid}`
- **Auth Cookie**: `auth-token` = JWT token (future implementation)

## Migration Applied
```sql
-- Added user_id TEXT NOT NULL DEFAULT 'default-user' to:
-- jobs, url_cache, job_queue, sse_events tables
-- Created appropriate indexes for performance
```

## Next Steps for Full Authentication
1. Implement real authentication provider (Auth0, Clerk, etc.)
2. Update `getAuthenticatedUser()` to validate real auth tokens
3. Add login/signup UI components
4. Consider data migration from anonymous to authenticated users