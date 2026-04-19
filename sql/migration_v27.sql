-- ============================================================
-- EJECUTA en Supabase SQL Editor — proyecto THE ORIGINALS
-- Agrega columnas faltantes para la v27
-- ============================================================

-- Hora de la sesión (BD lair 15/03/2026 21:00 → "21:00")
ALTER TABLE maze_sessions ADD COLUMN IF NOT EXISTS session_time TEXT;

-- Quien agarró el loot en la sesión
ALTER TABLE maze_sessions ADD COLUMN IF NOT EXISTS looter TEXT;

-- Si el jugador fue el looter en esta asistencia
ALTER TABLE maze_attendance ADD COLUMN IF NOT EXISTS is_looter BOOLEAN DEFAULT FALSE;

SELECT 'Columnas agregadas OK' AS resultado;
