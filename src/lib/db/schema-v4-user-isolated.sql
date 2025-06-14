-- V4 Schema with User Isolation
-- All tables include user_id for proper multi-tenant isolation

-- Jobs table - basic job tracking with user isolation
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- User identifier for isolation
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed, timeout
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    final_markdown TEXT,
    error_message TEXT,
    
    -- Simple metrics
    pages_found INTEGER DEFAULT 0,
    pages_processed INTEGER DEFAULT 0,
    total_words INTEGER DEFAULT 0
);

-- URL cache - content reuse across jobs within same user context
CREATE TABLE url_cache (
    url_hash CHAR(64) PRIMARY KEY, -- SHA256 of normalized URL
    user_id TEXT NOT NULL, -- User identifier for isolation
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    links JSONB, -- Array of discovered links
    quality_score INTEGER,
    word_count INTEGER,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique per user and URL
    UNIQUE(user_id, url_hash)
);

-- Job queue - URLs to process for each job
CREATE TABLE job_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Denormalized for query performance
    url_hash CHAR(64) NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, completed, failed
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication per job
    CONSTRAINT uq_job_url UNIQUE(job_id, url_hash)
);

-- SSE events - for resumable streams with user isolation
CREATE TABLE sse_events (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Denormalized for query performance
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance with user isolation
CREATE INDEX idx_jobs_user ON jobs (user_id, created_at DESC);
CREATE INDEX idx_jobs_user_status ON jobs (user_id, status) WHERE status = 'running';
CREATE INDEX idx_job_queue_user_pending ON job_queue (user_id, job_id, status) WHERE status = 'pending';
CREATE INDEX idx_job_queue_job ON job_queue (job_id);
CREATE INDEX idx_url_cache_user_lookup ON url_cache (user_id, url_hash);
CREATE INDEX idx_sse_events_user_job ON sse_events (user_id, job_id, created_at);

-- Function to ensure user isolation in queries
CREATE OR REPLACE FUNCTION check_user_access(query_user_id TEXT, resource_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN query_user_id = resource_user_id;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Row Level Security (RLS) policies
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sse_events ENABLE ROW LEVEL SECURITY;

-- Note: In production, you would create actual RLS policies
-- For now, we'll handle isolation in the application layer