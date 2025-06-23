DROP INDEX "crawled_pages_job_url_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "crawled_pages_job_url_unique" ON "crawled_pages" USING btree ("job_id","url_hash");