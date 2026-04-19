// ══════════════════════════════════════════════
// APP — TypeScript Types
// ══════════════════════════════════════════════

export type Rol = 'promotor' | 'gerente' | 'admin' | 'superadmin'
export type EstadoPrestamo = 'pendiente' | 'aprobado' | 'activo' | 'cancelado' | 'mora' | 'pagado'
export type EstadoPago = 'por_conciliar' | 'conciliado' | 'rechazado'
export type TipoMovimiento = 'inyeccion' | 'retiro' | 'capitalizacion_interes'
export type ReglaFeriado = 'antes' | 'despues'
export type MetodoPago = 'efectivo' | 'transferencia' | 'yappy' | 'ach' | 'cheque'
export type Disparador = 'aprobacion' | 'conciliacion' | 'mora' | 'recordatorio' | 'manual'

// ─────────────────────────────────────────────
export interface Agencia {
  id: string
  nombre: string
  logo_url: string | null
  metodos_pago: MetodoPago[]
  activa: boolean
  created_at: string
  updated_at: string
}

export interface Usuario {
  id: string
  agencia_id: string
  gerente_id: string | null
  nombre: string
  username: string
  rol: Rol
  activo: boolean
  cambio_pass_req: boolean
  ultimo_acceso: string | null
  created_at: string
  // Relations
  agencia?: Agencia
  gerente?: Usuario
}

export interface Cliente {
  id: string
  agencia_id: string
  promotor_id: string
  nombre: string
  cedula: string
  telefono: string | null
  email: string | null
  direccion: string | null
  foto_cedula_url: string | null
  referido_feria: boolean
  activo: boolean
  deleted_at: string | null
  created_at: string
  // Relations
  promotor?: Usuario
  prestamos?: Prestamo[]
}

export interface Prestamo {
  id: string
  agencia_id: string
  cliente_id: string
  promotor_id: string
  gerente_id: string | null
  admin_id: string | null
  monto_original: number
  saldo_capital: number
  tasa_interes: number
  periodicidad_dias: number
  fecha_desembolso: string | null
  fecha_primer_corte: string | null
  estado: EstadoPrestamo
  comprobante_url: string | null
  notas: string | null
  deleted_at: string | null
  created_at: string
  // Relations
  cliente?: Cliente
  promotor?: Usuario
  pagos?: Pago[]
}

export interface Pago {
  id: string
  prestamo_id: string
  agencia_id: string
  promotor_id: string
  conciliado_por: string | null
  monto_total: number
  monto_mora: number
  monto_interes: number
  monto_capital: number
  estado: EstadoPago
  metodo_pago: MetodoPago
  comprobante_url: string | null
  fecha_pago: string
  conciliado_at: string | null
  deleted_at: string | null
  created_at: string
  // Relations
  prestamo?: Prestamo
  promotor?: Usuario
}

export interface Fondeador {
  id: string
  agencia_id: string
  nombre: string
  tasa_anual: number
  capital_actual: number
  activo: boolean
  deleted_at: string | null
  created_at: string
  // Relations
  movimientos?: MovimientoFondeador[]
}

export interface MovimientoFondeador {
  id: string
  fondeador_id: string
  agencia_id: string
  tipo: TipoMovimiento
  monto: number
  descripcion: string | null
  registrado_por: string | null
  created_at: string
}

export interface Corte {
  id: string
  prestamo_id: string
  agencia_id: string
  fecha_original: string
  fecha_ajustada: string
  monto_interes: number
  pagado: boolean
  pago_id: string | null
  created_at: string
  // Relations
  prestamo?: Prestamo & { cliente?: Cliente }
}

export interface Feriado {
  id: string
  agencia_id: string
  fecha: string
  descripcion: string
  regla: ReglaFeriado
  created_at: string
}

