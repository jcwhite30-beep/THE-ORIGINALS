-- ══════════════════════════════════════════════════════════════
-- APP — Administrador de Préstamos Personales
-- Schema inicial + RLS (Row Level Security)
-- Supabase PostgreSQL
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- EXTENSIONES
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
CREATE TYPE rol_usuario AS ENUM ('promotor', 'gerente', 'admin', 'superadmin');
CREATE TYPE estado_prestamo AS ENUM ('pendiente', 'aprobado', 'activo', 'cancelado', 'mora', 'pagado');
CREATE TYPE estado_pago AS ENUM ('por_conciliar', 'conciliado', 'rechazado');
CREATE TYPE tipo_movimiento AS ENUM ('inyeccion', 'retiro', 'capitalizacion_interes');
CREATE TYPE regla_feriado AS ENUM ('antes', 'despues');
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'yappy', 'ach', 'cheque');
CREATE TYPE estado_solicitud_pass AS ENUM ('pendiente', 'atendida');

-- ─────────────────────────────────────────────
-- TABLA: agencias
-- ─────────────────────────────────────────────
CREATE TABLE agencias (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT NOT NULL,
  logo_url      TEXT,
  metodos_pago  metodo_pago[] DEFAULT '{efectivo, transferencia}',
  activa        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: usuarios (extiende auth.users de Supabase)
-- ─────────────────────────────────────────────
CREATE TABLE usuarios (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agencia_id          UUID REFERENCES agencias(id),
  gerente_id          UUID REFERENCES usuarios(id),        -- Promotores asignados a un Gerente
  nombre              TEXT NOT NULL,
  username            TEXT UNIQUE NOT NULL,                -- @usuario
  rol                 rol_usuario NOT NULL DEFAULT 'promotor',
  activo              BOOLEAN DEFAULT TRUE,
  cambio_pass_req     BOOLEAN DEFAULT FALSE,               -- Flag clave temporal
  ultimo_acceso       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: solicitudes_recuperacion_pass
-- ─────────────────────────────────────────────
CREATE TABLE solicitudes_recuperacion_pass (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id),
  agencia_id    UUID NOT NULL REFERENCES agencias(id),
  estado        estado_solicitud_pass DEFAULT 'pendiente',
  atendida_por  UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  atendida_at   TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- TABLA: clientes
-- ─────────────────────────────────────────────
CREATE TABLE clientes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id        UUID NOT NULL REFERENCES agencias(id),
  promotor_id       UUID NOT NULL REFERENCES usuarios(id),
  nombre            TEXT NOT NULL,
  cedula            TEXT NOT NULL,
  telefono          TEXT,
  email             TEXT,
  direccion         TEXT,
  foto_cedula_url   TEXT,                                  -- Supabase Storage
  referido_feria    BOOLEAN DEFAULT FALSE,                 -- Control de Ferias
  activo            BOOLEAN DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,                           -- Soft Delete
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agencia_id, cedula)
);

-- ─────────────────────────────────────────────
-- TABLA: fondeadores
-- ─────────────────────────────────────────────
CREATE TABLE fondeadores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id      UUID NOT NULL REFERENCES agencias(id),
  nombre          TEXT NOT NULL,
  tasa_anual      NUMERIC(5,2) NOT NULL,                  -- % anual pactado
  capital_actual  NUMERIC(14,2) NOT NULL DEFAULT 0,
  activo          BOOLEAN DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: movimientos_fondeador
