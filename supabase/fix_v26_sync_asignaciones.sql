-- fix_v26_sync_asignaciones.sql
-- Sincroniza el promotor_id de los préstamos con el del cliente asignado

-- 1. Ver desincronizaciones actuales
SELECT 
  cl.nombre as cliente,
  u_cli.nombre as asignado_a,
  u_pres.nombre as promotor_en_prestamo,
  p.estado,
  p.saldo_capital
FROM prestamos p
JOIN clientes cl ON cl.id = p.cliente_id
LEFT JOIN usuarios u_cli ON u_cli.id = cl.promotor_id
LEFT JOIN usuarios u_pres ON u_pres.id = p.promotor_id
WHERE cl.promotor_id != p.promotor_id
ORDER BY cl.nombre;

-- 2. (OPCIONAL) Sincronizar promotor_id del préstamo con el del cliente
-- Descomenta si quieres que el promotor_id del préstamo también se actualice
-- cuando reasignas un cliente:

-- UPDATE prestamos p
-- SET promotor_id = cl.promotor_id
-- FROM clientes cl
-- WHERE cl.id = p.cliente_id
--   AND cl.promotor_id != p.promotor_id
--   AND cl.promotor_id IS NOT NULL;

-- 3. Verificar asignaciones de clientes
SELECT 
  cl.nombre as cliente,
  cl.activo,
  u.nombre as asignado_a,
  u.rol,
  COUNT(p.id) as total_prestamos,
  SUM(CASE WHEN p.estado IN ('activo','mora') THEN p.saldo_capital ELSE 0 END) as saldo_activo
FROM clientes cl
LEFT JOIN usuarios u ON u.id = cl.promotor_id
LEFT JOIN prestamos p ON p.cliente_id = cl.id
WHERE cl.deleted_at IS NULL
GROUP BY cl.id, cl.nombre, cl.activo, u.nombre, u.rol
ORDER BY u.nombre, cl.nombre;
