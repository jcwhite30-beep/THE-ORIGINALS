'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ROL_CFG: Record<string,{color:string,bg:string}> = {
  superadmin: { color:'#e2c27d', bg:'rgba(201,168,76,.1)' },
  admin:      { color:'#c9a84c', bg:'rgba(201,168,76,.07)' },
  gerente:    { color:'#5a8fc0', bg:'rgba(90,143,192,.08)' },
  promotor:   { color:'#4caf82', bg:'rgba(76,175,130,.08)' },
}

export default function UsuariosPage() {
  const supabase = createClient()
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [agencias, setAgencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'nuevo'|'editar'|'pass'|null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [filtroAgencia, setFiltroAgencia] = useState('all')
  const [filtroRolUsuarios, setFiltroRolUsuarios] = useState('all')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sqlFallback, setSqlFallback] = useState('')
  const [newPass, setNewPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ nombre:'', username:'', password:'', rol:'promotor', agencia_id:'', telefono:'', ocupacion:'', lugar_trabajo:'' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id,nombre').eq('id', session.user.id).single()
        .then(({ data: p }) => { setPerfil(p); load(p) })
    })
  }, [])

  async function load(p: any) {
    setLoading(true)
    let q = supabase.from('usuarios').select('*, agencia:agencias(nombre)').order('rol').order('nombre')
    if (p.rol !== 'superadmin') q = q.eq('agencia_id', p.agencia_id)
    const { data } = await q
    setUsuarios(data||[])
    if (p.rol === 'superadmin') {
      const { data: ags } = await supabase.from('agencias').select('id,nombre').order('nombre')
      setAgencias(ags||[])
    }
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ nombre:'', username:'', password:'', rol:'promotor', agencia_id:perfil?.agencia_id||'', telefono:'', ocupacion:'', lugar_trabajo:'' })
    setError(''); setSuccess(''); setModal('nuevo')
  }

  function abrirEditar(u: any) {
    setSelected(u)
    setForm({ nombre:u.nombre, username:u.username, password:'', rol:u.rol, agencia_id:u.agencia_id||perfil?.agencia_id||'', telefono:u.telefono||'', ocupacion:u.ocupacion||'', lugar_trabajo:u.lugar_trabajo||'' })
    setError(''); setSuccess(''); setModal('editar')
  }

  async function guardarEdicion() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError(''); setSuccess('')
    const { error: e } = await supabase.from('usuarios').update({
      nombre: form.nombre.trim(),
      username: form.username ? form.username.toLowerCase().replace('@','') : selected.username,
      rol: form.rol,
      agencia_id: form.agencia_id || perfil.agencia_id,
      telefono: form.telefono || null,
      ocupacion: form.ocupacion || null,
      lugar_trabajo: form.lugar_trabajo || null,
    }).eq('id', selected.id)
    if (e) { setError(e.message); setSaving(false); return }
    setSuccess('✓ Usuario actualizado correctamente')
    setModal(null)
    setSaving(false)
    await load(perfil)
  }

  async function crearUsuario() {
    if (!form.nombre || !form.username || !form.password) { setError('Nombre, usuario y contraseña son obligatorios'); return }
    if (form.password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setSaving(true); setError('')
    const emailAuto = `${form.username.toLowerCase().replace('@','')}@app.local`
    const resp = await fetch('/api/create-user', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:emailAuto, password:form.password, nombre:form.nombre, username:form.username.toLowerCase().replace('@',''), rol:form.rol, agencia_id:form.agencia_id||perfil.agencia_id, telefono:form.telefono||null, ocupacion:form.ocupacion||null, lugar_trabajo:form.lugar_trabajo||null })
    })
    const result = await resp.json().catch(()=>({error:'Sin respuesta'}))
    if (!resp.ok || result.error) {
      setError(result.error || 'Error al crear usuario')
      setSaving(false); return
    }
    setSuccess(`✓ Usuario @${form.username} creado`)
    setModal(null); load(perfil); setSaving(false)
  }

  async function toggleActivo(u: any) {
    if (u.id===perfil?.id) { alert('No puedes desactivarte a ti mismo'); return }
    await supabase.from('usuarios').update({ activo:!u.activo }).eq('id', u.id)
    load(perfil)
  }

  async function resetPass() {
    if (!newPass || newPass.length < 6) { setError('Mínimo 6 caracteres'); return }
    setSaving(true); setError(''); setSuccess(''); setSqlFallback('')
    const sqlBackup = `UPDATE auth.users SET encrypted_password = crypt('${newPass}', gen_salt('bf')), updated_at = NOW() WHERE id = '${selected.id}';`
    try {
      const resp = await fetch('/api/create-user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id, password: newPass })
      })

      let result: any = {}
      try { result = await resp.json() } catch { result = { error: 'Sin respuesta del servidor' } }

      if (resp.ok && result.success) {
        // Éxito real confirmado por el servidor
        setSuccess(`✓ Contraseña de @${selected.username} actualizada correctamente.`)
        setNewPass('')
        setSqlFallback('') // limpiar SQL de respaldo — no se necesita
        setTimeout(() => setModal(null), 2500)
      } else {
        // El API falló — mostrar error real + SQL de respaldo
        const errMsg = result?.error || `HTTP ${resp.status}`
        setSqlFallback(sqlBackup)
        setError(`No se pudo cambiar vía API: ${errMsg}`)
      }
    } catch (e: any) {
      // Error de red — mostrar SQL de respaldo
      setSqlFallback(sqlBackup)
      setError('Sin conexión con el servidor. Usa el SQL de respaldo:')
    }
    setSaving(false)
  }

  const renderForm = () => (
    <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
        <div style={{ gridColumn:'span 2' }}>
          <label className="f-lbl">Nombre completo *</label>
          <input className="f-inp" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre y apellido" />
        </div>
        {modal==='nuevo' && <>
          <div>
            <label className="f-lbl">Username *</label>
            <input className="f-inp" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value.toLowerCase().replace(/[@\s]/g,'')}))} placeholder="jmartinez" />
          </div>
          <div>
            <label className="f-lbl">Nueva contraseña (mín. 6 caracteres)</label>
            <div style={{ position:'relative' }}>
              <input className="f-inp" type={showPass?'text':'password'} style={{ paddingRight:'40px' }} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••" />
              <button type="button" onClick={()=>setShowPass(!showPass)} style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#9a8668', cursor:'pointer', fontSize:'15px' }}>{showPass?'🙈':'👁'}</button>
            </div>
          </div>
        </>}
        <div>
          <label className="f-lbl">Rol</label>
          <select className="f-sel" value={form.rol} onChange={e=>setForm(f=>({...f,rol:e.target.value}))}>
            {perfil?.rol==='superadmin' && <><option value="superadmin">SuperAdmin</option><option value="admin">Admin</option></>}
            <option value="gerente">Gerente</option>
            <option value="promotor">Promotor</option>
          </select>
        </div>
        {perfil?.rol==='superadmin' && (
          <div>
            <label className="f-lbl">Agencia</label>
            <select className="f-sel" value={form.agencia_id} onChange={e=>setForm(f=>({...f,agencia_id:e.target.value}))}>
              <option value="">Mi agencia</option>
              {agencias.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="f-lbl">Teléfono / WhatsApp</label>
          <input className="f-inp" value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="507-6000-0000" />
        </div>
        <div>
          <label className="f-lbl">Ocupación</label>
          <input className="f-inp" value={form.ocupacion} onChange={e=>setForm(f=>({...f,ocupacion:e.target.value}))} placeholder="Promotor de ventas" />
        </div>
        <div style={{ gridColumn:'span 2' }}>
          <label className="f-lbl">Lugar de trabajo</label>
          <input className="f-inp" value={form.lugar_trabajo} onChange={e=>setForm(f=>({...f,lugar_trabajo:e.target.value}))} placeholder="Empresa o dirección" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px', gap:'10px', flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Usuarios</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>{usuarios.length} usuarios</p>
        </div>
        <button className="btn-gold" onClick={abrirNuevo}>+ Nuevo</button>
      </div>
      <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
        {perfil?.rol==='superadmin' && agencias.length>0 && (
          <select value={filtroAgencia} onChange={e=>setFiltroAgencia(e.target.value)}
            style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 10px', color:'#f0ebe0', fontSize:'12px', outline:'none' }}>
            <option value="all">Todas las agencias</option>
            {agencias.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        )}
        <select value={filtroRolUsuarios} onChange={e=>setFiltroRolUsuarios(e.target.value)}
          style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 10px', color:'#f0ebe0', fontSize:'12px', outline:'none' }}>
          <option value="all">Todos los roles</option>
          <option value="superadmin">SuperAdmin</option>
          <option value="admin">Admin</option>
          <option value="gerente">Gerente</option>
          <option value="promotor">Promotor</option>
        </select>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom:'14px' }}>
        {['superadmin','admin','gerente','promotor'].map(r=>{
          const cfg = ROL_CFG[r]
          return (
            <div key={r} className="kpi-card">
              <div className="kpi-label">{r}</div>
              <div className="kpi-val" style={{ color:cfg.color }}>{usuarios.filter(u=>u.rol===r).length}</div>
            </div>
          )
        })}
      </div>

      {/* Cards móvil */}
      <div className="mob-only">
        {loading ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Cargando...</div>
        : usuarios.filter(u=>(filtroAgencia==='all'||u.agencia_id===filtroAgencia)&&(filtroRolUsuarios==='all'||u.rol===filtroRolUsuarios)).map(u=>{
          const cfg = ROL_CFG[u.rol]||ROL_CFG.promotor
          const esYo = u.id===perfil?.id
          return (
            <div key={u.id} className="card card-sm" style={{ marginBottom:'8px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:600, color:'#f0ebe0' }}>{u.nombre} {esYo&&<span style={{ fontSize:'10px', color:'#524438' }}>(yo)</span>}</div>
                  <div style={{ fontSize:'11px', color:'#9a8668', fontFamily:'monospace' }}>@{u.username}</div>
                  {u.telefono && <div style={{ fontSize:'10px', color:'#524438' }}>📱 {u.telefono}</div>}
                </div>
                <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', color:cfg.color, background:cfg.bg }}>{u.rol}</span>
              </div>
              <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                <button className="btn-ghost" style={{ padding:'5px 9px', fontSize:'11px' }} onClick={()=>abrirEditar(u)}>✏️ Editar</button>
                <button className="btn-ghost" style={{ padding:'5px 9px', fontSize:'11px' }} onClick={()=>{setSelected(u);setNewPass('');setError('');setModal('pass')}}>🔑 Pass</button>
                {!esYo && <button className={u.activo?'btn-danger':'btn-ghost'} style={{ padding:'5px 9px', fontSize:'11px' }} onClick={()=>toggleActivo(u)}>{u.activo?'Desactivar':'Activar'}</button>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla desktop */}
      <div className="desk-only card" style={{ overflow:'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{['Usuario','Nombre','Rol','Teléfono','Agencia','Estado',''].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando...</td></tr>
              : usuarios.filter(u=>(filtroAgencia==='all'||u.agencia_id===filtroAgencia)&&(filtroRolUsuarios==='all'||u.rol===filtroRolUsuarios)).map(u=>{
                const cfg = ROL_CFG[u.rol]||ROL_CFG.promotor
                const esYo = u.id===perfil?.id
                return (
                  <tr key={u.id} onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,.02)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{ fontFamily:'monospace', color:'#e2c27d' }}>@{u.username} {esYo&&<span style={{ fontSize:'9px', color:'#524438' }}>(yo)</span>}</td>
                    <td style={{ fontWeight:500, color:'#f0ebe0' }}>{u.nombre}</td>
                    <td><span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', color:cfg.color, background:cfg.bg }}>{u.rol}</span></td>
                    <td style={{ color:'#9a8668', fontFamily:'monospace' }}>{u.telefono||'—'}</td>
                    <td style={{ color:'#9a8668' }}>{(u.agencia as any)?.nombre||'—'}</td>
                    <td><span className={`badge ${u.activo?'badge-green':'badge-red'}`}>{u.activo?'Activo':'Inactivo'}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:'4px' }}>
                        <button className="btn-ghost" style={{ padding:'4px 8px', fontSize:'11px' }} onClick={()=>abrirEditar(u)}>✏️</button>
                        <button className="btn-ghost" style={{ padding:'4px 8px', fontSize:'11px' }} onClick={()=>{setSelected(u);setNewPass('');setError('');setModal('pass')}}>🔑</button>
                        {!esYo&&<button className={u.activo?'btn-danger':'btn-ghost'} style={{ padding:'4px 8px', fontSize:'11px' }} onClick={()=>toggleActivo(u)}>{u.activo?'Off':'On'}</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      {(modal==='nuevo'||modal==='editar') && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>{modal==='nuevo'?'+ Nuevo Usuario':'✏️ Editar Usuario'}</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>
            {renderForm()}
            {error && <div className="alert-error" style={{ marginBottom:'8px' }}>⚠ {error}</div>}
            {sqlFallback && (
              <div style={{ background:'#0a0a0a', border:'1px solid #333', borderRadius:'8px', padding:'10px', marginBottom:'10px' }}>
                <div style={{ fontSize:'10px', color:'#9a8668', marginBottom:'6px' }}>Ejecuta esto en Supabase SQL Editor:</div>
                <code style={{ fontSize:'11px', color:'#4caf82', wordBreak:'break-all' }}>{sqlFallback}</code>
                <button onClick={()=>{navigator.clipboard.writeText(sqlFallback);setSuccess('✓ Copiado al portapapeles')}} 
                  style={{ marginTop:'8px', background:'none', border:'1px solid #333', color:'#9a8668', borderRadius:'5px', padding:'3px 8px', fontSize:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                  📋 Copiar SQL
                </button>
              </div>
            )}
            {success && <div className="alert-info" style={{ marginBottom:'10px' }}>{success}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={modal==='nuevo'?crearUsuario:guardarEdicion} disabled={saving}>{saving?'Guardando...':modal==='nuevo'?'Crear':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reset password */}
      {modal==='pass' && selected && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div className="modal-title">🔑 Cambiar contraseña</div>

            {/* Info del usuario */}
            <div style={{ background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'10px 12px', marginBottom:'14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:600, color:'#f0ebe0' }}>{selected.nombre}</div>
                  <div style={{ fontSize:'11px', color:'#9a8668', fontFamily:'monospace' }}>@{selected.username}</div>
                </div>
                <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px',
                  color:'#4caf82', background:'rgba(76,175,130,.1)' }}>{selected.rol}</span>
              </div>
              <div style={{ fontSize:'10px', color:'#524438', marginTop:'6px', lineHeight:1.5 }}>
                ℹ️ Para ingresar al sistema el usuario escribe su <strong style={{ color:'#9a8668' }}>username</strong> (sin @) y la nueva contraseña.
              </div>
            </div>

            <div style={{ position:'relative', marginBottom:'14px' }}>
              <label className="f-lbl">Nueva contraseña (mínimo 6 caracteres)</label>
              <input className="f-inp" type={showPass?'text':'password'}
                style={{ paddingRight:'40px' }}
                value={newPass}
                onChange={e=>setNewPass(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&resetPass()}
                placeholder="Ej: 123456" />
              <button type="button" onClick={()=>setShowPass(!showPass)}
                style={{ position:'absolute', right:'10px', bottom:'10px', background:'none', border:'none', color:'#9a8668', cursor:'pointer', fontSize:'15px' }}>
                {showPass?'🙈':'👁'}
              </button>
            </div>

            {error && (
              <div className="alert-error" style={{ marginBottom:'10px', whiteSpace:'pre-wrap' }}>⚠ {error}</div>
            )}

            {/* SQL de respaldo siempre visible */}
            <div style={{ background:'#0a0a0a', border:'1px solid #2a2a2a', borderRadius:'8px', padding:'10px', marginBottom:'12px' }}>
              <div style={{ fontSize:'10px', color:'#524438', marginBottom:'5px' }}>
                🛠 Si falla, copia y ejecuta esto en <strong style={{ color:'#9a8668' }}>Supabase → SQL Editor</strong>:
              </div>
              <code style={{ fontSize:'11px', color:'#4caf82', wordBreak:'break-all', display:'block' }}>
                {`UPDATE auth.users SET encrypted_password = crypt('${newPass||'NUEVA_CLAVE'}', gen_salt('bf')) WHERE id = '${selected.id}';`}
              </code>
              <button
                onClick={()=>{
                  const sql = `UPDATE auth.users SET encrypted_password = crypt('${newPass||'NUEVA_CLAVE'}', gen_salt('bf')) WHERE id = '${selected.id}';`
                  navigator.clipboard.writeText(sql)
                  setSuccess('✓ SQL copiado al portapapeles — pégalo en Supabase SQL Editor')
                }}
                style={{ marginTop:'7px', background:'none', border:'1px solid #333', color:'#9a8668', borderRadius:'5px', padding:'3px 10px', fontSize:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                📋 Copiar SQL
              </button>
            </div>

            {success && <div className="alert-info" style={{ marginBottom:'10px' }}>{success}</div>}

            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>{setModal(null);setError('');setSuccess('');setNewPass('')}}>Cancelar</button>
              <button className="btn-gold" onClick={resetPass} disabled={saving||newPass.length<6}>
                {saving ? 'Cambiando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
