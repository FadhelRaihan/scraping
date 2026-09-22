ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS config_snapshot jsonb;
CREATE TABLE IF NOT EXISTS scrape_job_queries (
 job_id bigint NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
 query text NOT NULL, city text NOT NULL, keyword text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','incomplete','failed','blocked')),
 started_at timestamptz NOT NULL, finished_at timestamptz,
 scroll_count integer NOT NULL DEFAULT 0, result_count integer NOT NULL DEFAULT 0,
 reached_end boolean NOT NULL DEFAULT false, error_code text,
 PRIMARY KEY(job_id,query)
);
CREATE TABLE IF NOT EXISTS scrape_job_places (
 job_id bigint NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
 place_key text NOT NULL, queries jsonb NOT NULL DEFAULT '[]',
 discovered_at timestamptz, processed_at timestamptz,
 result_status text NOT NULL, error_code text, snapshot jsonb,
 PRIMARY KEY(job_id,place_key)
);
CREATE INDEX IF NOT EXISTS scrape_history_place_idx ON scrape_job_places(place_key,job_id);
