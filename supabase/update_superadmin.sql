-- ══════════════════════════════════════════════
-- Actualizar username y contraseña del SuperAdmin
-- Ejecutar en: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════

-- 1. Cambiar username en la tabla usuarios
UPDATE usuarios
SET username = 'Jcwhite'
WHERE id = 'd75fc5b5-1f79-46b7-aaa0-1a1d8f8380b7';

-- 2. Cambiar contraseña en Supabase Auth
-- (Ejecutar como función admin)
SELECT auth.update_user(
  'd75fc5b5-1f79-46b7-aaa0-1a1d8f8380b7',
  '{"password": "jj2025"}'::jsonb
);
