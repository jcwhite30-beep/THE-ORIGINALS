'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo } from 'react'
import { getPublicLeaderboard, getPlayerRunes, getGuildEvents, processClaim, LeaderboardEntry, Runes, GuildEvent } from '@/lib/supabase'

const RUNES = [
  { key: 'curse',       label: 'Curse',       color: '#c040c0', icon: '💀' },
  { key: 'illusory',    label: 'Illusory',    color: '#4080f0', icon: '🌀' },
  { key: 'piercing',    label: 'Piercing',    color: '#f0a020', icon: '⚡' },
  { key: 'riven_soul',  label: 'Riven Soul',  color: '#e03030', icon: '💔' },
  { key: 'favor',       label: 'Favor',       color: '#40d0a0', icon: '✨' },
  { key: 'prayer',      label: 'Prayer',      color: '#d0d040', icon: '🙏' },
  { key: 'scroll_ring', label: 'Scroll Ring', color: '#c9a84c', icon: '📜' },
] as const

// FV cards (6 cards)
const FV_CARDS = [
  { key: 'fv1', label: 'Participación FV', color: '#4ab8f0', icon: '❄️' },
  { key: 'fv2', label: 'Kills FV',         color: '#60c8ff', icon: '⚔️' },
  { key: 'fv3', label: 'Boss FV',          color: '#80d8ff', icon: '🐉' },
  { key: 'fv4', label: 'MVP FV',           color: '#3090c0', icon: '🏅' },
  { key: 'fv5', label: 'Loot FV',          color: '#50a0e0', icon: '💎' },
  { key: 'fv6', label: 'Bonus FV',         color: '#70b0d0', icon: '⭐' },
] as const

const G='#c9a84c', GD='#7a6030', CARD='#0c0c22', DEEP='#07071a', BORDER='#1e1e40'

function SkRow() {
  return <tr>{[40,180,80,80,80,60].map((w,i)=><td key={i} className="px-3 py-3"><div className="skeleton h-4 rounded" style={{width:w}}/></td>)}</tr>
}

function RuneCard({ rune, value }: { rune: typeof RUNES[number]; value: number }) {
  return (
    <div className="rune-card flex flex-col items-center gap-1 rounded-lg p-2 transition-all"
      style={{background:`linear-gradient(135deg,#0c0c22,${rune.color}18)`,border:`1px solid ${rune.color}40`}}>
      <span style={{fontSize:16}}>{rune.icon}</span>
      <span className="font-cinzel text-center leading-tight" style={{fontSize:7.5,color:rune.color,letterSpacing:'0.04em'}}>{rune.label}</span>
      <span className="font-cinzel font-bold" style={{fontSize:16,color:rune.color}}>{value}</span>
    </div>
  )
}

function InfoCard({ icon, label, value, color }: { icon:string; label:string; value:string|number; color:string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg p-3 transition-all"
      style={{background:`linear-gradient(135deg,#0c0c22,${color}18)`,border:`1px solid ${color}40`}}>
      <span style={{fontSize:18}}>{icon}</span>
      <span className="font-cinzel text-center leading-tight" style={{fontSize:8,color,letterSpacing:'0.04em'}}>{label}</span>
      <span className="font-cinzel font-bold" style={{fontSize:18,color}}>{value}</span>
    </div>
  )
}