-- ─────────────────────────────────────────────
CREATE TABLE movimientos_fondeador (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fondeador_id    UUID NOT NULL REFERENCES fondeadores(id),
  agencia_id      UUID NOT NULL REFERENCES agencias(id),
  tipo            tipo_movimiento NOT NULL,
  monto           NUMERIC(14,2) NOT NULL,
  descripcion     TEXT,
  registrado_por  UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: prestamos
-- ─────────────────────────────────────────────
CREATE TABLE prestamos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id          UUID NOT NULL REFERENCES agencias(id),
  cliente_id          UUID NOT NULL REFERENCES clientes(id),
  promotor_id         UUID NOT NULL REFERENCES usuarios(id),
  gerente_id          UUID REFERENCES usuarios(id),
  admin_id            UUID REFERENCES usuarios(id),
  monto_original      NUMERIC(14,2) NOT NULL,
  saldo_capital       NUMERIC(14,2) NOT NULL,              -- Saldo insoluto actual
  tasa_interes        NUMERIC(5,2) NOT NULL,               -- % sobre saldo capital
  periodicidad_dias   INT NOT NULL DEFAULT 30,             -- Cada cuántos días se cobra
  fecha_desembolso    DATE,
  fecha_primer_corte  DATE,
  estado              estado_prestamo DEFAULT 'pendiente',
  comprobante_url     TEXT,                                -- Storage: comprobante desembolso
  notas               TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: pagos (Caja / Abonos)
-- ─────────────────────────────────────────────
CREATE TABLE pagos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prestamo_id       UUID NOT NULL REFERENCES prestamos(id),
  agencia_id        UUID NOT NULL REFERENCES agencias(id),
  promotor_id       UUID NOT NULL REFERENCES usuarios(id),
  conciliado_por    UUID REFERENCES usuarios(id),
  monto_total       NUMERIC(14,2) NOT NULL,
  -- Jerarquía de abono: Mora → Intereses → Capital
  monto_mora        NUMERIC(14,2) DEFAULT 0,
  monto_interes     NUMERIC(14,2) DEFAULT 0,
  monto_capital     NUMERIC(14,2) DEFAULT 0,
  estado            estado_pago DEFAULT 'por_conciliar',
  metodo_pago       metodo_pago DEFAULT 'efectivo',
  comprobante_url   TEXT,                                  -- Storage: foto recibo
  fecha_pago        DATE NOT NULL DEFAULT CURRENT_DATE,
  conciliado_at     TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: cortes (Calendario de cobros generado)
-- ─────────────────────────────────────────────
CREATE TABLE cortes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prestamo_id     UUID NOT NULL REFERENCES prestamos(id),
  agencia_id      UUID NOT NULL REFERENCES agencias(id),
  fecha_original  DATE NOT NULL,
  fecha_ajustada  DATE NOT NULL,                           -- Puede diferir por feriados
  monto_interes   NUMERIC(14,2) NOT NULL,
  pagado          BOOLEAN DEFAULT FALSE,
  pago_id         UUID REFERENCES pagos(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: feriados
-- ─────────────────────────────────────────────
CREATE TABLE feriados (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id    UUID NOT NULL REFERENCES agencias(id),
  fecha         DATE NOT NULL,
  descripcion   TEXT NOT NULL,
  regla         regla_feriado NOT NULL DEFAULT 'antes',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agencia_id, fecha)
);

-- ─────────────────────────────────────────────
-- TABLA: plantillas_whatsapp
-- ─────────────────────────────────────────────
CREATE TABLE plantillas_whatsapp (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id    UUID NOT NULL REFERENCES agencias(id),
  nombre        TEXT NOT NULL,
  mensaje       TEXT NOT NULL,                             -- Con {{variables}}
  disparador    TEXT,                                      -- 'aprobacion','conciliacion','mora','manual'
  activa        BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: logs_auditoria (INMUTABLE — sin UPDATE/DELETE)
-- ─────────────────────────────────────────────
CREATE TABLE logs_auditoria (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agencia_id    UUID REFERENCES agencias(id),
  usuario_id    UUID REFERENCES usuarios(id),
  username      TEXT,
  rol           rol_usuario,
  accion        TEXT NOT NULL,                             -- 'DESEMBOLSO','APROBACION','LOGIN', etc.
  tabla         TEXT,
  registro_id   UUID,
  detalle       JSONB,                                     -- { antes: {}, despues: {} }
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Hacer la tabla de auditoría de solo inserción para todos
ALTER TABLE logs_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo insertar auditoria" ON logs_auditoria FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Solo superadmin lee auditoria" ON logs_auditoria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.rol = 'superadmin'
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE agencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fondeadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_fondeador ENABLE ROW LEVEL SECURITY;
ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_recuperacion_pass ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- FUNCIÓN HELPER: obtener rol del usuario actual
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_rol()
RETURNS rol_usuario AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_agencia_id()
RETURNS UUID AS $$
  SELECT agencia_id FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_gerente_id()
RETURNS UUID AS $$
  SELECT gerente_id FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────
-- RLS: AGENCIAS
-- SuperAdmin ve todas; Admin solo la suya
-- ─────────────────────────────────────────────
CREATE POLICY "agencias_select" ON agencias FOR SELECT USING (
  get_rol() = 'superadmin' OR id = get_agencia_id()
);
CREATE POLICY "agencias_insert" ON agencias FOR INSERT WITH CHECK (get_rol() = 'superadmin');
CREATE POLICY "agencias_update" ON agencias FOR UPDATE USING (
  get_rol() = 'superadmin' OR (get_rol() = 'admin' AND id = get_agencia_id())
);

-- ─────────────────────────────────────────────
-- RLS: USUARIOS
-- ─────────────────────────────────────────────
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT USING (
  get_rol() IN ('admin','superadmin')
  OR id = auth.uid()
  OR (get_rol() = 'gerente' AND gerente_id = auth.uid())
);
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT WITH CHECK (
  get_rol() IN ('admin','superadmin')
);
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE USING (
  get_rol() IN ('admin','superadmin') OR id = auth.uid()
);

-- ─────────────────────────────────────────────
-- RLS: CLIENTES
-- Promotor: solo los suyos | Gerente: equipo | Admin+: agencia | SuperAdmin: todos
-- ─────────────────────────────────────────────
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  deleted_at IS NULL AND (
    get_rol() = 'superadmin'
    OR (get_rol() = 'admin' AND agencia_id = get_agencia_id())
    OR (get_rol() = 'gerente' AND agencia_id = get_agencia_id()
        AND promotor_id IN (SELECT id FROM usuarios WHERE gerente_id = auth.uid()))
    OR (get_rol() = 'promotor' AND promotor_id = auth.uid())
  )
);
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (
  get_rol() IN ('promotor','admin','superadmin')
  AND agencia_id = get_agencia_id()
);
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  get_rol() IN ('admin','superadmin')
  OR (get_rol() = 'promotor' AND promotor_id = auth.uid())
);
CREATE POLICY "clientes_soft_delete" ON clientes FOR UPDATE USING (
  get_rol() IN ('admin','superadmin')
) WITH CHECK (deleted_at IS NOT NULL);

-- ─────────────────────────────────────────────
-- RLS: PRÉSTAMOS
-- ─────────────────────────────────────────────
CREATE POLICY "prestamos_select" ON prestamos FOR SELECT USING (
  deleted_at IS NULL AND (
    get_rol() = 'superadmin'
    OR (get_rol() = 'admin' AND agencia_id = get_agencia_id())
    OR (get_rol() = 'gerente' AND agencia_id = get_agencia_id()
        AND promotor_id IN (SELECT id FROM usuarios WHERE gerente_id = auth.uid()))
    OR (get_rol() = 'promotor' AND promotor_id = auth.uid())
  )
);
CREATE POLICY "prestamos_insert" ON prestamos FOR INSERT WITH CHECK (
  get_rol() = 'promotor' AND agencia_id = get_agencia_id()
);
-- Solo Admin/SuperAdmin pueden cambiar estado (aprobar, desembolsar)
CREATE POLICY "prestamos_update_admin" ON prestamos FOR UPDATE USING (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);
-- Gerente puede aprobar (cambiar estado a 'aprobado')
CREATE POLICY "prestamos_update_gerente" ON prestamos FOR UPDATE USING (
  get_rol() = 'gerente' AND agencia_id = get_agencia_id()
  AND promotor_id IN (SELECT id FROM usuarios WHERE gerente_id = auth.uid())
);

-- ─────────────────────────────────────────────
-- RLS: PAGOS
-- ─────────────────────────────────────────────
CREATE POLICY "pagos_select" ON pagos FOR SELECT USING (
  deleted_at IS NULL AND (
    get_rol() = 'superadmin'
    OR (get_rol() IN ('admin','gerente') AND agencia_id = get_agencia_id())
    OR (get_rol() = 'promotor' AND promotor_id = auth.uid())
  )
);
CREATE POLICY "pagos_insert" ON pagos FOR INSERT WITH CHECK (
  get_rol() IN ('promotor','admin','superadmin')
  AND agencia_id = get_agencia_id()
);
-- Solo Gerente/Admin/SuperAdmin pueden conciliar
CREATE POLICY "pagos_update_conciliar" ON pagos FOR UPDATE USING (
  get_rol() IN ('gerente','admin','superadmin')
  AND agencia_id = get_agencia_id()
);

-- ─────────────────────────────────────────────
-- RLS: FONDEADORES (Solo Admin/SuperAdmin)
-- ─────────────────────────────────────────────
CREATE POLICY "fondeadores_select" ON fondeadores FOR SELECT USING (
  get_rol() IN ('admin','superadmin')
  AND (get_rol() = 'superadmin' OR agencia_id = get_agencia_id())
);
CREATE POLICY "fondeadores_insert" ON fondeadores FOR INSERT WITH CHECK (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);
CREATE POLICY "fondeadores_update" ON fondeadores FOR UPDATE USING (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);
CREATE POLICY "movimientos_fondeador_all" ON movimientos_fondeador FOR ALL USING (
  get_rol() IN ('admin','superadmin')
);

-- ─────────────────────────────────────────────
-- RLS: FERIADOS (Solo Admin/SuperAdmin)
-- ─────────────────────────────────────────────
CREATE POLICY "feriados_select" ON feriados FOR SELECT USING (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);
CREATE POLICY "feriados_insert" ON feriados FOR INSERT WITH CHECK (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);
CREATE POLICY "feriados_update" ON feriados FOR UPDATE USING (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);

-- ─────────────────────────────────────────────
-- RLS: CORTES (Todos ven los suyos)
-- ─────────────────────────────────────────────
CREATE POLICY "cortes_select" ON cortes FOR SELECT USING (
  get_rol() = 'superadmin'
  OR (get_rol() IN ('admin','gerente') AND agencia_id = get_agencia_id())
  OR (get_rol() = 'promotor' AND prestamo_id IN (
      SELECT id FROM prestamos WHERE promotor_id = auth.uid()
    ))
);

-- ─────────────────────────────────────────────
-- RLS: PLANTILLAS WHATSAPP
-- ─────────────────────────────────────────────
CREATE POLICY "plantillas_select" ON plantillas_whatsapp FOR SELECT USING (
  agencia_id = get_agencia_id() OR get_rol() = 'superadmin'
);
CREATE POLICY "plantillas_insert" ON plantillas_whatsapp FOR INSERT WITH CHECK (
  get_rol() IN ('admin','superadmin')
);
CREATE POLICY "plantillas_update" ON plantillas_whatsapp FOR UPDATE USING (
  get_rol() IN ('admin','superadmin') AND agencia_id = get_agencia_id()
);

-- ─────────────────────────────────────────────
-- RLS: SOLICITUDES RECUPERACIÓN CONTRASEÑA
-- ─────────────────────────────────────────────
CREATE POLICY "passreset_insert" ON solicitudes_recuperacion_pass FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "passreset_select" ON solicitudes_recuperacion_pass FOR SELECT USING (
  get_rol() IN ('admin','superadmin')
);
CREATE POLICY "passreset_update" ON solicitudes_recuperacion_pass FOR UPDATE USING (
  get_rol() IN ('admin','superadmin')
);

-- ══════════════════════════════════════════════════════════════
-- TRIGGERS Y FUNCIONES DE NEGOCIO
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TRIGGER: Al conciliar un pago → actualizar saldo_capital del préstamo
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_conciliar_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'conciliado' AND OLD.estado = 'por_conciliar' THEN
    -- Reducir saldo capital del préstamo
    UPDATE prestamos
    SET
      saldo_capital = saldo_capital - NEW.monto_capital,
      estado = CASE
        WHEN (saldo_capital - NEW.monto_capital) <= 0 THEN 'pagado'
        ELSE estado
      END,
      updated_at = NOW()
    WHERE id = NEW.prestamo_id;

    -- Log de auditoría
    INSERT INTO logs_auditoria (usuario_id, username, rol, agencia_id, accion, tabla, registro_id, detalle)
    SELECT
      auth.uid(),
      u.username,
      u.rol,
      NEW.agencia_id,
      'CONCILIACION',
      'pagos',
      NEW.id,
      jsonb_build_object(
        'monto_total', NEW.monto_total,
        'monto_capital', NEW.monto_capital,
        'monto_interes', NEW.monto_interes,
        'monto_mora', NEW.monto_mora,
        'prestamo_id', NEW.prestamo_id
      )
    FROM usuarios u WHERE u.id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_conciliar_pago
  AFTER UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_conciliar_pago();

-- ─────────────────────────────────────────────
-- TRIGGER: Al insertar movimiento fondeador → actualizar capital_actual
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_actualizar_capital_fondeador()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE fondeadores SET
    capital_actual = CASE NEW.tipo
      WHEN 'inyeccion'             THEN capital_actual + NEW.monto
      WHEN 'retiro'                THEN capital_actual - NEW.monto
      WHEN 'capitalizacion_interes' THEN capital_actual + NEW.monto
    END,
    updated_at = NOW()
  WHERE id = NEW.fondeador_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_capital_fondeador
  AFTER INSERT ON movimientos_fondeador
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_capital_fondeador();

-- ─────────────────────────────────────────────
-- TRIGGER: Log automático en préstamos (desembolso, aprobación)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_prestamo()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO logs_auditoria (usuario_id, username, rol, agencia_id, accion, tabla, registro_id, detalle)
    SELECT
      auth.uid(), u.username, u.rol, NEW.agencia_id,
      CASE NEW.estado
        WHEN 'aprobado'  THEN 'APROBACION_PRESTAMO'
        WHEN 'activo'    THEN 'DESEMBOLSO'
        WHEN 'cancelado' THEN 'CANCELACION'
        WHEN 'pagado'    THEN 'PRESTAMO_PAGADO'
        ELSE 'CAMBIO_ESTADO'
      END,
      'prestamos', NEW.id,
      jsonb_build_object('estado_anterior', OLD.estado, 'estado_nuevo', NEW.estado, 'monto', NEW.monto_original)
    FROM usuarios u WHERE u.id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_log_prestamo
  AFTER UPDATE ON prestamos
  FOR EACH ROW EXECUTE FUNCTION fn_log_prestamo();

-- ─────────────────────────────────────────────
-- TRIGGER: Log de login (llamar desde cliente via RPC)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_log_login(p_ip TEXT, p_user_agent TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = auth.uid();
  INSERT INTO logs_auditoria (usuario_id, username, rol, agencia_id, accion, ip, user_agent)
  SELECT id, username, rol, agencia_id, 'LOGIN', p_ip::INET, p_user_agent
  FROM usuarios WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- FUNCIÓN: Calcular Fondo Disponible de una agencia
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_fondo_disponible(p_agencia_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_fondeadores NUMERIC;
  saldo_capital_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(capital_actual), 0)
  INTO total_fondeadores
  FROM fondeadores
  WHERE agencia_id = p_agencia_id AND activo = TRUE AND deleted_at IS NULL;

  SELECT COALESCE(SUM(saldo_capital), 0)
  INTO saldo_capital_total
  FROM prestamos
  WHERE agencia_id = p_agencia_id AND estado IN ('activo','mora');

  RETURN total_fondeadores - saldo_capital_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────
-- FUNCIÓN: Validar si hay fondos para desembolsar
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_validar_desembolso(p_agencia_id UUID, p_monto NUMERIC)
RETURNS JSONB AS $$
DECLARE
  disponible NUMERIC;
BEGIN
  disponible := fn_fondo_disponible(p_agencia_id);
  IF p_monto > disponible THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'mensaje', 'Fondos insuficientes para este desembolso',
      'disponible', disponible,
      'solicitado', p_monto,
      'faltante', p_monto - disponible
    );
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'disponible', disponible);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- FUNCIÓN: Generar cortes del mes ajustados por feriados
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_generar_cortes_mes(p_agencia_id UUID, p_mes DATE)
RETURNS VOID AS $$
DECLARE
  prestamo RECORD;
  fecha_corte DATE;
  fecha_ajustada DATE;
  interes NUMERIC;
