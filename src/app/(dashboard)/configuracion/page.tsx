'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Módulos del sistema con sus permisos
const MODULOS = [
  { id:'dashboard',   label:'Dashboard',          icon:'🏠', desc:'Ver dashboard y KPIs' },
  { id:'clientes',    label:'Clientes',            icon:'👥', desc:'Ver, crear y editar clientes' },
  { id:'prestamos',   label:'Préstamos',           icon:'💳', desc:'Ver préstamos' },
  { id:'prestamos_crear', label:'Crear solicitudes', icon:'➕', desc:'Crear nuevas solicitudes de préstamo' },
  { id:'prestamos_aprobar', label:'Aprobar préstamos', icon:'✅', desc:'Aprobar solicitudes pendientes' },
  { id:'prestamos_desembolsar', label:'Desembolsar', icon:'💸', desc:'Ejecutar desembolsos' },
  { id:'caja',        label:'Recaudos / Caja',     icon:'💰', desc:'Registrar y conciliar pagos' },
  { id:'fondeadores', label:'Fondeadores',         icon:'🏦', desc:'Ver y gestionar fondeadores' },
  { id:'calendario',  label:'Calendarios',         icon:'📅', desc:'Gestionar calendarios y feriados' },
  { id:'mensajeria',  label:'Mensajería',          icon:'💬', desc:'Enviar mensajes y gestionar plantillas' },
  { id:'usuarios',    label:'Usuarios',            icon:'👤', desc:'Ver y crear usuarios' },
  { id:'usuarios_editar', label:'Editar usuarios', icon:'✏️', desc:'Editar y desactivar usuarios' },
  { id:'agencias',    label:'Agencias',            icon:'🏢', desc:'Ver y gestionar agencias' },
  { id:'auditoria',   label:'Auditoría',           icon:'📋', desc:'Ver registros de auditoría' },
  { id:'papelera',    label:'Papelera',            icon:'🗑️', desc:'Gestionar elementos eliminados' },
  { id:'configuracion', label:'Configuración',     icon:'⚙️', desc:'Gestionar roles y permisos' },
  { id:'editar_comision', label:'Editar Comisiones', icon:'✏️', desc:'Editar comisiones en préstamos desembolsados' },
]

// Roles del sistema con permisos por defecto
const ROLES_DEFAULT: Record<string, string[]> = {
  superadmin: MODULOS.map(m=>m.id),
  admin: ['dashboard','clientes','prestamos','prestamos_crear','prestamos_aprobar','prestamos_desembolsar','caja','fondeadores','calendario','mensajeria','usuarios','usuarios_editar','agencias','auditoria','papelera'],
  gerente: ['dashboard','clientes','prestamos','prestamos_crear','prestamos_aprobar','caja','mensajeria','editar_comision'],
  promotor: ['dashboard','clientes','prestamos','prestamos_crear','caja','mensajeria','editar_comision'],
}

