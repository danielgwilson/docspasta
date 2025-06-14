-- Add user_id column to jobs table
ALTER TABLE jobs ADD COLUMN user_id TEXT;

-- Create index for user_id for better query performance
CREATE INDEX idx_jobs_user_id ON jobs(user_id);

-- Create composite index for user_id and status
CREATE INDEX idx_jobs_user_id_status ON jobs(user_id, status);

-- Update existing jobs to have a default anonymous user (optional)
-- UPDATE jobs SET user_id = 'anon-default' WHERE user_id IS NULL;