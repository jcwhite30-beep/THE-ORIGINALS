'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import {
  supabase, getAdminLeaderboard, getPendingAlerts, resolveAlert,
  createMazeSession, addPlayerPoints, createPlayer, suggestPlayerName,
  LeaderboardEntry, PointAlert, MazeType
} from '@/lib/supabase'
import { parseMazeReport, calcPointShare, runOCR } from '@/lib/ocr'

// ─── Types ────────────────────────────────────────────────────
type Tab = 'rankings' | 'upload' | 'alerts' | 'events' | 'users'

// ─── Helpers ──────────────────────────────────────────────────
const GOLD = '#c9a84c'
const GOLD_DIM = '#7a6030'
const BORDER = '#1e1e40'
const CARD_BG = '#0c0c22'
const DEEP = '#07071a'
const VOID = '#04040e'

// ─── Toast ────────────────────────────────────────────────────
type ToastT = { msg: string; type: 'ok' | 'err' | 'warn' }
function Toast({ t, onClose }: { t: ToastT; onClose: () => void }) {
  useEffect(() => { const tm = setTimeout(onClose, 3500); return () => clearTimeout(tm) }, [])
  const colors = {
    ok:   { bg: '#0a2a1a', border: '#20a060', text: '#40d090' },
    err:  { bg: '#2a0a0a', border: '#a02020', text: '#e04040' },
    warn: { bg: '#2a1a00', border: '#a06000', text: '#d09020' },
  }[t.type]
  return (
    <div className="fade-in font-rajdhani font-semibold" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 20px', borderRadius: 8, fontSize: 14,
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
      boxShadow: `0 0 20px ${colors.border}40`,
    }}>{t.msg}</div>
  )
}

