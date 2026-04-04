-- ============================================================
-- THE ORIGINALS GUILD MANAGEMENT — Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PLAYERS ────────────────────────────────────────────────
CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,          -- PJ name (in-game)
  class       TEXT,                          -- optional: warrior, mage, etc.
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RUNES (per player) ─────────────────────────────────────
CREATE TABLE runes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID REFERENCES players(id) ON DELETE CASCADE,
  curse         INT DEFAULT 0,
  illusory      INT DEFAULT 0,
  piercing      INT DEFAULT 0,
  riven_soul    INT DEFAULT 0,
  favor         INT DEFAULT 0,
  prayer        INT DEFAULT 0,
  scroll_ring   INT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- ─── MAZE SESSIONS ──────────────────────────────────────────
CREATE TABLE maze_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maze_type       TEXT NOT NULL CHECK (maze_type IN ('BD', 'FV')),  -- Black Dragon / Frozen Ville
  total_points    INT NOT NULL DEFAULT 5,      -- BD always 5 pts per maze
  admin_points    NUMERIC(6,2) DEFAULT 0,      -- hidden from public
  event_points    NUMERIC(6,2) DEFAULT 0,
  participant_pts NUMERIC(6,2) DEFAULT 0,      -- auto-calculated
  session_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  raw_report      TEXT,                        -- OCR / pasted text
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PLAYER POINTS (per session) ────────────────────────────
CREATE TABLE player_points (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id    UUID REFERENCES players(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES maze_sessions(id) ON DELETE CASCADE,
  points       NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, session_id)
);

-- ─── GUILD EVENTS ───────────────────────────────────────────
CREATE TABLE guild_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  description  TEXT,
  points       NUMERIC(6,2) NOT NULL DEFAULT 0,
  event_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── POINT ALERTS (unmatched OCR names) ─────────────────────
CREATE TABLE point_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_name        TEXT NOT NULL,              -- name from OCR
  suggested_name  TEXT,                       -- fuzzy match suggestion
  session_id      UUID REFERENCES maze_sessions(id),
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ADMIN PROFILES ─────────────────────────────────────────
CREATE TABLE admin_profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id),
  username  TEXT NOT NULL UNIQUE,
  role      TEXT NOT NULL CHECK (role IN ('superadmin', 'manager')),
  player_id UUID REFERENCES players(id),       -- optional link to their PJ
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Public leaderboard: total BD + FV points per player (NO admin_points)
CREATE OR REPLACE VIEW public_leaderboard AS
SELECT
  p.id,
  p.name,
  p.class,
  COALESCE(SUM(pp.points), 0) AS total_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'BD' THEN pp.points ELSE 0 END), 0) AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'FV' THEN pp.points ELSE 0 END), 0) AS fv_points
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.class
ORDER BY total_points DESC;

-- Admin view: includes admin_points
CREATE OR REPLACE VIEW admin_leaderboard AS
SELECT
  p.id,
  p.name,
  p.class,
  COALESCE(SUM(pp.points), 0) AS total_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'BD' THEN pp.points ELSE 0 END), 0) AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'FV' THEN pp.points ELSE 0 END), 0) AS fv_points,
  COALESCE(SUM(ms.admin_points), 0) AS admin_points_total
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.class
ORDER BY total_points DESC;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE runes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE maze_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_points     ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles    ENABLE ROW LEVEL SECURITY;

-- Players: public read
CREATE POLICY "players_public_read" ON players FOR SELECT USING (TRUE);

-- Runes: public read
CREATE POLICY "runes_public_read" ON runes FOR SELECT USING (TRUE);

-- Maze sessions: public can read (but NOT admin_points col — handled via view)
CREATE POLICY "sessions_public_read" ON maze_sessions FOR SELECT USING (TRUE);
CREATE POLICY "sessions_admin_write" ON maze_sessions FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles));
CREATE POLICY "sessions_admin_update" ON maze_sessions FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM admin_profiles));

-- Player points: public read
CREATE POLICY "points_public_read" ON player_points FOR SELECT USING (TRUE);
CREATE POLICY "points_admin_write" ON player_points FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles));

-- Guild events: public read
CREATE POLICY "events_public_read" ON guild_events FOR SELECT USING (TRUE);
CREATE POLICY "events_admin_write" ON guild_events FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles));

-- Alerts: admin only
CREATE POLICY "alerts_admin_all" ON point_alerts FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_profiles));

-- Admin profiles: only self or superadmin
CREATE POLICY "adminprofiles_self" ON admin_profiles FOR SELECT
  USING (id = auth.uid() OR auth.uid() IN (SELECT id FROM admin_profiles WHERE role = 'superadmin'));
CREATE POLICY "adminprofiles_superadmin_write" ON admin_profiles FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles WHERE role = 'superadmin'));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-calculate participant_pts when session is inserted/updated
CREATE OR REPLACE FUNCTION calc_participant_points()
RETURNS TRIGGER AS $$
BEGIN
  NEW.participant_pts := NEW.total_points - NEW.admin_points - NEW.event_points;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_pts
  BEFORE INSERT OR UPDATE ON maze_sessions
  FOR EACH ROW EXECUTE FUNCTION calc_participant_points();

-- Fuzzy match helper (requires pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION suggest_player_name(input_name TEXT)
RETURNS TABLE(name TEXT, similarity FLOAT) AS $$
  SELECT p.name, similarity(p.name, input_name) AS sim
  FROM players p
  WHERE similarity(p.name, input_name) > 0.3
  ORDER BY sim DESC
  LIMIT 3;
$$ LANGUAGE sql;

-- ============================================================
-- SEED DATA (example)
-- ============================================================

-- INSERT INTO players (name, class) VALUES
--   ('Morgan', 'Swordsman'),
--   ('DragonSlayer', 'Hunter'),
--   ('IceMage', 'Mage');
