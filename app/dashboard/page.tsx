'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo, useRef } from 'react'
import { getPublicLeaderboard, getGuildEvents, processClaim, supabase, LeaderboardEntry, GuildEvent } from '@/lib/supabase'

const G='#c9a84c', GD='#7a6030', CARD='#0c0c22', DEEP='#07071a', BORDER='#1e1e40', VOID='#04040e'

const FV_RUNES = [
  { key:'curse',    label:'Curse',       color:'#c040c0' },
  { key:'illusory', label:'Illusory',    color:'#4080f0' },
  { key:'piercing', label:'Piercing',    color:'#f0a020' },
  { key:'riven',    label:'Riven Soul',  color:'#e03030' },
  { key:'favor',    label:'Favor',       color:'#40d0a0' },
  { key:'prayer',   label:'Prayer',      color:'#d0d040' },
] as const

// ── Skeleton ──────────────────────────────────────────────────
function Sk({ w, h=14 }: { w:number; h?:number }) {
  return <div className="skeleton rounded" style={{width:w, height:h}}/>
}

// ── Section header ────────────────────────────────────────────
function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD, letterSpacing:'0.14em'}}>{children}</h2>
      {right}
    </div>
  )
}

// ── BD Table ──────────────────────────────────────────────────
function BDTable({ data, loading, onSelect, selectedId }: {
  data: LeaderboardEntry[]; loading: boolean; onSelect: (p:LeaderboardEntry)=>void; selectedId?:string
}) {
  return (
    <div style={{background:CARD, border:`1px solid #e0505030`, borderRadius:12, overflow:'hidden'}}>
      <div className="px-5 py-3 flex items-center justify-between" style={{borderBottom:`1px solid #e0505020`, background:'#0f0808'}}>
        <div className="flex items-center gap-2">
          <span style={{fontSize:18}}>🐉</span>
          <span className="font-cinzel font-bold uppercase tracking-widest" style={{fontSize:11, color:'#e05050'}}>Black Dragon</span>
        </div>
        <BDDateBadge/>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
          <thead>
            <tr style={{borderBottom:`1px solid #1a0808`}}>
              <th className="font-cinzel uppercase tracking-widest text-left" style={{padding:'8px 14px', fontSize:8, color:'#555', fontWeight:600}}>#</th>
              <th className="font-cinzel uppercase tracking-widest text-left" style={{padding:'8px 14px', fontSize:8, color:'#555', fontWeight:600}}>Jugador / PJs</th>
              <th className="font-cinzel uppercase tracking-widest text-right" style={{padding:'8px 14px', fontSize:8, color:'#e05050', fontWeight:600}}>Total Pts</th>
              <th className="font-cinzel uppercase tracking-widest text-right" style={{padding:'8px 14px', fontSize:8, color:G, fontWeight:600}}>Claims Disp.</th>
              <th className="font-cinzel uppercase tracking-widest text-right" style={{padding:'8px 14px', fontSize:8, color:'#40d0a0', fontWeight:600}}>Claims Hechos</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #0f0808'}}>
                    {[30,160,70,70,70].map((w,j)=><td key={j} style={{padding:'10px 14px'}}><Sk w={w}/></td>)}
                  </tr>
                ))
              : data.map((p,i)=>{
                  const isSel = selectedId===p.id
                  const claimsAvail = Math.floor(p.available_points / 5)
                  return (
                    <tr key={p.id} onClick={()=>onSelect(p)}
                      style={{borderBottom:'1px solid #0f0808', background: isSel?'#1a0808':'transparent', cursor:'pointer', borderLeft: isSel?'2px solid #e05050':'2px solid transparent'}}
                      onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='#120808'}}
                      onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td className="font-cinzel text-center" style={{padding:'10px 14px', color:'#555', fontSize:11, width:36}}>
                        {i<3?['🥇','🥈','🥉'][i]:i+1}
                      </td>
                      <td style={{padding:'10px 14px', minWidth:150}}>
                        <div className="font-cinzel font-semibold" style={{color: isSel?'#e05050':'#e8e0d0', fontSize:13}}>{p.name}</div>
                        {p.chars&&<div className="font-rajdhani" style={{fontSize:10, color:'#555', marginTop:1}}>{p.chars}</div>}
                      </td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'10px 14px', color:'#e05050', fontSize:13}}>{p.available_points.toFixed(4)}</td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'10px 14px', color:G, fontSize:14}}>{claimsAvail}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'10px 14px', color:'#40d0a0', fontSize:13}}>{p.total_claims}</td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── FV Table ──────────────────────────────────────────────────