// ─── Alert Card ───────────────────────────────────────────────
function AlertCard({ alert, onResolved }: { alert: PointAlert; onResolved: () => void }) {
  const [sugg, setSugg] = useState<{ name: string; similarity: number }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { suggestPlayerName(alert.raw_name).then(setSugg) }, [alert.raw_name])

  async function handle(action: 'create' | 'link', name?: string) {
    setBusy(true)
    if (action === 'create') {
      await createPlayer(alert.raw_name)
    }
    await resolveAlert(alert.id, action, name)
    onResolved()
  }

  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: '#1a0d00', border: '1px solid #a0600040' }}>
      <p className="font-cinzel uppercase tracking-widest mb-1" style={{ fontSize: 9, color: '#d09020' }}>⚠ Nombre no encontrado en BD</p>
      <p className="font-cinzel font-bold mb-3" style={{ fontSize: 18, color: '#e8e0d0' }}>"{alert.raw_name}"</p>

      {sugg.length > 0 && (
        <div className="mb-3">
          <p className="font-rajdhani mb-2" style={{ fontSize: 12, color: '#888' }}>¿Quisiste decir...?</p>
          <div className="flex flex-wrap gap-2">
            {sugg.map(s => (
              <button key={s.name} disabled={busy} onClick={() => handle('link', s.name)}
                className="font-rajdhani transition-all"
                style={{ fontSize: 13, padding: '5px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: CARD_BG, color: '#e8e0d0', cursor: 'pointer' }}>
                {s.name} <span style={{ color: '#555', fontSize: 11 }}>({Math.round(s.similarity * 100)}%)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button disabled={busy} onClick={() => handle('create')}
          className="font-cinzel uppercase tracking-wider transition-all"
          style={{ fontSize: 10, padding: '8px 16px', borderRadius: 6, border: `1px solid ${GOLD_DIM}80`, background: `${GOLD}15`, color: GOLD, cursor: 'pointer' }}>
          + Crear nuevo PJ
        </button>
        <button disabled={busy} onClick={() => resolveAlert(alert.id, 'link').then(onResolved)}
          className="font-rajdhani transition-all"
          style={{ fontSize: 12, padding: '8px 16px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: '#555', cursor: 'pointer' }}>
          Ignorar
        </button>
      </div>
    </div>
  )
}

// ─── Upload Module ────────────────────────────────────────────
function UploadModule({ showToast }: { showToast: (t: ToastT) => void }) {
  const [mazeType, setMazeType] = useState<MazeType>('BD')
  const [adminPts, setAdminPts] = useState(0)
  const [eventPts, setEventPts] = useState(0)
  const [rawText, setRawText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{ name: string; points: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const share = calcPointShare(5, adminPts, eventPts, parsed.length)

  async function handleOCR() {
    if (!imageFile) return
    setOcrBusy(true)
    try {
      const text = await runOCR(imageFile)
      setRawText(text)
      setParsed(parseMazeReport(text))
      showToast({ msg: 'OCR completado', type: 'ok' })
    } catch {
      showToast({ msg: 'OCR falló — usa pegado de texto', type: 'err' })
    } finally { setOcrBusy(false) }
  }

  async function handleSubmit() {
    if (parsed.length === 0) { showToast({ msg: 'No hay datos', type: 'warn' }); return }
    setBusy(true)
    try {
      const session = await createMazeSession({
        maze_type: mazeType, total_points: 5,
        admin_points: adminPts, event_points: eventPts,
        session_date: new Date().toISOString().split('T')[0], raw_report: rawText,
      })
      for (const entry of parsed) {
        const { data: players } = await supabase.from('players').select('id').ilike('name', entry.name).limit(1)
        if (players && players.length > 0) {
          await addPlayerPoints(players[0].id, session.id, entry.points)
        } else {
          await supabase.from('point_alerts').insert({ raw_name: entry.name, session_id: session.id })
        }
      }
      showToast({ msg: 'Sesión guardada correctamente', type: 'ok' })
      setRawText(''); setParsed([]); setImageFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) {
      showToast({ msg: 'Error: ' + e.message, type: 'err' })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Maze type selector */}
      <div className="rounded-xl p-5 mb-4" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{ fontSize: 10, color: GOLD_DIM }}>Tipo de Maze</p>
        <div className="flex gap-3 mb-4">
          {([['BD', '🐉 Black Dragon', '#e05050'], ['FV', '❄️ Frozen Ville', '#4ab8f0']] as const).map(([k, label, col]) => (
            <button key={k} onClick={() => setMazeType(k as MazeType)}
              className="font-cinzel uppercase tracking-wider flex-1 transition-all"
              style={{ fontSize: 11, padding: '10px', borderRadius: 8, border: `1px solid ${mazeType === k ? col : BORDER}`, background: mazeType === k ? `${col}20` : 'transparent', color: mazeType === k ? col : '#555', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[['Puntos Admin (ocultos al público)', adminPts, setAdminPts], ['Puntos Guild Event', eventPts, setEventPts]].map(([label, val, setter]: any) => (
            <div key={label}>
              <p className="font-rajdhani mb-1" style={{ fontSize: 12, color: '#888' }}>{label}</p>
              <input type="number" min={0} max={5} step={0.1} value={val}
                onChange={e => setter(parseFloat(e.target.value) || 0)}
                className="font-rajdhani w-full"
                style={{ background: DEEP, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', color: '#e8e0d0', fontSize: 14 }} />
            </div>
          ))}
        </div>

        {parsed.length > 0 && (
          <div className="mt-4 rounded-lg p-3" style={{ background: DEEP, border: `1px solid ${BORDER}` }}>
            <span className="font-rajdhani" style={{ color: '#888', fontSize: 13 }}>Pts por participante: </span>
            <span className="font-cinzel font-bold" style={{ color: GOLD, fontSize: 20 }}>{share}</span>
            <span className="font-rajdhani ml-2" style={{ color: '#555', fontSize: 12 }}>({parsed.length} participantes)</span>
          </div>
        )}
      </div>

      {/* OCR upload */}
      <div className="rounded-xl p-5 mb-4" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
        <p className="font-cinzel uppercase tracking-widest mb-3" style={{ fontSize: 10, color: GOLD_DIM }}>📷 Subir Foto del Reporte</p>
        <input ref={fileRef} type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] ?? null)}
          className="font-rajdhani mb-3 w-full" style={{ fontSize: 13, color: '#888' }} />
        {imageFile && (
          <button onClick={handleOCR} disabled={ocrBusy}
            className="font-cinzel uppercase tracking-wider transition-all"
            style={{ fontSize: 10, padding: '8px 18px', borderRadius: 6, border: `1px solid ${GOLD_DIM}80`, background: `${GOLD}15`, color: GOLD, cursor: ocrBusy ? 'not-allowed' : 'pointer', opacity: ocrBusy ? 0.6 : 1 }}>
            {ocrBusy ? 'Procesando OCR...' : 'Leer imagen con OCR'}
          </button>
        )}
      </div>

      {/* Text paste */}
      <div className="rounded-xl p-5 mb-4" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
        <p className="font-cinzel uppercase tracking-widest mb-1" style={{ fontSize: 10, color: GOLD_DIM }}>📋 Pegado Rápido de Texto</p>
        <p className="font-rajdhani mb-3" style={{ fontSize: 12, color: '#555' }}>Formato: NombrePJ 3 / NombrePJ: 2.5 / NombrePJ - 1</p>
        <textarea rows={7} value={rawText} onChange={e => setRawText(e.target.value)}
          placeholder={"Morgan 3\nDragonSlayer 2\nIceMage 1.5"}
          className="font-rajdhani w-full"
          style={{ background: DEEP, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px', color: '#e8e0d0', fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }} />
        <button onClick={() => setParsed(parseMazeReport(rawText))}
          className="font-cinzel uppercase tracking-wider mt-3 transition-all"
          style={{ fontSize: 10, padding: '8px 18px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: '#888', cursor: 'pointer' }}>
          Parsear texto
        </button>
      </div>

      {/* Preview + submit */}
      {parsed.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-4 fade-in" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="font-cinzel uppercase tracking-widest" style={{ fontSize: 10, color: GOLD_DIM }}>Vista previa — {parsed.length} jugadores</p>
          </div>
          <ul>
            {parsed.map((e, i) => (
              <li key={i} className="flex justify-between px-5 py-2" style={{ borderBottom: i < parsed.length - 1 ? `1px solid #0f0f20` : 'none' }}>
                <span className="font-rajdhani" style={{ color: '#e8e0d0', fontSize: 14 }}>{e.name}</span>
                <span className="font-cinzel font-bold" style={{ color: GOLD, fontSize: 14 }}>{e.points} pts</span>
              </li>
            ))}
          </ul>
          <div className="p-5">
            <button onClick={handleSubmit} disabled={busy}
              className="font-cinzel uppercase tracking-widest w-full transition-all"
              style={{ fontSize: 12, padding: '14px', borderRadius: 8, background: busy ? '#2a2010' : `linear-gradient(135deg, #8a6020, #c9a84c)`, border: 'none', color: busy ? GOLD_DIM : '#04040e', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {busy ? 'Guardando...' : '✓ Guardar Sesión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Users Module ─────────────────────────────────────────────
function UsersModule({ showToast }: { showToast: (t: ToastT) => void }) {
  const [users, setUsers] = useState<any[]>([])
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'manager' | 'superadmin'>('manager')
  const [busy, setBusy] = useState(false)

  async function loadUsers() {
    const { data } = await supabase.from('admin_profiles').select('*').order('created_at', { ascending: false })
    setUsers(data ?? [])
  }

  useEffect(() => { loadUsers() }, [])

  async function handleCreate() {
    if (!email || !pass || !username) { showToast({ msg: 'Completa todos los campos', type: 'warn' }); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.admin?.createUser?.({ email, password: pass, email_confirm: true }) as any
      if (error) throw error
      const userId = data?.user?.id
      if (!userId) throw new Error('No se pudo obtener el ID del usuario')
      await supabase.from('admin_profiles').insert({ id: userId, username, role })
      showToast({ msg: `Usuario ${username} creado correctamente`, type: 'ok' })
      setEmail(''); setPass(''); setUsername(''); loadUsers()
    } catch (e: any) {
      // If admin API not available, show SQL alternative
      showToast({ msg: 'Usa el método SQL (ver instrucciones abajo)', type: 'warn' })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="rounded-xl p-5 mb-4" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{ fontSize: 10, color: GOLD_DIM }}>Crear nuevo Admin / Manager</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            ['Email', email, setEmail, 'email'],
            ['Contraseña', pass, setPass, 'password'],
            ['Username (nombre en app)', username, setUsername, 'text'],
          ].map(([label, val, setter, type]: any) => (
            <div key={label} className={label === 'Username (nombre en app)' ? 'col-span-2' : ''}>
              <p className="font-rajdhani mb-1" style={{ fontSize: 12, color: '#888' }}>{label}</p>
              <input type={type} value={val} onChange={e => setter(e.target.value)}
                className="font-rajdhani w-full"
                style={{ background: DEEP, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', color: '#e8e0d0', fontSize: 14 }} />
            </div>
          ))}
        </div>

        <div className="mb-4">
          <p className="font-rajdhani mb-2" style={{ fontSize: 12, color: '#888' }}>Rol</p>
          <div className="flex gap-2">
            {(['manager', 'superadmin'] as const).map(r => (
              <button key={r} onClick={() => setRole(r)}
                className="font-cinzel uppercase tracking-wider transition-all"
                style={{ fontSize: 10, padding: '7px 16px', borderRadius: 6, border: `1px solid ${role === r ? GOLD : BORDER}`, background: role === r ? `${GOLD}20` : 'transparent', color: role === r ? GOLD : '#555', cursor: 'pointer' }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleCreate} disabled={busy}
          className="font-cinzel uppercase tracking-widest transition-all"
          style={{ fontSize: 10, padding: '10px 24px', borderRadius: 6, border: `1px solid ${GOLD_DIM}`, background: `${GOLD}20`, color: GOLD, cursor: 'pointer' }}>
          {busy ? 'Creando...' : '+ Crear usuario'}
        </button>
      </div>

      {/* SQL method fallback */}
      <div className="rounded-xl p-5 mb-4" style={{ background: '#0a0a1a', border: `1px solid ${BORDER}` }}>
        <p className="font-cinzel uppercase tracking-widest mb-3" style={{ fontSize: 10, color: GOLD_DIM }}>Método alternativo (Supabase SQL)</p>
        <p className="font-rajdhani mb-2" style={{ fontSize: 12, color: '#888' }}>
          1. En Supabase → Authentication → Users → Add user → ingresa email y contraseña<br />
          2. Copia el UUID del usuario recién creado<br />
          3. Ejecuta en SQL Editor:
        </p>
        <div className="rounded-lg p-3" style={{ background: '#04040e', border: `1px solid ${BORDER}`, fontFamily: 'monospace', fontSize: 12, color: '#c9a84c' }}>
          {'INSERT INTO admin_profiles (id, username, role)\nVALUES (\n  \'PEGA-AQUI-EL-UUID\',\n  \'nombre_usuario\',\n  \'manager\'  -- o superadmin\n);'}
        </div>
      </div>

      {/* Users list */}
      {users.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="font-cinzel uppercase tracking-widest" style={{ fontSize: 10, color: GOLD_DIM }}>Administradores registrados</p>
          </div>
          {users.map((u, i) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: i < users.length - 1 ? `1px solid #0f0f20` : 'none' }}>
              <span className="font-cinzel" style={{ color: '#e8e0d0', fontSize: 14 }}>{u.username}</span>
              <span className="font-cinzel uppercase tracking-wider"
                style={{ fontSize: 9, padding: '3px 10px', borderRadius: 20, border: `1px solid ${u.role === 'superadmin' ? GOLD : BORDER}`, color: u.role === 'superadmin' ? GOLD : '#888' }}>
                {u.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('rankings')
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [alerts, setAlerts] = useState<PointAlert[]>([])
  const [toast, setToast] = useState<ToastT | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authErr, setAuthErr] = useState('')

  function showToast(t: ToastT) { setToast(t) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    supabase.auth.onAuthStateChange((_e, s) => setSession(s))
  }, [])

  useEffect(() => {
    if (!session) return
    getAdminLeaderboard().then(setLeaderboard)
    getPendingAlerts().then(setAlerts)
  }, [session])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthErr(error.message)
  }

  // ── Login Screen ──
  if (loading) return (
    <div style={{ minHeight: '100vh', background: VOID, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="font-cinzel" style={{ color: GOLD_DIM, fontSize: 14 }}>Cargando...</div>
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100vh', background: VOID, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div className="text-center mb-8">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🐉</div>
          <h1 className="font-cinzel font-black text-gold-gradient" style={{ fontSize: 24, letterSpacing: '0.12em' }}>THE ORIGINALS</h1>
          <p className="font-cinzel uppercase tracking-widest mt-1" style={{ fontSize: 9, color: GOLD_DIM }}>Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          {[['Email', email, setEmail, 'email'], ['Contraseña', password, setPassword, 'password']].map(([label, val, setter, type]: any) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <p className="font-cinzel uppercase tracking-widest mb-1" style={{ fontSize: 9, color: GOLD_DIM }}>{label}</p>
              <input type={type} value={val} onChange={e => setter(e.target.value)} required
                className="font-rajdhani w-full"
                style={{ background: DEEP, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 14px', color: '#e8e0d0', fontSize: 15 }} />
            </div>
          ))}
          {authErr && <p className="font-rajdhani mb-3" style={{ color: '#e04040', fontSize: 13 }}>{authErr}</p>}
          <button type="submit"
            className="font-cinzel uppercase tracking-widest w-full transition-all"
            style={{ fontSize: 12, padding: 14, borderRadius: 8, background: `linear-gradient(135deg, #8a6020, #c9a84c)`, border: 'none', color: VOID, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.1em' }}>
            Ingresar
          </button>
        </form>
        <div className="text-center mt-4">
          <a href="/dashboard" className="font-rajdhani transition-colors" style={{ color: '#555', fontSize: 13 }}>← Dashboard público</a>
        </div>
      </div>
    </div>
  )

  // ── Tabs config ──
  const pendingAlerts = alerts.filter(a => !a.resolved).length
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'rankings', label: '📊 Rankings' },
    { key: 'upload',   label: '📤 Cargar Maze' },
    { key: 'alerts',   label: '⚠ Alertas', badge: pendingAlerts },
    { key: 'events',   label: '🏆 Eventos' },
    { key: 'users',    label: '👥 Usuarios' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: VOID }}>
      {toast && <Toast t={toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <header style={{ background: `linear-gradient(180deg, #0a0010 0%, ${VOID} 100%)`, borderBottom: `1px solid #c9a84c30` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 24 }}>🐉</span>
            <span className="font-cinzel font-black text-gold-gradient" style={{ fontSize: 20, letterSpacing: '0.1em' }}>THE ORIGINALS — ADMIN</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-rajdhani" style={{ color: '#555', fontSize: 13 }}>{session.user.email}</span>
            <button onClick={() => supabase.auth.signOut()}
              className="font-cinzel uppercase tracking-widest transition-colors"
              style={{ fontSize: 9, color: '#555', border: `1px solid #1e1e40`, padding: '6px 14px', borderRadius: 6, background: 'none', cursor: 'pointer' }}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        {/* Tabs */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="font-cinzel uppercase tracking-wider relative transition-all"
              style={{
                fontSize: 10, padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${tab === t.key ? GOLD : BORDER}`,
                background: tab === t.key ? `${GOLD}18` : CARD_BG,
                color: tab === t.key ? GOLD : '#888',
              }}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="font-rajdhani font-bold" style={{ position: 'absolute', top: -6, right: -6, background: '#d09020', color: '#04040e', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Rankings tab */}
        {tab === 'rankings' && (
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p className="font-cinzel uppercase tracking-widest" style={{ fontSize: 10, color: GOLD_DIM }}>Rankings Admin — incluye puntos de Administrador</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['#', 'Personaje', '🐉 BD', '❄️ FV', 'Admin ★', 'Total'].map((h, i) => (
                      <th key={h} className="font-cinzel uppercase tracking-widest"
                        style={{ padding: '10px 16px', textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left', fontSize: 9, color: i === 4 ? GOLD_DIM : '#555', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid #0f0f20` }}>
                      <td className="font-cinzel text-center" style={{ padding: '11px 16px', color: '#555', fontSize: 12 }}>{i + 1}</td>
                      <td className="font-cinzel" style={{ padding: '11px 16px', color: '#e8e0d0', fontSize: 13 }}>{p.name}</td>
                      <td className="font-rajdhani font-bold text-right" style={{ padding: '11px 16px', color: '#e05050', fontSize: 14 }}>{p.bd_points}</td>
                      <td className="font-rajdhani font-bold text-right" style={{ padding: '11px 16px', color: '#4ab8f0', fontSize: 14 }}>{p.fv_points}</td>
                      <td className="font-cinzel font-bold text-right" style={{ padding: '11px 16px', color: GOLD, fontSize: 14 }}>{(p as any).admin_points_total ?? 0}</td>
                      <td className="font-cinzel font-bold text-right" style={{ padding: '11px 16px', color: '#e8e0d0', fontSize: 15 }}>{p.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'upload' && <UploadModule showToast={showToast} />}

        {tab === 'alerts' && (
          <div style={{ maxWidth: 720 }}>
            {alerts.filter(a => !a.resolved).length === 0 ? (
              <div className="text-center rounded-xl py-16" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
                <p className="font-cinzel uppercase tracking-widest" style={{ fontSize: 11, color: '#333' }}>✓ Sin alertas pendientes</p>
              </div>
            ) : (
              alerts.filter(a => !a.resolved).map(alert => (
                <AlertCard key={alert.id} alert={alert} onResolved={() => getPendingAlerts().then(setAlerts)} />
              ))
            )}
          </div>
        )}

        {tab === 'events' && (
          <div className="text-center rounded-xl py-16" style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
            <p className="font-cinzel uppercase tracking-widest" style={{ fontSize: 11, color: '#333' }}>Módulo Guild Events — próximamente</p>
          </div>
        )}

        {tab === 'users' && <UsersModule showToast={showToast} />}
      </div>
    </div>
  )
}