BEGIN
  FOR prestamo IN
    SELECT p.id, p.saldo_capital, p.tasa_interes, p.periodicidad_dias,
           p.fecha_primer_corte
    FROM prestamos p
    WHERE p.agencia_id = p_agencia_id
      AND p.estado IN ('activo','mora')
      AND p.deleted_at IS NULL
  LOOP
    fecha_corte := prestamo.fecha_primer_corte;
    WHILE fecha_corte <= (p_mes + INTERVAL '1 month - 1 day')::DATE LOOP
      IF fecha_corte >= p_mes THEN
        -- Calcular interés: saldo_capital * tasa_diaria * dias
        interes := ROUND(
          prestamo.saldo_capital * (prestamo.tasa_interes / 100 / 365) * prestamo.periodicidad_dias,
          2
        );

        -- Ajustar por feriados
        fecha_ajustada := fecha_corte;
        IF EXISTS(SELECT 1 FROM feriados WHERE agencia_id = p_agencia_id AND fecha = fecha_corte) THEN
          SELECT
            CASE regla
              WHEN 'antes'   THEN fecha_corte - 1
              WHEN 'despues' THEN fecha_corte + 1
            END
          INTO fecha_ajustada
          FROM feriados WHERE agencia_id = p_agencia_id AND fecha = fecha_corte;
        END IF;

        INSERT INTO cortes (prestamo_id, agencia_id, fecha_original, fecha_ajustada, monto_interes)
        VALUES (prestamo.id, p_agencia_id, fecha_corte, fecha_ajustada, interes)
        ON CONFLICT DO NOTHING;
      END IF;

      fecha_corte := fecha_corte + prestamo.periodicidad_dias;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ══════════════════════════════════════════════════════════════
