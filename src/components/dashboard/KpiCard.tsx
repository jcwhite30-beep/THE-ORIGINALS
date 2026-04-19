// src/components/dashboard/KpiCard.tsx
type Color = 'gold' | 'green' | 'red' | 'amber'

const COLORS: Record<Color, { value: string; border: string; bg: string; bar: string }> = {
  gold:  { value: '#e2c27d', border: 'rgba(201,168,76,0.2)',   bg: 'rgba(201,168,76,0.05)',   bar: 'linear-gradient(90deg,#c9a84c,#e2c27d)' },
  green: { value: '#4caf82', border: 'rgba(76,175,130,0.2)',   bg: 'rgba(76,175,130,0.05)',   bar: '#4caf82' },
  red:   { value: '#c0534e', border: 'rgba(192,83,78,0.2)',    bg: 'rgba(192,83,78,0.05)',    bar: '#c0534e' },
  amber: { value: '#c09a4c', border: 'rgba(192,154,76,0.2)',   bg: 'rgba(192,154,76,0.05)',   bar: '#c09a4c' },
}

export default function KpiCard({ color, label, value, delta, icon }: {
  color: Color
  label: string
  value: string
  delta?: string
  icon?: string
}) {
  const c = COLORS[color]
  return (
    <div className="rounded-xl p-5 relative overflow-hidden"
      style={{ background: c.bg, border: `1px solid ${c.border}`, borderTop: `2px solid ${c.value}` }}>
      {icon && <span className="absolute bottom-4 right-4 text-2xl opacity-20">{icon}</span>}
      <div className="text-[10px] font-semibold uppercase tracking-[1px] mb-2.5" style={{ color: '#5a4f42' }}>
        {label}
      </div>
      <div className="text-[26px] font-semibold leading-none mb-1.5 tracking-tight" style={{ color: c.value }}>
        {value}
      </div>
      {delta && <div className="text-[11px]" style={{ color: '#a08c6e' }}>{delta}</div>}
    </div>
  )
}
