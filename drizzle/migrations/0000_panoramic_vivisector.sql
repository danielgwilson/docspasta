CREATE TABLE "crawl_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT NOW() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT NOW() NOT NULL,
	"total_discovered" integer DEFAULT 0 NOT NULL,
	"total_queued" integer DEFAULT 0 NOT NULL,
	"total_processed" integer DEFAULT 0 NOT NULL,
	"total_filtered" integer DEFAULT 0 NOT NULL,
	"total_skipped" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"progress" jsonb DEFAULT '{}' NOT NULL,
	"results" jsonb DEFAULT '[]' NOT NULL,
	"markdown" text,
	"error_message" text,
	"discovery_complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sse_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"crawl_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT NOW() NOT NULL,
	CONSTRAINT "sse_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "sse_events" ADD CONSTRAINT "sse_events_crawl_id_crawl_jobs_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawl_jobs"("id") ON DELETE cascade ON UPDATE no action;