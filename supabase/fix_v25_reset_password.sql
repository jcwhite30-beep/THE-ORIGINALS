-- fix_v25_reset_password.sql
-- Ejecutar en Supabase → SQL Editor

-- 1. Asegurar extensión pgcrypto activa
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Crear/reemplazar función RPC de reset (fallback del API)
CREATE OR REPLACE FUNCTION reset_password_direct(p_user_id UUID, p_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
BEGIN
  UPDATE auth.users
  SET 
    encrypted_password = crypt(p_password, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_user_id;
  END IF;
END;
$$;

-- 3. Permisos
GRANT EXECUTE ON FUNCTION reset_password_direct(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reset_password_direct(UUID, TEXT) TO authenticated;

-- 4. Si también existe la función vieja, darle permisos también
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reset_user_password'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION reset_user_password(UUID, TEXT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION reset_user_password(UUID, TEXT) TO authenticated';
  END IF;
END $$;

-- 5. Mostrar todos los usuarios con su email en auth
SELECT 
  u.username,
  u.nombre,
  u.rol,
  u.activo,
  a.email,
  a.id as auth_id
FROM usuarios u
JOIN auth.users a ON a.id = u.id
ORDER BY u.rol, u.nombre;

-- ============================================================
-- RESET MANUAL DE EMERGENCIA (si el botón aún falla):
-- Reemplaza 'yvilla' con el username del usuario a cambiar
-- ============================================================
-- UPDATE auth.users 
-- SET encrypted_password = crypt('NuevaPass123', gen_salt('bf')), updated_at = NOW()
-- WHERE id = (SELECT id FROM usuarios WHERE username = 'yvilla');
