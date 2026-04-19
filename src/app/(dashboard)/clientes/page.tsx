'use client'
import { fmtM, getSimbolo } from '@/lib/fmt'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ROL_ES: Record<string,string> = { superadmin:'SuperAdmin', admin:'Admin', gerente:'Gerente', promotor:'Promotor' }


const ESTADO_PRES: Record<string,{color:string,label:string}> = {
  pendiente: { color:'#c09a4c', label:'Por aprobar' },
  aprobado:  { color:'#5a8fc0', label:'Por desembolsar' },
  activo:    { color:'#4caf82', label:'Activo' },
  mora:      { color:'#c0534e', label:'En mora' },
  pagado:    { color:'#524438', label:'Pagado' },
  cancelado: { color:'#3a3a3a', label:'Cancelado' },
}
const PER_L: Record<string,string> = { '1':'Diario','7':'Semanal','15':'Quincenal','30':'Mensual' }

export default function ClientesPage() {
  const supabase = createClient()
  const [clientes, setClientes] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [agencia, setAgencia] = useState<any>(null)
  const [agencias, setAgencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtroAgencia, setFiltroAgencia] = useState('all')
  const [filtroUsuario, setFiltroUsuario] = useState('all')
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [modal, setModal] = useState<'nuevo'|'editar'|'ver'|null>(null)
  const [clientePrestamos, setClientePrestamos] = useState<any[]>([])
  const [clientePagos, setClientePagos] = useState<any[]>([])
  const [loadingPres, setLoadingPres] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [perfil, setPerfil] = useState<any>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre:'', telefono1:'', telefono2:'', asignado_a:'' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id,nombre').eq('id', session.user.id).single()
        .then(({ data: p }) => {
          setPerfil(p); loadAll(p)
          supabase.from('agencias').select('id,nombre,moneda_principal').eq('id', p.agencia_id).single().then(({data:ag})=>setAgencia(ag))
          if (p.rol==='superadmin') {
            supabase.from('agencias').select('id,nombre,moneda_principal').order('nombre').then(({data})=>setAgencias(data||[]))
            setFiltroAgencia(p.agencia_id || 'all')
          }
          supabase.channel('cli-rt').on('postgres_changes',{event:'*',schema:'public',table:'clientes'},()=>loadAll(p)).subscribe()
        })
    })
  }, [])

  async function loadAll(p: any) {
    setLoading(true)
    const { data: usu } = await supabase.from('usuarios').select('id,nombre,rol').eq('agencia_id', p.agencia_id).eq('activo',true).order('nombre')
    setUsuarios(usu||[])
    let q = supabase.from('clientes').select('id,nombre,telefono,telefono2,promotor_id,activo,agencia_id,promotor:usuarios(nombre,rol),prestamos:prestamos(estado,saldo_capital)').is('deleted_at',null).order('nombre')
    if (p.rol==='promotor') {
      // Promotor: solo sus clientes
      q = q.eq('promotor_id', p.id)
    } else if (p.rol==='gerente') {
      // Gerente: sus clientes + clientes de sus promotores
      const { data: mp } = await supabase.from('usuarios').select('id').eq('agencia_id',p.agencia_id).eq('rol','promotor')
      q = q.in('promotor_id', [p.id,...(mp||[]).map((u:any)=>u.id)])
    } else if (p.rol==='admin') {
      // Admin: todos los clientes de su agencia
      q = q.eq('agencia_id', p.agencia_id)
    } else {
      // SuperAdmin: todos los clientes — sin filtro de agencia (se filtra en JS con filtroAgencia)
    }
    const { data } = await q
    setClientes(data||[])
    setLoading(false)
  }

  const activo = (c: any) => ((c.prestamos as any[])||[]).some((p:any)=>p.estado==='activo'&&p.saldo_capital>0)

  async function verCliente(c: any) {
    setSelected(c); setModal('ver'); setLoadingPres(true)
    // Préstamos del cliente
    const { data: pres } = await supabase.from('prestamos')
      .select('id,estado,monto_original,saldo_capital,tasa_interes,comision_porcentaje,comision_promotor,comision_mora,interes_acumulado,interes_mora,periodicidad_dias,tipo_desembolso,fecha_desembolso,created_at,agencia:agencias(periodo_gracia_dias)')
      .eq('cliente_id', c.id).order('created_at', { ascending:false })
    // Pagos del cliente
    const presIds = (pres||[]).map((p:any)=>p.id)
    let movs: any[] = []
    if (presIds.length > 0) {
      const { data: pg } = await supabase.from('pagos')
        .select('id,prestamo_id,monto_total,monto_capital,monto_interes,estado,fecha_pago,created_at,metodo_pago')
        .in('prestamo_id', presIds).order('fecha_pago', { ascending:false })
      movs = pg||[]
    }
    // Agregar desembolsos como movimientos
    const desembolsos = (pres||[])
      .filter((p:any)=>p.fecha_desembolso)
      .map((p:any)=>({
        id:`desembolso-${p.id}`, tipo:'desembolso',
        monto_total: p.monto_original, monto_capital: p.monto_original, monto_interes:0,
        estado:'confirmado', fecha_pago: p.fecha_desembolso,
        created_at: p.fecha_desembolso, metodo_pago: p.tipo_desembolso||'Efectivo'
      }))
    // Combinar y ordenar por fecha desc
    const todosMovs = [...movs, ...desembolsos].sort((a,b)=>
      new Date(b.fecha_pago||b.created_at).getTime() - new Date(a.fecha_pago||a.created_at).getTime()
    )
    setClientePrestamos(pres||[])
    setClientePagos(todosMovs)
    setLoadingPres(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre: form.nombre.trim(),
      telefono: form.telefono1 || null,
      telefono2: form.telefono2 || null,
      promotor_id: form.asignado_a || perfil.id,
      agencia_id: perfil.agencia_id,
      activo: false
    }
    const { error: e } = modal === 'nuevo'
      ? await supabase.from('clientes').insert(payload)
      : await supabase.from('clientes').update(payload).eq('id', selected.id)
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null)
    setSaving(false)
    await loadAll(perfil) // ← recargar lista inmediatamente
  }

  const filtrados = clientes.filter(c => {
    const a = activo(c)
    return (c.nombre.toLowerCase().includes(buscar.toLowerCase())||(c.telefono||'').includes(buscar))
      && (filtroEstado==='all'||(filtroEstado==='activo'?a:!a))
      && (filtroUsuario==='all'||c.promotor_id===filtroUsuario)
      && (filtroAgencia==='all'||c.agencia_id===filtroAgencia)
  })

  const isSup = perfil?.rol==='superadmin'
  const isGer = ['gerente','admin','superadmin'].includes(perfil?.rol||'')

  return (
    <div className="page">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'14px', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Clientes</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>{filtrados.length} de {clientes.length}</p>
        </div>
        <button className="btn-gold" onClick={()=>{setForm({nombre:'',telefono1:'',telefono2:'',asignado_a:perfil?.id||''}); setError(''); setModal('nuevo')}}>+ Nuevo</button>
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'12px' }}>
        <input className="f-inp" style={{ flex:1, minWidth:'130px', fontSize:'13px', padding:'8px 11px' }}
          placeholder="🔍 Buscar..." value={buscar} onChange={e=>setBuscar(e.target.value)} />
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
          style={{ background:'#141414', border:'1px solid var(--border)', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none' }}>
          <option value="all">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option>
        </select>
        {isSup && (
          <select value={filtroAgencia} onChange={e=>setFiltroAgencia(e.target.value)}
            style={{ background:'#141414', border:'1px solid var(--border)', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none' }}>
            <option value="all">Todas las agencias</option>
            {agencias.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        )}
        {isGer && (
          <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            style={{ background:'#141414', border:'1px solid var(--border)', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none', minWidth:'120px' }}>
            <option value="all">Todos</option>
            {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Cards móvil */}
      <div className="mob-only">
        {loading ? <div style={{ padding:'20px', textAlign:'center', color:'#524438', fontSize:'12px' }}>Cargando...</div>
        : filtrados.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#524438', fontSize:'12px' }}>Sin resultados</div>
        : filtrados.map(c=>(
          <div key={c.id} className="card card-sm" style={{ marginBottom:'8px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
              <div style={{ flex:1, minWidth:0, marginRight:'8px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#f0ebe0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</div>
                <div style={{ fontSize:'11px', color:'#524438', marginTop:'1px' }}>{c.telefono||'Sin teléfono'}</div>
              </div>
              <span className={`badge ${activo(c)?'badge-green':'badge-red'}`}>{activo(c)?'Activo':'Inactivo'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'#9a8668' }}>{(c.promotor as any)?.nombre||'—'}</span>
              <div style={{ display:'flex', gap:'5px' }}>
                <button className="btn-ghost" style={{ padding:'4px 9px', fontSize:'11px' }}
                  onClick={()=>{setSelected(c);setForm({nombre:c.nombre,telefono1:c.telefono||'',telefono2:c.telefono2||'',asignado_a:c.promotor_id||''}); setModal('editar')}}>Editar</button>
                <button className="btn-danger" style={{ padding:'4px 9px', fontSize:'11px' }}
                  onClick={async()=>{if(!confirm('¿Papelera?'))return; await supabase.from('clientes').update({deleted_at:new Date().toISOString(),activo:false}).eq('id',c.id)}}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla desktop */}
      <div className="desk-only card" style={{ overflow:'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{['#','Nombre','Teléfonos','Asignado','Préstamos','Estado',''].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando...</td></tr>
              : filtrados.length===0 ? <tr><td colSpan={7} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Sin resultados</td></tr>
              : filtrados.map((c,i)=>{
                const a = activo(c)
                const pA = ((c.prestamos as any[])||[]).filter((p:any)=>p.estado==='activo').length
                return (
                  <tr key={c.id} onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,.02)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <td style={{ fontFamily:'monospace', color:'#524438' }}>{String(i+1).padStart(3,'0')}</td>
                    <td style={{ fontWeight:500, color:'#f0ebe0', cursor:'pointer' }} onClick={()=>verCliente(c)}>
                      <span style={{ color:'#e2c27d', textDecoration:'underline dotted' }}>{c.nombre}</span>
                    </td>
                    <td><div style={{ fontFamily:'monospace', color:'#9a8668' }}>{c.telefono||'—'}</div>{c.telefono2&&<div style={{ fontFamily:'monospace', fontSize:'10px', color:'#524438' }}>{c.telefono2}</div>}</td>
                    <td><div style={{ color:'#9a8668' }}>{(c.promotor as any)?.nombre||'—'}</div><div style={{ fontSize:'10px', color:'#524438' }}>{ROL_ES[(c.promotor as any)?.rol]||''}</div></td>
                    <td style={{ fontFamily:'monospace', color:pA>0?'#4caf82':'#524438' }}>{pA} activo{pA!==1?'s':''}</td>
                    <td><span className={`badge ${a?'badge-green':'badge-red'}`}><span style={{ width:'4px', height:'4px', borderRadius:'50%', background:a?'#4caf82':'#c0534e' }}/>{a?'Activo':'Inactivo'}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        <button className="btn-ghost" style={{ padding:'4px 8px', fontSize:'11px', color:'#e2c27d', borderColor:'rgba(226,194,125,.3)' }} onClick={()=>verCliente(c)}>📊 Estado</button>
                        <button className="btn-ghost" style={{ padding:'4px 8px', fontSize:'11px' }} onClick={()=>{setSelected(c);setForm({nombre:c.nombre,telefono1:c.telefono||'',telefono2:c.telefono2||'',asignado_a:c.promotor_id||''}); setModal('editar')}}>✏️</button>
                        <button className="btn-danger" style={{ padding:'4px 8px', fontSize:'11px' }} onClick={async()=>{if(!confirm('¿Papelera?'))return; await supabase.from('clientes').update({deleted_at:new Date().toISOString(),activo:false}).eq('id',c.id)}}>🗑</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ESTADO DE CUENTA */}
      {modal==='ver' && selected && (()=>{
        const presActivos = clientePrestamos.filter(p=>['activo','mora'].includes(p.estado))
        const saldoTotal = presActivos.reduce((s:number,p:any)=>s+(p.saldo_capital||0),0)
        const enGracia = (p:any) => {
        if (!p?.fecha_desembolso) return false
        const gracia = (p.agencia as any)?.periodo_gracia_dias || 0
        if (!gracia) return false
        const fin = new Date(p.fecha_desembolso)
        fin.setDate(fin.getDate() + gracia)
        return new Date() < fin
      }
      const interTotal = presActivos.reduce((s:number,p:any)=>s+(enGracia(p)?0:(p.interes_acumulado>0?p.interes_acumulado:(p.saldo_capital||0)*((p.tasa_interes||10)/100))),0)
        const moraTotal  = presActivos.reduce((s:number,p:any)=>s+(p.interes_mora||0),0)
        const comTotal   = presActivos.reduce((s:number,p:any)=>{
          if (enGracia(p)) return s
          const porc=p.comision_porcentaje||0
          const comVig = porc>0?(p.saldo_capital||0)*(porc/100):(p.comision_promotor||0)
          const comMor = p.comision_mora||0
          return s+comVig+comMor
        },0)
        const totalCancelar = saldoTotal+interTotal+moraTotal  // comisión es interna
        return (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box" style={{ maxWidth:'640px' }}>
            {/* Encabezado */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px', paddingBottom:'12px', borderBottom:'1px solid #1e1e1e' }}>
              <div>
                <div style={{ fontSize:'17px', fontWeight:'700', color:'#e2c27d' }}>📊 Estado de Cuenta</div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#f0ebe0', marginTop:'2px' }}>{selected.nombre}</div>
                <div style={{ fontSize:'11px', color:'#9a8668', marginTop:'1px' }}>
                  {selected.telefono||'Sin teléfono'} · {(selected.promotor as any)?.nombre||'—'}
                </div>
              </div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'28px', height:'28px', borderRadius:'6px', flexShrink:0 }}>✕</button>
            </div>

            {loadingPres ? <div style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando...</div> : (<>

            {/* Resumen de balance */}
            <div style={{ background:'linear-gradient(135deg,#1a1a1a,#141414)', border:'1px solid #252525', borderRadius:'12px', padding:'14px', marginBottom:'14px' }}>
              <div style={{ fontSize:'9px', fontWeight:700, color:'#524438', textTransform:'uppercase', letterSpacing:'1.2px', marginBottom:'10px' }}>Balance total</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'10px' }}>
                {[
                  { l:'Saldo capital',    v:`$${saldoTotal.toFixed(2)}`,     c:'#e2c27d' },
                  { l:'Intereses período',v:`$${interTotal.toFixed(2)}`,     c:'#4caf82' },
                  { l:'Mora',             v:`$${moraTotal.toFixed(2)}`,      c:moraTotal>0?'#c0534e':'#524438' },
                ].map(m=>(
                  <div key={m.l} style={{ background:'#111', borderRadius:'8px', padding:'9px 11px' }}>
                    <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:'3px' }}>{m.l}</div>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:m.c, fontFamily:'monospace' }}>{m.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:'rgba(201,168,76,.08)', border:'1px solid rgba(201,168,76,.2)', borderRadius:'8px', padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'11px', color:'#9a8668', fontWeight:600 }}>TOTAL A CANCELAR</span>
                <span style={{ fontSize:'20px', fontWeight:'800', color:'#c9a84c', fontFamily:'monospace', letterSpacing:'-1px' }}>${totalCancelar.toFixed(2)}</span>
              </div>
            </div>

            {/* Préstamos activos */}
            {presActivos.length > 0 && (
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#524438', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>Préstamos activos ({presActivos.length})</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {presActivos.map((p:any)=>{
                    const cfg = ESTADO_PRES[p.estado]||ESTADO_PRES.cancelado
                    const pct = p.monto_original>0?((p.monto_original-p.saldo_capital)/p.monto_original*100):0
                    return (
                      <div key={p.id} style={{ background:'#141414', border:`1px solid ${cfg.color}22`, borderLeft:`3px solid ${cfg.color}`, borderRadius:'9px', padding:'10px 12px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                          <div style={{ fontSize:'15px', fontWeight:'700', color:'#e2c27d', fontFamily:'monospace' }}>${fmtM(p.saldo_capital, agencia?.moneda_principal)} <span style={{ fontSize:'10px', color:'#524438' }}>saldo</span></div>
                          <span style={{ fontSize:'9px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', color:cfg.color, background:`${cfg.color}15` }}>{cfg.label}</span>
                        </div>
                        <div style={{ display:'flex', gap:'12px', fontSize:'10px', color:'#524438', marginBottom:'6px' }}>
                          <span>Tasa: <strong style={{ color:'#9a8668' }}>{((p.tasa_interes||10)+(p.comision_porcentaje||0)).toFixed(1)}%</strong></span>
                          <span>Período: <strong style={{ color:'#9a8668' }}>{PER_L[String(p.periodicidad_dias)]||p.periodicidad_dias+'d'}</strong></span>
                          <span>Desembolsado: <strong style={{ color:'#9a8668' }}>{p.fecha_desembolso?new Date(p.fecha_desembolso).toLocaleDateString('es-PA'):'—'}</strong></span>
                        </div>
                        <div style={{ background:'#1e1e1e', borderRadius:'4px', height:'4px', overflow:'hidden' }}>
                          <div style={{ height:'4px', width:`${Math.min(100,pct)}%`, background:p.estado==='mora'?'#c0534e':'#4caf82', borderRadius:'4px' }}/>
                        </div>
                        <div style={{ fontSize:'9px', color:'#524438', marginTop:'3px', textAlign:'right' }}>{pct.toFixed(0)}% pagado de ${fmtM(p.monto_original, agencia?.moneda_principal)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Movimientos / pagos */}
            <div>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#524438', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>
                Movimientos ({clientePagos.length})
              </div>
              {clientePagos.length === 0 ? (
                <div style={{ padding:'16px', textAlign:'center', color:'#524438', background:'#141414', borderRadius:'8px', fontSize:'12px' }}>Sin pagos registrados</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'4px', maxHeight:'220px', overflowY:'auto' }}>
                  {clientePagos.map((pg:any)=>{
                    const esDesembolso = pg.tipo==='desembolso'
                    const color = esDesembolso ? '#5a8fc0' : (pg.estado==='conciliado'?'#4caf82':'#c09a4c')
                    const fecha = pg.fecha_pago ? new Date(pg.fecha_pago+'T12:00:00').toLocaleDateString('es-PA') : new Date(pg.created_at).toLocaleDateString('es-PA')
                    return (
                    <div key={pg.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'#141414', borderRadius:'7px', borderLeft:`3px solid ${color}` }}>
                      <div>
                        <div style={{ fontSize:'11px', color:'#f0ebe0', fontWeight:500, display:'flex', alignItems:'center', gap:'5px' }}>
                          <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 5px', borderRadius:'4px', color, background:`${color}18` }}>
                            {esDesembolso ? '💸 DESEMBOLSO' : '💰 PAGO'}
                          </span>
                          {fecha}
                          {pg.metodo_pago && <span style={{ fontSize:'9px', color:'#524438' }}>{pg.metodo_pago}</span>}
                        </div>
                        {!esDesembolso && (
                          <div style={{ fontSize:'9px', color:'#524438', marginTop:'2px' }}>
                            Capital: ${(pg.monto_capital||0).toFixed(2)} · Int: ${(pg.monto_interes||0).toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontFamily:'monospace', fontWeight:'700', fontSize:'13px', color }}>
                          {esDesembolso ? '-' : '+'}${(pg.monto_total||0).toFixed(2)}
                        </div>
                        <div style={{ fontSize:'9px', color:'#524438' }}>
                          {esDesembolso ? '✓ Desembolsado' : (pg.estado==='conciliado'?'✓ Conciliado':'⏳ Pendiente')}
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'8px', marginTop:'14px', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap' }}>
              <button
                onClick={()=>{
                  const nombre = selected.nombre
                  const tel = selected.telefono||''
                  const promotor = (selected.promotor as any)?.nombre||''
                  const lineas = clientePagos.map((pg:any)=>{
                    const esD = pg.tipo==='desembolso'
                    const fecha = pg.fecha_pago ? new Date(pg.fecha_pago+'T12:00:00').toLocaleDateString('es-PA') : new Date(pg.created_at).toLocaleDateString('es-PA')
                    return `<tr style="border-bottom:1px solid #eee"><td style="padding:6px 8px">${esD?'💸 Desembolso':'💰 Pago'}</td><td style="padding:6px 8px">${fecha}</td><td style="padding:6px 8px">${pg.metodo_pago||'—'}</td><td style="padding:6px 8px;text-align:right;color:${esD?'#c0534e':'#166534'}">${esD?'-':'+'}$${(pg.monto_total||0).toFixed(2)}</td><td style="padding:6px 8px">${esD?'Desembolsado':(pg.estado==='conciliado'?'Conciliado':'Pendiente')}</td></tr>`
                  }).join('')
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Estado de Cuenta — ${nombre}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;color:#555;font-weight:normal;margin:0 0 20px}.balance{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}.bal-card{background:#f5f5f5;border-radius:8px;padding:12px}.bal-label{font-size:10px;text-transform:uppercase;color:#666;margin-bottom:4px}.bal-val{font-size:18px;font-weight:bold}.total{background:#1a1a2e;color:white;border-radius:8px;padding:14px;display:flex;justify-content:space-between;align-items:center;margin:12px 0}.table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f5f5f5;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555}@media print{body{padding:16px}}</style></head><body><h1>📊 Estado de Cuenta</h1><h2>${nombre} · ${tel} · Promotor: ${promotor}</h2><hr/><div class="balance"><div class="bal-card"><div class="bal-label">Saldo Capital</div><div class="bal-val">$${saldoTotal.toFixed(2)}</div></div><div class="bal-card"><div class="bal-label">Intereses</div><div class="bal-val">$${interTotal.toFixed(2)}</div></div><div class="bal-card"><div class="bal-label">Mora</div><div class="bal-val" style="color:${moraTotal>0?'#dc2626':'#111'}">$${moraTotal.toFixed(2)}</div></div></div><div class="total"><span style="font-weight:bold">TOTAL A CANCELAR</span><span style="font-size:22px;font-weight:bold">$${totalCancelar.toFixed(2)}</span></div><h3 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;color:#555">Movimientos (${clientePagos.length})</h3><table class="table"><thead><tr><th>Tipo</th><th>Fecha</th><th>Método</th><th style="text-align:right">Monto</th><th>Estado</th></tr></thead><tbody>${lineas}</tbody></table><p style="margin-top:24px;font-size:11px;color:#999">Generado: ${new Date().toFixed(2)} · APP — Administrador de Préstamos Personales</p></body></html>`
                  const win = window.open('','_blank')
                  if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
                }}
                style={{ background:'rgba(90,143,192,.1)', border:'1px solid rgba(90,143,192,.25)', color:'#5a8fc0', borderRadius:'8px', padding:'8px 14px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
                📄 Descargar PDF
              </button>
              <div style={{ display:'flex', gap:'8px' }}>
                <button className="btn-ghost" onClick={()=>{setSelected(selected);setForm({nombre:selected.nombre,telefono1:selected.telefono||'',telefono2:selected.telefono2||'',asignado_a:selected.promotor_id||''});setModal('editar')}}>✏️ Editar</button>
                <button className="btn-ghost" onClick={()=>setModal(null)}>Cerrar</button>
              </div>
            </div>
            </>)}
          </div>
        </div>
        )
      })()}

      {modal && modal !== 'ver' && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>{modal==='nuevo'?'+ Nuevo Cliente':'Editar Cliente'}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div><label className="f-lbl">Nombre completo *</label><input className="f-inp" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre y apellidos" /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label className="f-lbl">Teléfono principal</label><input className="f-inp" value={form.telefono1} onChange={e=>setForm(f=>({...f,telefono1:e.target.value}))} placeholder="6000-0000" /></div>
                <div><label className="f-lbl">Tel. alternativo</label><input className="f-inp" value={form.telefono2} onChange={e=>setForm(f=>({...f,telefono2:e.target.value}))} placeholder="Opcional" /></div>
              </div>
              <div>
                <label className="f-lbl">Asignar a</label>
                <select className="f-sel" value={form.asignado_a} onChange={e=>setForm(f=>({...f,asignado_a:e.target.value}))}>
                  <option value="">Mi usuario</option>
                  {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombre} — {ROL_ES[u.rol]||u.rol}</option>)}
                </select>
              </div>
            </div>
            <div className="alert-info" style={{ marginBottom:'12px' }}>ℹ El cliente se activa automáticamente al desembolsar un préstamo.</div>
            {error && <div className="alert-error" style={{ marginBottom:'12px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={guardar} disabled={saving}>{saving?'Guardando...':modal==='nuevo'?'Crear':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
