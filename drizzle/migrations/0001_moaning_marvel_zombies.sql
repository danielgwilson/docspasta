CREATE TABLE "crawl_jobs_v3" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"initial_url" text NOT NULL,
	"max_pages" integer DEFAULT 50 NOT NULL,
	"max_depth" integer DEFAULT 2 NOT NULL,
	"quality_threshold" integer DEFAULT 20 NOT NULL,
	"total_urls" integer DEFAULT 0 NOT NULL,
	"processed_urls" integer DEFAULT 0 NOT NULL,
	"failed_urls" integer DEFAULT 0 NOT NULL,
	"discovered_urls" integer DEFAULT 0 NOT NULL,
	"current_step" text DEFAULT 'init' NOT NULL,
	"error_details" jsonb,
	"results" jsonb DEFAULT '[]',
	"final_markdown" text,
	"created_at" timestamp DEFAULT NOW() NOT NULL,
	"updated_at" timestamp DEFAULT NOW() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "job_urls_v3" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"processing_started_at" timestamp,
	"result" jsonb,
	"error_message" text,
	"discovered_from" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_urls_v3" ADD CONSTRAINT "job_urls_v3_job_id_crawl_jobs_v3_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crawl_jobs_v3"("id") ON DELETE cascade ON UPDATE no action;