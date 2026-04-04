'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo } from 'react'
import { getPublicLeaderboard, getPlayerRunes, getGuildEvents, LeaderboardEntry, Runes, GuildEvent, supabase, createClaim } from '@/lib/supabase'

const RUNES = [
  { key: 'curse',       label: 'Curse',       color: '#c040c0', icon: '💀' },
  { key: 'illusory',    label: 'Illusory',    color: '#4080f0', icon: '🌀' },
  { key: 'piercing',    label: 'Piercing',    color: '#f0a020', icon: '⚡' },
  { key: 'riven_soul',  label: 'Riven Soul',  color: '#e03030', icon: '💔' },
  { key: 'favor',       label: 'Favor',       color: '#40d0a0', icon: '✨' },
  { key: 'prayer',      label: 'Prayer',      color: '#d0d040', icon: '🙏' },
  { key: 'scroll_ring', label: 'Scroll Ring', color: '#c9a84c', icon: '📜' },
] as const

const G = '#c9a84c', GD = '#7a6030', CARD = '#0c0c22', DEEP = '#07071a', BORDER = '#1e1e40'

function SkRow() {
  return <tr>{[40,150,60,60,70,60].map((w,i) => <td key={i} className="px-4 py-3"><div className="skeleton h-4 rounded" style={{width:w}}/></td>)}</tr>
}

function RuneCard({ rune, value }: { rune: typeof RUNES[number]; value: number }) {
  return (
    <div className="rune-card flex flex-col items-center gap-1 rounded-lg p-2 transition-all"
      style={{ background: `linear-gradient(135deg,#0c0c22 0%,${rune.color}18 100%)`, border: `1px solid ${rune.color}40` }}>
      <span style={{fontSize:18}}>{rune.icon}</span>
      <span className="font-cinzel text-center leading-tight" style={{fontSize:8, color: rune.color, letterSpacing:'0.04em'}}>{rune.label}</span>
      <span className="font-cinzel font-bold" style={{fontSize:17, color: rune.color}}>{value}</span>
    </div>
  )
}