export interface PlantillaWhatsapp {
  id: string
  agencia_id: string
  nombre: string
  mensaje: string
  disparador: Disparador | null
  activa: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LogAuditoria {
  id: string
  agencia_id: string | null
  usuario_id: string | null
  username: string | null
  rol: Rol | null
  accion: string
  tabla: string | null
  registro_id: string | null
  detalle: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface SolicitudRecuperacionPass {
  id: string
  usuario_id: string
  agencia_id: string
  estado: 'pendiente' | 'atendida'
  atendida_por: string | null
  created_at: string
  atendida_at: string | null
  usuario?: Usuario
}

// ─────────────────────────────────────────────
// DASHBOARD KPIs
// ─────────────────────────────────────────────
export interface DashboardKPIs {
  fondo_disponible: number
  saldo_capital_total: number
  interes_devengado_mes: number
  cartera_en_riesgo: number        // Saldo de préstamos con +3 días atraso
  total_fondeadores: number
  indice_liquidez: number          // fondo_disponible / total_fondeadores * 100
  cortes_hoy: Corte[]
  alertas_pass: SolicitudRecuperacionPass[]
  alertas_fondeo_baja: boolean     // fondos < promedio desembolsos semana
}

export interface DashboardPromotor {
  mis_clientes: number
  mis_abonos_mes: number
  mis_cortes_hoy: Corte[]
  referidos_feria: number
  mis_comisiones_mes: number
}

// ─────────────────────────────────────────────
// VALIDACIÓN DESEMBOLSO (respuesta RPC)
// ─────────────────────────────────────────────
export interface ValidacionDesembolso {
  ok: boolean
  mensaje?: string
  disponible: number
  solicitado?: number
  faltante?: number
}

// ─────────────────────────────────────────────
// WHATSAPP HELPERS
// ─────────────────────────────────────────────
export interface VariablesWA {
  cliente?: string
  monto?: string
  interes?: string
  fecha_corte?: string
  monto_abono?: string
  saldo_actual?: string
  dias_mora?: string
  [key: string]: string | undefined
}

export function buildWAUrl(telefono: string, plantilla: PlantillaWhatsapp, vars: VariablesWA): string {
  const msg = plantilla.mensaje.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
  return `https://wa.me/507${telefono}?text=${encodeURIComponent(msg)}`
}

// ─────────────────────────────────────────────
// PERMISOS por ROL (helper client-side)
// ─────────────────────────────────────────────
export const PERMISOS: Record<Rol, {
  verLiquidez: boolean
  verEquipo: boolean
  aprobar: boolean
  desembolsar: boolean
  conciliar: boolean
  verFondeadores: boolean
  verCalendario: boolean
  verAuditoria: boolean
  verAgencias: boolean
  editarPlantillasWA: boolean
  restaurarPapelera: boolean
  purgarPapelera: boolean
}> = {
  promotor: {
    verLiquidez: false, verEquipo: false,
    aprobar: false, desembolsar: false, conciliar: false,
    verFondeadores: false, verCalendario: false, verAuditoria: false,
    verAgencias: false, editarPlantillasWA: false,
    restaurarPapelera: false, purgarPapelera: false,
  },
  gerente: {
    verLiquidez: false, verEquipo: true,
    aprobar: true, desembolsar: false, conciliar: true,
    verFondeadores: false, verCalendario: false, verAuditoria: false,
    verAgencias: false, editarPlantillasWA: false,
    restaurarPapelera: false, purgarPapelera: false,
  },
  admin: {
    verLiquidez: true, verEquipo: true,
    aprobar: false, desembolsar: true, conciliar: true,
    verFondeadores: true, verCalendario: true, verAuditoria: false,
    verAgencias: false, editarPlantillasWA: true,
    restaurarPapelera: true, purgarPapelera: false,
  },
  superadmin: {
    verLiquidez: true, verEquipo: true,
    aprobar: true, desembolsar: true, conciliar: true,
    verFondeadores: true, verCalendario: true, verAuditoria: true,
    verAgencias: true, editarPlantillasWA: true,
    restaurarPapelera: true, purgarPapelera: true,
  },
}
