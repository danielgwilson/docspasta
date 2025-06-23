CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'partial_success');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('pending', 'crawled', 'error', 'skipped');--> statement-breakpoint
CREATE TABLE "crawled_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"title" text,
	"status" "page_status" DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"error_message" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"discovered_from" text,
	"quality_score" integer DEFAULT 0,
	"word_count" integer DEFAULT 0,
	"crawled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawling_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"status_message" text,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"pages_found" integer DEFAULT 0 NOT NULL,
	"total_words" integer DEFAULT 0 NOT NULL,
	"final_markdown" text,
	"state_version" integer DEFAULT 1 NOT NULL,
	"progress_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "page_content_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'markdown' NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"start_position" integer,
	"end_position" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crawled_pages" ADD CONSTRAINT "crawled_pages_job_id_crawling_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crawling_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_content_chunks" ADD CONSTRAINT "page_content_chunks_page_id_crawled_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."crawled_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawled_pages_job_id_idx" ON "crawled_pages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "crawled_pages_url_hash_idx" ON "crawled_pages" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "crawled_pages_status_idx" ON "crawled_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crawled_pages_job_url_unique" ON "crawled_pages" USING btree ("job_id","url_hash");--> statement-breakpoint
CREATE INDEX "crawling_jobs_user_id_idx" ON "crawling_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crawling_jobs_status_idx" ON "crawling_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crawling_jobs_created_at_idx" ON "crawling_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crawling_jobs_pending_idx" ON "crawling_jobs" USING btree ("id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "page_content_chunks_page_id_idx" ON "page_content_chunks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_content_chunks_order_idx" ON "page_content_chunks" USING btree ("page_id","chunk_index");