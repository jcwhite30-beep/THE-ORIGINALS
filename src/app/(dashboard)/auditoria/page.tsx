'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ACCIONES: Record<string,{label:string,color:string}> = {
  cliente_creado:     { label:'👤 Cliente creado',     color:'#5a8fc0' },
  solicitud_prestamo: { label:'💳 Solicitud',           color:'#c09a4c' },
  prestamo_aprobado:  { label:'✅ Aprobado',            color:'#4caf82' },
  desembolso:         { label:'💸 Desembolso',          color:'#e2c27d' },
  pago_registrado:    { label:'💰 Pago registrado',     color:'#4caf82' },
  pago_conciliado:    { label:'⚖️ Conciliado',           color:'#c9a84c' },
  login:              { label:'🔑 Acceso',              color:'#5a8fc0' },
  logout:             { label:'🚪 Salida',              color:'#524438' },
  cancelacion:        { label:'✗ Cancelado',            color:'#c0534e' },
  mora:               { label:'⚠️ Mora',                color:'#c0534e' },
}

export default function AuditoriaPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('all')
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const hoy = new Date()
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate()-30)
    setDesde(hace30.toISOString().split('T')[0])
    setHasta(hoy.toISOString().split('T')[0])
    load(hace30.toISOString().split('T')[0], hoy.toISOString().split('T')[0], 'all')
  }, [])

  async function load(d: string, h: string, accion: string) {
    setLoading(true)
    let q = supabase.from('logs_auditoria')
      .select('*, usuario:usuarios(nombre,username,rol)', { count:'exact' })
      .order('created_at', { ascending:false })
      .limit(100)

    if (d) q = q.gte('created_at', d+'T00:00:00')
    if (h) q = q.lte('created_at', h+'T23:59:59')
    if (accion !== 'all') q = q.eq('accion', accion)

    const { data, count } = await q
    setLogs(data||[])
    setTotal(count||0)
    setLoading(false)
  }

  async function descargarTodos(d: string, h: string, accion: string) {
    let q = supabase.from('logs_auditoria')
      .select('*, usuario:usuarios(nombre,username,rol)')
      .order('created_at', { ascending:false })
    if (d) q = q.gte('created_at', d+'T00:00:00')
    if (h) q = q.lte('created_at', h+'T23:59:59')
    if (accion !== 'all') q = q.eq('accion', accion)
    const { data } = await q
    return data||[]
  }

  async function exportarCSV() {
    const data = await descargarTodos(desde, hasta, filtroAccion)
    const headers = ['Fecha','Hora','Acción','Descripción','Usuario','Rol','Agencia']
    const rows = data.map(l => [
      new Date(l.created_at).toLocaleDateString('es-PA'),
      new Date(l.created_at).toLocaleTimeString('es-PA'),
      l.accion||'—',
      (l.descripcion||l.detalle||'—').toString().replace(/,/g,';'),
      l.usuario?.nombre||l.username||'—',
      l.usuario?.rol||l.rol||'—',
      l.agencia_id||'—',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`auditoria_${desde}_${hasta}.csv`; a.click()
  }

  async function exportarHTML() {
    const data = await descargarTodos(desde, hasta, filtroAccion)
    const filas = data.map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString('es-PA')}</td>
        <td><strong>${l.accion||'—'}</strong></td>
        <td>${l.descripcion||l.detalle||'—'}</td>
        <td>${l.usuario?.nombre||l.username||'—'}</td>
        <td>${l.usuario?.rol||l.rol||'—'}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Auditoría APP</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
    h2{color:#c9a84c}table{width:100%;border-collapse:collapse}
    th{background:#1a1a1a;color:#e2c27d;padding:8px;text-align:left}
    td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even){background:#f9f9f9}
    .meta{color:#888;margin-bottom:16px}</style></head><body>
    <h2>📋 Auditoría — APP Préstamos</h2>
    <p class="meta">Período: ${desde} al ${hasta} · Total registros: ${data.length}</p>
    <table><thead><tr><th>Fecha/Hora</th><th>Acción</th><th>Descripción</th><th>Usuario</th><th>Rol</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <script>window.print()</script></body></html>`

    const blob = new Blob([html], { type:'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  function buscar() { load(desde, hasta, filtroAccion) }

  return (
    <div className="page">
      <div style={{ marginBottom:'16px' }}>
        <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 3px' }}>Auditoría</h1>
        <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>Historial completo · {total} registros totales · Mostrando últimos 100</p>
      </div>

      {/* Filtros */}
      <div className="card card-sm" style={{ marginBottom:'12px' }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label className="f-lbl">Desde</label>
            <input className="f-inp" type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{ width:'140px', fontSize:'13px' }} />
          </div>
          <div>
            <label className="f-lbl">Hasta</label>
            <input className="f-inp" type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{ width:'140px', fontSize:'13px' }} />
          </div>
          <div>
            <label className="f-lbl">Acción</label>
            <select className="f-sel" value={filtroAccion} onChange={e=>setFiltroAccion(e.target.value)} style={{ width:'160px', fontSize:'13px' }}>
              <option value="all">Todas</option>
              {Object.entries(ACCIONES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button className="btn-gold" onClick={buscar} style={{ height:'40px' }}>🔍 Buscar</button>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
            <button className="btn-ghost" onClick={exportarCSV} style={{ fontSize:'11px', padding:'8px 12px' }}>📊 CSV</button>
            <button className="btn-ghost" onClick={exportarHTML} style={{ fontSize:'11px', padding:'8px 12px' }}>📄 PDF/Imprimir</button>
          </div>
        </div>
      </div>

      {/* Cards móvil */}
      <div className="mob-only">
        {loading ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Cargando...</div>
        : logs.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Sin registros</div>
        : logs.map(l=>{
          const cfg = ACCIONES[l.accion]||ACCIONES[l.tipo_accion]||{ label:l.accion, color:'#9a8668' }
          return (
            <div key={l.id} className="card card-sm" style={{ marginBottom:'8px', borderLeft:`3px solid ${cfg.color}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                <span style={{ fontSize:'11px', fontWeight:600, color:cfg.color }}>{cfg.label}</span>
                <span style={{ fontSize:'10px', color:'#524438', fontFamily:'monospace' }}>{new Date(l.created_at).toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <div style={{ fontSize:'12px', color:'#f0ebe0', marginBottom:'3px' }}>{l.descripcion||String(l.detalle||'—')}</div>
              <div style={{ fontSize:'10px', color:'#9a8668' }}>{l.usuario?.nombre||l.username||'Sistema'} · {new Date(l.created_at).toLocaleDateString('es-PA')}</div>
            </div>
          )
        })}
      </div>

      {/* Tabla desktop */}
      <div className="desk-only card" style={{ overflow:'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{['Fecha','Hora','Acción','Descripción','Usuario','Rol'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando...</td></tr>
              : logs.length===0 ? <tr><td colSpan={6} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Sin registros en este rango</td></tr>
              : logs.map(l=>{
                const cfg = ACCIONES[l.accion]||ACCIONES[l.tipo_accion]||{ label:l.accion||'—', color:'#9a8668' }
                return (
                  <tr key={l.id} onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,.02)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{ fontFamily:'monospace', color:'#9a8668', whiteSpace:'nowrap' }}>{new Date(l.created_at).toLocaleDateString('es-PA')}</td>
                    <td style={{ fontFamily:'monospace', color:'#524438', whiteSpace:'nowrap' }}>{new Date(l.created_at).toLocaleTimeString('es-PA')}</td>
                    <td><span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'5px', color:cfg.color, background:`${cfg.color}15`, whiteSpace:'nowrap' }}>{cfg.label}</span></td>
                    <td style={{ color:'#f0ebe0', maxWidth:'280px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descripcion||String(l.detalle||'—')}</td>
                    <td style={{ color:'#9a8668' }}><div>{l.usuario?.nombre||l.username||'Sistema'}</div><div style={{ fontSize:'10px', color:'#524438', fontFamily:'monospace' }}>@{l.usuario?.username||'system'}</div></td>
                    <td><span style={{ fontSize:'10px', padding:'2px 6px', background:'#1c1c1c', borderRadius:'4px', color:'#9a8668' }}>{l.usuario?.rol||l.rol||'—'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
