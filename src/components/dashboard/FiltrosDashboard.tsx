'use client'
// src/components/dashboard/FiltrosDashboard.tsx
import { useState } from 'react'
import type { Rol } from '@/types'

export default function FiltrosDashboard({ rol }: { rol: Rol }) {
  const [usuario, setUsuario] = useState('')
  const [rolFiltro, setRolFiltro] = useState('')
  const [agencia, setAgencia] = useState('')
  const activos = [usuario, rolFiltro, agencia].filter(Boolean)

  function limpiar() { setUsuario(''); setRolFiltro(''); setAgencia('') }

  const selectStyle = {
    background: 'transparent', border: 'none',
    color: '#f5f0e8', fontSize: '12px', padding: 0, outline: 'none',
    fontFamily: 'inherit', cursor: 'pointer',
  }

  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: '#141414', border: '1px solid #2c2c2c' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
          style={{ color: '#5a4f42' }}>Filtrar vista:</span>

        {/* Usuario */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
          <span className="text-xs" style={{ color: '#a08c6e' }}>👤</span>
          <select value={usuario} onChange={e => setUsuario(e.target.value)} style={selectStyle as React.CSSProperties}>
            <option value="">Todos los usuarios</option>
            <option>J. Martínez (Promotor)</option>
            <option>L. Pérez (Promotor)</option>
            <option>M. Santos (Promotor)</option>
            <option>R. Gómez (Gerente)</option>
          </select>
        </div>

        {/* Rol */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
          <span className="text-xs" style={{ color: '#a08c6e' }}>🏷</span>
          <select value={rolFiltro} onChange={e => setRolFiltro(e.target.value)} style={selectStyle as React.CSSProperties}>
            <option value="">Todos los roles</option>
            <option>Promotor</option>
            <option>Gerente</option>
            <option>Admin</option>
          </select>
        </div>

        {/* Agencia: solo SuperAdmin */}
        {rol === 'superadmin' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
            <span className="text-xs" style={{ color: '#a08c6e' }}>🏢</span>
            <select value={agencia} onChange={e => setAgencia(e.target.value)} style={selectStyle as React.CSSProperties}>
              <option value="">Todas las agencias</option>
              <option>Panamá Central</option>
              <option>Panamá Este</option>
              <option>Colón</option>
              <option>Chiriquí</option>
            </select>
          </div>
        )}

        <button onClick={limpiar}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ border: '1px solid #3a3a3a', color: '#a08c6e' }}>
          ✕ Limpiar
        </button>

        {activos.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#e2c27d' }}>
            🔍 {activos.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