function FVTable({ data, loading }: { data: LeaderboardEntry[]; loading: boolean }) {
  const [fvData, setFvData] = useState<Record<string,any>>({})

  useEffect(() => {
    supabase.from('fv_rune_points').select('*, players(name)')
      .then(({data:d}) => {
        const map: Record<string,any> = {}
        ;(d??[]).forEach((r:any) => { if(r.players?.name) map[r.players.name] = r })
        setFvData(map)
      })
  }, [])

  return (
    <div style={{background:CARD, border:`1px solid #4ab8f030`, borderRadius:12, overflow:'hidden'}}>
      <div className="px-5 py-3 flex items-center justify-between" style={{borderBottom:`1px solid #4ab8f020`, background:'#08100f'}}>
        <div className="flex items-center gap-2">
          <span style={{fontSize:18}}>❄️</span>
          <span className="font-cinzel font-bold uppercase tracking-widest" style={{fontSize:11, color:'#4ab8f0'}}>Frozen Ville</span>
        </div>
        <FVDateBadge/>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:11}}>
          <thead>
            <tr style={{borderBottom:`1px solid #081010`}}>
              <th className="font-cinzel text-left" style={{padding:'6px 12px', fontSize:8, color:'#555', fontWeight:600, minWidth:140}}>Jugador</th>
              {FV_RUNES.map(r=>(
                <th key={r.key} colSpan={2} className="font-cinzel text-center uppercase tracking-wider"
                  style={{padding:'6px 8px', fontSize:8, color:r.color, fontWeight:600, borderLeft:`1px solid #1a1a3a`}}>
                  {r.label}
                </th>
              ))}
            </tr>
            <tr style={{borderBottom:`1px solid #081010`, background:'#060a0a'}}>
              <th style={{padding:'4px 12px'}}/>
              {FV_RUNES.map(r=>(
                <>
                  <th key={`${r.key}-a`} className="font-cinzel text-right" style={{padding:'4px 6px', fontSize:7, color:'#888', fontWeight:500, borderLeft:`1px solid #1a1a3a`}}>Pts</th>
                  <th key={`${r.key}-c`} className="font-cinzel text-right" style={{padding:'4px 6px', fontSize:7, color:'#888', fontWeight:500}}>Claims</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({length:5}).map((_,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #081010'}}>
                    <td style={{padding:'8px 12px'}}><Sk w={100}/></td>
                    {FV_RUNES.map(r=>(
                      <><td key={`${r.key}-a`} style={{padding:'8px 6px', borderLeft:'1px solid #1a1a3a'}}><Sk w={40}/></td>
                      <td key={`${r.key}-c`} style={{padding:'8px 6px'}}><Sk w={30}/></td></>
                    ))}
                  </tr>
                ))
              : data.map((p,i)=>{
                  const fv = fvData[p.name]
                  return (
                    <tr key={p.id} style={{borderBottom:'1px solid #081010'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0a1212'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td style={{padding:'9px 12px', minWidth:140}}>
                        <div className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:12}}>{p.name}</div>
                        {p.chars&&<div className="font-rajdhani" style={{fontSize:10, color:'#555'}}>{p.chars}</div>}
                      </td>
                      {FV_RUNES.map(r=>(
                        <>
                          <td key={`${r.key}-a`} className="text-right font-rajdhani font-bold"
                            style={{padding:'9px 6px', color:r.color, fontSize:12, borderLeft:'1px solid #1a1a3a'}}>
                            {fv?.[`${r.key}_avail`]?.toFixed(2) ?? '—'}
                          </td>
                          <td key={`${r.key}-c`} className="text-right font-rajdhani"
                            style={{padding:'9px 6px', color:'#40d0a0', fontSize:12}}>
                            {fv?.[`${r.key}_claims`] ?? '—'}
                          </td>
                        </>
                      ))}
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Date badges ───────────────────────────────────────────────
function BDDateBadge() {
  const [date, setDate] = useState('')
  useEffect(()=>{ supabase.from('report_dates').select('last_date').eq('maze_type','BD').single().then(({data})=>{ if(data) setDate(data.last_date) }) },[])
  if (!date) return null
  return <span className="font-rajdhani" style={{fontSize:11, color:'#e05050', opacity:0.7}}>Último reporte: {date}</span>
}
function FVDateBadge() {
  const [date, setDate] = useState('')
  useEffect(()=>{ supabase.from('report_dates').select('last_date').eq('maze_type','FV').single().then(({data})=>{ if(data) setDate(data.last_date) }) },[])
  if (!date) return null
  return <span className="font-rajdhani" style={{fontSize:11, color:'#4ab8f0', opacity:0.7}}>Último reporte: {date}</span>
}

// ── Player Claim Panel ────────────────────────────────────────
function ClaimPanel({ player, onClose, onClaimed }: { player:LeaderboardEntry; onClose:()=>void; onClaimed:()=>void }) {
  const [claiming, setClaiming] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [localAvail, setLocalAvail] = useState(player.available_points)
  const [localClaims, setLocalClaims] = useState(player.total_claims)
  const claimsAvail = Math.floor(localAvail / 5)

  async function handleClaim() {
    setClaiming(true); setErr('')
    try {
      await processClaim(player.id, 'Dashboard público')
      setLocalAvail(v=>v-5); setLocalClaims(v=>v+1); setDone(true)
      setTimeout(()=>{ setDone(false); onClaimed() }, 2000)
    } catch(e:any){ setErr(e.message??'Error') }
    finally { setClaiming(false) }
  }

  return (
    <div className="fade-in rounded-xl p-5 mb-4" style={{background:'#08080f', border:`1px solid ${G}50`}}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-cinzel font-bold text-gold-gradient" style={{fontSize:20}}>{player.name}</h3>
          {player.chars&&<p className="font-rajdhani mt-1" style={{fontSize:12, color:'#666'}}>PJs: {player.chars}</p>}
        </div>
        <button onClick={onClose} style={{color:'#444', fontSize:18, background:'none', border:'none', cursor:'pointer'}}>✕</button>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {label:'Pts Disponibles', val:localAvail.toFixed(4), col:'#e05050'},
          {label:'Claims Disponibles', val:claimsAvail, col:G},
          {label:'Claims Realizados', val:localClaims, col:'#40d0a0'},
        ].map(s=>(
          <div key={s.label} className="rounded-lg p-3 text-center" style={{background:DEEP, border:`1px solid ${BORDER}`}}>
            <div className="font-cinzel font-bold" style={{fontSize:22, color:s.col}}>{s.val}</div>
            <div className="font-rajdhani uppercase tracking-wider" style={{fontSize:9, color:'#555', marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>
      {done ? (
        <div className="font-cinzel rounded-lg px-4 py-2" style={{background:'#0a2a1a', border:'1px solid #20a060', color:'#40d090', fontSize:12}}>
          ✓ Claim registrado — pendiente de aprobación
        </div>
      ) : claimsAvail > 0 ? (
        <button onClick={handleClaim} disabled={claiming}
          className="font-cinzel uppercase tracking-widest"
          style={{fontSize:11, padding:'10px 24px', borderRadius:8, background:`linear-gradient(135deg,#2a6030,#40a060)`, border:'none', color:'#e8e0d0', cursor:'pointer', opacity:claiming?0.6:1}}>
          {claiming?'Procesando...':'🏆 Reclamar'}
        </button>
      ) : (
        <p className="font-rajdhani" style={{fontSize:12, color:'#555'}}>
          Necesitas {(5 - (localAvail % 5)).toFixed(4)} pts más para el próximo claim
        </p>
      )}
      {err&&<p className="font-rajdhani mt-2" style={{color:'#e04040', fontSize:12}}>{err}</p>}
    </div>
  )
}

// ── Announcements ─────────────────────────────────────────────
function Announcements() {
  const [items, setItems] = useState<any[]>([])
  useEffect(()=>{
    supabase.from('announcements').select('*').order('pinned', {ascending:false}).order('created_at', {ascending:false}).limit(10)
      .then(({data})=>setItems(data??[]))
  },[])
  if (items.length===0) return null
  return (
    <div className="mb-6">
      <SectionTitle>📢 Anuncios</SectionTitle>
      <div className="space-y-3">
        {items.map(a=>(
          <div key={a.id} className="rounded-xl overflow-hidden" style={{background:CARD, border:`1px solid ${a.pinned?`${G}50`:BORDER}`}}>
            {a.image_url&&(
              <img src={a.image_url} alt={a.title} style={{width:'100%', maxHeight:300, objectFit:'cover'}}/>
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {a.pinned&&<span className="font-cinzel uppercase tracking-wider" style={{fontSize:8, padding:'2px 8px', borderRadius:10, background:`${G}20`, border:`1px solid ${GD}`, color:G}}>📌 Fijado</span>}
                <h3 className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:14}}>{a.title}</h3>
              </div>
              {a.content&&<p className="font-rajdhani" style={{color:'#888', fontSize:13, lineHeight:1.6}}>{a.content}</p>}
              <p className="font-rajdhani mt-2" style={{fontSize:10, color:'#444'}}>{new Date(a.created_at).toLocaleDateString('es-PA')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Boss Posts ────────────────────────────────────────────────
type BossType = 'BD'|'FV'
function BossPostForm({ type, onCreated }: { type:BossType; onCreated:()=>void }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('boss_posts').insert({ boss_type:type, player_name:name, kill_date:date, kill_time:time||null, notes:notes||null })
    setName(''); setNotes(''); setBusy(false); onCreated()
  }

  const col = type==='BD'?'#e05050':'#4ab8f0'
  const label = type==='BD'?'🐉 Black Dragon':'❄️ Frozen Ville'

  return (
    <div className="rounded-xl p-4" style={{background:CARD, border:`1px solid ${col}30`}}>
      <p className="font-cinzel uppercase tracking-widest mb-3" style={{fontSize:9, color:col}}>Publicar kill — {label}</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="font-rajdhani mb-1" style={{fontSize:10, color:'#888'}}>Tu nombre / PJ</p>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Morgan"
            className="font-rajdhani w-full" style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:5, padding:'6px 10px', color:'#e8e0d0', fontSize:13}}/>
        </div>
        <div>
          <p className="font-rajdhani mb-1" style={{fontSize:10, color:'#888'}}>Fecha</p>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            className="font-rajdhani w-full" style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:5, padding:'6px 10px', color:'#e8e0d0', fontSize:13}}/>
        </div>
      </div>
      <div className="mb-2">
        <p className="font-rajdhani mb-1" style={{fontSize:10, color:'#888'}}>Hora (opcional)</p>
        <input value={time} onChange={e=>setTime(e.target.value)} placeholder="21:00"
          className="font-rajdhani w-full" style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:5, padding:'6px 10px', color:'#e8e0d0', fontSize:13}}/>
      </div>
      <div className="mb-3">
        <p className="font-rajdhani mb-1" style={{fontSize:10, color:'#888'}}>Notas (opcional)</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Descripción del kill..."
          className="font-rajdhani w-full" style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:5, padding:'6px 10px', color:'#e8e0d0', fontSize:13, resize:'none'}}/>
      </div>
      <button onClick={submit} disabled={busy||!name.trim()}
        className="font-cinzel uppercase tracking-wider"
        style={{fontSize:9, padding:'8px 18px', borderRadius:6, background:`${col}20`, border:`1px solid ${col}60`, color:col, cursor:'pointer', opacity:(busy||!name.trim())?0.5:1}}>
        {busy?'Publicando...':'+ Publicar Kill'}
      </button>
    </div>
  )
}

function BossPostsList({ type, posts }: { type:BossType; posts:any[] }) {
  const col = type==='BD'?'#e05050':'#4ab8f0'
  const filtered = posts.filter(p=>p.boss_type===type).slice(0,8)
  return (
    <div className="space-y-2 mt-3">
      {filtered.length===0
        ? <p className="font-rajdhani text-center" style={{padding:'20px', color:'#333', fontSize:12}}>Sin publicaciones aún — ¡sé el primero!</p>
        : filtered.map(p=>(
          <div key={p.id} className="rounded-lg px-4 py-3 flex items-center justify-between"
            style={{background:'#09090f', border:`1px solid ${col}20`}}>
            <div>
              <span className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:13}}>{p.player_name}</span>
              {p.notes&&<p className="font-rajdhani" style={{fontSize:11, color:'#666', marginTop:1}}>{p.notes}</p>}
            </div>
            <div className="text-right">
              <p className="font-cinzel" style={{fontSize:12, color:col}}>{p.kill_date}</p>
              {p.kill_time&&<p className="font-rajdhani" style={{fontSize:10, color:'#555'}}>{p.kill_time}</p>}
            </div>
          </div>
        ))
      }
    </div>
  )
}

function LastTimeBoss() {
  const [posts, setPosts] = useState<any[]>([])
  const [tab, setTab] = useState<BossType>('BD')

  async function load() {
    const {data} = await supabase.from('boss_posts').select('*').order('created_at', {ascending:false}).limit(30)
    setPosts(data??[])
  }
  useEffect(()=>{ load() },[])

  return (
    <div className="mb-6">
      <SectionTitle>⚔️ Last Time Boss</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        {(['BD','FV'] as BossType[]).map(t=>(
          <div key={t}>
            <BossPostForm type={t} onCreated={load}/>
            <BossPostsList type={t} posts={posts}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const [lb, setLb] = useState<LeaderboardEntry[]>([])
  const [events, setEvents] = useState<GuildEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<LeaderboardEntry|null>(null)

  async function loadData() {
    const [l,e] = await Promise.all([getPublicLeaderboard(), getGuildEvents()])
    setLb(l); setEvents(e); setLoading(false)
  }
  useEffect(()=>{ loadData() },[])

  async function handleClaimed() {
    const fresh = await getPublicLeaderboard()
    setLb(fresh)
    if (selected) setSelected(fresh.find(p=>p.id===selected.id)??null)
  }

  const filtered = useMemo(()=>{
    if (!search.trim()) return lb
    const s = search.toLowerCase()
    return lb.filter(p=>
      p.name.toLowerCase().includes(s)||
      (p.owner||'').toLowerCase().includes(s)||
      (p.chars||'').toLowerCase().includes(s)
    )
  },[lb,search])

  return (
    <div style={{minHeight:'100vh', background:VOID}}>
      {/* Header */}
      <header style={{background:'linear-gradient(180deg,#0a0010 0%,#04040e 100%)', borderBottom:'1px solid #c9a84c30'}}>
        <div style={{maxWidth:1200, margin:'0 auto', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span style={{fontSize:26}}>🐉</span>
              <h1 className="font-cinzel font-black text-gold-gradient" style={{fontSize:24, letterSpacing:'0.08em'}}>THE ORIGINALS</h1>
            </div>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:9, color:GD}}>Tales of Pirates · Guild Point Tracker</p>
          </div>
          <a href="/admin" className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD, border:'1px solid #7a603060', padding:'7px 16px', borderRadius:6, textDecoration:'none'}}>Admin →</a>
        </div>
      </header>

      <div style={{maxWidth:1200, margin:'0 auto', padding:'24px'}}>

        {/* ── ANUNCIOS ── */}
        <Announcements/>

        {/* ── SEARCH ── */}
        <div className="relative mb-4">
          <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setSelected(null)}}
            placeholder="Buscar jugador por nombre, owner o PJ..."
            className="font-rajdhani w-full"
            style={{background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'11px 18px 11px 44px', color:'#e8e0d0', fontSize:15}}/>
          <span style={{position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, color:'#444'}}>🔍</span>
          {search&&<button onClick={()=>{setSearch('');setSelected(null)}} style={{position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', color:'#555', fontSize:15, background:'none', border:'none', cursor:'pointer'}}>✕</button>}
        </div>

        {/* ── CLAIM PANEL ── */}
        {selected&&<ClaimPanel player={selected} onClose={()=>setSelected(null)} onClaimed={handleClaimed}/>}

        {/* ── BD TABLE ── */}
        <div className="mb-5">
          <SectionTitle>🐉 Black Dragon Points</SectionTitle>
          <BDTable data={filtered} loading={loading} onSelect={p=>setSelected(prev=>prev?.id===p.id?null:p)} selectedId={selected?.id}/>
        </div>

        {/* ── FV TABLE ── */}
        <div className="mb-6">
          <SectionTitle>❄️ Frozen Ville Points</SectionTitle>
          <FVTable data={filtered} loading={loading}/>
        </div>

        {/* ── LAST TIME BOSS ── */}
        <LastTimeBoss/>

        {/* ── GUILD EVENTS ── */}
        {events.length>0&&(
          <div style={{background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden'}}>
            <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
              <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD}}>🏆 Guild Events</h2>
              <span className="font-cinzel font-bold" style={{fontSize:13, color:G}}>{events.reduce((s,e)=>s+e.points,0)} pts</span>
            </div>
            {events.map((ev,i)=>(
              <div key={ev.id} className="flex items-center justify-between px-5 py-3"
                style={{borderBottom:i<events.length-1?'1px solid #0f0f20':'none'}}>
                <div>
                  <p className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:13}}>{ev.name}</p>
                  {ev.description&&<p className="font-rajdhani" style={{fontSize:11, color:'#555'}}>{ev.description}</p>}
                </div>
                <div className="text-right">
                  <span className="font-cinzel font-bold" style={{color:G, fontSize:14}}>{ev.points} pts</span>
                  <p className="font-rajdhani" style={{fontSize:10, color:'#555'}}>{ev.event_date}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
