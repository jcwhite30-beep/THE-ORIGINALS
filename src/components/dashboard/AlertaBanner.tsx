'use client'
// src/components/dashboard/AlertaBanner.tsx
export default function AlertaBanner({ tipo, children }: {
  tipo: 'warn' | 'danger' | 'amber' | 'info'
  children: React.ReactNode
}) {
  const styles = {
    warn:   { bg: 'rgba(192,154,76,0.08)',  border: 'rgba(192,154,76,0.3)',  color: '#c09a4c' },
    danger: { bg: 'rgba(192,83,78,0.08)',   border: 'rgba(192,83,78,0.3)',   color: '#c0534e' },
    amber:  { bg: 'rgba(192,154,76,0.08)',  border: 'rgba(192,154,76,0.3)',  color: '#c09a4c' },
    info:   { bg: 'rgba(90,143,192,0.08)',  border: 'rgba(90,143,192,0.3)', color: '#5a8fc0' },
  }[tipo]

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-xs"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color }}>
      {children}
    </div>
  )
}
