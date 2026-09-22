CREATE TABLE IF NOT EXISTS leads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_key text NOT NULL UNIQUE,
  nama text NOT NULL,
  alamat text NOT NULL,
  kota text NOT NULL DEFAULT '',
  rating numeric(2,1) CHECK (rating BETWEEN 0 AND 5),
  telepon text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  kategori text NOT NULL DEFAULT '',
  label_pencarian text NOT NULL DEFAULT '',
  url_maps text NOT NULL,
  ulasan_terbaru text NOT NULL,
  scraped_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','contacted','replied','meeting','proposal_sent','won','lost','do_not_contact'))
);
CREATE INDEX IF NOT EXISTS leads_scraped_idx ON leads(scraped_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS leads_city_idx ON leads(kota);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS leads_quality_idx ON leads USING gin(quality);
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_idx ON leads ((quality->>'google_maps_place_id')) WHERE quality->>'google_maps_place_id' IS NOT NULL;
CREATE TABLE IF NOT EXISTS lead_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_lead_idx ON lead_notes(lead_id, created_at DESC);
CREATE TABLE IF NOT EXISTS lead_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_lead_idx ON lead_status_history(lead_id, created_at DESC);
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','stopping','completed','stopped','failed')),
  pid integer, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  last_heartbeat timestamptz NOT NULL DEFAULT now(), requested_hours numeric NOT NULL DEFAULT 4.5,
  stop_reason text, progress jsonb NOT NULL DEFAULT '{}', logs jsonb NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_scrape ON scrape_jobs ((true)) WHERE status IN ('queued','running','stopping');
