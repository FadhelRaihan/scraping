ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS leads_quality_idx ON leads USING gin(quality);
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_idx ON leads ((quality->>'google_maps_place_id')) WHERE quality->>'google_maps_place_id' IS NOT NULL;
