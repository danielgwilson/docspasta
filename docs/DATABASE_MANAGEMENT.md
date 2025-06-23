# Database Management Guide

## ✅ Proper Drizzle Workflow (Fixed!)

We've fixed the Drizzle integration to work properly with Neon PostgreSQL. Here's the correct process:

### For Schema Changes
```bash
# 1. Modify schema in src/shared/lib/db/schema-new.ts
# 2. Generate migration files
pnpm db:generate

# 3. Apply migrations to database  
pnpm db:push  # For development (bypasses migration files)
# OR
pnpm db:migrate  # For production (uses migration files)
```

### For New Deployments
```bash
# Apply all pending migrations
pnpm db:migrate
```

## 🔧 Fixed Issues

### Problem: Drizzle Migrations Failing Silently
**Root Cause**: 
- Custom migration script bypassed Drizzle's tracking system
- Environment variables not loading in drizzle.config.ts
- Wrong driver configuration

**Solution Applied**:
- ✅ Fixed drizzle.config.ts with proper env loading
- ✅ Updated package.json scripts to use drizzle-kit commands
- ✅ Verified drizzle-kit push/generate works correctly
- ✅ Removed custom bypass scripts

### Current State
- ✅ Schema created: crawling_jobs, crawled_pages, page_content_chunks
- ✅ Drizzle config working with Neon PostgreSQL
- ✅ TypeScript types properly exported
- ✅ Database operations tested and working

## 📋 Commands Reference

```bash
# Generate new migration files
pnpm db:generate

# Push schema directly to DB (development)
pnpm db:push

# Apply migrations (production)
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

## 🚫 Never Do This Again

- ❌ Don't bypass Drizzle with custom SQL scripts
- ❌ Don't manually modify __drizzle_migrations table
- ❌ Don't use tsx scripts for migrations
- ✅ Always use drizzle-kit commands
- ✅ Always test with pnpm db:push first
- ✅ Use proper migration files for production

## 🎯 Next Steps

The database foundation is now solid and follows Drizzle best practices. You can safely:

1. Modify schema-new.ts
2. Run pnpm db:generate  
3. Apply with pnpm db:push (dev) or pnpm db:migrate (prod)
4. Commit the migration files to git

**No more manual SQL needed!** 🎉