-- Ejecutar desde el Dashboard de Supabase o vía API:
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('documentos-clientes', 'documentos-clientes', false),
--   ('comprobantes-pagos',  'comprobantes-pagos',  false),
--   ('logos-agencias',      'logos-agencias',       true);

-- Política Storage: solo usuarios autenticados de la misma agencia
-- (configurar en Supabase Dashboard > Storage > Policies)

-- ══════════════════════════════════════════════════════════════
-- DATOS INICIALES (SEED)
-- ══════════════════════════════════════════════════════════════
INSERT INTO agencias (id, nombre, metodos_pago) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Panamá Central', '{efectivo,transferencia,yappy,ach}');

-- Plantillas WhatsApp por defecto
INSERT INTO plantillas_whatsapp (agencia_id, nombre, mensaje, disparador) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Bienvenida / Aprobación',
   'Hola {{cliente}}, tu préstamo por {{monto}} ha sido aprobado. Bienvenido a APP.',
   'aprobacion'),
  ('00000000-0000-0000-0000-000000000001',
   'Recordatorio de Cobro',
   'Estimado {{cliente}}, le recordamos que su pago de {{interes}} vence el día {{fecha_corte}}.',
   'recordatorio'),
  ('00000000-0000-0000-0000-000000000001',
   'Confirmación de Pago',
   'Gracias {{cliente}}, hemos recibido su abono de {{monto_abono}}. Su nuevo saldo es {{saldo_actual}}.',
   'conciliacion'),
  ('00000000-0000-0000-0000-000000000001',
   'Alerta de Mora',
   'Atención {{cliente}}, su pago presenta un retraso de {{dias_mora}} días. Favor comunicarse.',
   'mora');
