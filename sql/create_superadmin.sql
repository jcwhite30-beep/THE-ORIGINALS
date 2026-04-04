-- ============================================================
-- CREAR SUPERADMIN: jcwhite / jj2025
-- ============================================================
-- PASO 1: Ejecuta esto en Supabase → Authentication → Users → Add user
--   Email: jcwhite@gmail.com  (o el email que prefieras)
--   Password: jj2025
--   Auto confirm: ON
--
-- PASO 2: Copia el UUID del usuario creado y pégalo abajo:

INSERT INTO admin_profiles (id, username, role)
VALUES (
  'PEGA-AQUI-EL-UUID-DEL-USUARIO',  -- reemplaza con el UUID real
  'jcwhite',
  'superadmin'
)
ON CONFLICT (id) DO UPDATE SET role = 'superadmin', username = 'jcwhite';

-- ============================================================
-- VERIFICAR que quedó bien:
SELECT ap.username, ap.role, au.email
FROM admin_profiles ap
JOIN auth.users au ON au.id = ap.id
ORDER BY ap.created_at;
