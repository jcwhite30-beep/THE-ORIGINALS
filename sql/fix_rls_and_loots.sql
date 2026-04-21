-- ============================================================
-- EJECUTA EN SUPABASE SQL EDITOR — proyecto THE ORIGINALS
-- 1. Corrige recursión infinita en admin_profiles
-- 2. Sistema de tracking de loots
-- ============================================================

-- ── 1. FIX CRÍTICO: Recursión en admin_profiles ──────────────
ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_profiles_policy"  ON admin_profiles;
DROP POLICY IF EXISTS "allow_all"              ON admin_profiles;
DROP POLICY IF EXISTS "all_access"             ON admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_open"    ON admin_profiles;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_profiles_open" ON admin_profiles
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Columnas para tracking de loots en players ────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS total_loots       INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS loots_pendientes  INTEGER DEFAULT 0;

-- ── 3. bank_snapshot — asegura que tiene columna loots_claims ─
-- loots_banco   = loots físicamente en el banco del guild
-- loots_fuera   = loots que salieron del banco (en manos de jugadores como pago por participar)
--                 SOLO cambia cuando: +reporte (sale loot) / +looter entrega al banco (vuelve)
-- loots_claims  = loots disponibles para que jugadores hagan claim
--                 BAJA cuando alguien hace claim (-1 por claim)
ALTER TABLE bank_snapshot ADD COLUMN IF NOT EXISTS loots_claims INTEGER DEFAULT 0;

-- Asegurar que existe al menos una fila
INSERT INTO bank_snapshot (loots_banco, loots_fuera, loots_claims)
SELECT 46, 77, 0 WHERE NOT EXISTS (SELECT 1 FROM bank_snapshot LIMIT 1);

-- RLS
ALTER TABLE bank_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_open" ON bank_snapshot;
CREATE POLICY "bank_open" ON bank_snapshot FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Tabla loot_events — historial ─────────────────────────
CREATE TABLE IF NOT EXISTS loot_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type  TEXT NOT NULL CHECK (event_type IN ('reporte','claim','entrega_banco')),
  maze_type   TEXT CHECK (maze_type IN ('BD','FV')),
  player_id   UUID REFERENCES players(id),
  session_id  UUID REFERENCES maze_sessions(id),
  qty         INTEGER NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE loot_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loot_events_open" ON loot_events;
CREATE POLICY "loot_events_open" ON loot_events FOR ALL USING (true) WITH CHECK (true);

-- ── 5. Trigger: actualiza puntos al insertar en player_points ─
CREATE OR REPLACE FUNCTION update_player_totals_on_points()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE players
  SET total_score   = total_score   + NEW.points,
      available_pts = available_pts + NEW.points
  WHERE id = NEW.player_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_player_totals ON player_points;
CREATE TRIGGER trg_update_player_totals
  AFTER INSERT ON player_points
  FOR EACH ROW EXECUTE FUNCTION update_player_totals_on_points();

-- ── 6. Columnas faltantes en maze_sessions / maze_attendance ──
ALTER TABLE maze_sessions   ADD COLUMN IF NOT EXISTS session_time TEXT;
ALTER TABLE maze_sessions   ADD COLUMN IF NOT EXISTS looter       TEXT;
ALTER TABLE maze_attendance ADD COLUMN IF NOT EXISTS is_looter    BOOLEAN DEFAULT FALSE;

SELECT 'fix_rls_and_loots aplicado ✓' AS resultado;