export default function ConfiguracionPage() {
  const supabase = createClient()
  const [roles, setRoles] = useState<any[]>([])
  const [selectedRol, setSelectedRol] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [modal, setModal] = useState<'nuevo_rol'|null>(null)
  const [nuevoRol, setNuevoRol] = useState({ nombre:'', descripcion:'', basado_en:'promotor' })
  const [permisos, setPermisos] = useState<Record<string,boolean>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id').eq('id', session.user.id).single()
        .then(({ data: p }) => { setPerfil(p); loadRoles(p) })
    })
  }, [])

  async function loadRoles(p: any) {
    setLoading(true)
    const { data: r } = await supabase.from('roles_config')
      .select('*').eq('agencia_id', p.agencia_id).order('created_at')
    
    if (!r || r.length === 0) {
      // Crear roles por defecto si no existen
      await crearRolesDefault(p)
      return loadRoles(p)
    }
    
    setRoles(r)
    if (r.length > 0) {
      setSelectedRol(r[0])
      setPermisos(r[0].permisos||{})
    }
    setLoading(false)
  }

  async function crearRolesDefault(p: any) {
    for (const [nombre, permArray] of Object.entries(ROLES_DEFAULT)) {
      const perms: Record<string,boolean> = {}
      permArray.forEach(pm => perms[pm] = true)
      await supabase.from('roles_config').upsert({
        nombre, agencia_id: p.agencia_id,
        descripcion: `Rol ${nombre} del sistema`,
        permisos: perms, es_sistema: true, activo: true
      }, { onConflict: 'nombre,agencia_id' })
    }
  }

  function seleccionarRol(r: any) {
    setSelectedRol(r)
    setPermisos(r.permisos||{})
    setSuccess('')
  }

  function togglePermiso(modId: string) {
    if (selectedRol?.es_sistema && selectedRol?.nombre==='superadmin') return // superadmin no se toca
    setPermisos(prev => ({ ...prev, [modId]: !prev[modId] }))
  }

  async function guardarPermisos() {
    if (!selectedRol) return
    setSaving(true); setSuccess('')
    const { error } = await supabase.from('roles_config')
      .update({ permisos, updated_at: new Date().toISOString() })
      .eq('id', selectedRol.id)
    if (error) { alert(error.message); setSaving(false); return }
    // Actualizar en la lista local
    setRoles(prev => prev.map(r => r.id===selectedRol.id ? {...r, permisos} : r))
    setSelectedRol((prev: any) => ({...prev, permisos}))
    setSuccess('✓ Permisos guardados correctamente')
    setSaving(false)
  }

  async function crearRol() {
    if (!nuevoRol.nombre.trim()) return
    setSaving(true)
    const basePerms = ROLES_DEFAULT[nuevoRol.basado_en]||[]
    const permsBase: Record<string,boolean> = {}
    basePerms.forEach(p => permsBase[p]=true)
    
    const { data, error } = await supabase.from('roles_config').insert({
      nombre: nuevoRol.nombre.trim().toLowerCase().replace(/\s+/g,'_'),
      agencia_id: perfil.agencia_id,
      descripcion: nuevoRol.descripcion,
      permisos: permsBase,
      es_sistema: false,
      activo: true,
    }).select().single()
    
    if (error) { alert(error.message); setSaving(false); return }
    setRoles(prev => [...prev, data])
    setSelectedRol(data); setPermisos(data.permisos||{})
    setModal(null); setSaving(false)
    setNuevoRol({ nombre:'', descripcion:'', basado_en:'promotor' })
  }

  async function eliminarRol(r: any) {
    if (r.es_sistema) { alert('No se pueden eliminar roles del sistema'); return }
    if (!confirm(`¿Eliminar el rol "${r.nombre}"?`)) return
    await supabase.from('roles_config').delete().eq('id', r.id)
    setRoles(prev => prev.filter(x=>x.id!==r.id))
    if (selectedRol?.id===r.id) {
      const first = roles.find(x=>x.id!==r.id)
      if (first) { setSelectedRol(first); setPermisos(first.permisos||{}) }
    }
  }

  const ROL_COLOR: Record<string,string> = { superadmin:'#e2c27d', admin:'#c9a84c', gerente:'#5a8fc0', promotor:'#4caf82' }
  const isSuperAdmin = perfil?.rol === 'superadmin'

  return (
    <div className="page">
      <div style={{ marginBottom:'16px' }}>
        <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>⚙️ Configuración de Roles</h1>
        <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>Define qué puede hacer cada rol en el sistema</p>
      </div>

      {loading ? <div style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando configuración...</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:'14px' }}>

          {/* Lista de roles */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <div style={{ fontSize:'10px', fontWeight:'600', color:'#524438', textTransform:'uppercase', letterSpacing:'1px' }}>Roles</div>
              <button onClick={()=>setModal('nuevo_rol')} style={{ background:'none', border:'1px solid #333', color:'#c9a84c', borderRadius:'6px', padding:'3px 8px', fontSize:'10px', cursor:'pointer' }}>+ Nuevo</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {roles.map(r => {
                const color = ROL_COLOR[r.nombre]||'#9a8668'
                const active = selectedRol?.id===r.id
                return (
                  <div key={r.id} onClick={()=>seleccionarRol(r)}
                    style={{ background:active?`${color}12`:'#141414', border:`1px solid ${active?color+'44':'#252525'}`, borderRadius:'9px', padding:'10px 12px', cursor:'pointer', transition:'all .15s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:'13px', fontWeight:active?600:400, color:active?color:'#f0ebe0', textTransform:'capitalize' }}>{r.nombre}</div>
                      {!r.es_sistema && (
                        <button onClick={e=>{e.stopPropagation();eliminarRol(r)}} style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'12px', padding:'0 2px' }}>🗑</button>
                      )}
                    </div>
                    {r.descripcion && <div style={{ fontSize:'10px', color:'#524438', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.descripcion}</div>}
                    <div style={{ fontSize:'9px', color:color, marginTop:'3px' }}>
                      {Object.values(r.permisos||{}).filter(Boolean).length} permisos
                      {r.es_sistema && <span style={{ marginLeft:'4px', color:'#524438' }}>· sistema</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Panel de permisos */}
          {selectedRol ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:'600', color:'#f0ebe0', textTransform:'capitalize' }}>{selectedRol.nombre}</div>
                  <div style={{ fontSize:'11px', color:'#9a8668' }}>{selectedRol.descripcion}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  {success && <span style={{ fontSize:'11px', color:'#4caf82' }}>{success}</span>}
                  {selectedRol.nombre !== 'superadmin' && (
                    <button className="btn-gold" onClick={guardarPermisos} disabled={saving} style={{ padding:'8px 14px', fontSize:'12px' }}>
                      {saving?'Guardando...':'💾 Guardar cambios'}
                    </button>
                  )}
                </div>
              </div>

              {selectedRol.nombre === 'superadmin' && (
                <div className="alert-warn" style={{ marginBottom:'12px' }}>El rol SuperAdmin tiene acceso completo al sistema y no puede modificarse.</div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:'8px' }}>
                {MODULOS.map(mod => {
                  const activo = !!permisos[mod.id]
                  const bloqueado = selectedRol.nombre === 'superadmin'
                  return (
                    <div key={mod.id}
                      onClick={()=>!bloqueado && togglePermiso(mod.id)}
                      style={{ background:activo?'rgba(201,168,76,.07)':'#141414', border:`1px solid ${activo?'rgba(201,168,76,.25)':'#252525'}`, borderRadius:'9px', padding:'12px', cursor:bloqueado?'default':'pointer', display:'flex', alignItems:'center', gap:'10px', transition:'all .15s' }}>
                      {/* Checkbox */}
                      <div style={{ width:'18px', height:'18px', borderRadius:'5px', flexShrink:0, border:activo?'none':'1.5px solid #3a3a3a', background:activo?'linear-gradient(135deg,#c9a84c,#e2c27d)':'#191919', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {activo && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="#0c0c0c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:500, color:activo?'#f0ebe0':'#9a8668', display:'flex', alignItems:'center', gap:'5px' }}>
                          <span>{mod.icon}</span> {mod.label}
                        </div>
                        <div style={{ fontSize:'10px', color:'#524438', marginTop:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mod.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#524438', fontSize:'13px' }}>Selecciona un rol para ver sus permisos</div>
          )}
        </div>
      )}

      {/* Modal nuevo rol */}
      {modal === 'nuevo_rol' && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div className="modal-title">+ Nuevo Rol personalizado</div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label className="f-lbl">Nombre del rol *</label>
                <input className="f-inp" value={nuevoRol.nombre} onChange={e=>setNuevoRol(f=>({...f,nombre:e.target.value}))} placeholder="ej: supervisor, cobrador..." />
              </div>
              <div>
                <label className="f-lbl">Descripción</label>
                <input className="f-inp" value={nuevoRol.descripcion} onChange={e=>setNuevoRol(f=>({...f,descripcion:e.target.value}))} placeholder="¿Qué hace este rol?" />
              </div>
              <div>
                <label className="f-lbl">Basado en (permisos iniciales de)</label>
                <select className="f-sel" value={nuevoRol.basado_en} onChange={e=>setNuevoRol(f=>({...f,basado_en:e.target.value}))}>
                  <option value="promotor">Promotor (acceso básico)</option>
                  <option value="gerente">Gerente (acceso medio)</option>
                  <option value="admin">Admin (acceso amplio)</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={crearRol} disabled={saving||!nuevoRol.nombre.trim()}>{saving?'Creando...':'Crear rol'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
