-- ============================================================
-- MIGRATION V2 — Claims + Vistas actualizadas
-- Pega y ejecuta en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. Tabla de Claims
CREATE TABLE IF NOT EXISTS claims (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID REFERENCES players(id) ON DELETE CASCADE,
  claimed_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  approved    BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_public_read"  ON claims;
DROP POLICY IF EXISTS "claims_admin_write"  ON claims;
DROP POLICY IF EXISTS "claims_admin_update" ON claims;

CREATE POLICY "claims_public_read"  ON claims FOR SELECT USING (TRUE);
CREATE POLICY "claims_admin_write"  ON claims FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles));
CREATE POLICY "claims_admin_update" ON claims FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM admin_profiles));

-- 2. Actualizar vistas con claims
DROP VIEW IF EXISTS public_leaderboard;
CREATE OR REPLACE VIEW public_leaderboard AS
SELECT
  p.id, p.name, p.class,
  COALESCE(SUM(pp.points), 0)                                                    AS total_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'BD' THEN pp.points ELSE 0 END), 0)     AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'FV' THEN pp.points ELSE 0 END), 0)     AS fv_points,
  COUNT(DISTINCT c.id)                                                            AS total_claims
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
LEFT JOIN claims c ON c.player_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.class
ORDER BY total_points DESC;

DROP VIEW IF EXISTS admin_leaderboard;
CREATE OR REPLACE VIEW admin_leaderboard AS
SELECT
  p.id, p.name, p.class,
  COALESCE(SUM(pp.points), 0)                                                    AS total_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'BD' THEN pp.points ELSE 0 END), 0)     AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type = 'FV' THEN pp.points ELSE 0 END), 0)     AS fv_points,
  COALESCE(SUM(ms.admin_points), 0)                                              AS admin_points_total,
  COUNT(DISTINCT c.id)                                                            AS total_claims
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
LEFT JOIN claims c ON c.player_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.class
ORDER BY total_points DESC;

-- 3. Columna chars en players (personajes del dueño)
ALTER TABLE players ADD COLUMN IF NOT EXISTS chars TEXT; -- lista de PJs separada por comas
ALTER TABLE players ADD COLUMN IF NOT EXISTS owner TEXT; -- nombre real del dueño

-- 4. SuperAdmin jcwhite
INSERT INTO admin_profiles (id, username, role)
VALUES (
  '51bde731-3f76-43fa-87c4-5002c0442b30',
  'jcwhite',
  'superadmin'
)
ON CONFLICT (id) DO UPDATE SET role = 'superadmin', username = 'jcwhite';
