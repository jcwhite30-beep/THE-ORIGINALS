'use client'
import { Suspense } from 'react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function PerfilContent() {
  const supabase = createClient()
  const [pass, setPass] = useState({ nueva: '', confirmar: '' })
  const [msg, setMsg] = useState('')

  async function handleCambio(e: React.FormEvent) {
    e.preventDefault()
    if (pass.nueva !== pass.confirmar) { setMsg('Las contraseñas no coinciden'); return }
    const { error } = await supabase.auth.updateUser({ password: pass.nueva })
    if (error) { setMsg(error.message); return }
    setMsg('✓ Contraseña actualizada correctamente')
    setPass({ nueva: '', confirmar: '' })
  }

  const inp = { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'12px 14px', color:'#f5f0e8', fontSize:'14px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit' }

  return (
    <div style={{ padding:'32px 28px', fontFamily:'system-ui,sans-serif', maxWidth:'480px' }}>
      <h1 style={{ fontSize:'26px', fontWeight:'700', color:'#f5f0e8', margin:'0 0 6px' }}>Mi Perfil</h1>
      <p style={{ fontSize:'12px', color:'#a08c6e', margin:'0 0 28px' }}>Seguridad de cuenta</p>
      <div style={{ background:'#141414', border:'1px solid #2c2c2c', borderRadius:'14px', padding:'24px' }}>
        <div style={{ fontSize:'13px', fontWeight:'500', color:'#e2c27d', marginBottom:'16px', paddingBottom:'12px', borderBottom:'1px solid #2c2c2c' }}>Cambiar Contraseña</div>
        <form onSubmit={handleCambio}>
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#7a6a5a', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>Nueva contraseña</label>
            <input style={inp} type="password" value={pass.nueva} onChange={e => setPass(p => ({...p, nueva: e.target.value}))} required />
          </div>
          <div style={{ marginBottom:'20px' }}>
            <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#7a6a5a', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>Confirmar contraseña</label>
            <input style={inp} type="password" value={pass.confirmar} onChange={e => setPass(p => ({...p, confirmar: e.target.value}))} required />
          </div>
          {msg && <div style={{ padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'16px', background: msg.startsWith('✓') ? 'rgba(76,175,130,0.1)' : 'rgba(192,83,78,0.1)', color: msg.startsWith('✓') ? '#4caf82' : '#c0534e', border: `1px solid ${msg.startsWith('✓') ? 'rgba(76,175,130,0.2)' : 'rgba(192,83,78,0.2)'}` }}>{msg}</div>}
          <button type="submit" style={{ background:'linear-gradient(135deg,#b8922a,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'11px 20px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>Actualizar</button>
        </form>
      </div>
    </div>
  )
}

export default function PerfilPage() {
  return <Suspense fallback={<div style={{ padding:'40px', color:'#5a4f42' }}>Cargando...</div>}><PerfilContent /></Suspense>
}
