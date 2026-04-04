'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { getPublicLeaderboard, getPlayerRunes, getGuildEvents, LeaderboardEntry, Runes, GuildEvent } from '@/lib/supabase'

// ─── Rune definitions ─────────────────────────────────────────
const RUNES = [
  { key: 'curse',       label: 'Curse Rune',       color: '#c040c0', icon: '💀' },
  { key: 'illusory',    label: 'Illusory Rune',    color: '#4080f0', icon: '🌀' },
  { key: 'piercing',    label: 'Piercing Rune',    color: '#f0a020', icon: '⚡' },
  { key: 'riven_soul',  label: 'Riven Soul Rune',  color: '#e03030', icon: '💔' },
  { key: 'favor',       label: 'Favor Rune',       color: '#40d0a0', icon: '✨' },
  { key: 'prayer',      label: 'Prayer Rune',      color: '#d0d040', icon: '🙏' },
  { key: 'scroll_ring', label: 'Scroll Ring',      color: '#c9a84c', icon: '📜' },
] as const

// ─── Skeleton ─────────────────────────────────────────────────
function SkRow() {
  return (
    <tr>
      {[40, 140, 60, 60, 70].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Rune Card ────────────────────────────────────────────────
function RuneCard({ rune, value }: { rune: typeof RUNES[number]; value: number }) {
  return (
    <div
      className="rune-card flex flex-col items-center gap-1 rounded-lg p-3 transition-all cursor-default"
      style={{
        background: `linear-gradient(135deg, #0c0c22 0%, ${rune.color}18 100%)`,
        border: `1px solid ${rune.color}40`,
      }}
    >
      <span style={{ fontSize: 20 }}>{rune.icon}</span>
      <span className="font-cinzel text-center leading-tight" style={{ fontSize: 9, color: rune.color, letterSpacing: '0.05em' }}>
        {rune.label}
      </span>
      <span className="font-cinzel font-bold" style={{ fontSize: 18, color: rune.color }}>
        {value}
      </span>
    </div>
  )
}

// ─── Player Detail Panel ──────────────────────────────────────
function PlayerPanel({ player, onClose }: { player: LeaderboardEntry; onClose: () => void }) {
  const [runes, setRunes] = useState<Runes | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPlayerRunes(player.id).then(r => { setRunes(r); setLoading(false) })
  }, [player.id])

  return (
    <div className="fade-in rounded-xl p-5 mb-4" style={{ background: '#0a0a1e', border: '1px solid #c9a84c60' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-cinzel font-bold text-gold-gradient" style={{ fontSize: 22 }}>{player.name}</h2>
          {player.class && <p className="font-rajdhani uppercase tracking-widest" style={{ fontSize: 11, color: '#7a6030' }}>{player.class}</p>}
        </div>
        <button onClick={onClose} className="font-rajdhani transition-colors hover:text-white" style={{ color: '#555', fontSize: 20 }}>✕</button>
      </div>

      {/* Point summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total', val: player.total_points, col: '#c9a84c' },
          { label: 'Black Dragon', val: player.bd_points, col: '#e05050' },
          { label: 'Frozen Ville', val: player.fv_points, col: '#4ab8f0' },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: '#07071a', border: '1px solid #1e1e40' }}>
            <div className="font-cinzel font-bold" style={{ fontSize: 24, color: s.col }}>{s.val}</div>
            <div className="font-rajdhani uppercase tracking-wider" style={{ fontSize: 10, color: '#666' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rune cards */}
      <p className="font-cinzel uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#7a6030' }}>Runas</p>
      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {RUNES.map(r => <div key={r.key} className="skeleton rounded-lg h-20" />)}
        </div>
      ) : runes ? (
        <div className="grid grid-cols-7 gap-2">
          {RUNES.map(r => <RuneCard key={r.key} rune={r} value={(runes as any)[r.key] ?? 0} />)}
        </div>
      ) : (
        <p className="font-rajdhani" style={{ color: '#444', fontSize: 13 }}>Sin runas registradas aún.</p>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function DashboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [events, setEvents] = useState<GuildEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [activeTab, setActiveTab] = useState<'bd' | 'fv' | 'all'>('all')

  useEffect(() => {
    Promise.all([getPublicLeaderboard(), getGuildEvents()])
      .then(([lb, ev]) => { setLeaderboard(lb); setEvents(ev) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let data = leaderboard
    if (activeTab === 'bd') data = [...data].sort((a, b) => b.bd_points - a.bd_points)
    else if (activeTab === 'fv') data = [...data].sort((a, b) => b.fv_points - a.fv_points)
    if (!search.trim()) return data
    return data.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  }, [leaderboard, search, activeTab])

  function handleSelect(player: LeaderboardEntry) {
    setSelected(prev => prev?.id === player.id ? null : player)
  }

  const totalEventPts = events.reduce((s, e) => s + e.points, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-void)' }}>
      {/* ── HEADER ── */}
      <header style={{ background: 'linear-gradient(180deg, #0a0010 0%, #04040e 100%)', borderBottom: '1px solid #c9a84c30' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span style={{ fontSize: 32 }}>🐉</span>
                <h1 className="font-cinzel font-black text-gold-gradient" style={{ fontSize: 30, letterSpacing: '0.08em' }}>
                  THE ORIGINALS
                </h1>
              </div>
              <p className="font-rajdhani uppercase tracking-widest" style={{ fontSize: 11, color: '#7a6030', paddingLeft: 4 }}>
                Tales of Pirates · Guild Point Tracker
              </p>
            </div>
            <a
              href="/admin"
              className="font-cinzel uppercase tracking-widest transition-all"
              style={{ fontSize: 11, color: '#7a6030', border: '1px solid #7a603060', padding: '8px 18px', borderRadius: 6 }}
            >
              Admin →
            </a>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── SEARCH ── */}
        <div className="relative mb-2">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null) }}
            placeholder="Buscar personaje por nombre..."
            className="w-full font-rajdhani"
            style={{
              background: '#0c0c22',
              border: '1px solid #1e1e40',
              borderRadius: 10,
              padding: '14px 20px 14px 48px',
              color: '#e8e0d0',
              fontSize: 16,
            }}
          />
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: '#444' }}>🔍</span>
          {search && (
            <button
              onClick={() => { setSearch(''); setSelected(null) }}
              style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}
            >✕</button>
          )}
        </div>

        {search && filtered.length > 0 && (
          <p className="font-rajdhani mb-4" style={{ fontSize: 12, color: '#7a6030', paddingLeft: 4 }}>
            {filtered.length} personaje{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* ── PLAYER DETAIL ── */}
        {selected && <PlayerPanel player={selected} onClose={() => setSelected(null)} />}

        {/* ── TABS ── */}
        <div className="flex gap-2 mb-4">
          {([['all', 'Todos', '#c9a84c'], ['bd', '🐉 Black Dragon', '#e05050'], ['fv', '❄️ Frozen Ville', '#4ab8f0']] as const).map(([k, label, col]) => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              className="font-cinzel uppercase tracking-wider transition-all"
              style={{
                fontSize: 10,
                padding: '7px 16px',
                borderRadius: 6,
                border: `1px solid ${activeTab === k ? col : '#1e1e40'}`,
                background: activeTab === k ? `${col}18` : 'transparent',
                color: activeTab === k ? col : '#555',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── LEADERBOARD TABLE ── */}
        <div className="mb-8" style={{ background: '#0c0c22', border: '1px solid #1e1e40', borderRadius: 12, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e1e40' }}>
            <h2 className="font-cinzel uppercase tracking-widest" style={{ fontSize: 11, color: '#7a6030' }}>
              Clasificación General
            </h2>
            <span className="font-rajdhani" style={{ fontSize: 12, color: '#444' }}>{filtered.length} jugadores</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e1e40' }}>
                  {['#', 'Personaje', '🐉 BD', '❄️ FV', 'Total'].map((h, i) => (
                    <th key={h} className="font-cinzel uppercase tracking-widest"
                      style={{ padding: '10px 16px', textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left', fontSize: 9, color: '#555', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkRow key={i} />)
                  : filtered.length === 0
                    ? (
                      <tr>
                        <td colSpan={5} className="font-rajdhani text-center" style={{ padding: '40px', color: '#333', fontSize: 14 }}>
                          {search ? `No se encontró "${search}"` : 'Sin jugadores registrados'}
                        </td>
                      </tr>
                    )
                    : filtered.map((p, i) => {
                      const isSelected = selected?.id === p.id
                      const medals = ['🥇', '🥈', '🥉']
                      return (
                        <tr
                          key={p.id}
                          onClick={() => handleSelect(p)}
                          style={{
                            borderBottom: '1px solid #0f0f20',
                            background: isSelected ? '#12122e' : 'transparent',
                            cursor: 'pointer',
                            borderLeft: isSelected ? '2px solid #c9a84c' : '2px solid transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#0e0e26' }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td className="font-cinzel text-center" style={{ padding: '12px 16px', width: 48, color: '#555', fontSize: 13 }}>
                            {i < 3 ? medals[i] : i + 1}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className="font-cinzel font-semibold" style={{ color: isSelected ? '#c9a84c' : '#e8e0d0', fontSize: 14 }}>{p.name}</span>
                            {p.class && <span className="font-rajdhani uppercase ml-2" style={{ fontSize: 10, color: '#555' }}>{p.class}</span>}
                          </td>
                          <td className="font-rajdhani font-bold text-right" style={{ padding: '12px 16px', color: '#e05050', fontSize: 15 }}>{p.bd_points}</td>
                          <td className="font-rajdhani font-bold text-right" style={{ padding: '12px 16px', color: '#4ab8f0', fontSize: 15 }}>{p.fv_points}</td>
                          <td className="font-cinzel font-bold text-right" style={{ padding: '12px 16px', color: '#c9a84c', fontSize: 16 }}>{p.total_points}</td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ── GUILD EVENTS ── */}
        <div style={{ background: '#0c0c22', border: '1px solid #1e1e40', borderRadius: 12, overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e1e40' }}>
            <h2 className="font-cinzel uppercase tracking-widest" style={{ fontSize: 11, color: '#7a6030' }}>🏆 Guild Events</h2>
            <span className="font-cinzel font-bold" style={{ fontSize: 13, color: '#c9a84c' }}>{totalEventPts} pts acumulados</span>
          </div>
          {events.length === 0 ? (
            <p className="font-rajdhani text-center" style={{ padding: '32px', color: '#333', fontSize: 14 }}>Sin eventos registrados</p>
          ) : (
            <ul>
              {events.map((ev, i) => (
                <li key={ev.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#0e0e26]"
                  style={{ borderBottom: i < events.length - 1 ? '1px solid #0f0f20' : 'none' }}>
                  <div>
                    <p className="font-cinzel font-semibold" style={{ color: '#e8e0d0', fontSize: 13 }}>{ev.name}</p>
                    {ev.description && <p className="font-rajdhani" style={{ fontSize: 12, color: '#555' }}>{ev.description}</p>}
                  </div>
                  <div className="text-right">
                    <span className="font-cinzel font-bold" style={{ color: '#c9a84c', fontSize: 15 }}>{ev.points} pts</span>
                    <p className="font-rajdhani" style={{ fontSize: 11, color: '#555' }}>{ev.event_date}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  )
}
