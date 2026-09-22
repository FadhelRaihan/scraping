CREATE TABLE IF NOT EXISTS message_templates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL, body text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;
CREATE TABLE IF NOT EXISTS lead_contacts (
 id uuid PRIMARY KEY, lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 template_id bigint REFERENCES message_templates(id) ON DELETE SET NULL,
 template_name_snapshot text NOT NULL,phone_snapshot text NOT NULL,message_snapshot text NOT NULL,
 contacted_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS lead_contacts_lead_idx ON lead_contacts(lead_id,contacted_at DESC);
