'use client'
// src/components/layout/Topbar.tsx
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Usuario } from '@/types'
import { LogOut } from 'lucide-react'

const ROL_LABELS: Record<string, string> = {
  promotor: 'PROMOTOR', gerente: 'GERENTE',
  admin: 'ADMIN', superadmin: 'SUPERADMIN',
}

export default function Topbar({ usuario, agenciaNombre }: {
  usuario: Usuario
  agenciaNombre: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const initials = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="h-[52px] flex items-center gap-4 px-5 flex-shrink-0"
      style={{ background: '#141414', borderBottom: '1px solid #2c2c2c', zIndex: 50 }}>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-xl font-semibold tracking-wider" style={{ color: '#e2c27d' }}>APP</span>
        <span className="text-xs" style={{ color: '#5a4f42' }}>Administrador de Préstamos Personales</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6" style={{ background: '#2c2c2c' }} />

      {/* Agencia */}
      <span className="text-xs" style={{ color: '#a08c6e' }}>
        Agencia <strong style={{ color: '#f5f0e8', fontWeight: 500 }}>{agenciaNombre}</strong>
      </span>

      {/* Right */}
      <div className="ml-auto flex items-center gap-3">
        {/* Rol badge */}
        <span className="text-[10px] font-semibold px-3 py-1 rounded-full tracking-widest uppercase"
          style={{ background: 'rgba(201,168,76,0.10)', color: '#e2c27d', border: '1px solid rgba(201,168,76,0.3)' }}>
          {ROL_LABELS[usuario.rol]}
        </span>

        {/* Avatar */}
        <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold text-[#0c0c0c] flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #c9a84c, #8a6020)', border: '1px solid #c9a84c' }}>
          {initials}
        </div>

        {/* Logout */}
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{ border: '1px solid #3a3a3a', color: '#a08c6e' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a84c'; e.currentTarget.style.color = '#c9a84c' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3a3a'; e.currentTarget.style.color = '#a08c6e' }}>
          <LogOut size={12} /> Salir
        </button>
      </div>
    </header>
  )
}