function PlayerPanel({ player, onClose }: { player: LeaderboardEntry; onClose: () => void }) {
  const [runes, setRunes] = useState<Runes|null>(null)
  const [loadingR, setLoadingR] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimDone, setClaimDone] = useState(false)

  useEffect(() => { getPlayerRunes(player.id).then(r=>{ setRunes(r); setLoadingR(false) }) }, [player.id])

  const canClaim = player.total_points >= 5
  const nextClaimAt = Math.ceil((player.total_claims + 1) * 5)

  async function handleClaim() {
    setClaiming(true)
    try {
      await createClaim(player.id, 'Reclamo desde dashboard público')
      setClaimDone(true)
    } finally { setClaiming(false) }
  }

  return (
    <div className="fade-in rounded-xl p-5 mb-5" style={{background:'#08081a', border:`1px solid ${G}60`}}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-cinzel font-bold text-gold-gradient" style={{fontSize:22}}>{player.name}</h2>
          {player.owner && player.owner !== player.name &&
            <p className="font-rajdhani uppercase tracking-widest" style={{fontSize:11,color:GD}}>Owner: {player.owner}</p>}
          {player.chars &&
            <p className="font-rajdhani mt-1" style={{fontSize:12,color:'#666'}}>PJs: {player.chars}</p>}
        </div>
        <button onClick={onClose} style={{color:'#555',fontSize:20,background:'none',border:'none',cursor:'pointer'}}>✕</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          {label:'Total',   val: player.total_points, col: G},
          {label:'Black Dragon', val: player.bd_points, col:'#e05050'},
          {label:'Frozen Ville', val: player.fv_points, col:'#4ab8f0'},
          {label:'Claims',  val: player.total_claims,  col:'#40d0a0'},
        ].map(s=>(
          <div key={s.label} className="rounded-lg p-3 text-center" style={{background:DEEP, border:`1px solid ${BORDER}`}}>
            <div className="font-cinzel font-bold" style={{fontSize:22,color:s.col}}>{s.val}</div>
            <div className="font-rajdhani uppercase tracking-wider" style={{fontSize:9,color:'#555'}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Claim button */}
      <div className="flex items-center gap-3 mb-4">
        {claimDone ? (
          <div className="font-cinzel rounded-lg px-4 py-2" style={{background:'#0a2a1a',border:'1px solid #20a060',color:'#40d090',fontSize:12}}>
            ✓ Claim registrado — pendiente de aprobación
          </div>
        ) : canClaim ? (
          <button onClick={handleClaim} disabled={claiming}
            className="font-cinzel uppercase tracking-widest transition-all"
            style={{fontSize:11,padding:'9px 20px',borderRadius:8,background:`linear-gradient(135deg,#2a6030,#40a060)`,border:'none',color:'#e8e0d0',cursor:'pointer',opacity:claiming?0.6:1}}>
            {claiming ? 'Registrando...' : '🏆 Reclamar (tienes ≥5 pts)'}
          </button>
        ) : (
          <div className="font-rajdhani" style={{fontSize:12,color:'#555'}}>
            Necesitas {(5 - (player.total_points % 5)).toFixed(2)} pts más para tu próximo claim
          </div>
        )}
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
  const [tab, setTab] = useState<'all'|'bd'|'fv'>('all')

  useEffect(() => {
    Promise.all([getPublicLeaderboard(), getGuildEvents()])
      .then(([l,e])=>{setLb(l);setEvents(e)})
      .finally(()=>setLoading(false))
  },[])

  const filtered = useMemo(()=>{
    let data = [...lb]
    if (tab==='bd') data.sort((a,b)=>b.bd_points-a.bd_points)
    else if (tab==='fv') data.sort((a,b)=>b.fv_points-a.fv_points)
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(p=>
      p.name.toLowerCase().includes(s) ||
      (p.owner||'').toLowerCase().includes(s) ||
      (p.chars||'').toLowerCase().includes(s)
    )
  },[lb,search,tab])

  const totalEventPts = events.reduce((s,e)=>s+e.points,0)

  return (
    <div style={{minHeight:'100vh',background:'#04040e'}}>
      <header style={{background:'linear-gradient(180deg,#0a0010 0%,#04040e 100%)',borderBottom:'1px solid #c9a84c30'}}>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span style={{fontSize:30}}>🐉</span>
              <h1 className="font-cinzel font-black text-gold-gradient" style={{fontSize:28,letterSpacing:'0.08em'}}>THE ORIGINALS</h1>
            </div>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:9,color:GD,paddingLeft:4}}>Tales of Pirates · Guild Point Tracker</p>
          </div>
          <a href="/admin" className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD,border:'1px solid #7a603060',padding:'7px 16px',borderRadius:6}}>Admin →</a>
        </div>
      </header>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>
        {/* Search */}
        <div className="relative mb-2">
          <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setSelected(null)}}
            placeholder="Buscar por nombre, owner o PJ..."
            className="font-rajdhani w-full"
            style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'13px 18px 13px 46px',color:'#e8e0d0',fontSize:16}}/>
          <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:17,color:'#444'}}>🔍</span>
          {search && <button onClick={()=>{setSearch('');setSelected(null)}} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',color:'#555',fontSize:17,background:'none',border:'none',cursor:'pointer'}}>✕</button>}
        </div>
        {search && <p className="font-rajdhani mb-3" style={{fontSize:12,color:GD,paddingLeft:4}}>{filtered.length} resultado{filtered.length!==1?'s':''}</p>}

        {selected && <PlayerPanel player={selected} onClose={()=>setSelected(null)}/>}

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([['all','Todos',G],['bd','🐉 BD','#e05050'],['fv','❄️ FV','#4ab8f0']] as const).map(([k,label,col])=>(
            <button key={k} onClick={()=>setTab(k)} className="font-cinzel uppercase tracking-wider"
              style={{fontSize:10,padding:'7px 16px',borderRadius:6,border:`1px solid ${tab===k?col:BORDER}`,background:tab===k?`${col}18`:'transparent',color:tab===k?col:'#555',cursor:'pointer'}}>
              {label}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="mb-6" style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Clasificación General</h2>
            <span className="font-rajdhani" style={{fontSize:12,color:'#444'}}>{filtered.length} jugadores</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {['#','Owner / PJs','🐉 BD','❄️ FV','Total','Claims'].map((h,i)=>(
                    <th key={h} className="font-cinzel uppercase tracking-widest"
                      style={{padding:'9px 14px',textAlign:i===0?'center':i>=2?'right':'left',fontSize:9,color:'#555',fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({length:8}).map((_,i)=><SkRow key={i}/>) :
                 filtered.length===0 ? (
                  <tr><td colSpan={6} className="font-rajdhani text-center" style={{padding:'40px',color:'#333',fontSize:14}}>
                    {search?`No se encontró "${search}"`:'Sin jugadores'}
                  </td></tr>
                ) : filtered.map((p,i)=>{
                  const isSel = selected?.id===p.id
                  return (
                    <tr key={p.id} onClick={()=>setSelected(prev=>prev?.id===p.id?null:p)}
                      style={{borderBottom:'1px solid #0f0f20',background:isSel?'#12122e':'transparent',cursor:'pointer',borderLeft:isSel?`2px solid ${G}`:'2px solid transparent'}}
                      onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='#0e0e26'}}
                      onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td className="font-cinzel text-center" style={{padding:'11px 14px',width:44,color:'#555',fontSize:12}}>
                        {i<3?['🥇','🥈','🥉'][i]:i+1}
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        <span className="font-cinzel font-semibold" style={{color:isSel?G:'#e8e0d0',fontSize:14}}>{p.name}</span>
                        {p.chars && <div className="font-rajdhani" style={{fontSize:11,color:'#555',marginTop:1}}>{p.chars}</div>}
                      </td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'11px 14px',color:'#e05050',fontSize:15}}>{p.bd_points}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'11px 14px',color:'#4ab8f0',fontSize:15}}>{p.fv_points}</td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'11px 14px',color:G,fontSize:16}}>{p.total_points}</td>
                      <td className="font-rajdhani text-right" style={{padding:'11px 14px',color:'#40d0a0',fontSize:14}}>{p.total_claims}</td>
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
            <span className="font-cinzel font-bold" style={{fontSize:13,color:G}}>{totalEventPts} pts acumulados</span>
          </div>
          {events.length===0 ? (
            <p className="font-rajdhani text-center" style={{padding:'32px',color:'#333',fontSize:14}}>Sin eventos</p>
          ) : events.map((ev,i)=>(
            <div key={ev.id} className="flex items-center justify-between px-5 py-3"
              style={{borderBottom:i<events.length-1?'1px solid #0f0f20':'none'}}>
              <div>
                <p className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:13}}>{ev.name}</p>
                {ev.description&&<p className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{ev.description}</p>}
              </div>
              <div className="text-right">
                <span className="font-cinzel font-bold" style={{color:G,fontSize:15}}>{ev.points} pts</span>
                <p className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{ev.event_date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
