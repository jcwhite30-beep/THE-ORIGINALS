'use client'
// src/components/dashboard/CortesTable.tsx
import type { Corte, Rol } from '@/types'
import { buildWAUrl } from '@/types'
import { format } from 'date-fns'

export default function CortesTable({ cortes, rol }: { cortes: Corte[]; rol: Rol }) {
  function enviarWA(corte: Corte) {
    const cliente = (corte.prestamo as any)?.cliente
    if (!cliente?.telefono) return alert('Este cliente no tiene teléfono registrado')
    const url = buildWAUrl(cliente.telefono, {
      id: '', agencia_id: '', nombre: 'Recordatorio de Cobro',
      mensaje: 'Estimado {{cliente}}, le recordamos que su pago de {{interes}} vence hoy {{fecha_corte}}.',
      disparador: 'recordatorio', activa: true, created_by: null,
      created_at: '', updated_at: ''
    }, {
      cliente: cliente.nombre,
      interes: `$${corte.monto_interes.toLocaleString()}`,
      fecha_corte: format(new Date(corte.fecha_ajustada), 'dd/MM/yyyy'),
    })
    window.open(url, '_blank')
  }

  const hoy = format(new Date(), 'dd/MM/yyyy')

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2c2c2c' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2c2c2c', background: '#141414' }}>
        <div>
          <div className="text-[13px] font-medium" style={{ color: '#f5f0e8' }}>📅 Cortes del Día — {hoy}</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#5a4f42' }}>Fechas ajustadas según Calendario de Feriados</div>
        </div>
        <span className="text-[10px] px-3 py-1 rounded-full" style={{ background: '#1c1c1c', border: '1px solid #2c2c2c', color: '#a08c6e' }}>
          {cortes.length} cobro{cortes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {cortes.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: '#5a4f42', background: '#141414' }}>
          No hay cobros programados para hoy
        </div>
      ) : (
        <table className="w-full" style={{ background: '#141414' }}>
          <thead>
            <tr>
              {['Cliente', 'Interés', 'Periodicidad', 'Fecha Orig.', 'Fecha Ajust.', 'Estado', ''].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-[0.8px] px-5 py-3"
                  style={{ color: '#5a4f42', borderBottom: '1px solid #2c2c2c' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cortes.map(corte => {
              const cliente = (corte.prestamo as any)?.cliente
              const anticipado = corte.fecha_original !== corte.fecha_ajustada
              return (
                <tr key={corte.id} className="group"
                  style={{ borderBottom: '1px solid #2c2c2c' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-5 py-3 text-sm font-medium" style={{ color: '#f5f0e8' }}>
                    {cliente?.nombre ?? '—'}
                    {anticipado && (
                      <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(192,154,76,0.15)', color: '#c09a4c' }}>⏰ Anticipado</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: '#e2c27d' }}>
                    ${corte.monto_interes.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] px-2 py-1 rounded"
                      style={{ background: '#1c1c1c', border: '1px solid #2c2c2c', color: '#a08c6e' }}>
                      Mensual
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: '#5a4f42' }}>
                    {format(new Date(corte.fecha_original), 'dd/MM/yy')}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: anticipado ? '#c09a4c' : '#a08c6e' }}>
                    {format(new Date(corte.fecha_ajustada), 'dd/MM/yy')}
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full w-fit"
                      style={{ background: 'rgba(192,154,76,0.08)', color: '#c09a4c', border: '1px solid rgba(192,154,76,0.2)' }}>
                      <span className="w-1 h-1 rounded-full" style={{ background: '#c09a4c' }} />
                      Pendiente
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => enviarWA(corte)}
                      className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
                      style={{ background: 'rgba(37,211,102,0.08)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}>
                      💬 WA
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
