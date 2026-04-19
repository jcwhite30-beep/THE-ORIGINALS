'use client'
// src/components/clientes/ClientesTable.tsx
import type { Cliente, Rol } from '@/types'

const ESTADO_PILL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'al_dia':        { label: 'Al día',      color: '#4caf82', bg: 'rgba(76,175,130,0.08)',  border: 'rgba(76,175,130,0.2)'  },
  'en_mora':       { label: 'En mora',     color: '#c0534e', bg: 'rgba(192,83,78,0.08)',   border: 'rgba(192,83,78,0.2)'   },
  'sin_prestamos': { label: 'Sin préstamos', color: '#a08c6e', bg: '#1c1c1c',              border: '#2c2c2c'               },
}

export default function ClientesTable({ clientes, rol }: { clientes: Cliente[]; rol: Rol }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2c2c2c' }}>
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid #2c2c2c', background: '#141414' }}>
        <div className="text-[13px] font-medium" style={{ color: '#f5f0e8' }}>Directorio</div>
        <div className="flex gap-2">
          <input placeholder="Buscar cliente..." className="text-xs px-3 py-1.5 rounded-lg outline-none"
            style={{ background: '#1c1c1c', border: '1px solid #2c2c2c', color: '#f5f0e8', width: 200 }} />
        </div>
      </div>
      <table className="w-full" style={{ background: '#141414' }}>
        <thead>
          <tr>
            {['#', 'Cliente', 'Cédula', 'Teléfono', 'Promotor', 'Referido Feria', 'Estado', ''].map(h => (
              <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-[0.8px] px-5 py-3"
                style={{ color: '#5a4f42', borderBottom: '1px solid #2c2c2c' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clientes.length === 0 ? (
            <tr><td colSpan={8} className="px-5 py-10 text-center text-sm" style={{ color: '#5a4f42' }}>
              No hay clientes registrados
            </td></tr>
          ) : clientes.map((c, i) => (
            <tr key={c.id}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.025)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              style={{ borderBottom: '1px solid #2c2c2c' }}>
              <td className="px-5 py-3 font-mono text-xs" style={{ color: '#5a4f42' }}>
                {String(i + 1).padStart(3, '0')}
              </td>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: '#f5f0e8' }}>{c.nombre}</td>
              <td className="px-5 py-3 font-mono text-xs" style={{ color: '#a08c6e' }}>{c.cedula}</td>
              <td className="px-5 py-3 font-mono text-xs" style={{ color: '#a08c6e' }}>{c.telefono ?? '—'}</td>
              <td className="px-5 py-3 text-xs" style={{ color: '#a08c6e' }}>
                {(c as any).promotor?.nombre ?? '—'}
              </td>
              <td className="px-5 py-3">
                {c.referido_feria
                  ? <span className="text-[10px] px-2 py-1 rounded font-semibold"
                      style={{ background: 'rgba(201,168,76,0.1)', color: '#e2c27d', border: '1px solid rgba(201,168,76,0.2)' }}>
                      🎪 Feria
                    </span>
                  : <span className="text-[10px]" style={{ color: '#5a4f42' }}>—</span>
                }
              </td>
              <td className="px-5 py-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit"
                  style={{ background: 'rgba(76,175,130,0.08)', color: '#4caf82', border: '1px solid rgba(76,175,130,0.2)' }}>
                  <span className="w-1 h-1 rounded-full" style={{ background: '#4caf82' }} />
                  Al día
                </span>
              </td>
              <td className="px-5 py-3">
                <button className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ border: '1px solid #3a3a3a', color: '#a08c6e' }}>
                  Ver →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
