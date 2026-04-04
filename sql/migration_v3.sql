-- ============================================================
-- MIGRATION V3 — Schema completo para claims con puntos disponibles
-- EJECUTAR EN ORDEN: 1) este archivo, 2) seed_v3.sql
-- ============================================================

-- 1. Agregar columna available_points y total_score a players
ALTER TABLE players ADD COLUMN IF NOT EXISTS total_score   NUMERIC(10,4) DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS available_pts NUMERIC(10,4) DEFAULT 0;

-- 2. Tabla claims actualizada (con resta de puntos)
DROP TABLE IF EXISTS claims CASCADE;
CREATE TABLE claims (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID REFERENCES players(id) ON DELETE CASCADE,
  claimed_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  pts_used    NUMERIC(6,4) DEFAULT 5,   -- cada claim consume 5 pts
  notes       TEXT,
  approved    BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims_public_read"  ON claims FOR SELECT USING (TRUE);
CREATE POLICY "claims_admin_write"  ON claims FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_profiles));
CREATE POLICY "claims_admin_update" ON claims FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM admin_profiles));

-- 3. Vista pública — usa available_pts y cuenta claims
DROP VIEW IF EXISTS public_leaderboard;
CREATE OR REPLACE VIEW public_leaderboard AS
SELECT
  p.id, p.name, p.owner, p.chars, p.class,
  p.total_score                             AS total_points,
  p.available_pts                           AS available_points,
  COALESCE(SUM(CASE WHEN ms.maze_type='BD' THEN pp.points ELSE 0 END),0) AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type='FV' THEN pp.points ELSE 0 END),0) AS fv_points,
  COUNT(DISTINCT c.id)                      AS total_claims
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
LEFT JOIN claims c ON c.player_id = p.id AND c.approved = TRUE
WHERE p.is_active = TRUE AND p.name NOT IN ('Administrador','Guild EVENTS')
GROUP BY p.id, p.name, p.owner, p.chars, p.class, p.total_score, p.available_pts
ORDER BY p.available_pts DESC;

-- 4. Vista admin — incluye admin_points
DROP VIEW IF EXISTS admin_leaderboard;
CREATE OR REPLACE VIEW admin_leaderboard AS
SELECT
  p.id, p.name, p.owner, p.chars, p.class,
  p.total_score                             AS total_points,
  p.available_pts                           AS available_points,
  COALESCE(SUM(CASE WHEN ms.maze_type='BD' THEN pp.points ELSE 0 END),0) AS bd_points,
  COALESCE(SUM(CASE WHEN ms.maze_type='FV' THEN pp.points ELSE 0 END),0) AS fv_points,
  COALESCE(SUM(ms.admin_points),0)          AS admin_points_total,
  COUNT(DISTINCT c.id)                      AS total_claims
FROM players p
LEFT JOIN player_points pp ON pp.player_id = p.id
LEFT JOIN maze_sessions ms ON ms.id = pp.session_id
LEFT JOIN claims c ON c.player_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.owner, p.chars, p.class, p.total_score, p.available_pts
ORDER BY p.available_pts DESC;

-- 5. Función para procesar un claim: resta 5pts de available_pts
CREATE OR REPLACE FUNCTION process_claim(p_player_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_avail NUMERIC;
  v_claim_id UUID;
BEGIN
  SELECT available_pts INTO v_avail FROM players WHERE id = p_player_id;
  IF v_avail < 5 THEN
    RAISE EXCEPTION 'Puntos insuficientes: disponible=%, necesita=5', v_avail;
  END IF;
  -- Restar puntos
  UPDATE players SET available_pts = available_pts - 5 WHERE id = p_player_id;
  -- Insertar claim
  INSERT INTO claims (player_id, pts_used, notes, approved)
  VALUES (p_player_id, 5, p_notes, FALSE)
  RETURNING id INTO v_claim_id;
  RETURN v_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. SuperAdmin
INSERT INTO admin_profiles (id, username, role)
VALUES ('51bde731-3f76-43fa-87c4-5002c0442b30','jcwhite','superadmin')
ON CONFLICT (id) DO UPDATE SET role='superadmin', username='jcwhite';

SELECT 'Migration V3 completada' AS resultado;
