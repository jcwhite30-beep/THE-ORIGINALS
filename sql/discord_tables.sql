CREATE TABLE IF NOT EXISTS discord_processed_messages (
  message_id   TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  session_id   UUID REFERENCES maze_sessions(id),
  status       TEXT DEFAULT 'processed' CHECK (status IN ('processed','skipped','pending'))
);
ALTER TABLE discord_processed_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpm_all" ON discord_processed_messages;
CREATE POLICY "dpm_all" ON discord_processed_messages FOR ALL USING (TRUE);

CREATE TABLE IF NOT EXISTS discord_pending_reports (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id     TEXT NOT NULL UNIQUE,
  channel_name   TEXT NOT NULL,
  maze_type      TEXT CHECK (maze_type IN ('BD','FV')),
  session_date   DATE,
  author_name    TEXT,
  content        TEXT,
  image_url      TEXT,
  detected_names JSONB DEFAULT '[]',
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE discord_pending_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpr_all" ON discord_pending_reports;
CREATE POLICY "dpr_all" ON discord_pending_reports FOR ALL USING (TRUE);

SELECT 'Discord tables OK' AS resultado;
