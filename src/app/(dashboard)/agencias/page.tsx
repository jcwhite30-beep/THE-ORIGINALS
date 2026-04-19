'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS_BASE = ['Efectivo','Yappy','Nequi','Transferencia','ACH','Cheque']
const MONEDAS_LISTA = [
  { v:'USD', l:'USD — Dólar Americano' },{ v:'PAB', l:'PAB — Balboa Panameño' },
  { v:'COP', l:'COP — Peso Colombiano' },{ v:'EUR', l:'EUR — Euro' },
  { v:'MXN', l:'MXN — Peso Mexicano' },{ v:'BRL', l:'BRL — Real Brasileño' },
  { v:'ARS', l:'ARS — Peso Argentino' },{ v:'CLP', l:'CLP — Peso Chileno' },
  { v:'PEN', l:'PEN — Sol Peruano' },{ v:'CRC', l:'CRC — Colón' },
  { v:'GTQ', l:'GTQ — Quetzal' },{ v:'HNL', l:'HNL — Lempira' },
  { v:'DOP', l:'DOP — Peso Dominicano' },{ v:'VES', l:'VES — Bolívar' },
  { v:'GBP', l:'GBP — Libra Esterlina' },{ v:'CAD', l:'CAD — Dólar Canadiense' },
  { v:'USDT', l:'USDT — Tether' },{ v:'BTC', l:'BTC — Bitcoin' },
]
const PER_LABEL: Record<string,string> = { '1':'Diaria','7':'Semanal','15':'Quincenal','30':'Mensual' }

