'use client'

import { useEffect, useState } from 'react'
import { supabase, getAdminLeaderboard, getPendingAlerts, resolveAlert, createMazeSession, addPlayerPoints, createPlayer, suggestPlayerName, LeaderboardEntry, PointAlert, MazeType } from '@/lib/supabase'
import { parseMazeReport, calcPointShare, runOCR } from '@/lib/ocr'

// ─── Types ───────────────────────────────────────────────────
type Tab = 'leaderboard' | 'upload' | 'alerts' | 'events'

// ─── Toast ───────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' | 'warn' }) {
  const colors = { ok: 'bg-green-900 border-green-500', err: 'bg-red-900 border-red-500', warn: 'bg-yellow-900 border-yellow-500' }
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg border text-sm font-semibold ${colors[type]} text-white shadow-xl`}>
      {msg}
    </div>
  )
}

// ─── Alert Card ──────────────────────────────────────────────
function AlertCard({ alert, onResolve }: { alert: PointAlert; onResolve: () => void }) {
  const [suggestions, setSuggestions] = useState<{ name: string; similarity: number }[]>([])
  const [loadingSugg, setLoadingSugg] = useState(false)

  async function loadSuggestions() {
    setLoadingSugg(true)
    const sugg = await suggestPlayerName(alert.raw_name)
    setSuggestions(sugg)
    setLoadingSugg(false)
  }

  useEffect(() => { loadSuggestions() }, [alert.raw_name])

  return (
    <div className="bg-[#1a0d00] border border-yellow-500/30 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-yellow-400 text-xs uppercase tracking-wider mb-1">⚠ Nombre no encontrado</p>
          <p className="text-white font-bold text-lg">"{alert.raw_name}"</p>
        </div>
      </div>

      {loadingSugg ? (
        <p className="text-[#666] text-xs mt-2">Buscando similares…</p>
      ) : suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-[#888] mb-2">¿Quisiste decir…?</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button
                key={s.name}
                onClick={() => resolveAlert(alert.id, 'link', s.name).then(onResolve)}
                className="px-3 py-1 bg-[#1a1a2e] border border-[#2a2a4a] hover:border-[#ff6b35] text-sm rounded text-white transition-colors"
              >
                {s.name} <span className="text-[#555] text-xs">({Math.round(s.similarity * 100)}%)</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[#555] text-xs mt-2">Sin similares encontrados.</p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => resolveAlert(alert.id, 'create', alert.raw_name).then(onResolve)}
          className="px-3 py-1.5 bg-[#ff6b35]/20 border border-[#ff6b35]/40 text-[#ff6b35] text-xs rounded hover:bg-[#ff6b35]/30 transition-colors"
        >
          + Crear nuevo PJ
        </button>
        <button
          onClick={() => resolveAlert(alert.id, 'link').then(onResolve)}
          className="px-3 py-1.5 bg-[#1a1a2e] border border-[#2a2a4a] text-[#888] text-xs rounded hover:text-white transition-colors"
        >
          Ignorar
        </button>
      </div>
    </div>
  )
}

// ─── Upload / Report Module ───────────────────────────────────
function UploadModule() {
  const [mazeType, setMazeType] = useState<MazeType>('BD')
  const [adminPts, setAdminPts] = useState(0)
  const [eventPts, setEventPts] = useState(0)
  const [rawText, setRawText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{ name: string; points: number }[]>([])
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok'|'err'|'warn' } | null>(null)

  function showToast(msg: string, type: 'ok'|'err'|'warn') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleOCR() {
    if (!imageFile) return
    setProcessing(true)
    try {
      const text = await runOCR(imageFile)
      setRawText(text)
      setParsed(parseMazeReport(text))
    } catch {
      showToast('Error en OCR. Prueba con pegado de texto.', 'err')
    } finally {
      setProcessing(false)
    }
  }

  function handleParse() {
    setParsed(parseMazeReport(rawText))
  }

  async function handleSubmit() {
    if (parsed.length === 0) { showToast('No hay datos para procesar.', 'warn'); return }
    setProcessing(true)
    try {
      const session = await createMazeSession({
        maze_type: mazeType,
        total_points: 5,
        admin_points: adminPts,
        event_points: eventPts,
        session_date: new Date().toISOString().split('T')[0],
        raw_report: rawText,
      })
      // Add points per player
      for (const entry of parsed) {
        const { data: players } = await supabase
          .from('players').select('id').eq('name', entry.name)
        if (players && players.length > 0) {
          await addPlayerPoints(players[0].id, session.id, entry.points)
        } else {
          // Create alert for unmatched name
          await supabase.from('point_alerts').insert({
            raw_name: entry.name,
            session_id: session.id,
          })
        }
      }
      showToast('Sesión guardada correctamente.', 'ok')
      setRawText(''); setParsed([]); setImageFile(null)
    } catch (e: any) {
      showToast('Error al guardar: ' + e.message, 'err')
    } finally {
      setProcessing(false)
    }
  }

  const share = calcPointShare(5, adminPts, eventPts, parsed.length)

  return (
    <div className="space-y-6">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Maze config */}
      <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl p-5 space-y-4">
        <h3 className="font-bold tracking-wider text-[#ccc] uppercase text-sm">Configuración del Maze</h3>
        <div className="flex gap-3">
          {(['BD','FV'] as MazeType[]).map(t => (
            <button
              key={t}
              onClick={() => setMazeType(t)}
              className={`flex-1 py-2 rounded border font-bold tracking-wider text-sm transition-colors ${
                mazeType === t
                  ? 'bg-[#ff6b35] border-[#ff6b35] text-black'
                  : 'border-[#2a2a4a] text-[#888] hover:border-[#ff6b35]'
              }`}
            >
              {t === 'BD' ? '🐉 Black Dragon' : '❄️ Frozen Ville'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wider block mb-1">Pts Admin</label>
            <input
              type="number" min={0} max={5} step={0.1}
              value={adminPts}
              onChange={e => setAdminPts(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#070712] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-3 py-2 rounded text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wider block mb-1">Pts Evento</label>
            <input
              type="number" min={0} max={5} step={0.1}
              value={eventPts}
              onChange={e => setEventPts(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#070712] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-3 py-2 rounded text-white"
            />
          </div>
        </div>
        {parsed.length > 0 && (
          <div className="bg-[#07071a] border border-[#1a1a3a] rounded-lg p-3 text-sm">
            <span className="text-[#888]">Pts por participante: </span>
            <span className="text-[#ff6b35] font-bold text-lg">{share}</span>
            <span className="text-[#555] ml-2">({parsed.length} participantes)</span>
          </div>
        )}
      </div>

      {/* Image upload / OCR */}
      <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl p-5 space-y-3">
        <h3 className="font-bold tracking-wider text-[#ccc] uppercase text-sm">📷 OCR — Subir Imagen</h3>
        <input
          type="file"
          accept="image/*"
          onChange={e => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm text-[#888]"
        />
        {imageFile && (
          <button
            onClick={handleOCR}
            disabled={processing}
            className="px-4 py-2 bg-[#ff6b35]/20 border border-[#ff6b35]/40 text-[#ff6b35] text-sm rounded hover:bg-[#ff6b35]/30 transition-colors disabled:opacity-50"
          >
            {processing ? 'Procesando OCR…' : 'Leer imagen con OCR'}
          </button>
        )}
      </div>

      {/* Text paste */}
      <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl p-5 space-y-3">
        <h3 className="font-bold tracking-wider text-[#ccc] uppercase text-sm">📋 Pegado Rápido de Texto</h3>
        <p className="text-xs text-[#555]">Formato: NombrePJ 3  /  NombrePJ: 2.5  /  NombrePJ - 1</p>
        <textarea
          rows={8}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder={"Morgan 3\nDragonSlayer 2\nIceMage 1.5"}
          className="w-full bg-[#070712] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-3 py-2 rounded text-white text-sm font-mono resize-none"
        />
        <button
          onClick={handleParse}
          className="px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] hover:border-[#ff6b35] text-sm rounded text-white transition-colors"
        >
          Parsear texto
        </button>
      </div>

      {/* Parsed preview */}
      {parsed.length > 0 && (
        <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a1a3a] text-sm font-bold text-[#ccc] uppercase tracking-wider">
            Vista previa ({parsed.length} jugadores)
          </div>
          <ul className="divide-y divide-[#0f0f1f]">
            {parsed.map((entry, i) => (
              <li key={i} className="px-5 py-2 flex justify-between text-sm">
                <span className="text-white">{entry.name}</span>
                <span className="text-[#ff6b35] font-bold">{entry.points} pts</span>
              </li>
            ))}
          </ul>
          <div className="px-5 py-4">
            <button
              onClick={handleSubmit}
              disabled={processing}
              className="w-full py-3 bg-[#ff6b35] hover:bg-[#e55a25] text-black font-black tracking-widest uppercase rounded-lg transition-colors disabled:opacity-50"
            >
              {processing ? 'Guardando…' : '✓ Guardar Sesión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Panel ────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [alerts, setAlerts] = useState<PointAlert[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    getAdminLeaderboard().then(setLeaderboard)
    getPendingAlerts().then(setAlerts)
  }, [session])

  // ── Login form ──
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    else {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#070712] flex items-center justify-center text-[#ff6b35]">
      Cargando…
    </div>
  )

  if (!session) return (
    <div className="min-h-screen bg-[#070712] flex items-center justify-center font-['Rajdhani',sans-serif]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-5xl">🐉</span>
          <h1 className="text-2xl font-black text-[#ff6b35] mt-3 tracking-widest uppercase">Admin Panel</h1>
          <p className="text-[#555] text-sm mt-1">The Originals Guild</p>
        </div>
        <form onSubmit={handleLogin} className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl p-6 space-y-4">
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wider block mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#070712] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-3 py-2 rounded text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wider block mb-1">Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#070712] border border-[#2a2a4a] focus:border-[#ff6b35] outline-none px-3 py-2 rounded text-white"
            />
          </div>
          {authError && <p className="text-red-400 text-xs">{authError}</p>}
          <button type="submit" className="w-full py-3 bg-[#ff6b35] text-black font-black tracking-widest uppercase rounded-lg hover:bg-[#e55a25] transition-colors">
            Ingresar
          </button>
        </form>
        <div className="mt-4 text-center">
          <a href="/" className="text-[#555] text-sm hover:text-[#888] transition-colors">← Dashboard público</a>
        </div>
      </div>
    </div>
  )

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'leaderboard', label: '📊 Rankings' },
    { key: 'upload',      label: '📤 Cargar Maze' },
    { key: 'alerts',      label: '⚠ Alertas', badge: alerts.filter(a => !a.resolved).length },
    { key: 'events',      label: '🏆 Eventos' },
  ]

  return (
    <div className="min-h-screen bg-[#070712] text-white font-['Rajdhani',sans-serif]">
      <header className="bg-[#07071a] border-b border-[#1a1a3a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐉</span>
          <span className="font-black tracking-widest text-[#ff6b35] uppercase">The Originals — Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#555] text-sm">{session.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut().then(() => setSession(null))}
            className="text-xs text-[#555] hover:text-[#ff6b35] transition-colors uppercase tracking-wider"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#0d0d1f] p-1 rounded-xl border border-[#1a1a3a] w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-[#ff6b35] text-black' : 'text-[#888] hover:text-white'
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-black">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'leaderboard' && (
          <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a1a3a] text-sm font-bold text-[#ccc] uppercase tracking-wider">
              Rankings Admin (incluye puntos de Administrador)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#555] uppercase text-xs tracking-widest border-b border-[#1a1a3a]">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Personaje</th>
                    <th className="px-4 py-3 text-right">BD</th>
                    <th className="px-4 py-3 text-right">FV</th>
                    <th className="px-4 py-3 text-right text-yellow-400">Admin</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr key={p.id} className="border-b border-[#0f0f1f] hover:bg-[#1a1a2e] transition-colors">
                      <td className="px-4 py-3 text-[#555]">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="px-4 py-3 text-right text-[#ff6b35]">{p.bd_points}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{p.fv_points}</td>
                      <td className="px-4 py-3 text-right text-yellow-400 font-bold">{p.admin_points_total ?? 0}</td>
                      <td className="px-4 py-3 text-right font-bold">{p.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'upload' && <UploadModule />}

        {tab === 'alerts' && (
          <div className="space-y-4">
            {alerts.filter(a => !a.resolved).length === 0 ? (
              <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl px-5 py-10 text-center text-[#555]">
                ✓ Sin alertas pendientes
              </div>
            ) : (
              alerts.filter(a => !a.resolved).map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onResolve={() => getPendingAlerts().then(setAlerts)}
                />
              ))
            )}
          </div>
        )}

        {tab === 'events' && (
          <div className="bg-[#0d0d1f] border border-[#1a1a3a] rounded-xl px-5 py-8 text-center text-[#555]">
            Módulo de Guild Events — próximamente
          </div>
        )}
      </div>
    </div>
  )
}
