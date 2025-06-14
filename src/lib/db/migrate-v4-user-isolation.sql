-- Migration script to add user isolation to V4 schema
-- This adds user_id columns and updates indexes for multi-tenant support

-- First check if tables exist
DO $$ 
BEGIN
    -- Add user_id to jobs table if it exists and doesn't have the column
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'jobs') 
       AND NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'user_id') THEN
        ALTER TABLE jobs ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default-user';
    END IF;

    -- Add user_id to url_cache table if it exists and doesn't have the column
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'url_cache')
       AND NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'url_cache' AND column_name = 'user_id') THEN
        ALTER TABLE url_cache ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default-user';
    END IF;

    -- Add user_id to job_queue table if it exists and doesn't have the column  
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'job_queue')
       AND NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'job_queue' AND column_name = 'user_id') THEN
        ALTER TABLE job_queue ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default-user';
    END IF;

    -- Add user_id to sse_events table if it exists and doesn't have the column
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sse_events')
       AND NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'sse_events' AND column_name = 'user_id') THEN
        ALTER TABLE sse_events ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default-user';
    END IF;
END $$;

-- Drop and recreate constraints only if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'url_cache') THEN
        -- Drop existing unique constraint on url_cache if it exists
        ALTER TABLE url_cache DROP CONSTRAINT IF EXISTS url_cache_url_hash_key;
        
        -- Add new unique constraint that includes user_id (only if user_id column exists)
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'url_cache' AND column_name = 'user_id') THEN
            ALTER TABLE url_cache ADD CONSTRAINT url_cache_user_url_unique UNIQUE(user_id, url_hash);
        END IF;
    END IF;
END $$;

-- Create indexes only if tables and columns exist
DO $$
BEGIN
    -- Jobs indexes
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs (user_id, status) WHERE status = 'running';
    END IF;
    
    -- Job queue indexes
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'job_queue' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_job_queue_user_pending ON job_queue (user_id, job_id, status) WHERE status = 'pending';
    END IF;
    
    -- URL cache indexes
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'url_cache' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_url_cache_user_lookup ON url_cache (user_id, url_hash);
    END IF;
    
    -- SSE events indexes
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'sse_events' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_sse_events_user_job ON sse_events (user_id, job_id, created_at);
    END IF;
END $$;

-- Remove the default value after migration (optional - run manually after ensuring all rows have proper user_id)
-- ALTER TABLE jobs ALTER COLUMN user_id DROP DEFAULT;
-- ALTER TABLE url_cache ALTER COLUMN user_id DROP DEFAULT;
-- ALTER TABLE job_queue ALTER COLUMN user_id DROP DEFAULT;
-- ALTER TABLE sse_events ALTER COLUMN user_id DROP DEFAULT;