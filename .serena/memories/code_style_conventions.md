# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2017 with modern library support
- **Strict Mode**: Enabled with strict type checking
- **Path Aliases**: 
  - `@/*` → `./src/*`
  - `@/features/*` → `./src/features/*`
  - `@/shared/*` → `./src/shared/*`

## Function Style Preferences
- **Prefer Arrow Functions**: Use arrow functions over function declarations
- **Expression Style**: Functions should be expressions where possible
- **Concise Bodies**: Use arrow body style "as-needed"

## Architecture Patterns
- **Feature-Sliced Architecture**: Code organized into feature modules and shared utilities
- **Database-First**: All SSE streams reconstruct from database state, not event replay
- **Serverless-Native**: Designed for Vercel deployment with QStash job processing

## Naming Conventions
- **Files**: kebab-case for files (`crawl-card.tsx`, `queue-operations.ts`)
- **Components**: PascalCase (`CrawlCard`, `CrawlProgress`)
- **Functions**: camelCase (`processUrlJob`, `getJobState`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_QUEUE_CONFIG`)
- **Types/Interfaces**: PascalCase (`CrawlConfig`, `JobState`)

## Import Patterns
```typescript
// Framework imports first
import { useState, useEffect } from 'react'
import { NextRequest } from 'next/server'

// Third-party libraries
import { z } from 'zod'
import { eq } from 'drizzle-orm'

// Internal imports with path aliases
import { db } from '@/shared/lib/db'
import { CrawlCard } from '@/features/crawling/components'
```

## Database Patterns
- **Use Drizzle ORM** with manual SQL migrations for Neon compatibility
- **NEVER use drizzle-kit push** - always use generate + migrate approach
- **Use TEXT over VARCHAR** for better PostgreSQL performance
- **User Isolation**: All operations are user-scoped with application-level filtering

## Date Handling
- **Luxon Only**: Use Luxon exclusively for all date/time operations
- **No date-fns or moment.js**: Never import or use other date libraries
- **Relative Times**: Use `DateTime.now().toRelative()` for user-friendly timestamps