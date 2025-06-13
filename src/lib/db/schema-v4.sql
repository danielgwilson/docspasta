-- Jobs table - basic job tracking
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- URL cache - content reuse across jobs  
CREATE TABLE url_cache (
    url_hash CHAR(64) PRIMARY KEY, -- SHA256 of normalized URL
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    links JSONB, -- Array of discovered links
    quality_score INTEGER,
    word_count INTEGER,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Simple deduplication
    UNIQUE(url_hash)
);

-- Job queue - URLs to process for each job
CREATE TABLE job_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    url_hash CHAR(64) NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, completed, failed
    depth INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication per job
    CONSTRAINT uq_job_url UNIQUE(job_id, url_hash)
);

-- SSE events - for resumable streams (keep existing)
CREATE TABLE sse_events (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_job_queue_pending ON job_queue (job_id, status) WHERE status = 'pending';
CREATE INDEX idx_job_queue_job ON job_queue (job_id);
CREATE INDEX idx_url_cache_lookup ON url_cache (url_hash);
CREATE INDEX idx_sse_events_job ON sse_events (job_id, created_at);
CREATE INDEX idx_jobs_status ON jobs (status) WHERE status = 'running';