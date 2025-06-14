-- Pages table for storing crawled content
CREATE TABLE IF NOT EXISTS pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT 'default-user',
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    quality_score INTEGER,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Index for efficient lookups
    CONSTRAINT uq_job_url UNIQUE(job_id, url)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pages_job ON pages (job_id);
CREATE INDEX IF NOT EXISTS idx_pages_user_job ON pages (user_id, job_id);