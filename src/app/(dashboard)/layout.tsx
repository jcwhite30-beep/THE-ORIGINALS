'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href:'/dashboard',   emoji:'🏠', label:'Inicio',     roles:['promotor','gerente','admin','superadmin'] },
  { href:'/clientes',    emoji:'👥', label:'Clientes',   roles:['promotor','gerente','admin','superadmin'] },
  { href:'/prestamos',   emoji:'💳', label:'Préstamos',  roles:['promotor','gerente','admin','superadmin'] },
  { href:'/caja',        emoji:'💰', label:'Recaudos',   roles:['promotor','gerente','admin','superadmin'] },
  { href:'/fondeadores', emoji:'🏦', label:'Fondos',     roles:['admin','superadmin'] },
  { href:'/calendario',  emoji:'📅', label:'Calendario', roles:['admin','superadmin'] },
  { href:'/whatsapp',    emoji:'💬', label:'Mensajes',   roles:['promotor','gerente','admin','superadmin'] },
  { href:'/usuarios',    emoji:'👤', label:'Usuarios',   roles:['admin','superadmin'] },
  { href:'/agencias',    emoji:'🏢', label:'Agencias',   roles:['superadmin'] },
  { href:'/auditoria',   emoji:'📋', label:'Auditoría',  roles:['superadmin'] },
  { href:'/papelera',    emoji:'🗑️',  label:'Papelera',   roles:['admin','superadmin'] },
  { href:'/configuracion', emoji:'⚙️', label:'Roles y Permisos', roles:['superadmin'] },
  { href:'/perfil',      emoji:'⚙️',  label:'Perfil',     roles:['promotor','gerente','admin','superadmin'] },
]
const ROL_COLOR: Record<string,string> = { superadmin:'#e2c27d', admin:'#c9a84c', gerente:'#5a8fc0', promotor:'#4caf82' }

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<any[]>([])
  const [showN, setShowN] = useState(false)
  const audioCtx = useRef<any>(null)

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      supabase.from('usuarios')
        .select('*, agencia:agencias(nombre,moneda_principal,monedas)')
        .eq('id', session.user.id).single()
        .then(async ({ data: p }) => {
          if (!p) { router.replace('/login'); return }
          // Cargar permisos del rol desde roles_config
          const { data: rc } = await supabase.from('roles_config')
            .select('permisos').eq('nombre', p.rol).maybeSingle()
          if (rc?.permisos) {
            p._permisos = rc.permisos  // ej: { mensajeria: false, clientes: true, ... }
          }
          setPerfil(p); setLoading(false)
          // Log de acceso al sistema
          supabase.from('logs_auditoria').insert({
            accion: 'login',
            tipo_accion: 'login',
            agencia_id: p.agencia_id,
            usuario_id: p.id,
            username: p.username,
            rol: p.rol,
            descripcion: `Acceso al sistema: ${p.nombre}`,
            created_at: new Date().toISOString()
          }).then(() => {})
          // Realtime notificaciones
          supabase.channel('notif-rt')
            .on('postgres_changes', { event:'INSERT', schema:'public', table:'logs_auditoria', filter:`agencia_id=eq.${p.agencia_id}` }, (pl: any) => {
              const log = pl.new as any
              const labels: Record<string,string> = {
                solicitud_prestamo:'💳 Nueva solicitud',
                prestamo_aprobado:'✅ Préstamo aprobado',
                desembolso:'💸 Desembolso realizado',
                pago_registrado:'💰 Pago registrado',
                pago_conciliado:'⚖️ Pago conciliado',
              }
              // cliente_creado solo va a campana, NO a WA
              if (log.tipo_accion === 'cliente_creado') {
                setNotifs(prev => [{ id:Date.now(), tipo:'cliente_creado', msg:'👤 Cliente registrado', ts:new Date() }, ...prev].slice(0,30))
                beep('cliente_creado')
                return
              }
              const label = labels[log.tipo_accion]; if (!label) return
              const msg = log.descripcion ? `${label}: ${log.descripcion}` : label
              setNotifs(prev => [{ id:Date.now(), tipo:log.tipo_accion, msg, ts:new Date() }, ...prev].slice(0,30))
              beep(log.tipo_accion)
              // WA solo para eventos críticos — solo 1 ventana usando target único
              const tiposWA = ['solicitud_prestamo','prestamo_aprobado','desembolso']
              if (p.telefono && (p.rol==='superadmin'||p.rol==='admin') && tiposWA.includes(log.tipo_accion)) {
                const tel = p.telefono.replace(/\D/g,'')
                const num = tel.startsWith('507') ? tel : `507${tel}`
                // '_blank_wa' como target fijo — reutiliza la misma ventana
                window.open(`https://wa.me/${num}?text=${encodeURIComponent(`🔔 *APP — ${p.agencia?.nombre}*\n${msg}`)}`, 'wa_app')
              }
            }).subscribe()
        })
    })
  }, [])

  function beep(tipo: string) {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      const ctx = audioCtx.current
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      if (['desembolso','pago_conciliado'].includes(tipo)) {
        ;[523,659,784].forEach((f,i) => o.frequency.setValueAtTime(f, ctx.currentTime+i*.12))
        g.gain.setValueAtTime(.18, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+.5)
        o.start(); o.stop(ctx.currentTime+.5)
      } else {
        o.frequency.setValueAtTime(880, ctx.currentTime)
        o.frequency.setValueAtTime(660, ctx.currentTime+.1)
        g.gain.setValueAtTime(.14, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+.28)
        o.start(); o.stop(ctx.currentTime+.28)
      }
    } catch {}
  }

  async function logout() {
    if (perfil) {
      await supabase.from('logs_auditoria').insert({
        accion: 'logout', tipo_accion: 'logout',
        agencia_id: perfil.agencia_id, usuario_id: perfil.id,
        username: perfil.username, rol: perfil.rol,
        descripcion: `Salida del sistema: ${perfil.nombre}`,
        created_at: new Date().toISOString()
      })
    }
    await supabase.auth.signOut(); router.replace('/login')
  }

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#090909' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'26px', fontWeight:'900', letterSpacing:'10px', background:'linear-gradient(90deg,#c9a84c,#fff3c4,#c9a84c)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>APP</div>
        <div style={{ color:'#524438', fontSize:'11px', marginTop:'8px' }}>Cargando...</div>
      </div>
    </div>
  )

  const rol = perfil?.rol||'promotor'
  const nombre = perfil?.nombre||''
  const agencia = perfil?.agencia?.nombre||'APP'
  const initials = nombre.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
  // Mapeo de ruta → módulo de permisos
  const HREF_MODULO: Record<string,string> = {
    '/dashboard':'dashboard', '/clientes':'clientes', '/prestamos':'prestamos',
    '/caja':'caja', '/fondeadores':'fondeadores', '/calendario':'calendario',
    '/whatsapp':'mensajeria', '/usuarios':'usuarios', '/agencias':'agencias',
    '/auditoria':'auditoria', '/papelera':'papelera', '/configuracion':'configuracion',
    '/perfil':'dashboard',
  }
  const perm = perfil?._permisos  // undefined = sin restricciones en roles_config
  const items = NAV.filter(n => {
    // Primero filtrar por rol base (superadmin siempre ve todo)
    if (!n.roles.includes(rol)) return false
    // Si hay permisos configurados en roles_config, respetarlos
    if (perm) {
      const modulo = HREF_MODULO[n.href]
      if (modulo && modulo in perm) return perm[modulo] === true
    }
    return true
  })
  // bottomItems eliminado — se usa el menú lateral
  const noLeidas = notifs.length

  const sidebarGroups = [
    { t:'Principal', paths:['/dashboard','/clientes'] },
    { t:'Crédito', paths:['/prestamos','/caja'] },
    { t:'Operaciones', paths:['/fondeadores','/calendario','/whatsapp'] },
    { t:'Admin', paths:['/usuarios','/agencias'] },
    { t:'Control', paths:['/auditoria','/papelera','/configuracion','/perfil'] },
  ]

  return (
    <div className="app-shell">
      {/* TOPBAR */}
      <header className="topbar">
        <button onClick={()=>setOpen(!open)} style={{ background:'none', border:'none', color:'#9a8668', fontSize:'19px', padding:'4px 6px', lineHeight:1, display:'flex', alignItems:'center' }}>
          {open ? '✕' : '☰'}
        </button>
        <span style={{ fontSize:'17px', fontWeight:'900', letterSpacing:'4px', color:'#e2c27d' }}>APP</span>
        <span style={{ fontSize:'11px', color:'#524438', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100px' }}>{agencia}</span>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
          {/* Campana */}
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowN(!showN)} style={{ background:'none', border:'1px solid #252525', color:noLeidas>0?'#c9a84c':'#524438', borderRadius:'7px', width:'30px', height:'30px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', position:'relative' }}>
              🔔
              {noLeidas>0 && <span style={{ position:'absolute', top:'-3px', right:'-3px', background:'#c0534e', color:'#fff', fontSize:'8px', fontWeight:'700', borderRadius:'10px', padding:'1px 4px', minWidth:'13px', textAlign:'center', lineHeight:'13px' }}>{noLeidas>9?'9+':noLeidas}</span>}
            </button>
            {showN && (
              <div style={{ position:'absolute', right:0, top:'36px', width:'250px', background:'#111', border:'1px solid #252525', borderRadius:'12px', boxShadow:'0 8px 30px rgba(0,0,0,.6)', zIndex:300, overflow:'hidden' }}>
                <div style={{ padding:'9px 12px', borderBottom:'1px solid #1e1e1e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:'11px', fontWeight:600, color:'#e2c27d' }}>Notificaciones</span>
                  <button onClick={()=>{setNotifs([]);setShowN(false)}} style={{ background:'none', border:'none', color:'#524438', fontSize:'11px', cursor:'pointer' }}>Limpiar</button>
                </div>
                <div style={{ maxHeight:'260px', overflowY:'auto' }}>
                  {notifs.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#524438', fontSize:'12px' }}>Sin notificaciones</div>
                  : notifs.map(n=>(
                    <div key={n.id} style={{ padding:'9px 12px', borderBottom:'1px solid #1c1c1c' }}>
                      <div style={{ fontSize:'12px', color:'#f0ebe0', marginBottom:'2px' }}>{n.msg}</div>
                      <div style={{ fontSize:'10px', color:'#524438' }}>{n.ts.toLocaleTimeString('es-PA')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span style={{ fontSize:'9px', fontWeight:'600', padding:'2px 7px', borderRadius:'20px', background:'rgba(201,168,76,.1)', color:ROL_COLOR[rol]||'#e2c27d', border:'1px solid rgba(201,168,76,.18)', letterSpacing:'1px', textTransform:'uppercase', whiteSpace:'nowrap' }} className="desk-only">{rol}</span>
          <div style={{ width:'27px', height:'27px', borderRadius:'50%', background:'linear-gradient(135deg,#c9a84c,#8a6020)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#0c0c0c', flexShrink:0 }}>{initials}</div>
          <button onClick={logout} style={{ background:'none', border:'1px solid #252525', color:'#524438', fontSize:'10px', padding:'5px 8px', borderRadius:'6px', whiteSpace:'nowrap', flexShrink:0 }}>Salir</button>
        </div>
      </header>

      <div className="app-body">
        {/* SIDEBAR */}
        <aside className={`sidebar${open?' open':''}`}>
          <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
            {sidebarGroups.map(g => {
              const gi = items.filter(n=>g.paths.includes(n.href))
              if (!gi.length) return null
              return (
                <div key={g.t} style={{ marginBottom:'14px' }}>
                  <div style={{ fontSize:'8px', fontWeight:'600', color:'#333', textTransform:'uppercase', letterSpacing:'2px', padding:'0 8px', marginBottom:'3px' }}>{g.t}</div>
                  {gi.map(n => {
                    const active = pathname===n.href||pathname.startsWith(n.href+'/')
                    return (
                      <a key={n.href} href={n.href} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', marginBottom:'1px', color:active?'#e2c27d':'#6a5a48', background:active?'rgba(201,168,76,.09)':'transparent', fontWeight:active?500:400, fontSize:'13px', borderLeft:`2px solid ${active?'#c9a84c':'transparent'}` }}>
                        <span style={{ fontSize:'14px', flexShrink:0 }}>{n.emoji}</span>{n.label}
                      </a>
                    )
                  })}
                </div>
              )
            })}
          </nav>
          <div style={{ padding:'8px', borderTop:'1px solid #1e1e1e' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', background:'#1a1a1a', borderRadius:'8px', border:'1px solid #222' }}>
              <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:'linear-gradient(135deg,#c9a84c,#8a6020)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#0c0c0c', flexShrink:0 }}>{initials}</div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'12px', fontWeight:500, color:'#f0ebe0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'140px' }}>{nombre}</div>
                <div style={{ fontSize:'9px', color:ROL_COLOR[rol], letterSpacing:'.5px' }}>{rol.toUpperCase()}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="app-main">{children}</main>
      </div>

      {/* bottom nav eliminado — se usa el menú lateral con el botón ☰ */}

      {/* OVERLAYS */}
      <div className={`overlay${open?' show':''}`} onClick={()=>setOpen(false)}/>
      {showN && <div style={{ position:'fixed', inset:0, zIndex:200 }} onClick={()=>setShowN(false)}/>}
    </div>
  )
}