function PlayerPanel({ player, onClose, onClaimed }: { player: LeaderboardEntry; onClose: () => void; onClaimed: () => void }) {
  const [runes, setRunes] = useState<Runes|null>(null)
  const [loadingR, setLoadingR] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimDone, setClaimDone] = useState(false)
  const [claimErr, setClaimErr] = useState('')
  const [localAvail, setLocalAvail] = useState(player.available_points)

  useEffect(() => {
    setLocalAvail(player.available_points)
    getPlayerRunes(player.id).then(r=>{ setRunes(r); setLoadingR(false) })
  }, [player.id, player.available_points])

  const canClaim = localAvail >= 5

  async function handleClaim() {
    setClaiming(true); setClaimErr('')
    try {
      await processClaim(player.id, 'Reclamo desde dashboard público')
      setLocalAvail(p => p - 5)
      setClaimDone(true)
      setTimeout(() => { setClaimDone(false); onClaimed() }, 2000)
    } catch(e:any) {
      setClaimErr(e.message ?? 'Error al reclamar')
    } finally { setClaiming(false) }
  }

  return (
    <div className="fade-in rounded-xl p-5 mb-5" style={{background:'#07071a', border:`1px solid ${G}60`}}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-cinzel font-bold text-gold-gradient" style={{fontSize:22}}>{player.name}</h2>
          {player.chars && <p className="font-rajdhani mt-1" style={{fontSize:12,color:'#888'}}>PJs: {player.chars}</p>}
        </div>
        <button onClick={onClose} style={{color:'#444',fontSize:18,background:'none',border:'none',cursor:'pointer'}}>✕</button>
      </div>

      {/* BD Card (1) + FV Cards (6) + Claim card */}
      <p className="font-cinzel uppercase tracking-widest mb-2" style={{fontSize:9,color:GD}}>Black Dragon</p>
      <div className="grid grid-cols-1 gap-2 mb-4">
        <InfoCard icon="🐉" label="Puntos BD disponibles" value={localAvail.toFixed(4)} color="#e05050" />
      </div>

      <p className="font-cinzel uppercase tracking-widest mb-2" style={{fontSize:9,color:GD}}>Frozen Ville</p>
      <div className="grid grid-cols-6 gap-2 mb-4">
        {FV_CARDS.map(c=><InfoCard key={c.key} icon={c.icon} label={c.label} value={player.fv_points > 0 ? (player.fv_points/6).toFixed(2) : 0} color={c.color}/>)}
      </div>

      {/* Claims section */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="rounded-lg px-4 py-2" style={{background:DEEP,border:`1px solid ${BORDER}`}}>
          <span className="font-rajdhani" style={{fontSize:12,color:'#888'}}>Claims realizados: </span>
          <span className="font-cinzel font-bold" style={{fontSize:16,color:'#40d0a0'}}>{player.total_claims}</span>
        </div>
        {claimDone ? (
          <div className="font-cinzel rounded-lg px-4 py-2" style={{background:'#0a2a1a',border:'1px solid #20a060',color:'#40d090',fontSize:12}}>
            ✓ Claim registrado — pendiente de aprobación
          </div>
        ) : canClaim ? (
          <button onClick={handleClaim} disabled={claiming}
            className="font-cinzel uppercase tracking-widest transition-all"
            style={{fontSize:10,padding:'9px 20px',borderRadius:8,background:`linear-gradient(135deg,#2a6030,#40a060)`,border:'none',color:'#e8e0d0',cursor:'pointer',opacity:claiming?0.6:1}}>
            {claiming ? 'Procesando...' : `🏆 Reclamar (tienes ${localAvail.toFixed(2)} pts)`}
          </button>
        ) : (
          <div className="font-rajdhani rounded-lg px-3 py-2" style={{background:DEEP,border:`1px solid ${BORDER}`,fontSize:12,color:'#555'}}>
            Necesitas {(5 - localAvail).toFixed(4)} pts más para reclamar
          </div>
        )}
        {claimErr && <p className="font-rajdhani" style={{color:'#e04040',fontSize:12}}>{claimErr}</p>}
      </div>

      {/* Runes */}
      <p className="font-cinzel uppercase tracking-widest mb-2" style={{fontSize:9,color:GD}}>Runas</p>
      {loadingR ? (
        <div className="grid grid-cols-7 gap-2">{RUNES.map(r=><div key={r.key} className="skeleton rounded-lg h-20"/>)}</div>
      ) : runes ? (
        <div className="grid grid-cols-7 gap-2">{RUNES.map(r=><RuneCard key={r.key} rune={r} value={(runes as any)[r.key]??0}/>)}</div>
      ) : (
        <p className="font-rajdhani" style={{color:'#333',fontSize:13}}>Sin runas registradas</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [lb, setLb] = useState<LeaderboardEntry[]>([])
  const [events, setEvents] = useState<GuildEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<LeaderboardEntry|null>(null)
  const [sortBy, setSortBy] = useState<'available'|'total'|'claims'>('available')

  async function loadData() {
    const [l,e] = await Promise.all([getPublicLeaderboard(), getGuildEvents()])
    setLb(l); setEvents(e); setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // When player claims, reload and update selected
  async function handleClaimed() {
    const fresh = await getPublicLeaderboard()
    setLb(fresh)
    if (selected) {
      const updated = fresh.find(p=>p.id===selected.id)
      if (updated) setSelected(updated)
    }
  }

  const filtered = useMemo(() => {
    let data = [...lb]
    if (sortBy === 'total') data.sort((a,b) => b.total_points - a.total_points)
    else if (sortBy === 'claims') data.sort((a,b) => b.total_claims - a.total_claims)
    else data.sort((a,b) => b.available_points - a.available_points)
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(p =>
      p.name.toLowerCase().includes(s) ||
      (p.owner||'').toLowerCase().includes(s) ||
      (p.chars||'').toLowerCase().includes(s)
    )
  }, [lb, search, sortBy])

  const totalEventPts = events.reduce((s,e)=>s+e.points, 0)

  return (
    <div style={{minHeight:'100vh',background:'#04040e'}}>
      <header style={{background:'linear-gradient(180deg,#0a0010 0%,#04040e 100%)',borderBottom:'1px solid #c9a84c30'}}>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'22px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span style={{fontSize:28}}>🐉</span>
              <h1 className="font-cinzel font-black text-gold-gradient" style={{fontSize:26,letterSpacing:'0.08em'}}>THE ORIGINALS</h1>
            </div>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:9,color:GD,paddingLeft:4}}>Tales of Pirates · Guild Point Tracker</p>
          </div>
          <a href="/admin" className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD,border:'1px solid #7a603060',padding:'7px 16px',borderRadius:6,textDecoration:'none'}}>Admin →</a>
        </div>
      </header>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px'}}>
        {/* Search */}
        <div className="relative mb-3">
          <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setSelected(null)}}
            placeholder="Buscar por nombre, owner o personaje..."
            className="font-rajdhani w-full"
            style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 18px 12px 44px',color:'#e8e0d0',fontSize:16}}/>
          <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#444'}}>🔍</span>
          {search && <button onClick={()=>{setSearch('');setSelected(null)}} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',color:'#555',fontSize:16,background:'none',border:'none',cursor:'pointer'}}>✕</button>}
        </div>
        {search && <p className="font-rajdhani mb-3" style={{fontSize:12,color:GD}}>{filtered.length} resultado{filtered.length!==1?'s':''}</p>}

        {/* Player detail panel */}
        {selected && <PlayerPanel player={selected} onClose={()=>setSelected(null)} onClaimed={handleClaimed}/>}

        {/* Sort tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            ['available','💰 Pts Disponibles'],
            ['total','📊 Total Score'],
            ['claims','🏆 Claims'],
          ] as const).map(([k,label])=>(
            <button key={k} onClick={()=>setSortBy(k)} className="font-cinzel uppercase tracking-wider"
              style={{fontSize:9,padding:'7px 14px',borderRadius:6,border:`1px solid ${sortBy===k?G:BORDER}`,background:sortBy===k?`${G}18`:'transparent',color:sortBy===k?G:'#555',cursor:'pointer'}}>
              {label}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="mb-6" style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Clasificación — {filtered.length} jugadores</h2>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {['#','Jugador / PJs','Pts Disponibles','Total Score','🐉 BD','❄️ FV','Claims'].map((h,i)=>(
                    <th key={h} className="font-cinzel uppercase tracking-widest"
                      style={{padding:'9px 12px',textAlign:i===0?'center':i>=2?'right':'left',fontSize:8,color: i===2?G:'#555',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({length:8}).map((_,i)=><SkRow key={i}/>) :
                 filtered.length===0 ? (
                  <tr><td colSpan={7} className="font-rajdhani text-center" style={{padding:'40px',color:'#333',fontSize:14}}>
                    {search?`No se encontró "${search}"`:'Sin jugadores'}
                  </td></tr>
                ) : filtered.map((p,i)=>{
                  const isSel = selected?.id===p.id
                  return (
                    <tr key={p.id} onClick={()=>setSelected(prev=>prev?.id===p.id?null:p)}
                      style={{borderBottom:'1px solid #0f0f20',background:isSel?'#10102a':'transparent',cursor:'pointer',borderLeft:isSel?`2px solid ${G}`:'2px solid transparent'}}
                      onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='#0e0e26'}}
                      onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td className="font-cinzel text-center" style={{padding:'11px 12px',width:40,color:'#555',fontSize:12}}>
                        {i<3?['🥇','🥈','🥉'][i]:i+1}
                      </td>
                      <td style={{padding:'11px 12px',minWidth:160}}>
                        <div className="font-cinzel font-semibold" style={{color:isSel?G:'#e8e0d0',fontSize:13}}>{p.name}</div>
                        {p.chars && <div className="font-rajdhani" style={{fontSize:10,color:'#555',marginTop:1,lineHeight:1.3}}>{p.chars}</div>}
                      </td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'11px 12px',color:G,fontSize:14}}>{p.available_points.toFixed(4)}</td>
                      <td className="font-rajdhani text-right" style={{padding:'11px 12px',color:'#aaa',fontSize:13}}>{p.total_points.toFixed(4)}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'11px 12px',color:'#e05050',fontSize:13}}>{p.bd_points.toFixed(2)}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'11px 12px',color:'#4ab8f0',fontSize:13}}>{p.fv_points.toFixed(2)}</td>
                      <td className="font-rajdhani text-right" style={{padding:'11px 12px',color:'#40d0a0',fontSize:13,fontWeight:700}}>{p.total_claims}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guild Events */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>🏆 Guild Events</h2>
            <span className="font-cinzel font-bold" style={{fontSize:13,color:G}}>{totalEventPts} pts</span>
          </div>
          {events.length===0
            ? <p className="font-rajdhani text-center" style={{padding:'28px',color:'#333',fontSize:13}}>Sin eventos registrados</p>
            : events.map((ev,i)=>(
              <div key={ev.id} className="flex items-center justify-between px-5 py-3"
                style={{borderBottom:i<events.length-1?'1px solid #0f0f20':'none'}}>
                <div>
                  <p className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:13}}>{ev.name}</p>
                  {ev.description&&<p className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{ev.description}</p>}
                </div>
                <div className="text-right">
                  <span className="font-cinzel font-bold" style={{color:G,fontSize:14}}>{ev.points} pts</span>
                  <p className="font-rajdhani" style={{fontSize:10,color:'#555'}}>{ev.event_date}</p>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