export default function AgenciasPage() {
  const supabase = createClient()
  const [agencias, setAgencias] = useState<any[]>([])
  const [calendarios, setCalendarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'nuevo'|'editar'|null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [form, setForm] = useState({
    nombre:'', ciudad:'Ciudad de Panamá', pais:'Panamá',
    periodo_gracia_dias:'3', dias_gracia_mora:'3', tasa_interes_default:'10',
    monedas:['USD'] as string[],
    tipos_desembolso:['Efectivo','Yappy','Nequi','Transferencia','ACH'] as string[],
    calendario_id:''
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id').eq('id', session.user.id).single()
        .then(({ data: p }) => { setPerfil(p); load() })
    })
  }, [])

  async function load() {
    setLoading(true)
    const { data: a } = await supabase.from('agencias').select('*').order('created_at')
    setAgencias(a||[])
    const { data: c } = await supabase.from('calendarios').select('*').order('nombre')
    setCalendarios(c||[])
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ nombre:'', ciudad:'Ciudad de Panamá', pais:'Panamá', periodo_gracia_dias:'3', dias_gracia_mora:'3', monedas:['USD'], tipos_desembolso:['Efectivo','Yappy','Nequi','Transferencia','ACH'], calendario_id:'' })
    setError(''); setSelected(null); setModal('nuevo')
  }

  function abrirEditar(a: any) {
    setSelected(a)
    setForm({
      nombre: a.nombre||'',
      ciudad: a.ciudad||'Ciudad de Panamá',
      pais: a.pais||'Panamá',
      periodo_gracia_dias: String(a.periodo_gracia_dias ?? 0),
      dias_gracia_mora: String(a.dias_gracia_mora ?? 0),
      tasa_interes_default: String(a.tasa_interes_default||10),
      monedas: Array.isArray(a.monedas) && a.monedas.length>0 ? a.monedas : ['USD'],
      tipos_desembolso: Array.isArray(a.tipos_desembolso) && a.tipos_desembolso.length>0 ? a.tipos_desembolso : ['Efectivo'],
      calendario_id: a.calendario_id||''
    })
    setError(''); setModal('editar')
  }

  async function eliminar(a: any) {
    if (perfil?.rol !== 'superadmin') { alert('Solo SuperAdmin puede eliminar'); return }
    const { data: p } = await supabase.from('prestamos').select('id').eq('agencia_id', a.id).gt('saldo_capital', 0).limit(1)
    if (p && p.length > 0) { alert('No se puede eliminar: hay préstamos con saldo > $0'); return }
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return
    await supabase.from('agencias').delete().eq('id', a.id)
    load()
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre: form.nombre.trim(),
      ciudad: form.ciudad,
      pais: form.pais,
      periodo_gracia_dias: parseInt(form.periodo_gracia_dias)||0,
      dias_gracia_mora: parseInt(form.dias_gracia_mora)||0,
      tasa_interes_default: parseFloat(form.tasa_interes_default)||10,
      monedas: form.monedas,
      moneda_principal: form.monedas[0]||'USD',
      tipos_desembolso: form.tipos_desembolso,
      calendario_id: form.calendario_id||null,
    }
    let err
    if (modal==='nuevo') {
      const { error: e } = await supabase.from('agencias').insert(payload); err=e
    } else if (selected) {
      // Actualizar sin calendario_id primero (puede fallar si el UUID es inválido)
      const payloadSinCal = { ...payload }
      delete payloadSinCal.calendario_id
      const { error: e1 } = await supabase.from('agencias').update(payloadSinCal).eq('id', selected.id)
      // Actualizar calendario_id por separado si tiene valor
      if (!e1 && payload.calendario_id) {
        await supabase.from('agencias').update({ calendario_id: payload.calendario_id }).eq('id', selected.id)
      }
      err = e1
    }
    if (err) { setError('Error al guardar: ' + err.message); setSaving(false); return }
    setModal(null); setSaving(false)
    await load()
  }

  function toggleTipo(t: string) {
    setForm(f => ({ ...f, tipos_desembolso: f.tipos_desembolso.includes(t) ? f.tipos_desembolso.filter(x=>x!==t) : [...f.tipos_desembolso, t] }))
  }

  function addTipo() {
    if (!nuevoTipo.trim() || form.tipos_desembolso.includes(nuevoTipo.trim())) return
    setForm(f => ({ ...f, tipos_desembolso: [...f.tipos_desembolso, nuevoTipo.trim()] }))
    setNuevoTipo('')
  }

  function addMoneda(m: string) {
    if (!m || form.monedas.includes(m)) return
    setForm(f => ({ ...f, monedas: [...f.monedas, m] }))
  }

  function quitarMoneda(m: string) {
    setForm(f => ({ ...f, monedas: f.monedas.filter(x=>x!==m) }))
  }

  const inp = (extra?: any) => ({ width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'9px', padding:'10px 12px', color:'#f0ebe0', fontSize:'14px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit', ...extra })
  const lbl = { display:'block' as const, fontSize:'9px', fontWeight:'600' as const, color:'#6a5a48', textTransform:'uppercase' as const, letterSpacing:'1.2px', marginBottom:'5px' }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Agencias</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>Solo SuperAdmin puede eliminar agencias</p>
        </div>
        <button className="btn-gold" onClick={abrirNuevo}>+ Nueva Agencia</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'14px' }}>
        {loading ? <div style={{ color:'#524438', fontSize:'13px' }}>Cargando...</div>
        : agencias.length===0 ? <div style={{ color:'#524438', fontSize:'13px' }}>No hay agencias registradas</div>
        : agencias.map(a=>(
          <div key={a.id} className="card card-md">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
              <div>
                <div style={{ fontSize:'15px', fontWeight:'600', color:'#f0ebe0' }}>{a.nombre}</div>
                <div style={{ fontSize:'11px', color:'#9a8668', marginTop:'2px' }}>{a.ciudad||'—'}, {a.pais||'—'}</div>
              </div>
              <div style={{ display:'flex', gap:'5px' }}>
                <button className="btn-ghost" style={{ padding:'4px 9px', fontSize:'11px' }} onClick={()=>abrirEditar(a)}>✏️ Editar</button>
                {perfil?.rol==='superadmin' && <button className="btn-danger" style={{ padding:'4px 8px', fontSize:'11px' }} onClick={()=>eliminar(a)}>🗑</button>}
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom:'10px' }}>
              {[
                { l:'Período de gracia', v:`${a.periodo_gracia_dias ?? 0} días`, d:'Sin interés post-desembolso', c:'#5a8fc0' },
                { l:'Gracia post-pago', v:`${a.dias_gracia_mora||0} días`, d:'Para cancelar capital sin nuevo interés', c:'#c09a4c' },
              ].map(m=>(
                <div key={m.l} style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px' }}>
                  <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>{m.l}</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:m.c }}>{m.v}</div>
                  <div style={{ fontSize:'9px', color:'#524438', marginTop:'2px', lineHeight:1.3 }}>{m.d}</div>
                </div>
              ))}
            </div>

            {/* Monedas - siempre visible */}
            <div style={{ marginBottom:'8px' }}>
              <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'5px' }}>Monedas aceptadas</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                {Array.isArray(a.monedas) && a.monedas.length > 0
                  ? a.monedas.map((m:string)=>(
                    <span key={m} style={{ background:'rgba(201,168,76,.1)', border:'1px solid rgba(201,168,76,.25)', borderRadius:'5px', padding:'3px 9px', fontSize:'12px', fontWeight:'600', color:'#e2c27d', fontFamily:'monospace' }}>{m}</span>
                  ))
                  : <span style={{ fontSize:'11px', color:'#524438' }}>Sin monedas configuradas</span>
                }
              </div>
            </div>

            <div>
              <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'5px' }}>Tipos de desembolso/recaudo</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                {(a.tipos_desembolso||['Efectivo']).map((t:string)=>(
                  <span key={t} style={{ background:'#1a1a1a', border:'1px solid #2c2c2c', borderRadius:'5px', padding:'2px 8px', fontSize:'11px', color:'#9a8668' }}>{t}</span>
                ))}
              </div>
            </div>

            {a.calendario_id && <div style={{ marginTop:'8px', fontSize:'11px', color:'#524438' }}>📅 {calendarios.find(c=>c.id===a.calendario_id)?.nombre||'Calendario asignado'}</div>}
          </div>
        ))}
      </div>

      {/* MODAL */}
      {modal && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box" style={{ maxWidth:'540px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>{modal==='nuevo'?'+ Nueva Agencia':'✏️ Editar Agencia'}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Nombre de la agencia *</label>
                <input style={inp()} value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Panamá Norte" />
              </div>
              <div><label style={lbl}>Ciudad</label><input style={inp()} value={form.ciudad} onChange={e=>setForm(f=>({...f,ciudad:e.target.value}))} /></div>
              <div><label style={lbl}>País</label><input style={inp()} value={form.pais} onChange={e=>setForm(f=>({...f,pais:e.target.value}))} /></div>
              <div>
                <label style={lbl}>Tasa de interés por defecto %</label>
                <input style={inp()} type="number" step="0.5" min="0" value={form.tasa_interes_default||'10'} onChange={e=>setForm(f=>({...f,tasa_interes_default:e.target.value}))} />
                <div style={{ fontSize:'10px', color:'#524438', marginTop:'3px' }}>Tasa con que nacen las solicitudes</div>
              </div>
              <div>
                <label style={lbl}>Período de gracia (días)</label>
                <input style={inp()} type="number" min="0" value={form.periodo_gracia_dias} onChange={e=>setForm(f=>({...f,periodo_gracia_dias:e.target.value}))} />
                <div style={{ fontSize:'10px', color:'#524438', marginTop:'3px' }}>Días post-desembolso sin interés</div>
              </div>
              <div>
                <label style={lbl}>Gracia post-pago (días)</label>
                <input style={inp()} type="number" min="0" value={form.dias_gracia_mora} onChange={e=>setForm(f=>({...f,dias_gracia_mora:e.target.value}))} />
                <div style={{ fontSize:'10px', color:'#524438', marginTop:'3px' }}>Días para cancelar capital sin nuevos intereses</div>
              </div>
            </div>

            {/* Tipos de desembolso */}
            <div style={{ marginBottom:'12px' }}>
              <label style={lbl}>Tipos de desembolso y recaudo</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'7px' }}>
                {TIPOS_BASE.map(t=>(
                  <button key={t} type="button" onClick={()=>toggleTipo(t)}
                    style={{ background:form.tipos_desembolso.includes(t)?'rgba(201,168,76,.12)':'#1a1a1a', border:`1px solid ${form.tipos_desembolso.includes(t)?'rgba(201,168,76,.3)':'#2c2c2c'}`, borderRadius:'6px', padding:'5px 11px', fontSize:'12px', color:form.tipos_desembolso.includes(t)?'#e2c27d':'#9a8668', cursor:'pointer', fontFamily:'inherit' }}>
                    {form.tipos_desembolso.includes(t)?'✓ ':''}{t}
                  </button>
                ))}
              </div>
              {/* Tipos personalizados */}
              {form.tipos_desembolso.filter(t=>!TIPOS_BASE.includes(t)).map(t=>(
                <span key={t} onClick={()=>setForm(f=>({...f,tipos_desembolso:f.tipos_desembolso.filter(x=>x!==t)}))}
                  style={{ display:'inline-flex', alignItems:'center', gap:'4px', background:'rgba(201,168,76,.08)', border:'1px solid rgba(201,168,76,.2)', borderRadius:'5px', padding:'3px 9px', fontSize:'11px', color:'#e2c27d', cursor:'pointer', marginRight:'4px', marginBottom:'4px' }}>
                  {t} ✕
                </span>
              ))}
              <div style={{ display:'flex', gap:'6px', marginTop:'6px' }}>
                <input style={inp({ flex:1 })} placeholder="Agregar otro tipo..." value={nuevoTipo} onChange={e=>setNuevoTipo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTipo()} />
                <button type="button" onClick={addTipo} style={{ background:'#1a1a1a', border:'1px solid #2c2c2c', color:'#9a8668', borderRadius:'8px', padding:'0 12px', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}>+ Agregar</button>
              </div>
            </div>

            {/* Monedas */}
            <div style={{ marginBottom:'12px' }}>
              <label style={lbl}>Monedas aceptadas</label>
              {/* Chips de monedas seleccionadas */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginBottom:'8px', minHeight:'28px' }}>
                {form.monedas.length===0 && <span style={{ fontSize:'11px', color:'#524438' }}>Ninguna seleccionada</span>}
                {form.monedas.map(m=>(
                  <span key={m} onClick={()=>quitarMoneda(m)}
                    style={{ display:'inline-flex', alignItems:'center', gap:'5px', background:'rgba(201,168,76,.12)', border:'1px solid rgba(201,168,76,.3)', borderRadius:'6px', padding:'4px 10px', fontSize:'13px', fontWeight:'700', color:'#e2c27d', cursor:'pointer', fontFamily:'monospace' }}>
                    {m} <span style={{ fontSize:'10px', color:'#c09a4c' }}>✕</span>
                  </span>
                ))}
              </div>
              {/* Selector */}
              <select style={inp({ fontSize:'13px' })} value="" onChange={e=>{ addMoneda(e.target.value); (e.target as HTMLSelectElement).value='' }}>
                <option value="">+ Agregar moneda...</option>
                {MONEDAS_LISTA.filter(m=>!form.monedas.includes(m.v)).map(m=>(
                  <option key={m.v} value={m.v}>{m.l}</option>
                ))}
              </select>
            </div>

            {/* Calendario */}
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>Calendario de feriados</label>
              <select style={inp({ fontSize:'13px' })} value={form.calendario_id} onChange={e=>setForm(f=>({...f,calendario_id:e.target.value}))}>
                <option value="">Sin calendario asignado</option>
                {calendarios.map(c=><option key={c.id} value={c.id}>{c.nombre} — {c.pais||'Panamá'}</option>)}
              </select>
            </div>

            {error && <div className="alert-error" style={{ marginBottom:'12px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={guardar} disabled={saving}>{saving?'Guardando...':modal==='nuevo'?'Crear Agencia':'Guardar Cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
