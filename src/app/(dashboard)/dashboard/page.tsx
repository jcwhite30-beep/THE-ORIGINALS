'use client'
import { fmtM, getSimbolo } from '@/lib/fmt'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SYM: Record<string,string> = { USD:'$',PAB:'B/.',EUR:'€',COP:'$',MXN:'$' }
// Monedas sin decimales (enteros)
const SIN_DECIMALES = ['COP','CLP','PYG','VES','IDR','HUF','JPY']
function fmt(v: number, m='USD') {
  const s = SYM[m]||'$'
  const sinDec = SIN_DECIMALES.includes(m)
  const n = Math.round(v)
  if (sinDec) {
    // COP y similares: número entero con separador de miles, sin abreviar
    return `${s}${n.toLocaleString('es-CO')}`
  }
  // USD y otros: 2 decimales, abreviar millones
  if (v>=1000000) return `${s}${(v/1000000).toFixed(2)}M`
  if (v>=1000) return `${s}${v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`
  return `${s}${v.toFixed(2)}`
}
function getPeriodo() {
  const now = new Date(), d = now.getDate()
  const mes = now.toLocaleDateString('es-PA',{month:'long',year:'numeric'})
  // Períodos: 1-15 y 16-30 (nunca 31)
  return d<=15 ? `1 al 15 de ${mes}` : `16 al 30 de ${mes}`
}
const ECOLOR: Record<string,string> = { activo:'#4caf82', mora:'#c0534e' }
const ELABEL: Record<string,string> = { activo:'Activo', mora:'Mora' }

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const perfilRef  = useRef<any>(null)
  const filtroRef  = useRef({ ag:'all', rol:'all', us:'all' })

  const [perfil,   setPerfil]   = useState<any>(null)
  const [agencias, setAgencias] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [filtroAg,  setFiltroAg]  = useState('all')
  const [filtroRol, setFiltroRol] = useState('all')
  const [filtroUs,  setFiltroUs]  = useState('all')
  const [stats,    setStats]    = useState<any>(null)
  const [prevSaldo, setPrevSaldo] = useState<number|null>(null)
  const [clientes, setClientes] = useState<any[]>([])
  const [moneda,   setMoneda]   = useState('USD')
  const [loading,  setLoading]  = useState(true)

  // ─── carga principal (usa refs para siempre tener valores actuales) ───
  const cargar = useCallback(async (
    p: any,
    fAg: string, fRol: string, fUs: string
  ) => {
    setLoading(true)
    const isSA = p.rol === 'superadmin'
    const agId = fAg !== 'all' ? fAg : p.agencia_id
    // vista global = superadmin sin ningún filtro activo
    const verTodas = isSA && fAg === 'all' && fRol === 'all' && fUs === 'all'

    // ── Resolver promotor_ids ──
    let pIds: string[] | null = null

    if (p.rol === 'promotor') {
      pIds = [p.id]
    } else if (fUs !== 'all') {
      pIds = [fUs]
    } else if (fRol !== 'all') {
      let qu = supabase.from('usuarios').select('id').eq('rol', fRol).eq('activo', true)
      if (!verTodas) qu = qu.eq('agencia_id', agId)
      const { data: uRol } = await qu
      pIds = (uRol || []).map((u: any) => u.id)
    }

    // Si filtro por rol/usuario no encontró nadie → todo en cero
    if (pIds !== null && pIds.length === 0) {
      // Guardar saldo anterior para calcular tendencia
    setPrevSaldo(prev => {
      if (prev === null) return saldo  // primera carga
      return prev  // mantener el anterior
    })
    setStats({ activos:0,mora:0,pend:0,apro:0,saldo:0,intereses:0,intMora:0,comisiones:0,comMora:0,porConciliar:0,totalFondos:0,disponible:0 })
      setClientes([])
      setLoading(false)
      return
    }

    // ── Paso 1: obtener clientes asignados al filtro (por promotor_id del cliente) ──
    let clienteIdsParaFiltro: string[] | null = null

    if (pIds !== null) {
      // Buscar clientes cuyo promotor_id (asignado_a) esté en pIds
      let qCli = supabase.from('clientes').select('id').is('deleted_at', null)
      if (!verTodas) qCli = qCli.eq('agencia_id', agId)
      if (pIds.length === 1) qCli = qCli.eq('promotor_id', pIds[0])
      else                   qCli = qCli.in('promotor_id', pIds)
      const { data: cliIds } = await qCli
      clienteIdsParaFiltro = (cliIds || []).map((c: any) => c.id)

      if (clienteIdsParaFiltro.length === 0) {
        setStats({ activos:0,mora:0,pend:0,apro:0,montoPend:0,montoApro:0,saldo:0,intereses:0,intMora:0,comisiones:0,comMora:0,porConciliar:0,totalFondos:0,disponible:0 })
        setClientes([])
        setLoading(false)
        return
      }
    }

    // ── Paso 2: Query de préstamos filtrados por cliente_id ──
    let q = supabase.from('prestamos')
      .select('estado,saldo_capital,tasa_interes,comision_porcentaje,comision_promotor,comision_mora,interes_acumulado,interes_mora,promotor_id,agencia_id,cliente_id,fecha_desembolso,agencia:agencias(periodo_gracia_dias)')

    if (!verTodas) q = q.eq('agencia_id', agId)

    if (clienteIdsParaFiltro !== null) {
      if (clienteIdsParaFiltro.length === 1) q = q.eq('cliente_id', clienteIdsParaFiltro[0])
      else                                   q = q.in('cliente_id', clienteIdsParaFiltro)
    }

    const { data: pres, error: presErr } = await q
    if (presErr) console.error('Dashboard prestamos:', presErr.message)

    const todos   = pres || []
    const activos = todos.filter((x: any) => x.estado === 'activo')
    const moraL   = todos.filter((x: any) => x.estado === 'mora')

    const saldo = [...activos, ...moraL].reduce((s: number, x: any) => s + (x.saldo_capital || 0), 0)

    // Helpers — deben declararse ANTES de usarse
    const enGracia = (x: any) => {
      if (!x.fecha_desembolso) return false
      const gracia = (x.agencia as any)?.periodo_gracia_dias || 0
      if (!gracia) return false
      const finGracia = new Date(x.fecha_desembolso)
      finGracia.setDate(finGracia.getDate() + gracia)
      return new Date() < finGracia
    }
    const calcInteresPres = (x: any) => enGracia(x) ? 0 :
      (x.interes_acumulado > 0 ? x.interes_acumulado : (x.saldo_capital || 0) * ((x.tasa_interes || 10) / 100))
    const calcComis = (arr: any[]) => arr.reduce((s: number, x: any) => {
      if (enGracia(x)) return s
      const porc = x.comision_porcentaje || 0
      return s + (porc > 0 ? (x.saldo_capital || 0) * (porc / 100) : (x.comision_promotor || 0))
    }, 0)
    // Comisión en mora = comision_mora acumulada de préstamos vencidos
    const calcComMora = (arr: any[]) => arr.reduce((s: number, x: any) => {
      return s + (x.comision_mora || 0)
    }, 0)

    const intereses = activos.reduce((s: number, x: any) => s + calcInteresPres(x), 0)
    const intMora   = moraL.reduce((s: number, x: any) => s + (x.interes_mora || 0), 0)
    const comisiones = calcComis([...activos, ...moraL])
    const comMora    = calcComMora(moraL)

    // Pagos por conciliar — filtrado por préstamos de clientes asignados
    let porConciliar = 0
    if (clienteIdsParaFiltro !== null && clienteIdsParaFiltro.length > 0) {
      // Obtener IDs de préstamos de esos clientes
      const { data: presPC } = await supabase.from('prestamos').select('id')
        .in('cliente_id', clienteIdsParaFiltro)
      const presIdsPc = (presPC || []).map((x: any) => x.id)
      if (presIdsPc.length > 0) {
        let qp = supabase.from('pagos').select('monto_total').eq('estado', 'por_conciliar')
          .in('prestamo_id', presIdsPc)
        const { data: pags } = await qp
        porConciliar = (pags || []).reduce((s: number, x: any) => s + (x.monto_total || 0), 0)
      }
    } else {
      let qp = supabase.from('pagos').select('monto_total').eq('estado', 'por_conciliar')
      if (!verTodas) qp = qp.eq('agencia_id', agId)
      const { data: pags } = await qp
      porConciliar = (pags || []).reduce((s: number, x: any) => s + (x.monto_total || 0), 0)
    }

    // Fondeadores
    let totalFondos = 0
    if (['admin', 'superadmin'].includes(p.rol)) {
      let qf = supabase.from('fondeadores').select('saldo_actual,capital_actual,intereses_acumulados')
      if (!verTodas) qf = qf.eq('agencia_id', agId)
      const { data: fond } = await qf
      totalFondos = (fond || []).reduce((s: number, x: any) =>
        s + (x.saldo_actual || 0) + (x.intereses_acumulados || 0), 0)
    }

    const pendList = todos.filter((x: any) => x.estado === 'pendiente')
    const aproList = todos.filter((x: any) => x.estado === 'aprobado')
    setStats({
      activos: activos.length, mora: moraL.length,
      pend: pendList.length,
      apro: aproList.length,
      montoPend: pendList.reduce((s: number, x: any) => s + (x.saldo_capital||0), 0),
      montoApro: aproList.reduce((s: number, x: any) => s + (x.saldo_capital||0), 0),
      saldo, intereses, intMora, comisiones, comMora, porConciliar,
      totalFondos, disponible: totalFondos - saldo  // puede ser negativo
    })

    // ── Tabla de clientes activos ──
    const clienteIds = [...new Set([...activos, ...moraL]
      .map((x: any) => x.cliente_id).filter(Boolean))] as string[]

    if (clienteIds.length > 0) {
      const { data: clis } = await supabase.from('clientes')
        .select('id,nombre,telefono,promotor:usuarios(nombre)')
        .in('id', clienteIds).order('nombre')

      const cliConPres = (clis || []).map((c: any) => {
        const presCli = [...activos, ...moraL].filter((x: any) => x.cliente_id === c.id)
        const saldoTotal   = presCli.reduce((s: number, x: any) => s + (x.saldo_capital || 0), 0)
        const intCli       = presCli.reduce((s: number, x: any) =>
          s + calcInteresPres(x), 0)
        const moraCli      = presCli.reduce((s: number, x: any) => s + (x.interes_mora || 0), 0)
        const comisionCli  = calcComis(presCli)
        const estado       = presCli.some((x: any) => x.estado === 'mora') ? 'mora' : 'activo'
        const totalPagar   = saldoTotal + intCli + moraCli + comisionCli
        return { ...c, saldoTotal, intCli, moraCli, comisionCli, totalPagar, estado }
      })
      setClientes(cliConPres)
    } else {
      setClientes([])
    }
    setLoading(false)
  }, [supabase])

  // ─── inicio ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      supabase.from('usuarios')
        .select('*, agencia:agencias(nombre,moneda_principal)')
        .eq('id', session.user.id).single()
        .then(async ({ data: p }) => {
          if (!p) return
          setPerfil(p)
          perfilRef.current = p
          setMoneda(p.agencia?.moneda_principal || 'USD')

          // Cargar agencias si es superadmin
          if (p.rol === 'superadmin') {
            const { data: ags } = await supabase.from('agencias')
              .select('id,nombre,moneda_principal').order('nombre')
            setAgencias(ags || [])
            // SuperAdmin inicia con su agencia por defecto (Panamá Central)
            if (p.agencia_id) {
              setFiltroAg(p.agencia_id)
              filtroRef.current.ag = p.agencia_id
            }
          }

          // Cargar todos los usuarios de la agencia al inicio
          const { data: usu } = await supabase.from('usuarios')
            .select('id,nombre,rol').eq('agencia_id', p.agencia_id)
            .eq('activo', true).order('nombre')
          setUsuarios(usu || [])

          // Cargar stats iniciales con agencia por defecto
          const agInicial = p.rol === 'superadmin' ? p.agencia_id : 'all'
          await cargar(p, agInicial, 'all', 'all')
        })
    })
  }, [])

  // ─── reaccionar a cambios de filtro ───
  // CLAVE: usar un ref para disparar cargar con los valores más recientes
  useEffect(() => {
    const p = perfilRef.current
    if (!p) return

    // Actualizar lista de usuarios si cambió la agencia
    const actualizarUsuarios = async () => {
      if (p.rol === 'superadmin' && filtroAg === 'all') {
        // SuperAdmin sin filtro de agencia → todos los usuarios
        const { data: usu } = await supabase.from('usuarios')
          .select('id,nombre,rol').eq('activo', true).order('nombre')
        setUsuarios(usu || [])
      } else {
        const agId = filtroAg !== 'all' ? filtroAg : p.agencia_id
        const { data: usu } = await supabase.from('usuarios')
          .select('id,nombre,rol').eq('agencia_id', agId)
          .eq('activo', true).order('nombre')
        setUsuarios(usu || [])
      }
    }

    // Actualizar moneda
    if (filtroAg !== 'all') {
      const ag = agencias.find((a: any) => a.id === filtroAg)
      if (ag?.moneda_principal) setMoneda(ag.moneda_principal)
    } else {
      setMoneda(p.agencia?.moneda_principal || 'USD')
    }

    // Primero actualizar usuarios, luego cargar datos con los filtros actuales
    actualizarUsuarios().then(() => {
      // Capturar valores actuales de los filtros en este momento exacto
      cargar(p, filtroAg, filtroRol, filtroUs)
    })
  }, [filtroAg, filtroRol, filtroUs])

  const isAdmin   = ['admin', 'superadmin'].includes(perfil?.rol || '')
  const isGerente = ['gerente', 'admin', 'superadmin'].includes(perfil?.rol || '')
  const S  = stats || {}
  const F  = (v: number) => fmt(v || 0, moneda)
  const hayFiltro    = filtroAg !== 'all' || filtroRol !== 'all' || filtroUs !== 'all'
  const filtroNombre = filtroUs !== 'all'
    ? usuarios.find(u => u.id === filtroUs)?.nombre
    : filtroRol !== 'all' ? `Rol: ${filtroRol}`
    : filtroAg !== 'all' ? agencias.find((a: any) => a.id === filtroAg)?.nombre
    : null

  return (
    <div className="page">

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px', gap:'8px', flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:'18px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 1px' }}>Dashboard</h1>
          <div style={{ fontSize:'10px', color:'#9a8668' }}>{perfil?.nombre} · <span style={{ color:'#c9a84c' }}>{getPeriodo()}</span></div>
        </div>
        {hayFiltro && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(201,168,76,.1)', border:'1px solid rgba(201,168,76,.25)', borderRadius:'7px', padding:'5px 10px', fontSize:'11px', color:'#c9a84c' }}>
            🔍 <strong>{filtroNombre}</strong>
            <button onClick={() => { setFiltroAg('all'); setFiltroRol('all'); setFiltroUs('all') }}
              style={{ background:'none', border:'none', color:'#9a8668', cursor:'pointer', fontSize:'14px', padding:'0 0 0 2px', lineHeight:1 }}>✕</button>
          </div>
        )}
      </div>

      {/* Filtros */}
      {isGerente && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'6px', marginBottom:'12px' }}>
          {perfil?.rol === 'superadmin' && (
            <select value={filtroAg} onChange={e => { setFiltroUs('all'); setFiltroAg(e.target.value) }}
              className="f-sel" style={{ fontSize:'12px', padding:'7px 10px' }}>
              <option value="all">Todas las agencias</option>
              {agencias.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <select value={filtroRol} onChange={e => { setFiltroUs('all'); setFiltroRol(e.target.value) }}
            className="f-sel" style={{ fontSize:'12px', padding:'7px 10px' }}>
            <option value="all">Todos los roles</option>
            <option value="promotor">Promotores</option>
            <option value="gerente">Gerentes</option>
            <option value="admin">Admins</option>
          </select>
          <select value={filtroUs} onChange={e => setFiltroUs(e.target.value)}
            className="f-sel" style={{ fontSize:'12px', padding:'7px 10px' }}>
            <option value="all">Todos los usuarios</option>
            {usuarios
              .filter((u: any) => filtroRol === 'all' || u.rol === filtroRol)
              .map((u: any) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ padding:'40px', textAlign:'center', color:'#524438' }}>⏳ Cargando...</div>
      ) : (<>

        {/* ═══ DASHBOARD CARDS ═══ */}
        <style>{`
          .dash-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:8px; }
          .dash-grid-5 { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:12px; }
          @media(max-width:900px){
            .dash-grid-4 { grid-template-columns:repeat(2,1fr); }
            .dash-grid-5 { grid-template-columns:repeat(2,1fr); }
          }
          @media(max-width:480px){
            .dash-grid-4 { grid-template-columns:1fr 1fr; gap:6px; }
            .dash-grid-5 { grid-template-columns:1fr 1fr; gap:6px; }
          }
          .dcard {
            background:#141414;
            border:1px solid #1e1e1e;
            border-radius:12px;
            padding:12px 13px 10px;
            position:relative;
            overflow:hidden;
            transition:border-color .15s;
          }
          .dcard:hover { border-color:#2a2a2a; }
          .dcard::before {
            content:'';
            position:absolute;
            top:0; left:0; right:0;
            height:2px;
          }
          .dcard-label {
            font-size:8px;
            font-weight:700;
            letter-spacing:1.2px;
            text-transform:uppercase;
            color:#524438;
            margin-bottom:6px;
          }
          .dcard-val {
            font-size:22px;
            font-weight:800;
            letter-spacing:-1px;
            line-height:1;
            margin-bottom:5px;
            font-variant-numeric: tabular-nums;
          }
          .dcard-sub {
            font-size:9px;
            color:#524438;
            display:flex;
            justify-content:space-between;
            align-items:center;
          }
          .dcard-count {
            font-size:10px;
            font-weight:700;
            padding:1px 6px;
            border-radius:20px;
            background:rgba(255,255,255,.04);
          }
          @media(max-width:480px){
            .dcard { padding:10px 10px 8px; }
            .dcard-val { font-size:18px; }
          }
        `}</style>

        {/* Barra de estado cartera vs fondos */}
        {S.totalFondos > 0 && (() => {
          const pct = Math.min(100, (S.saldo / S.totalFondos) * 100)
          const disponible = S.totalFondos - S.saldo
          const color = pct >= 90 ? '#c0534e' : pct >= 70 ? '#c09a4c' : '#4caf82'
          const tendencia = prevSaldo !== null && prevSaldo !== S.saldo
            ? S.saldo > prevSaldo ? '↑' : '↓' : null
          return (
            <div style={{ background:'#141414', border:'1px solid #252525', borderRadius:'10px', padding:'12px 16px', marginBottom:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <div style={{ fontSize:'10px', fontWeight:600, color:'#524438', textTransform:'uppercase', letterSpacing:'1px' }}>
                  Cartera vs Fondos disponibles
                  {tendencia && <span style={{ marginLeft:'6px', color: S.saldo > (prevSaldo||0) ? '#c0534e' : '#4caf82', fontSize:'12px' }}>{tendencia}</span>}
                </div>
                <div style={{ fontSize:'11px', color:'#9a8668' }}>
                  <span style={{ color, fontWeight:700 }}>{F(S.saldo)}</span>
                  <span style={{ color:'#524438' }}> / {F(S.totalFondos)}</span>
                </div>
              </div>
              <div style={{ height:'8px', background:'#1c1c1c', borderRadius:'4px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, ${color}88, ${color})`, borderRadius:'4px', transition:'width 0.6s ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px' }}>
                <span style={{ fontSize:'10px', color:'#524438' }}>{pct.toFixed(1)}% comprometido</span>
                <span style={{ fontSize:'10px', color: disponible < 0 ? '#c0534e' : '#4caf82', fontWeight:600 }}>
                  {disponible < 0 ? `Déficit ${F(Math.abs(disponible))}` : `Disponible ${F(disponible)}`}
                </span>
              </div>
            </div>
          )
        })()}

        {/* Fila 1: Cartera · Int.Período · Int.Mora · Clientes en mora */}
        <div className="dash-grid-4">
          {[
            { l:'Cartera activa',    v:F(S.saldo),       c:'#c09a4c', 
              sub: (() => {
                if (prevSaldo === null || prevSaldo === S.saldo) return `${S.activos||0} préstamos`
                const diff = S.saldo - prevSaldo
                const pct = prevSaldo > 0 ? Math.abs(diff/prevSaldo*100).toFixed(1) : '0'
                return diff > 0 
                  ? `↑ ${pct}% vs anterior · ${S.activos||0} préstamos`
                  : `↓ ${pct}% vs anterior · ${S.activos||0} préstamos`
              })(),
              cnt:S.activos||0 },
            { l:'Intereses período', v:F(S.intereses),   c:'#e2c27d', sub:'devengados este período',       cnt:S.activos||0 },
            { l:'Intereses mora',    v:F(S.intMora),     c:'#c0534e', sub:'en préstamos vencidos',         cnt:S.mora||0 },
            { l:'Clientes en mora',  v:String(S.mora||0),c:'#c0534e', sub:'requieren gestión urgente',     cnt:S.mora||0 },
          ].map(k=>(
            <div key={k.l} className="dcard" style={{ '--ac':k.c } as any}>
              <div className="dcard-label">{k.l}</div>
              <div className="dcard-val" style={{ color:k.c }}>{k.v}</div>
              <div className="dcard-sub">
                <span>{k.sub}</span>
                <span className="dcard-count" style={{ color:k.c }}>{k.cnt}</span>
              </div>
              <style>{`.dcard[style*="--ac:${k.c}"]::before{background:${k.c}20;height:2px;background:${k.c};}`}</style>
            </div>
          ))}
        </div>

        {/* Fila 2: Comisiones · Com.Mora · Por Conciliar · Por Aprobar · Por Desembolsar */}
        <div className="dash-grid-5">
          {[
            { l:'Comisiones',           v:F(S.comisiones),    c:'#4caf82', sub:`${S.activos||0} préstamos`,     cnt:S.activos||0 },
            { l:'Comisiones mora',       v:F(S.comMora),       c:'#c09a4c', sub:'pendientes de cobro',           cnt:S.mora||0 },
            { l:'Pagos por conciliar',   v:F(S.porConciliar),  c:'#e2c27d', sub:'pendientes confirmación',       cnt:null },
            { l:'Por aprobar',           v:String(S.pend||0),  c:'#5a8fc0', sub:F(S.montoPend||0),              cnt:S.pend||0 },
            { l:'Por desembolsar',       v:String(S.apro||0),  c:'#a855f7', sub:F(S.montoApro||0),              cnt:S.apro||0 },
          ].map(k=>(
            <div key={k.l} className="dcard">
              <div className="dcard-label">{k.l}</div>
              <div className="dcard-val" style={{ color:k.c }}>{k.v}</div>
              <div className="dcard-sub">
                <span>{k.sub}</span>
                {k.cnt!==null && <span className="dcard-count" style={{ color:k.c }}>{k.cnt}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Tabla clientes activos */}
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #1e1e1e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'#f0ebe0' }}>
              Clientes activos
              {hayFiltro && filtroNombre && <span style={{ color:'#9a8668', fontWeight:400 }}> · {filtroNombre}</span>}
            </div>
            <span style={{ fontSize:'10px', color:'#524438' }}>{clientes.length} clientes</span>
          </div>

          {/* Móvil */}
          <div className="mob-only">
            {clientes.length === 0
              ? <div style={{ padding:'20px', textAlign:'center', color:'#524438', fontSize:'12px' }}>
                  {hayFiltro ? 'Sin clientes para este filtro' : 'Sin clientes activos'}
                </div>
              : clientes.map((c: any) => (
                <div key={c.id} style={{ padding:'10px 14px', borderBottom:'1px solid #1c1c1c' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                    <div>
                      <div style={{ fontSize:'13px', fontWeight:600, color:'#f0ebe0' }}>{c.nombre}</div>
                      <div style={{ fontSize:'10px', color:'#9a8668' }}>{(c.promotor as any)?.nombre || '—'}</div>
                    </div>
                    <span style={{ fontSize:'9px', fontWeight:600, padding:'2px 7px', borderRadius:'20px',
                      color:ECOLOR[c.estado]||'#9a8668', background:`${ECOLOR[c.estado]||'#9a8668'}18` }}>
                      {ELABEL[c.estado]||c.estado}
                    </span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'5px' }}>
                    {[
                      { l:'Capital',    v:fmt(c.saldoTotal, moneda),   col:'#e2c27d' },
                      { l:'Int+Mora',   v:fmt(c.intCli+c.moraCli, moneda), col:c.moraCli>0?'#c0534e':'#4caf82' },
                      { l:'Total',      v:fmt(c.totalPagar, moneda),   col:c.moraCli>0?'#c0534e':'#f0ebe0' },
                    ].map(m => (
                      <div key={m.l} style={{ background:'#1a1a1a', borderRadius:'6px', padding:'5px 7px' }}>
                        <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase' }}>{m.l}</div>
                        <div style={{ fontSize:'12px', fontWeight:700, color:m.col, fontFamily:'monospace' }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                  {c.telefono && (
                    <button
                      onClick={() => {
                        const tel = c.telefono.replace(/\D/g,'')
                        const num = tel.startsWith('507') ? tel : `507${tel}`
                        const int = (c.intCli||0)+(c.moraCli||0)+(c.comisionCli||0)
                        const msg = `Estimado/a *${c.nombre}*, le recordamos su cuota:\n\n💰 Saldo capital: *$${c.saldoTotal.toFixed(2)}*\n📈 Intereses: *$${int.toFixed(2)}*\n━━━━━━━━━━\n✅ *Total a cancelar: $${c.totalPagar.toFixed(2)}*\n\n— ${perfil?.agencia?.nombre||'APP'}`
                        window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'wa_app')
                      }}
                      style={{ marginTop:'8px', width:'100%', background:'rgba(37,211,102,.08)', border:'1px solid rgba(37,211,102,.2)', borderRadius:'8px', padding:'7px', cursor:'pointer', fontSize:'12px', color:'#25d366', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                      💬 Enviar recordatorio WhatsApp
                    </button>
                  )}
                </div>
              ))
            }
          </div>

          {/* Desktop */}
          <div className="desk-only">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {['Cliente','Promotor','Saldo capital','Intereses+Mora','Comisión','Total a cancelar','Estado',''].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.length === 0
                    ? <tr><td colSpan={7} style={{ padding:'24px', textAlign:'center', color:'#524438' }}>
                        {hayFiltro ? 'Sin clientes para este filtro' : 'Sin clientes activos'}
                      </td></tr>
                    : clientes.map((c: any) => (
                      <tr key={c.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ fontWeight:500, color:'#f0ebe0' }}>{c.nombre}</td>
                        <td style={{ color:'#9a8668', fontSize:'11px' }}>{(c.promotor as any)?.nombre || '—'}</td>
                        <td style={{ fontFamily:'monospace', color:'#e2c27d', fontWeight:600 }}>{fmt(c.saldoTotal, moneda)}</td>
                        <td style={{ fontFamily:'monospace', color:c.moraCli>0?'#c0534e':'#4caf82' }}>
                          {fmt(c.intCli + c.moraCli, moneda)}
                          {c.moraCli > 0 && <span style={{ fontSize:'9px', color:'#c0534e', marginLeft:'3px' }}>+mora</span>}
                        </td>
                        <td style={{ fontFamily:'monospace', color:'#9a8668', fontSize:'11px' }}>{fmt(c.comisionCli, moneda)}</td>
                        <td style={{ fontFamily:'monospace', fontWeight:700, color:c.moraCli>0?'#c0534e':'#f0ebe0' }}>
                          {fmt(c.totalPagar, moneda)}
                        </td>
                        <td>
                          <span style={{ fontSize:'9px', fontWeight:600, padding:'2px 8px', borderRadius:'20px',
                            color:ECOLOR[c.estado]||'#9a8668', background:`${ECOLOR[c.estado]||'#9a8668'}18` }}>
                            {ELABEL[c.estado]||c.estado}
                          </span>
                        </td>
                        <td>
                          {c.telefono && (
                            <button
                              title={`Enviar WA a ${c.nombre}`}
                              onClick={() => {
                                const tel = c.telefono.replace(/\D/g,'')
                                const num = tel.startsWith('507') ? tel : `507${tel}`
                                const int = (c.intCli||0)+(c.moraCli||0)+(c.comisionCli||0)
                                const msg = `Estimado/a *${c.nombre}*, le recordamos su cuota:\n\n💰 Saldo capital: *$${c.saldoTotal.toFixed(2)}*\n📈 Intereses: *$${int.toFixed(2)}*\n━━━━━━━━━━\n✅ *Total a cancelar: $${c.totalPagar.toFixed(2)}*\n\n— ${perfil?.agencia?.nombre||'APP'}`
                                window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'wa_app')
                              }}
                              style={{ background:'rgba(37,211,102,.1)', border:'1px solid rgba(37,211,102,.25)', borderRadius:'6px', padding:'3px 7px', cursor:'pointer', fontSize:'13px', lineHeight:1 }}>
                              💬
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </>)}
    </div>
  )
}
