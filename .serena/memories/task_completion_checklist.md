# Task Completion Checklist

## Before Considering Any Task Complete

### 1. Code Quality Checks
```bash
pnpm lint             # Fix all ESLint errors
pnpm typecheck        # Resolve all TypeScript errors
```

### 2. Testing Requirements (CRITICAL)
```bash
pnpm test:run         # ALL tests must pass
```
**NEVER skip testing** - the vitest integration tests are comprehensive and catch issues faster than manual testing.

### 3. Database Integrity
- If database schema changed: Run `pnpm db:generate` and `pnpm db:migrate`
- If major changes: Consider `pnpm db:nuclear` for clean reset
- Verify migrations work with Neon serverless constraints

### 4. Build Verification
```bash
pnpm build            # Ensure production build succeeds
```

### 5. Feature-Specific Validation

#### For Crawler/API Changes
- Test with vitest integration tests (NOT curl or manual scripts)
- Verify real-time progress streaming works
- Check QStash job processing functionality
- Validate database state persistence

#### For UI Changes
- Test responsive design (mobile/desktop)
- Verify SSE connections and real-time updates using `CrawlJobCard` component
- Check `useActiveJobs` hook integration for database-driven job lists
- Validate error handling and loading states

#### For Database Changes
- Verify migration compatibility with Neon serverless
- Test user isolation and security
- Check foreign key relationships
- Validate JSONB configuration fields

### 6. Documentation Updates
- Update CLAUDE.md if workflow changes
- Update memory files if architecture changes
- No need to create README files unless explicitly requested

## Component Architecture (Post-Polish)
- **Single Job Component**: `CrawlJobCard.tsx` handles all job display logic
- **Database-Driven State**: `useActiveJobs` hook replaces localStorage patterns
- **Real-time Updates**: `useCrawlJob` hook provides SSE progress per job
- **Clean Dependencies**: No legacy `redis` dependency, uses `resumable-stream` correctly

## Critical Failure Points to Avoid
- **NEVER use npm** - always use pnpm
- **NEVER skip vitest tests** - they catch issues other methods miss
- **NEVER use pooled connections for migrations** - use DATABASE_URL_UNPOOLED
- **NEVER manually test with curl** - use vitest integration tests
- **NEVER import date libraries other than Luxon**
- **NEVER use localStorage for active job state** - use `useActiveJobs` hook

## Success Criteria
✅ All linting passes  
✅ All type checking passes  
✅ All tests pass  
✅ Production build succeeds  
✅ Feature works as intended  
✅ No regressions introduced  
✅ Components properly consolidated  
✅ Database is source of truth