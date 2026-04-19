'use client'
import { fmtM, getSimbolo } from '@/lib/fmt'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PER_LABEL: Record<number,string> = { 1:'Diaria',7:'Semanal',15:'Quincenal',30:'Mensual' }
const PER_VAL = [1,7,15,30]

export default function FondeadoresPage() {
  const supabase = createClient()
  const [fondeadores, setFondeadores] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'form'|'movimiento'|null>(null)
  const [modoForm, setModoForm] = useState<'nuevo'|'editar'>('nuevo')
  const [selected, setSelected] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [agencias, setAgencias] = useState<any[]>([])
  const [form, setForm] = useState({ nombre:'', capital_aportado:'', tasa_retorno:'10', notas:'', periodicidad_retorno:30, agencia_id:'' })
  const [movForm, setMovForm] = useState({ tipo:'inyeccion', monto:'', descripcion:'' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id').eq('id', session.user.id).single()
        .then(({ data: p }) => {
          setPerfil(p); loadAll(p)
          supabase.channel('fond-rt')
            .on('postgres_changes',{event:'*',schema:'public',table:'fondeadores'},()=>loadAll(p))
            .on('postgres_changes',{event:'*',schema:'public',table:'movimientos_fondeador'},()=>loadAll(p))
            .subscribe()
        })
    })
  }, [])

  async function loadAll(p: any) {
    setLoading(true)
    if (p.rol==='superadmin') { const { data: ags } = await supabase.from('agencias').select('id,nombre').order('nombre'); setAgencias(ags||[]) }
    const agId = p.agencia_id
    const { data: fondsData } = await supabase.from('fondeadores').select('*').eq('agencia_id', p.agencia_id).is('deleted_at', null).order('created_at', { ascending:false })
    setFondeadores(fondsData||[])
    const { data: m } = await supabase.from('movimientos_fondeador').select('*, fondeador:fondeadores(nombre)').eq('agencia_id', p.agencia_id).order('created_at', { ascending:false }).limit(50)
    setMovimientos(m||[])
    // Cartera activa de esta agencia
    // Cartera activa = suma de todos los préstamos activos de las agencias de los fondeadores
    const agIds = [...new Set(fondsData.map((f:any)=>f.agencia_id).filter(Boolean))]
    let cartTotal = 0
    if (agIds.length > 0) {
      const { data: cart } = await supabase.from('prestamos').select('saldo_capital').in('agencia_id', agIds as string[]).in('estado',['activo','mora'])
      cartTotal = (cart||[]).reduce((s:number,x:any)=>s+(x.saldo_capital||0),0)
    }
    setCarteraActiva(cartTotal)
    setLoading(false)
  }

  // Calcular retorno según periodicidad
  function calcRetorno(f: any) {
    const saldo = f.saldo_actual||f.capital_actual||0
    const tasa = f.tasa_retorno||f.tasa_anual||0
    const per = f.periodicidad_retorno||30
    // Interés por período = capital × tasa%
    return saldo * (tasa / 100)
  }

  async function crearFondeador() {
    if (!form.nombre.trim()||!form.capital_aportado) { setError('Nombre y capital son obligatorios'); return }
    const monto = parseFloat(form.capital_aportado)
    if (isNaN(monto)||monto<=0) { setError('Capital debe ser mayor a 0'); return }
    setSaving(true); setError('')
    const { data: f, error: e } = await supabase.from('fondeadores').insert({
      nombre:form.nombre.trim(), capital_actual:monto, capital_aportado:monto, saldo_actual:monto,
      tasa_anual:parseFloat(form.tasa_retorno)||0, tasa_retorno:parseFloat(form.tasa_retorno)||0,
      periodicidad_retorno:form.periodicidad_retorno,
      notas:form.notas||null, agencia_id:form.agencia_id||perfil.agencia_id, activo:true, intereses_acumulados:0
    }).select().single()
    if (e) { setError(e.message); setSaving(false); return }
    await supabase.from('movimientos_fondeador').insert({ fondeador_id:f.id, agencia_id:form.agencia_id||perfil.agencia_id, tipo:'inyeccion', monto, saldo_anterior:0, saldo_nuevo:monto, descripcion:'Aportación inicial' })
    setModal(null); setSaving(false); loadAll(perfil)
  }

  async function editarFondeador() {
    if (!form.nombre.trim()||!selected) { setError('Nombre obligatorio'); return }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('fondeadores').update({
      nombre:form.nombre.trim(),
      tasa_anual:parseFloat(form.tasa_retorno)||0,
      tasa_retorno:parseFloat(form.tasa_retorno)||0,
      periodicidad_retorno:form.periodicidad_retorno,
      notas:form.notas||null
    }).eq('id', selected.id)
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null); setSaving(false); loadAll(perfil)
  }

  async function registrarMovimiento() {
    if (!movForm.monto||!selected) { setError('Monto obligatorio'); return }
    setSaving(true); setError('')
    const monto = parseFloat(movForm.monto)
    if (isNaN(monto)||monto<=0) { setError('Monto inválido'); setSaving(false); return }
    const saldo_ant = selected.saldo_actual||selected.capital_actual||0
    const intAcum = selected.intereses_acumulados||0
    let saldo_nuevo = saldo_ant
    let intNuevo = intAcum
    let descripcion = movForm.descripcion||''

    if (movForm.tipo==='inyeccion') {
      saldo_nuevo = saldo_ant + monto
    } else if (movForm.tipo==='retiro') {
      if (monto > saldo_ant) { setError('Saldo insuficiente'); setSaving(false); return }
      saldo_nuevo = saldo_ant - monto
    } else if (movForm.tipo==='capitalizacion_interes') {
      // Capitalizar: los intereses acumulados se suman al capital
      if (monto > intAcum) { setError(`Intereses acumulados disponibles: $${intAcum.toFixed(2)}`); setSaving(false); return }
      saldo_nuevo = saldo_ant + monto
      intNuevo = intAcum - monto
      descripcion = descripcion||`Capitalización de intereses $${monto.toFixed(2)}`
    } else if (movForm.tipo==='retiro_interes') {
      // Retirar intereses: baja de intereses acumulados
      if (monto > intAcum) { setError(`Intereses acumulados disponibles: $${intAcum.toFixed(2)}`); setSaving(false); return }
      intNuevo = intAcum - monto
      descripcion = descripcion||`Retiro de intereses $${monto.toFixed(2)}`
    }

    await supabase.from('fondeadores').update({ saldo_actual:saldo_nuevo, capital_actual:saldo_nuevo, capital_aportado:saldo_nuevo, intereses_acumulados:intNuevo }).eq('id', selected.id)
    await supabase.from('movimientos_fondeador').insert({ fondeador_id:selected.id, agencia_id:perfil.agencia_id, tipo:movForm.tipo, monto, saldo_anterior:saldo_ant, saldo_nuevo, descripcion })
    setModal(null); setSaving(false); loadAll(perfil)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este fondeador?')) return
    await supabase.from('fondeadores').update({ deleted_at:new Date().toISOString(), activo:false }).eq('id', id)
    loadAll(perfil)
  }

  const totalFondos = fondeadores.reduce((s,f)=>s+(f.saldo_actual||f.capital_actual||0),0)
  const totalAportado = fondeadores.reduce((s,f)=>s+(f.saldo_actual||f.capital_actual||0),0)
  const totalIntereses = fondeadores.reduce((s,f)=>s+(f.intereses_acumulados||0),0)
  const [carteraActiva, setCarteraActiva] = useState(0)

  const inp = (extra?: any) => ({ width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'9px', padding:'10px 12px', color:'#f0ebe0', fontSize:'14px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit', ...extra })
  const lbl = { display:'block' as const, fontSize:'9px', fontWeight:'600' as const, color:'#6a5a48', textTransform:'uppercase' as const, letterSpacing:'1.2px', marginBottom:'5px' }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Fondeadores</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>Capital e inversionistas</p>
        </div>
        <button className="btn-gold" onClick={()=>{ setForm({nombre:'',capital_aportado:'',tasa_retorno:'10',notas:'',periodicidad_retorno:30}); setModoForm('nuevo'); setError(''); setModal('form') }}>+ Nuevo</button>
      </div>

      {/* KPIs */}
      <div className="grid-3" style={{ marginBottom:'14px' }}>
        {[
          { l:'Total Aportado', v:`$${totalAportado.toFixed(2)}`, c:'#e2c27d' },
          { l:'Disponible Neto', 
            v: (totalFondos+totalIntereses-carteraActiva) < 0 
              ? `-$${Math.abs(totalFondos+totalIntereses-carteraActiva).toFixed(2)}` 
              : `$${(totalFondos+totalIntereses-carteraActiva).toFixed(2)}`, 
            c: (totalFondos+totalIntereses-carteraActiva) < 0 ? '#c0534e' : '#4caf82' },
          { l:'Intereses Acumulados', v:`$${totalIntereses.toFixed(2)}`, c:'#c09a4c' },
        ].map(k=>(
          <div key={k.l} className="kpi-card" style={{ borderTop:`2px solid ${k.c}` }}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-val" style={{ color:k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Cards fondeadores */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'12px', marginBottom:'20px' }}>
        {loading ? <div style={{ color:'#524438', fontSize:'13px' }}>Cargando...</div>
        : fondeadores.length===0 ? (
          <div className="card card-md" style={{ textAlign:'center', color:'#524438', fontSize:'13px', gridColumn:'1/-1' }}>No hay fondeadores — crea el primero</div>
        ) : fondeadores.map(f=>{
          const saldo = f.saldo_actual||f.capital_actual||0
          const capital = f.capital_aportado||f.capital_actual||0
          const tasa = f.tasa_retorno||f.tasa_anual||0
          const per = f.periodicidad_retorno||30
          const perLabel = PER_LABEL[per]||`${per}d`
          const retornoPeriodo = calcRetorno(f)
          const intAcum = f.intereses_acumulados||0
          return (
            <div key={f.id} className="card card-md">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'15px', fontWeight:'600', color:'#f0ebe0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.nombre}</div>
                  {perfil?.rol==='superadmin' && agencias.length>0 && (
                    <div style={{ fontSize:'10px', color:'#524438', marginTop:'1px' }}>
                      {agencias.find((a:any)=>a.id===f.agencia_id)?.nombre||'Sin agencia'}
                    </div>
                  )}
                  <div style={{ fontSize:'11px', color:'#c09a4c', marginTop:'2px', fontWeight:600 }}>
                    {tasa}% {perLabel}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'4px', flexShrink:0, marginLeft:'8px' }}>
                  <button onClick={()=>{ setSelected(f); setForm({nombre:f.nombre,capital_aportado:String(capital),tasa_retorno:String(tasa),notas:f.notas||'',periodicidad_retorno:per,agencia_id:f.agencia_id||''}); setModoForm('editar'); setError(''); setModal('form') }}
                    style={{ background:'none', border:'1px solid #333', color:'#9a8668', borderRadius:'6px', padding:'4px 8px', fontSize:'11px', cursor:'pointer' }}>✏️</button>
                  <button onClick={()=>{ setSelected(f); setMovForm({tipo:'inyeccion',monto:'',descripcion:''}); setError(''); setModal('movimiento') }}
                    style={{ background:'none', border:'1px solid #333', color:'#9a8668', borderRadius:'6px', padding:'4px 8px', fontSize:'11px', cursor:'pointer' }}>💱</button>
                  <button onClick={()=>eliminar(f.id)}
                    style={{ background:'rgba(192,83,78,.08)', border:'1px solid rgba(192,83,78,.2)', color:'#c0534e', borderRadius:'6px', padding:'4px 7px', fontSize:'11px', cursor:'pointer' }}>🗑</button>
                </div>
              </div>

              <div className="grid-2" style={{ marginBottom:'10px' }}>
                <div style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px' }}>
                  <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Capital</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#e2c27d', fontFamily:'monospace' }}>${Number(capital).toFixed(2)}</div>
                </div>
                <div style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px' }}>
                  <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Saldo Actual</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#4caf82', fontFamily:'monospace' }}>${Number(saldo).toFixed(2)}</div>
                </div>
              </div>

              {/* Retorno e intereses acumulados */}
              <div style={{ background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius:'8px', padding:'10px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>
                    <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Retorno x período</div>
                    <div style={{ fontSize:'15px', fontWeight:'700', color:'#e2c27d', fontFamily:'monospace' }}>${retornoPeriodo.toFixed(2)}</div>
                    <div style={{ fontSize:'9px', color:'#524438' }}>{tasa}% {perLabel}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Intereses acumulados</div>
                    <div style={{ fontSize:'15px', fontWeight:'700', color:intAcum>0?'#c09a4c':'#524438', fontFamily:'monospace' }}>${intAcum.toFixed(2)}</div>
                    <div style={{ fontSize:'9px', color:'#524438' }}>Capitalizar o retirar</div>
                  </div>
                </div>
                {intAcum > 0 && (
                  <div style={{ display:'flex', gap:'5px', marginTop:'8px' }}>
                    <button onClick={()=>{ setSelected(f); setMovForm({tipo:'capitalizacion_interes',monto:intAcum.toFixed(2),descripcion:''}); setError(''); setModal('movimiento') }}
                      style={{ flex:1, background:'rgba(76,175,130,.1)', border:'1px solid rgba(76,175,130,.25)', color:'#4caf82', borderRadius:'6px', padding:'5px', fontSize:'10px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                      📈 Capitalizar
                    </button>
                    <button onClick={()=>{ setSelected(f); setMovForm({tipo:'retiro_interes',monto:intAcum.toFixed(2),descripcion:''}); setError(''); setModal('movimiento') }}
                      style={{ flex:1, background:'rgba(192,83,78,.08)', border:'1px solid rgba(192,83,78,.2)', color:'#c0534e', borderRadius:'6px', padding:'5px', fontSize:'10px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                      💸 Retirar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Historial */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e1e1e', fontSize:'13px', fontWeight:500, color:'#f0ebe0' }}>Historial de movimientos</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{['Fondeador','Tipo','Monto','Saldo','Descripción','Fecha'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {movimientos.length===0 ? <tr><td colSpan={6} style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Sin movimientos</td></tr>
              : movimientos.map(m=>{
                const esPositivo = ['inyeccion','capitalizacion_interes'].includes(m.tipo)
                const TIPOS: Record<string,string> = { inyeccion:'↑ Inyección', retiro:'↓ Retiro', capitalizacion_interes:'📈 Capitalización', retiro_interes:'💸 Retiro interés', devengar_interes:'⏱ Interés devengado' }
                return (
                  <tr key={m.id}>
                    <td style={{ color:'#f0ebe0' }}>{m.fondeador?.nombre||'—'}</td>
                    <td><span style={{ fontSize:'10px', fontWeight:600, padding:'2px 6px', borderRadius:'5px', color:esPositivo?'#4caf82':'#c0534e', background:esPositivo?'rgba(76,175,130,.08)':'rgba(192,83,78,.08)', whiteSpace:'nowrap' }}>{TIPOS[m.tipo]||m.tipo}</span></td>
                    <td style={{ fontFamily:'monospace', fontWeight:600, color:esPositivo?'#4caf82':'#c0534e', whiteSpace:'nowrap' }}>{esPositivo?'+':'-'}${m.monto?.toFixed(2)}</td>
                    <td style={{ fontFamily:'monospace', color:'#e2c27d', whiteSpace:'nowrap' }}>${m.saldo_nuevo?.toFixed(2)}</td>
                    <td style={{ color:'#9a8668', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.descripcion||'—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:'11px', color:'#524438', whiteSpace:'nowrap' }}>{new Date(m.created_at).toLocaleDateString('es-PA')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal form crear/editar */}
      {modal==='form' && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>{modoForm==='editar'?'✏️ Editar Fondeador':'+ Nuevo Fondeador'}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div><label style={lbl}>Nombre *</label><input style={inp()} value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre o razón social" /></div>
              {perfil?.rol === 'superadmin' && agencias.length > 0 && (
                <div>
                  <label style={lbl}>Agencia {modoForm==='editar'?'(editable)':'*'}</label>
                  <select style={inp({ fontSize:'13px' })} value={form.agencia_id||perfil?.agencia_id||''} onChange={e=>setForm(f=>({...f,agencia_id:e.target.value}))}>
                    <option value="">Mi agencia</option>
                    {agencias.map((a:any)=><option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <div style={{ fontSize:'10px', color:'#524438', marginTop:'3px' }}>Los fondos de este fondeador se dirigen al disponible de esta agencia</div>
                </div>
              )}
              {modoForm==='nuevo' && <div><label style={lbl}>Capital aportado *</label><input style={inp()} type="number" step="0.01" min="0.01" placeholder="0.00" value={form.capital_aportado} onChange={e=>setForm(f=>({...f,capital_aportado:e.target.value}))} /></div>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label style={lbl}>Tasa de retorno %</label><input style={inp()} type="number" step="0.5" min="0" placeholder="10" value={form.tasa_retorno} onChange={e=>setForm(f=>({...f,tasa_retorno:e.target.value}))} /></div>
                <div>
                  <label style={lbl}>Periodicidad del retorno</label>
                  <select style={inp({ fontSize:'13px' })} value={form.periodicidad_retorno} onChange={e=>setForm(f=>({...f,periodicidad_retorno:parseInt(e.target.value)}))}>
                    {PER_VAL.map(p=><option key={p} value={p}>{PER_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>
              {/* Preview del retorno */}
              {form.capital_aportado && parseFloat(form.capital_aportado)>0 && (
                <div style={{ background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius:'8px', padding:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:'11px', color:'#9a8668' }}>Retorno estimado por período</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#e2c27d', fontFamily:'monospace' }}>
                    ${(parseFloat(form.capital_aportado||'0') * (parseFloat(form.tasa_retorno||'0')/100)).toFixed(2)}
                    <span style={{ fontSize:'10px', color:'#9a8668', fontWeight:400 }}> / {PER_LABEL[form.periodicidad_retorno]||'período'}</span>
                  </div>
                </div>
              )}
              <div><label style={lbl}>Notas</label><textarea style={{ ...inp(), height:'55px', resize:'none' as const }} value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Condiciones, observaciones..." /></div>
            </div>
            {error && <div className="alert-error" style={{ marginBottom:'10px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={modoForm==='editar'?editarFondeador:crearFondeador} disabled={saving}>{saving?'Guardando...':modoForm==='editar'?'Guardar':'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal movimiento */}
      {modal==='movimiento' && selected && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>💱 Movimiento — {selected.nombre}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>
            {/* Resumen del fondeador */}
            <div className="grid-2" style={{ marginBottom:'12px' }}>
              <div style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px', textAlign:'center' }}>
                <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Saldo actual</div>
                <div style={{ fontSize:'20px', fontWeight:'700', color:'#4caf82', fontFamily:'monospace' }}>${(selected.saldo_actual||selected.capital_actual||0).toFixed(2)}</div>
              </div>
              <div style={{ background:'rgba(201,168,76,.06)', borderRadius:'8px', padding:'10px', textAlign:'center' }}>
                <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>Intereses acumulados</div>
                <div style={{ fontSize:'20px', fontWeight:'700', color:'#c09a4c', fontFamily:'monospace' }}>${(selected.intereses_acumulados||0).toFixed(2)}</div>
              </div>
            </div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={lbl}>Tipo de movimiento</label>
                <select style={inp({ fontSize:'13px' })} value={movForm.tipo} onChange={e=>setMovForm(f=>({...f,tipo:e.target.value}))}>
                  <option value="inyeccion">↑ Inyección de capital</option>
                  <option value="retiro">↓ Retiro de capital</option>
<option value="capitalizacion_interes">📈 Capitalizar intereses → suma al capital</option>
                  <option value="retiro_interes">💸 Retirar intereses acumulados</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Monto *</label>
                <input style={inp()} type="number" step="0.01" placeholder="0.00" value={movForm.monto} onChange={e=>setMovForm(f=>({...f,monto:e.target.value}))} />

              </div>
              <div><label style={lbl}>Descripción</label><input style={inp()} value={movForm.descripcion} onChange={e=>setMovForm(f=>({...f,descripcion:e.target.value}))} placeholder="Motivo del movimiento..." /></div>
            </div>
            {error && <div className="alert-error" style={{ marginBottom:'10px' }}>⚠ {error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={registrarMovimiento} disabled={saving}>{saving?'Registrando...':'Registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
