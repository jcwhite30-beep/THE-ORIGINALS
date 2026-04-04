'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPublicLeaderboard,
  getPlayerRunes,
  getGuildEvents,
  LeaderboardEntry,
  Runes,
  GuildEvent,
} from '@/lib/supabase'

// ─── Rune Card ───────────────────────────────────────────────
const RUNE_ICONS: Record<string, string> = {
  curse:       '💀',
  illusory:    '🌀',
  piercing:    '⚡',
  riven_soul:  '💔',
  favor:       '✨',
  prayer:      '🙏',
  scroll_ring: '📜',
}

const RUNE_LABELS: Record<string, string> = {
  curse:       'Curse',
  illusory:    'Illusory',
  piercing:    'Piercing',
  riven_soul:  'Riven Soul',
  favor:       'Favor',
  prayer:      'Prayer',
  scroll_ring: 'Scroll Ring',
}

function RuneCard({ runes }: { runes: Runes }) {
  const runeKeys = Object.keys(RUNE_ICONS) as (keyof typeof RUNE_ICONS)[]
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {runeKeys.map(key => (
        <div
          key={key}
          className="flex flex-col items-center bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg p-2 hover:border-[#ff6b35] transition-colors"
        >
          <span className="text-xl">{RUNE_ICONS[key]}</span>
          <span className="text-[10px] text-[#888] mt-1 uppercase tracking-wider">{RUNE_LABELS[key]}</span>
          <span className="text-[#ff6b35] font-bold text-sm">{(runes as any)[key] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Skeleton Loader ─────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-[#1a1a2e] rounded w-6" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-[#1a1a2e] rounded w-32" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-[#1a1a2e] rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-[#1a1a2e] rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-[#1a1a2e] rounded w-16" /></td>
    </tr>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function DashboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [events, setEvents] = useState<GuildEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardEntry | null>(null)
  const [runes, setRunes] = useState<Runes | null>(null)
  const [runesLoading, setRunesLoading] = useState(false)

  useEffect(() => {
    Promise.all([getPublicLeaderboard(), getGuildEvents()])
      .then(([lb, ev]) => { setLeaderboard(lb); setEvents(ev) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return leaderboard
    return leaderboard.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [leaderboard, search])

  async function handleSelectPlayer(player: LeaderboardEntry) {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null); setRunes(null); return
    }
    setSelectedPlayer(player)
    setRunesLoading(true)
    const r = await getPlayerRunes(player.id)
    setRunes(r)
    setRunesLoading(false)
  }

  const totalEventPts = events.reduce((sum, e) => sum + e.points, 0)

  return (
    <main className="min-h-screen bg-[#070712] text-white font-['Rajdhani',sans-serif]">
      {/* ── Header ── */}
      <header className="relative overflow-hidden border-b border-[#1a1a3a] bg-[#07071a]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1a0533_0%,_transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🐉</span>
              <h1 className="text-3xl font-black tracking-widest uppercase text-[#ff6b35]">
                The Originals
              </h1>
            </div>
            <p className="text-[#888] text-sm mt-1 tracking-wider uppercase">
              Guild Points — Tales of Pirates
            </p>
          </div>
          <a
            href="/admin"
            className="px-4 py-2 border border-[#ff6b35]/40 text-[#ff6b35] text-sm rounded hover:bg-[#ff6b35]/10 transition-colors tracking-wider uppercase"
          >
            Admin →
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Search ── */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar personaje…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0d0d1f] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-5 py-3 rounded-lg text-white placeholder-[#444] text-lg transition-colors"
          />
          <span className="absolute right-4 top-3.5 text-[#444] text-xl">🔍</span>
        </div>

        {/* ── Player Rune Detail (shown when filtered) ── */}
        {selectedPlayer && (
          <div className="bg-[#0d0d1f] border border-[#ff6b35]/30 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#ff6b35] tracking-wider">
                  {selectedPlayer.name}
                </h2>
                {selectedPlayer.class && (
                  <p className="text-[#888] text-sm uppercase tracking-widest">{selectedPlayer.class}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white">{selectedPlayer.total_points}</div>
                <div className="text-xs text-[#888]">TOTAL PTS</div>
              </div>
            </div>

            <div className="flex gap-6 mt-3 text-sm">
              <span>🐉 BD: <span className="text-[#ff6b35] font-bold">{selectedPlayer.bd_points}</span></span>
              <span>❄️ FV: <span className="text-blue-400 font-bold">{selectedPlayer.fv_points}</span></span>
            </div>

            {runesLoading ? (
              <div className="mt-3 h-20 bg-[#1a1a2e] rounded-lg animate-pulse" />
            ) : runes ? (
              <RuneCard runes={runes} />
            ) : (
              <p className="text-[#555] text-sm mt-3">Sin runas registradas.</p>
            )}
          </div>
        )}

        {/* ── Leaderboard Table ── */}
        <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a1a3a] flex items-center justify-between">
            <h2 className="font-bold tracking-widest uppercase text-[#ccc] text-sm">
              📊 Clasificación General
            </h2>
            <span className="text-xs text-[#555]">{filtered.length} jugadores</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#555] uppercase text-xs tracking-widest border-b border-[#1a1a3a]">
                  <th className="px-4 py-3 text-left w-10">#</th>
                  <th className="px-4 py-3 text-left">Personaje</th>
                  <th className="px-4 py-3 text-right">🐉 BD</th>
                  <th className="px-4 py-3 text-right">❄️ FV</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.map((player, i) => (
                    <tr
                      key={player.id}
                      onClick={() => handleSelectPlayer(player)}
                      className={`border-b border-[#0f0f1f] cursor-pointer transition-colors hover:bg-[#1a1a2e] ${
                        selectedPlayer?.id === player.id ? 'bg-[#1a0a05] border-l-2 border-l-[#ff6b35]' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-[#555]">
                        {i < 3
                          ? ['🥇','🥈','🥉'][i]
                          : <span className="text-[#444]">{i + 1}</span>
                        }
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {player.name}
                        {player.class && (
                          <span className="ml-2 text-[10px] text-[#555] uppercase tracking-wider">
                            {player.class}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[#ff6b35]">{player.bd_points}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{player.fv_points}</td>
                      <td className="px-4 py-3 text-right font-bold text-white">{player.total_points}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Guild Events ── */}
        <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a1a3a] flex items-center justify-between">
            <h2 className="font-bold tracking-widest uppercase text-[#ccc] text-sm">
              🏆 Guild Events
            </h2>
            <span className="text-[#ff6b35] font-bold text-sm">{totalEventPts} pts acumulados</span>
          </div>
          {events.length === 0 ? (
            <p className="px-5 py-6 text-[#555] text-sm">Sin eventos registrados.</p>
          ) : (
            <ul className="divide-y divide-[#0f0f1f]">
              {events.map(ev => (
                <li key={ev.id} className="px-5 py-3 flex items-center justify-between hover:bg-[#1a1a2e] transition-colors">
                  <div>
                    <p className="font-semibold text-white">{ev.name}</p>
                    {ev.description && <p className="text-xs text-[#666] mt-0.5">{ev.description}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-[#ff6b35] font-bold">{ev.points} pts</span>
                    <p className="text-[10px] text-[#555]">{ev.event_date}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
