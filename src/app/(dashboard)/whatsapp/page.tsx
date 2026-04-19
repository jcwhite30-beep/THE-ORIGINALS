'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MensajeriaPage() {
  const supabase = createClient()
  const [plantillas, setPlantillas] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [agencias, setAgencias] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [plantillaActiva, setPlantillaActiva] = useState<any>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [todos, setTodos] = useState(false)
  const [filtroAgencia, setFiltroAgencia] = useState('all')
  const [filtroRol, setFiltroRol] = useState('all')
  const [filtroUsuario, setFiltroUsuario] = useState('all')
  const [modal, setModal] = useState<'nuevo'|'editar'|null>(null)
  const [saving, setSaving] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState({ nombre:'', categoria:'recordatorio', mensaje:'' })
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('*, agencia:agencias(nombre)').eq('id', session.user.id).single()
        .then(({ data: p }) => { setPerfil(p); loadAll(p) })
    })
  }, [])

  async function loadAll(p: any) {
    setLoading(true)
    const { data: pl } = await supabase.from('plantillas_whatsapp').select('*').eq('activa', true).order('created_at')
    setPlantillas(pl||[])
    if (pl && pl.length > 0 && !plantillaActiva) setPlantillaActiva(pl[0])

    if (p.rol === 'superadmin') {
      const { data: ags } = await supabase.from('agencias').select('id,nombre').order('nombre')
      setAgencias(ags||[])
    }
    const { data: usu } = await supabase.from('usuarios').select('id,nombre,rol').eq('agencia_id', p.agencia_id).eq('activo', true).order('nombre')
    setUsuarios(usu||[])

    let q = supabase.from('clientes').select('id,nombre,telefono,activo,promotor_id,agencia_id,promotor:usuarios(nombre,rol)').is('deleted_at', null).eq('activo', true)
    if (p.rol === 'promotor') q = q.eq('promotor_id', p.id)
    else q = q.eq('agencia_id', p.agencia_id)
    const { data: cl } = await q.order('nombre')

    // Cargar préstamos activos para tener datos financieros de cada cliente
    let qp = supabase.from('prestamos')
      .select('cliente_id,saldo_capital,tasa_interes,comision_porcentaje,comision_promotor,interes_acumulado,interes_mora,fecha_proximo_pago,periodicidad_dias,estado')
      .in('estado', ['activo','mora'])
    if (p.rol === 'promotor') qp = qp.eq('promotor_id', p.id)
    else qp = qp.eq('agencia_id', p.agencia_id)
    const { data: pres } = await qp

    // Enriquecer clientes con datos del préstamo
    const presMap: Record<string, any> = {}
    for (const pr of (pres||[])) {
      const cid = pr.cliente_id
      if (!presMap[cid]) presMap[cid] = { saldo:0, interes:0, mora:0, comision:0, fecha_corte:'' }
      presMap[cid].saldo    += pr.saldo_capital||0
      presMap[cid].interes  += pr.interes_acumulado>0 ? pr.interes_acumulado : (pr.saldo_capital||0)*((pr.tasa_interes||10)/100)
      presMap[cid].mora     += pr.interes_mora||0
      const porc = pr.comision_porcentaje||0
      presMap[cid].comision += porc>0 ? (pr.saldo_capital||0)*(porc/100) : (pr.comision_promotor||0)
      if (pr.fecha_proximo_pago) presMap[cid].fecha_corte = new Date(pr.fecha_proximo_pago).toLocaleDateString('es-PA')
    }

    const clEnriquecidos = (cl||[]).map((c:any) => ({
      ...c,
      _pres: presMap[c.id] || { saldo:0, interes:0, mora:0, comision:0, fecha_corte:'' }
    }))
    setClientes(clEnriquecidos)
    setLoading(false)
  }

  async function guardarPlantilla() {
    if (!form.nombre.trim() || !form.mensaje.trim()) { setError('Nombre y mensaje son obligatorios'); return }
    setSaving(true); setError('')
    if (modal === 'nuevo') {
      await supabase.from('plantillas_whatsapp').insert({ nombre:form.nombre, categoria:form.categoria, mensaje:form.mensaje, activa:true })
    } else if (plantillaActiva) {
      await supabase.from('plantillas_whatsapp').update({ nombre:form.nombre, categoria:form.categoria, mensaje:form.mensaje, updated_at:new Date().toISOString() }).eq('id', plantillaActiva.id)
    }
    setModal(null); setSaving(false)
    const { data: pl } = await supabase.from('plantillas_whatsapp').select('*').eq('activa', true).order('created_at')
    setPlantillas(pl||[])
    // Seleccionar la plantilla recién creada/editada automáticamente
    if (pl && pl.length > 0) {
      const reciente = modal === 'nuevo' 
        ? pl[pl.length - 1]  // la más nueva
        : pl.find((p:any) => p.nombre === form.nombre) || pl[0]
      setPlantillaActiva(reciente)
    }
  }

  async function eliminarPlantilla(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await supabase.from('plantillas_whatsapp').update({ activa:false }).eq('id', id)
    const { data: pl } = await supabase.from('plantillas_whatsapp').select('*').eq('activa', true).order('created_at')
    setPlantillas(pl||[])
    if (plantillaActiva?.id === id) setPlantillaActiva(pl?.[0]||null)
  }

  function buildMensaje(c: any, extra?: Record<string,string>) {
    if (!plantillaActiva) return ''
    const cap     = parseFloat(extra?.capital||'0')
    const intVig  = parseFloat(extra?.intereses||'0')
    const mora    = parseFloat(extra?.mora||'0')
    const comis   = parseFloat(extra?.comision||'0')
    const cMora   = parseFloat(extra?.comision_mora||'0')
    // Lo que el cliente ve como "intereses" = intereses vigentes + mora + comisión + comisión mora
    // El cliente no sabe que parte es comisión — lo pactó como tasa total con el promotor
    const interesesCliente = (intVig + mora + comis + cMora).toFixed(2)
    const totalCliente     = (cap + intVig + mora + comis + cMora).toFixed(2)
    const vars: Record<string,string> = {
      nombre:      c.nombre || '',
      cliente:     c.nombre || '',    // alias de {nombre}
      capital:     cap.toFixed(2),
      intereses:   interesesCliente,  // int+mora+comision todo junto (el cliente no ve la comisión)
      total:       totalCliente,       // capital + intereses (total completo)
      total_pagar: totalCliente,       // alias de {total}
      monto:       extra?.monto || cap.toFixed(2),
      fecha:       extra?.fecha || new Date().toLocaleDateString('es-PA'),
      fecha_corte: extra?.fecha_corte || new Date().toLocaleDateString('es-PA'),
      dias:        extra?.dias || '0',
      agencia:     perfil?.agencia?.nombre || 'APP',
    }
    // Normalizar plantilla: {{var}} → {var} y {cliente} → {nombre}
    const msgNorm = plantillaActiva.mensaje
      .replace(/\{\{([^}]+)\}\}/g, (_, v) => '{' + v + '}')
      .replace(/\{cliente\}/g, '{nombre}')  // alias común
    return Object.entries(vars).reduce(
      (msg, [k, v]) => msg.replace(new RegExp('\\{' + k + '\\}', 'g'), v),
      msgNorm
    )
  }

  function toggleCliente(id: string) {
    setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  }

  function toggleTodos() {
    if (todos) { setSelected(new Set()); setTodos(false) }
    else { setSelected(new Set(filtradosCli.map((c:any)=>c.id))); setTodos(true) }
  }

  async function enviarMasivo() {
    if (selected.size===0||!plantillaActiva) return
    setEnviando(true)
    const sel = filtradosCli.filter((c:any)=>selected.has(c.id))
    for (const c of sel) {
      if (!c.telefono) continue
      const tel = c.telefono.replace(/\D/g,'')
      const num = tel.startsWith('507')?tel:`507${tel}`
      const pr = c._pres||{}
      const extra = {
        capital:     (pr.saldo||0).toFixed(2),
        intereses:   (pr.interes||0).toFixed(2),
        mora:        (pr.mora||0).toFixed(2),
        comision:    (pr.comision||0).toFixed(2),
        comision_mora:'0',
        monto:       (pr.saldo||0).toFixed(2),
        fecha_corte: pr.fecha_corte || new Date().toLocaleDateString('es-PA'),
      }
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(buildMensaje(c, extra))}`, 'wa_app')
      await new Promise(r=>setTimeout(r,700))
    }
    setEnviando(false)
  }

  const filtradosCli = clientes.filter(c =>
    (filtroAgencia==='all'||c.agencia_id===filtroAgencia) &&
    (filtroUsuario==='all'||c.promotor_id===filtroUsuario) &&
    (filtroRol==='all'||(c.promotor as any)?.rol===filtroRol)
  )

  const CATS: Record<string,string> = { recordatorio:'🔔', mora:'⚠️', aprobacion:'✅', desembolso:'💸', pago:'💰', bienvenida:'👋' }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Mensajería WhatsApp</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>Plantillas personalizadas y envío masivo</p>
        </div>
        <button className="btn-gold" onClick={()=>{setForm({nombre:'',categoria:'recordatorio',mensaje:''}); setError(''); setModal('nuevo')}}>+ Nueva Plantilla</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'14px' }}>
        {/* Columna izquierda - plantillas */}
        <div>
          <div style={{ fontSize:'10px', fontWeight:'600', color:'#524438', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Plantillas disponibles</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'14px' }}>
            {loading ? <div style={{ color:'#524438', fontSize:'12px' }}>Cargando...</div>
            : plantillas.map(p=>(
              <div key={p.id} onClick={()=>setPlantillaActiva(p)}
                style={{ background:plantillaActiva?.id===p.id?'rgba(201,168,76,.09)':'#141414', border:`1px solid ${plantillaActiva?.id===p.id?'rgba(201,168,76,.3)':'#252525'}`, borderRadius:'10px', padding:'12px', cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'4px' }}>
                  <div style={{ fontWeight:600, color:plantillaActiva?.id===p.id?'#e2c27d':'#f0ebe0', fontSize:'13px' }}>
                    {CATS[p.categoria]||'📝'} {p.nombre}
                  </div>
                  <div style={{ display:'flex', gap:'4px' }}>
                    <button onClick={e=>{e.stopPropagation();setForm({nombre:p.nombre,categoria:p.categoria,mensaje:p.mensaje});setPlantillaActiva(p);setModal('editar')}}
                      style={{ background:'none', border:'none', color:'#9a8668', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                    <button onClick={e=>{e.stopPropagation();eliminarPlantilla(p.id)}}
                      style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'13px' }}>🗑</button>
                  </div>
                </div>
                <div style={{ fontSize:'11px', color:'#524438', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.mensaje.substring(0,60)}...</div>
              </div>
            ))}
          </div>

          {/* Preview */}
          {plantillaActiva && (
            <div className="card card-sm" style={{ marginBottom:'14px' }}>
              <div style={{ fontSize:'10px', color:'#524438', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Vista previa</div>
              <div style={{ background:'#1e3a2a', borderRadius:'8px 8px 8px 2px', padding:'10px 12px' }}>
                <div style={{ fontSize:'12px', color:'#f0ebe0', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                  {plantillaActiva.mensaje
                    .replace(/{nombre}/g,'Juan García')
                    .replace(/{capital}/g,'500.00')
                    .replace(/{intereses}/g,'50.00')
                    .replace(/{mora}/g,'25.00')
                    .replace(/{total}/g,'562.50')  // capital 500 + intereses 62.50
                    .replace(/{monto}/g,'500.00')
                    .replace(/{fecha}/g, new Date().toLocaleDateString('es-PA'))
                    .replace(/{fecha_corte}/g, new Date().toLocaleDateString('es-PA'))
                    .replace(/{dias}/g,'5')
                    .replace(/{agencia}/g, perfil?.agencia?.nombre||'APP')
                    .split('*').map((part:string,i:number)=>i%2===0?part:<strong key={i}>{part}</strong>)}
                </div>
              </div>
              <div style={{ fontSize:'10px', color:'#524438', marginTop:'6px', lineHeight:1.8 }}>
                <strong style={{ color:'#9a8668' }}>Variables disponibles:</strong><br/>
                <span style={{ fontFamily:'monospace', color:'#c09a4c' }}>
                  {'{nombre}'} {'{capital}'} {'{intereses}'} {'{total}'} {'{monto}'} {'{fecha}'} {'{fecha_corte}'} {'{dias}'} {'{agencia}'}
                </span><br/>
                <span style={{ color:'#524438', fontSize:'9px', lineHeight:1.5, display:'block', marginTop:'3px' }}>
                  ℹ️ <strong style={{ color:'#9a8668' }}>{'{intereses}'}</strong> = int.período + mora + comisión (el cliente no sabe que hay comisión)<br/>
                  ℹ️ <strong style={{ color:'#9a8668' }}>{'{total}'}</strong> = {'{capital}'} + {'{intereses}'} — Total a pagar<br/>
                  ℹ️ <strong style={{ color:'#9a8668' }}>{'{cliente}'}</strong> es alias de {'{nombre}'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha - clientes */}
        <div>
          {/* Filtros */}
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'8px' }}>
            {perfil?.rol==='superadmin' && (
              <select value={filtroAgencia} onChange={e=>setFiltroAgencia(e.target.value)}
                style={{ background:'#141414', border:'1px solid #252525', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none' }}>
                <option value="all">Todas las agencias</option>
                {agencias.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            )}
            <select value={filtroRol} onChange={e=>{setFiltroRol(e.target.value);setFiltroUsuario('all')}}
              style={{ background:'#141414', border:'1px solid #252525', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none' }}>
              <option value="all">Todos los roles</option>
              <option value="promotor">Promotores</option>
              <option value="gerente">Gerentes</option>
            </select>
            <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
              style={{ background:'#141414', border:'1px solid #252525', borderRadius:'7px', padding:'6px 9px', color:'#f0ebe0', fontSize:'11px', outline:'none', flex:1, minWidth:'120px' }}>
              <option value="all">Todos</option>
              {usuarios.filter(u=>filtroRol==='all'||u.rol===filtroRol).map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>

          {/* Header lista */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #1e1e1e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }} onClick={toggleTodos}>
                <div style={{ width:'16px', height:'16px', borderRadius:'4px', border:todos?'none':'1.5px solid #3a3a3a', background:todos?'linear-gradient(135deg,#c9a84c,#e2c27d)':'#191919', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {todos&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 6L8 1" stroke="#0c0c0c" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                </div>
                <span style={{ fontSize:'12px', color:'#9a8668' }}>{selected.size>0?`${selected.size} seleccionados`:`${filtradosCli.length} clientes activos`}</span>
              </label>
              <button onClick={enviarMasivo} disabled={enviando||selected.size===0||!plantillaActiva}
                style={{ background:selected.size>0&&!enviando?'rgba(37,211,102,.1)':'#1a1a1a', color:selected.size>0&&!enviando?'#25d366':'#524438', border:`1px solid ${selected.size>0&&!enviando?'rgba(37,211,102,.3)':'#252525'}`, borderRadius:'7px', padding:'6px 12px', fontSize:'11px', fontWeight:600, cursor:selected.size>0?'pointer':'not-allowed', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                {enviando?'Enviando...':`💬 Enviar (${selected.size})`}
              </button>
            </div>
            <div style={{ maxHeight:'320px', overflowY:'auto' }}>
              {filtradosCli.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#524438', fontSize:'12px' }}>Sin clientes activos</div>
              : filtradosCli.map((c:any)=>{
                const chk = selected.has(c.id)
                return (
                  <div key={c.id} onClick={()=>toggleCliente(c.id)}
                    style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px', borderBottom:'1px solid #1c1c1c', cursor:'pointer', background:chk?'rgba(201,168,76,.04)':'transparent' }}>
                    <div style={{ width:'15px', height:'15px', borderRadius:'4px', border:chk?'none':'1.5px solid #3a3a3a', background:chk?'linear-gradient(135deg,#c9a84c,#e2c27d)':'#191919', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {chk&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 6L8 1" stroke="#0c0c0c" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'12px', fontWeight:500, color:'#f0ebe0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</div>
                      <div style={{ fontSize:'10px', color:'#524438', fontFamily:'monospace' }}>{c.telefono||'Sin teléfono'} · {(c.promotor as any)?.nombre||'—'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal plantilla */}
      {modal && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>{modal==='nuevo'?'+ Nueva Plantilla':'✏️ Editar Plantilla'}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label className="f-lbl">Nombre *</label><input className="f-inp" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre de la plantilla" /></div>
                <div>
                  <label className="f-lbl">Categoría</label>
                  <select className="f-sel" value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>
                    <option value="recordatorio">🔔 Recordatorio</option>
                    <option value="mora">⚠️ Mora</option>
                    <option value="aprobacion">✅ Aprobación</option>
                    <option value="desembolso">💸 Desembolso</option>
                    <option value="pago">💰 Pago recibido</option>
                    <option value="bienvenida">👋 Bienvenida</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="f-lbl">Mensaje * <span style={{ color:'#524438', fontWeight:400 }}>— Variables: {'{nombre}'} {'{monto}'} {'{fecha}'} {'{dias}'}</span></label>
                <textarea className="f-inp" style={{ height:'130px', resize:'vertical' }} value={form.mensaje} onChange={e=>setForm(f=>({...f,mensaje:e.target.value}))} placeholder="Estimado/a {nombre}, su cuota: capital *${capital}* + intereses *${intereses}* = Total *${total}*..." />
              </div>
            </div>
            {error && <div className="alert-error" style={{ marginBottom:'10px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={guardarPlantilla} disabled={saving}>{saving?'Guardando...':modal==='nuevo'?'Crear':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
