// =================================================================
// Docspasta 2.0 -- The Definitive Drizzle ORM Schema
//
// Final Review Principles:
// 1. Correct Imports: All helpers, including `sql`, are imported
//    from their canonical, non-deprecated locations.
// 2. Modern Syntax: Index definitions, especially partial unique
//    indexes, use the current, fluent `.where()` API.
// 3. Lean & Robust: The schema is the minimal set of tables
//    required, with database-level guards (partial indexes) to
//    ensure data integrity and prevent redundant work.
// 4. Documented Intent: Comments clarify *why* each design
//    decision was made, from caching to authentication.
// =================================================================

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/*                                    Enums                                   */
/* -------------------------------------------------------------------------- */

// Defines the caching behavior for a given source.
export const cachePolicy = pgEnum('cache_policy', [
  'always', // Always use the latest crawl unless explicitly told not to.
  'ttl', // Use latest crawl if it's within the TTL.
  'none', // Always trigger a new crawl by default.
]);

// Defines the lifecycle of a single crawl job.
export const crawlState = pgEnum('crawl_state', [
  'initial',
  'running',
  'finalized',
  'error',
]);

/* -------------------------------------------------------------------------- */
/*                                   Tables                                   */
/* -------------------------------------------------------------------------- */

/**
 * 1. VISITORS
 * Tracks a unique user, whether anonymous (via a cookie) or
 * logged in (via Clerk). This allows associating anonymous activity
 * with an account post-login.
 */
export const visitors = pgTable('visitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  cookieId: text('cookie_id').notNull(),
  clerkUserId: text('clerk_user_id'), // Nullable until a user logs in
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const visitorsCookieIdIdx = uniqueIndex('visitors_cookie_id_idx').on(visitors.cookieId);
export const visitorsClerkUserIdIdx = uniqueIndex('visitors_clerk_user_id_idx')
  .on(visitors.clerkUserId)
  .where(sql`clerk_user_id IS NOT NULL`);

/**
 * 2. SOURCES
 * A canonical documentation source, uniquely identified by its scope.
 * This table holds the "what" to crawl and its caching rules.
 */
export const sources = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  // The crawl scope, inspired by Cursor.
  entrypointUrl: text('entrypoint_url').notNull(),
  prefixUrl: text('prefix_url').notNull(),
  // Human-readable metadata.
  title: text('title'),
  description: text('description'),
  faviconUrl: text('favicon_url'),
  // --- Caching Strategy ---
  // A pointer to the most recent successfully completed crawl.
  latestCrawlId: uuid('latest_crawl_id'),
  cachePolicy: cachePolicy('cache_policy').default('always'),
  cacheTtlMinutes: integer('cache_ttl_minutes').default(10080), // 7 days
  // --- Ownership & Metadata ---
  createdBy: uuid('created_by').references(() => visitors.id),
  isPublic: boolean('is_public').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Ensures we never have duplicate sources for the same scope.
export const sourcesScopeIdx = uniqueIndex('sources_scope_idx').on(sources.entrypointUrl, sources.prefixUrl);

/**
 * 3. CRAWLS
 * An immutable record of a single crawl attempt for a source.
 * This captures a snapshot in time.
 */
export const crawls = pgTable('crawls', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id')
    .references(() => sources.id)
    .notNull(),
  branch: text('branch'), // For versioned docs, e.g., 'main', 'v1.2'
  state: crawlState('state').default('initial'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  totalTokens: integer('total_tokens').default(0),
  totalPages: integer('total_pages').default(0),
  error: text('error'),
});

// This partial unique index is the database-level guard against
// redundant work. It prevents more than one crawl from being in the
// 'running' state for the same source and branch.
export const crawlsRunningScopeIdx = uniqueIndex('crawls_running_scope_idx')
  .on(crawls.sourceId, crawls.branch)
  .where(sql`state = 'running'`);

// A supporting index to quickly find the latest *finished* crawl,
// which is needed to update the `latest_crawl_id` pointer.
export const crawlsFinalizedIdx = index('crawls_finalized_idx')
  .on(crawls.sourceId, crawls.branch, crawls.finishedAt)
  .where(sql`state = 'finalized'`);

/**
 * 4. PAGES
 * The actual content. One row per crawled page, containing the
 * cleaned, final markdown.
 */
export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  crawlId: uuid('crawl_id')
    .references(() => crawls.id)
    .notNull(),
  path: text('path').notNull(), // e.g., /guides/introduction
  markdown: text('markdown').notNull(),
  tokenCount: integer('token_count'),
  orderIndex: integer('order_index'), // To preserve nav order
  contentHash: text('content_hash'), // For future diff-based crawls
});

export const pagesLookupIdx = index('pages_crawl_path_idx').on(pages.crawlId, pages.path);

/**
 * 5. SUMMARIES
 * An optional, LLM-generated summary of a full crawl. Kept in a
 * separate table to avoid bloating the primary `crawls` table.
 */
export const summaries = pgTable('summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  crawlId: uuid('crawl_id')
    .references(() => crawls.id)
    .notNull()
    .unique(),
  markdown: text('markdown'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * 6. SHARE_LINKS
 * Powers the `docspasta.com/p/xyz` URLs. Can either point to a
 * floating, always-latest source or a pinned, immutable crawl.
 */
export const shareLinks = pgTable('share_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Exactly one of these two should be non-null.
  crawlId: uuid('crawl_id').references(() => crawls.id), // Pinned version
  sourceId: uuid('source_id').references(() => sources.id), // Floating version
  slug: text('slug').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const shareLinksSlugIdx = uniqueIndex('share_links_slug_idx').on(shareLinks.slug);