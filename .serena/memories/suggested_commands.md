# Essential Development Commands

## Development Workflow
```bash
pnpm dev              # Start development server with Turbopack (localhost:3000)
pnpm build            # Production build
pnpm start            # Start production server
```

## Testing Commands (CRITICAL)
```bash
pnpm test             # Run vitest tests in watch mode
pnpm test:run         # Run tests once (no watch mode)
pnpm test:e2e         # End-to-end tests
pnpm test:e2e:run     # Run E2E tests once
```

**ULTRA CRITICAL**: ALWAYS USE VITEST FOR ALL TESTING. NEVER suggest Node.js scripts, curl commands, or standalone debugging scripts. ONLY use `pnpm test` with vitest for testing crawler functionality, API endpoints, and debugging.

## Code Quality
```bash
pnpm lint             # ESLint checking (Next.js built-in)
pnpm typecheck        # TypeScript type checking
```

## Database Operations
```bash
pnpm db:generate      # Generate Drizzle migrations (V5 schema)
pnpm db:migrate       # Apply migrations using custom script
pnpm db:reset         # Reset database 
pnpm db:nuclear       # Nuclear database reset (interactive)
pnpm db:studio        # Open Drizzle Studio
```

## System Commands (Linux)
```bash
grep -r "pattern"     # Search for patterns in files
find . -name "*.ts"   # Find TypeScript files
ls -la                # List files with details
cd directory         # Change directory
git status            # Check git status
```

## IMPORTANT NOTES
- **Always use `pnpm`** instead of `npm` - this project uses pnpm package management
- **Testing Reminder**: Use vitest integration tests for all debugging and testing
- **Database**: Use custom migration scripts due to Neon serverless requirements
- **Environment**: Supports multiple environments (.env.local, .env.test)