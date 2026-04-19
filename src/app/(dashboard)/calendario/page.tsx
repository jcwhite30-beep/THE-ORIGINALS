'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const inp = { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'11px 14px', color:'#f5f0e8', fontSize:'13px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit' }
const lbl = { display:'block', fontSize:'10px', fontWeight:'600' as const, color:'#7a6a5a', textTransform:'uppercase' as const, letterSpacing:'1.2px', marginBottom:'6px' }
const sel_s = { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'11px 14px', color:'#f5f0e8', fontSize:'13px', outline:'none', fontFamily:'inherit' }

const PAISES = ['Panamá','Colombia','México','Costa Rica','Guatemala','Honduras','Nicaragua','El Salvador','República Dominicana','Venezuela','Ecuador','Perú','Bolivia','Argentina','Chile','Uruguay','Paraguay','Brasil','España','Estados Unidos']

export default function CalendarioPage() {
  const supabase = createClient()
  const [calendarios, setCalendarios] = useState<any[]>([])
  const [feriados, setFeriados] = useState<any[]>([])
  const [selectedCal, setSelectedCal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'nuevo_cal'|'nuevo_feriado'|'editar_feriado'|null>(null)
  const [editFeriado, setEditFeriado] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calForm, setCalForm] = useState({ nombre:'', pais:'Panamá', descripcion:'' })
  const [ferForm, setFerForm] = useState({ fecha:'', nombre:'', recurrente:true, ajuste:'adelantar' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: c } = await supabase.from('calendarios').select('*').order('nombre')
    setCalendarios(c||[])
    setLoading(false)
  }

  async function loadFeriados(calId: string) {
    const { data: f } = await supabase.from('feriados_v2').select('*').eq('calendario_id', calId).order('fecha')
    setFeriados(f||[])
  }

  async function crearCalendario() {
    if (!calForm.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const { data, error: e } = await supabase.from('calendarios').insert({
      nombre: calForm.nombre.trim(),
      pais: calForm.pais,
      descripcion: calForm.descripcion||null
    }).select().single()
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null)
    setCalForm({ nombre:'', pais:'Panamá', descripcion:'' })
    load()
    setSaving(false)
  }

  async function editarFeriado() {
    if (!ferForm.fecha || !ferForm.nombre.trim() || !editFeriado) { setError('Fecha y nombre obligatorios'); return }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('feriados_v2').update({
      fecha: ferForm.fecha, nombre: ferForm.nombre.trim(),
      recurrente: ferForm.recurrente, ajuste: ferForm.ajuste
    }).eq('id', editFeriado.id)
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null); if (selectedCal) loadFeriados(selectedCal.id); setSaving(false)
  }

  async function crearFeriado() {
    if (!ferForm.fecha || !ferForm.nombre.trim() || !selectedCal) { setError('Fecha y nombre son obligatorios'); return }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('feriados_v2').insert({
      calendario_id: selectedCal.id,
      fecha: ferForm.fecha,
      nombre: ferForm.nombre.trim(),
      recurrente: ferForm.recurrente,
      ajuste: ferForm.ajuste
    })
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null)
    setFerForm({ fecha:'', nombre:'', recurrente:true, ajuste:'adelantar' })
    loadFeriados(selectedCal.id)
    setSaving(false)
  }

  async function eliminarFeriado(id: string) {
    if (!confirm('¿Eliminar este feriado?')) return
    await supabase.from('feriados_v2').delete().eq('id', id)
    if (selectedCal) loadFeriados(selectedCal.id)
  }

  async function eliminarCalendario(id: string) {
    if (!confirm('¿Eliminar este calendario y todos sus feriados?')) return
    await supabase.from('calendarios').delete().eq('id', id)
    if (selectedCal?.id === id) { setSelectedCal(null); setFeriados([]) }
    load()
  }

  function selectCal(c: any) {
    setSelectedCal(c)
    loadFeriados(c.id)
  }

  return (
    <div style={{ padding:'20px 16px', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@media(min-width:640px){.cal-pad{padding:32px 28px!important}.cal-grid{grid-template-columns:300px 1fr!important}}`}</style>
      <div className="cal-pad" style={{ padding:'20px 16px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'10px' }}>
          <div>
            <h1 style={{ fontSize:'24px', fontWeight:'700', color:'#f5f0e8', margin:'0 0 4px' }}>Calendarios</h1>
            <p style={{ fontSize:'12px', color:'#a08c6e', margin:0 }}>Días festivos y reglas de ajuste de pagos</p>
          </div>
          <button onClick={()=>{ setCalForm({nombre:'',pais:'Panamá',descripcion:''}); setError(''); setModal('nuevo_cal') }}
            style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
            + Nuevo Calendario
          </button>
        </div>

        <div className="cal-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:'16px' }}>
          {/* Lista calendarios */}
          <div>
            <div style={{ fontSize:'11px', fontWeight:'600', color:'#5a4f42', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'10px' }}>Calendarios disponibles</div>
            {loading ? <div style={{ color:'#5a4f42', fontSize:'13px' }}>Cargando...</div>
            : calendarios.length === 0 ? (
              <div style={{ background:'#141414', border:'1px dashed #2c2c2c', borderRadius:'10px', padding:'24px', textAlign:'center', color:'#5a4f42', fontSize:'13px' }}>
                No hay calendarios — crea el primero
              </div>
            ) : calendarios.map(c=>(
              <div key={c.id} onClick={()=>selectCal(c)}
                style={{ background: selectedCal?.id===c.id ? 'rgba(201,168,76,0.08)' : '#141414', border:`1px solid ${selectedCal?.id===c.id ? 'rgba(201,168,76,0.3)' : '#2c2c2c'}`, borderRadius:'10px', padding:'14px', marginBottom:'8px', cursor:'pointer', transition:'all .15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:'14px', fontWeight:600, color: selectedCal?.id===c.id ? '#e2c27d' : '#f5f0e8' }}>📅 {c.nombre}</div>
                    <div style={{ fontSize:'11px', color:'#5a4f42', marginTop:'3px' }}>🌍 {c.pais||'Panamá'}</div>
                    {c.descripcion && <div style={{ fontSize:'11px', color:'#a08c6e', marginTop:'3px' }}>{c.descripcion}</div>}
                  </div>
                  <button onClick={e=>{ e.stopPropagation(); eliminarCalendario(c.id) }}
                    style={{ background:'none', border:'none', color:'#5a4f42', cursor:'pointer', fontSize:'14px', padding:'2px 6px' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>

          {/* Feriados del calendario seleccionado */}
          {selectedCal && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <div style={{ fontSize:'11px', fontWeight:'600', color:'#5a4f42', textTransform:'uppercase', letterSpacing:'1px' }}>
                  Feriados de {selectedCal.nombre} ({feriados.length})
                </div>
                <button onClick={()=>{ setFerForm({fecha:'',nombre:'',recurrente:true,ajuste:'adelantar'}); setError(''); setModal('nuevo_feriado') }}
                  style={{ background:'transparent', border:'1px solid #c9a84c', color:'#c9a84c', borderRadius:'7px', padding:'5px 12px', fontSize:'11px', cursor:'pointer' }}>
                  + Agregar feriado
                </button>
              </div>

              <div style={{ background:'#141414', border:'1px solid #2c2c2c', borderRadius:'12px', overflow:'hidden' }}>
                {feriados.length === 0 ? (
                  <div style={{ padding:'30px', textAlign:'center', color:'#5a4f42', fontSize:'13px' }}>
                    No hay feriados registrados en este calendario
                  </div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>{['Fecha','Nombre','Recurrente','Si cae pago...',''].map(h=>(
                        <th key={h} style={{ textAlign:'left', fontSize:'10px', fontWeight:'600', color:'#5a4f42', textTransform:'uppercase', letterSpacing:'0.8px', padding:'10px 14px', borderBottom:'1px solid #2c2c2c', whiteSpace:'nowrap' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {feriados.map(f=>(
                        <tr key={f.id} style={{ borderBottom:'1px solid #1c1c1c' }}>
                          <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:'12px', color:'#e2c27d' }}>{f.fecha}</td>
                          <td style={{ padding:'10px 14px', fontSize:'13px', color:'#f5f0e8' }}>{f.nombre}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'5px', color:f.recurrente?'#4caf82':'#a08c6e', background:f.recurrente?'rgba(76,175,130,0.08)':'#1a1a1a' }}>
                              {f.recurrente?'Anual':'Una vez'}
                            </span>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'5px',
                              color:f.ajuste==='adelantar'?'#5a8fc0':f.ajuste==='retrasar'?'#c09a4c':'#5a4f42',
                              background:f.ajuste==='adelantar'?'rgba(90,143,192,0.08)':f.ajuste==='retrasar'?'rgba(192,154,76,0.08)':'#1a1a1a' }}>
                              {f.ajuste==='adelantar'?'← Adelantar':f.ajuste==='retrasar'?'→ Retrasar':'Sin cambio'}
                            </span>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex', gap:'4px' }}>
                            <button onClick={()=>{ setEditFeriado(f); setFerForm({fecha:f.fecha,nombre:f.nombre,recurrente:f.recurrente,ajuste:f.ajuste}); setModal('editar_feriado') }}
                              style={{ background:'none', border:'none', color:'#5a4f42', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                            <button onClick={()=>eliminarFeriado(f.id)}
                              style={{ background:'none', border:'none', color:'#5a4f42', cursor:'pointer', fontSize:'13px' }}>🗑</button>
                          </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nuevo Calendario */}
      {modal==='nuevo_cal' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'16px' }}
          onClick={e=>{ if(e.target===e.currentTarget) setModal(null) }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'18px', padding:'24px', width:'100%', maxWidth:'440px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'18px', paddingBottom:'12px', borderBottom:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:'17px', fontWeight:'600', color:'#e2c27d' }}>+ Nuevo Calendario</div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#a08c6e', cursor:'pointer', width:'28px', height:'28px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:'12px', marginBottom:'16px' }}>
              <div>
                <label style={lbl}>Nombre del calendario *</label>
                <input style={inp} value={calForm.nombre} onChange={e=>setCalForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Feriados Nacionales Panamá 2026" onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
              </div>
              <div>
                <label style={lbl}>País</label>
                <select style={sel_s} value={calForm.pais} onChange={e=>setCalForm(f=>({...f,pais:e.target.value}))}>
                  {PAISES.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Descripción</label>
                <textarea style={{ ...inp, height:'60px', resize:'none' }} value={calForm.descripcion} onChange={e=>setCalForm(f=>({...f,descripcion:e.target.value}))} placeholder="Opcional..." onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
              </div>
            </div>
            {error && <div style={{ background:'rgba(192,83,78,0.1)', border:'1px solid rgba(192,83,78,0.2)', borderRadius:'8px', padding:'10px', color:'#c0534e', fontSize:'12px', marginBottom:'12px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={()=>setModal(null)} style={{ background:'transparent', border:'1px solid #333', color:'#a08c6e', borderRadius:'8px', padding:'9px 14px', fontSize:'12px', cursor:'pointer' }}>Cancelar</button>
              <button onClick={crearCalendario} disabled={saving} style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity:saving?0.5:1 }}>
                {saving?'Creando...':'Crear Calendario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Feriado */}
      {modal==='nuevo_feriado' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'16px' }}
          onClick={e=>{ if(e.target===e.currentTarget) setModal(null) }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'18px', padding:'24px', width:'100%', maxWidth:'440px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'18px', paddingBottom:'12px', borderBottom:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:'17px', fontWeight:'600', color:'#e2c27d' }}>+ Agregar Feriado</div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#a08c6e', cursor:'pointer', width:'28px', height:'28px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ fontSize:'12px', color:'#5a4f42', marginBottom:'14px' }}>Calendario: <span style={{ color:'#a08c6e' }}>{selectedCal?.nombre}</span></div>
            <div style={{ display:'grid', gap:'12px', marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>Fecha *</label>
                  <input style={inp} type="date" value={ferForm.fecha} onChange={e=>setFerForm(f=>({...f,fecha:e.target.value}))} onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
                </div>
                <div>
                  <label style={lbl}>Tipo</label>
                  <select style={sel_s} value={ferForm.recurrente?'anual':'unico'} onChange={e=>setFerForm(f=>({...f,recurrente:e.target.value==='anual'}))}>
                    <option value="anual">Anual (recurrente)</option>
                    <option value="unico">Una sola vez</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Nombre del feriado *</label>
                <input style={inp} value={ferForm.nombre} onChange={e=>setFerForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Día de la Independencia" onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
              </div>
              <div>
                <label style={lbl}>Si un pago cae en esta fecha...</label>
                <select style={sel_s} value={ferForm.ajuste} onChange={e=>setFerForm(f=>({...f,ajuste:e.target.value}))}>
                  <option value="adelantar">← Adelantar al día hábil anterior</option>
                  <option value="retrasar">→ Retrasar al día hábil siguiente</option>
                  <option value="ninguno">Sin ajuste (cobrar igual)</option>
                </select>
              </div>
            </div>
            {error && <div style={{ background:'rgba(192,83,78,0.1)', border:'1px solid rgba(192,83,78,0.2)', borderRadius:'8px', padding:'10px', color:'#c0534e', fontSize:'12px', marginBottom:'12px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={()=>setModal(null)} style={{ background:'transparent', border:'1px solid #333', color:'#a08c6e', borderRadius:'8px', padding:'9px 14px', fontSize:'12px', cursor:'pointer' }}>Cancelar</button>
              <button onClick={crearFeriado} disabled={saving} style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity:saving?0.5:1 }}>
                {saving?'Guardando...':'Agregar Feriado'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Editar Feriado */}
      {modal==='editar_feriado' && editFeriado && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'16px' }}
          onClick={e=>{ if(e.target===e.currentTarget) setModal(null) }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'18px', padding:'24px', width:'100%', maxWidth:'440px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'18px', paddingBottom:'12px', borderBottom:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:'17px', fontWeight:'600', color:'#e2c27d' }}>✏️ Editar Feriado</div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#a08c6e', cursor:'pointer', width:'28px', height:'28px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:'12px', marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label style={lbl}>Fecha *</label><input style={inp} type="date" value={ferForm.fecha} onChange={e=>setFerForm(f=>({...f,fecha:e.target.value}))} onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} /></div>
                <div><label style={lbl}>Tipo</label><select style={sel_s} value={ferForm.recurrente?'anual':'unico'} onChange={e=>setFerForm(f=>({...f,recurrente:e.target.value==='anual'}))}><option value="anual">Anual</option><option value="unico">Una vez</option></select></div>
              </div>
              <div><label style={lbl}>Nombre *</label><input style={inp} value={ferForm.nombre} onChange={e=>setFerForm(f=>({...f,nombre:e.target.value}))} onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} /></div>
              <div><label style={lbl}>Si cae un pago...</label>
                <select style={sel_s} value={ferForm.ajuste} onChange={e=>setFerForm(f=>({...f,ajuste:e.target.value}))}>
                  <option value="adelantar">← Adelantar</option><option value="retrasar">→ Retrasar</option><option value="ninguno">Sin ajuste</option>
                </select>
              </div>
            </div>
            {error && <div style={{ background:'rgba(192,83,78,0.1)', borderRadius:'8px', padding:'10px', color:'#c0534e', fontSize:'12px', marginBottom:'12px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={()=>setModal(null)} style={{ background:'transparent', border:'1px solid #333', color:'#a08c6e', borderRadius:'8px', padding:'9px 14px', fontSize:'12px', cursor:'pointer' }}>Cancelar</button>
              <button onClick={editarFeriado} disabled={saving} style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity:saving?0.5:1 }}>
                {saving?'Guardando...':'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
