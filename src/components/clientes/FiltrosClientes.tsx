'use client'
// src/components/clientes/FiltrosClientes.tsx
import { useState } from 'react'
import type { Rol } from '@/types'

export default function FiltrosClientes({ rol }: { rol: Rol }) {
  const [promotor, setPromotor] = useState('')
  const [estado, setEstado] = useState('')
  const [agencia, setAgencia] = useState('')

  function limpiar() { setPromotor(''); setEstado(''); setAgencia('') }

  const sel = { background: 'transparent', border: 'none', color: '#f5f0e8',
    fontSize: '12px', padding: 0, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }

  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: '#141414', border: '1px solid #2c2c2c' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#5a4f42' }}>
          Filtrar:
        </span>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
          <span className="text-xs" style={{ color: '#a08c6e' }}>👤</span>
          <select value={promotor} onChange={e => setPromotor(e.target.value)} style={sel as React.CSSProperties}>
            <option value="">Todos los promotores</option>
            <option>J. Martínez</option><option>L. Pérez</option><option>M. Santos</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
          <span className="text-xs" style={{ color: '#a08c6e' }}>📊</span>
          <select value={estado} onChange={e => setEstado(e.target.value)} style={sel as React.CSSProperties}>
            <option value="">Todos los estados</option>
            <option>Al día</option><option>En mora</option><option>Sin préstamos</option>
          </select>
        </div>

        {rol === 'superadmin' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: '#1c1c1c', border: '1px solid #2c2c2c' }}>
            <span className="text-xs" style={{ color: '#a08c6e' }}>🏢</span>
            <select value={agencia} onChange={e => setAgencia(e.target.value)} style={sel as React.CSSProperties}>
              <option value="">Todas las agencias</option>
              <option>Panamá Central</option><option>Panamá Este</option>
              <option>Colón</option><option>Chiriquí</option>
            </select>
          </div>
        )}

        <button onClick={limpiar} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid #3a3a3a', color: '#a08c6e' }}>
          ✕ Limpiar
        </button>
      </div>
    </div>
  )
}
