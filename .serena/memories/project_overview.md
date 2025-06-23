# Docspasta V2 - Project Overview

## Purpose
Docspasta is a **Next.js 15 documentation crawler** that extracts and processes content from websites. It's designed as a serverless application with advanced crawling capabilities, real-time progress tracking, and quality assessment.

## Current State: V2 Rebuild Complete ✅
- **V5 Architecture**: Production-ready with clean 3-table schema and QStash job processing
- **Modern Frontend**: Single `CrawlJobCard` component with database-driven state management
- **SSE Implementation**: Correctly uses `resumable-stream` library for robust real-time updates
- **Clean Codebase**: Removed all legacy components and dependencies

## Key Features
- **Web Crawling**: Sitemap discovery, robots.txt compliance, content quality assessment
- **Real-time Progress**: Server-Sent Events (SSE) with resumable-stream v2.2.0
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Job Processing**: Upstash QStash for serverless job queues
- **User Interface**: React 19 with Tailwind CSS and shadcn/ui components
- **Testing**: Comprehensive vitest integration tests

## Tech Stack Overview
- **Frontend**: Next.js 15 App Router, React 19, TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn/ui, Framer Motion
- **Backend**: Serverless functions, Upstash QStash, Neon PostgreSQL
- **Database**: Drizzle ORM with manual SQL migrations for Neon compatibility
- **Streaming**: `resumable-stream` for SSE (no Redis dependency needed)
- **Date/Time**: Luxon exclusively (NO date-fns or moment.js)
- **Testing**: Vitest with jsdom environment, comprehensive integration tests
- **Package Manager**: pnpm (NEVER use npm)

## Architecture Highlights
- **Single Source of Truth**: Database-driven state, no localStorage persistence
- **Component Consolidation**: One `CrawlJobCard` replaces three redundant components
- **Clean Dependencies**: Removed obsolete `redis` package and legacy files
- **Proper SSE**: Uses `resumable-stream` idempotent patterns correctly