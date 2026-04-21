'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo } from 'react'
import { getPublicLeaderboard, processClaim, supabase, LeaderboardEntry } from '@/lib/supabase'

// ─── Design tokens ────────────────────────────────────────────
const G='#c9a84c', GD='#7a6030', CARD='#0d0d1e', DEEP='#070712', BORDER='#22224a', VOID='#04040e'

// ─── 7 FV Runes ───────────────────────────────────────────────
const FV_RUNES = [
  { key:'curse',       label:'Curse Rune',    color:'#c040c0' },
  { key:'illusory',    label:'Illusory Rune', color:'#4080f0' },
  { key:'piercing',    label:'Piercing Rune', color:'#f0a020' },
  { key:'riven',       label:'Riven Soul',    color:'#e03030' },
  { key:'favor',       label:'Favor Rune',    color:'#40d0a0' },
  { key:'prayer',      label:'Prayer Rune',   color:'#d0d040' },
  { key:'scroll_ring', label:'Scroll Ring',   color:'#c9a84c' },
] as const

// ─── Helpers ──────────────────────────────────────────────────
const f2 = (n: number) => n.toFixed(2)
const fi = (n: number) => Math.floor(n)

// ─── Skeleton ─────────────────────────────────────────────────
function Sk({ w, h=14 }: { w:number; h?:number }) {
  return <div className="skeleton rounded" style={{width:w, height:h, display:'inline-block'}}/>
}

// ─── Stat Card (top bar) ──────────────────────────────────────
function StatCard({ icon, label, value, sub, color='#e8e0d0' }: { icon:string; label:string; value:string|number; sub?:string; color?:string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1" style={{background:CARD, border:`1px solid ${color}25`}}>
      <div className="flex items-center gap-2">
        <span style={{fontSize:16}}>{icon}</span>
        <span className="font-cinzel uppercase tracking-widest" style={{fontSize:8, color:'#666', letterSpacing:'0.12em'}}>{label}</span>
      </div>
      <div className="font-cinzel font-bold" style={{fontSize:22, color, lineHeight:1}}>{value}</div>
      {sub && <div className="font-rajdhani" style={{fontSize:11, color:'#555'}}>{sub}</div>}
    </div>
  )
}

// ─── RuneStat Card (FV top bar) ───────────────────────────────
function RuneStatCard({ rune, avail, claims }: { rune: typeof FV_RUNES[number]; avail:number; claims:number }) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1" style={{background:CARD, border:`1px solid ${rune.color}30`}}>
      <span className="font-cinzel uppercase tracking-widest" style={{fontSize:7.5, color:rune.color, letterSpacing:'0.1em'}}>{rune.label}</span>
      <div className="flex items-end gap-3 mt-1">
        <div>
          <div className="font-cinzel font-bold" style={{fontSize:18, color:rune.color}}>{f2(avail)}</div>
          <div className="font-rajdhani uppercase" style={{fontSize:9, color:'#555'}}>pts disp.</div>
        </div>
        <div>
          <div className="font-cinzel font-bold" style={{fontSize:18, color:'#40d0a0'}}>{claims}</div>
          <div className="font-rajdhani uppercase" style={{fontSize:9, color:'#555'}}>claims</div>
        </div>
      </div>
    </div>
  )
}

// ─── Claim Panel ──────────────────────────────────────────────
function ClaimPanel({ player, onClose, onClaimed }: { player:LeaderboardEntry; onClose:()=>void; onClaimed:()=>void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [avail, setAvail] = useState(player.available_points)
  const [claimsDone, setClaimsDone] = useState(player.total_claims)
  const claimsDisp = fi(avail / 5)

  async function handleClaim() {
    setBusy(true); setErr('')
    try {
      await processClaim(player.id, 'Dashboard público')
      setAvail(v => v - 5); setClaimsDone(v => v + 1); setDone(true)
      setTimeout(() => { setDone(false); onClaimed() }, 2000)
    } catch(e: any) { setErr(e.message ?? 'Error') }
    finally { setBusy(false) }
  }

  return (
    <div className="fade-in rounded-xl p-5 mb-5" style={{background:'#08081a', border:`1px solid ${G}55`}}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-cinzel font-bold text-gold-gradient" style={{fontSize:20}}>{player.name}</h3>
          {player.chars && <p className="font-rajdhani mt-1" style={{fontSize:12, color:'#777'}}>PJs: {player.chars}</p>}
        </div>
        <button onClick={onClose} style={{color:'#555', fontSize:18, background:'none', border:'none', cursor:'pointer', padding:4}}>✕</button>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {label:'Pts Disponibles', val:f2(avail), col:'#e05050'},
          {label:'Claims Disponibles', val:claimsDisp, col:G},
          {label:'Claims Realizados', val:claimsDone, col:'#40d0a0'},
        ].map(s=>(
          <div key={s.label} className="rounded-lg p-3 text-center" style={{background:DEEP, border:`1px solid ${BORDER}`}}>
            <div className="font-cinzel font-bold" style={{fontSize:22, color:s.col}}>{s.val}</div>
            <div className="font-rajdhani uppercase tracking-wider" style={{fontSize:9, color:'#666', marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>
      {done ? (
        <div className="font-cinzel rounded-lg px-4 py-2" style={{background:'#0a2a1a', border:'1px solid #20a060', color:'#40d090', fontSize:12}}>
          ✓ Claim registrado — pendiente de aprobación
        </div>
      ) : claimsDisp > 0 ? (
        <button onClick={handleClaim} disabled={busy} className="font-cinzel uppercase tracking-widest"
          style={{fontSize:11, padding:'10px 24px', borderRadius:8, background:`linear-gradient(135deg,#2a6030,#40a060)`, border:'none', color:'#e8ffe8', cursor:'pointer', opacity:busy?0.6:1}}>
          {busy ? 'Procesando...' : '🏆 Reclamar'}
        </button>
      ) : (
        <p className="font-rajdhani" style={{fontSize:13, color:'#555'}}>
          Necesitas {f2(5 - (avail % 5))} pts más para el próximo claim
        </p>
      )}
      {err && <p className="font-rajdhani mt-2" style={{color:'#e04040', fontSize:12}}>{err}</p>}
    </div>
  )
}

// ─── Announcements ────────────────────────────────────────────
function Announcements() {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => {
    supabase.from('announcements').select('*')
      .order('pinned', {ascending:false}).order('created_at', {ascending:false}).limit(10)
      .then(({data}) => setItems(data ?? []))
  }, [])
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span style={{fontSize:14}}>📢</span>
        <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD}}>Anuncios</h2>
      </div>
      <div className="space-y-3">
        {items.map(a => (
          <div key={a.id} className="rounded-xl overflow-hidden" style={{background:CARD, border:`1px solid ${a.pinned?`${G}50`:BORDER}`}}>
            {a.image_url && <img src={a.image_url} alt={a.title} style={{width:'100%', maxHeight:280, objectFit:'cover'}}/>}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {a.pinned && <span className="font-cinzel uppercase" style={{fontSize:8, padding:'2px 8px', borderRadius:10, background:`${G}20`, border:`1px solid ${GD}`, color:G}}>📌 Fijado</span>}
                <h3 className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:15}}>{a.title}</h3>
              </div>
              {a.content && <p className="font-rajdhani" style={{color:'#aaa', fontSize:13, lineHeight:1.7}}>{a.content}</p>}
              <p className="font-rajdhani mt-2" style={{fontSize:10, color:'#555'}}>{new Date(a.created_at).toLocaleDateString('es-PA')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── BD Table ─────────────────────────────────────────────────
function BDTable({ data, loading, selectedId, onSelect }: {data:LeaderboardEntry[]; loading:boolean; selectedId?:string; onSelect:(p:LeaderboardEntry)=>void}) {
  const [lastDate, setLastDate] = useState('')
  useEffect(() => {
    supabase.from('report_dates').select('last_date').eq('maze_type','BD').single()
      .then(({data:d}) => { if(d) setLastDate(d.last_date) })
  }, [])

  return (
    <div style={{background:CARD, border:'1px solid #e0505035', borderRadius:14, overflow:'hidden'}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:'1px solid #e0505025', background:'#0e080a'}}>
        <div className="flex items-center gap-2">
          <span style={{fontSize:18}}>🐉</span>
          <span className="font-cinzel font-bold uppercase tracking-widest" style={{fontSize:12, color:'#e05050'}}>Black Dragon</span>
        </div>
        {lastDate && <span className="font-rajdhani" style={{fontSize:11, color:'#e05050', opacity:0.65}}>Último reporte: {lastDate}</span>}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid #1a0a0a'}}>
              {[['#','center',30,'#555'],['Jugador / PJs','left',180,'#888'],['Total Pts','right',110,'#e05050'],['Claims Disp.','right',110,G],['Claims Hechos','right',120,'#40d0a0']].map(([h,a,w,c])=>(
                <th key={String(h)} className="font-cinzel uppercase tracking-widest"
                  style={{padding:'9px 14px', textAlign:a as any, width:Number(w), fontSize:8.5, color:String(c), fontWeight:600, letterSpacing:'0.1em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({length:6}).map((_,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #120808'}}>
                    {[30,180,90,90,90].map((w,j)=><td key={j} style={{padding:'11px 14px'}}><Sk w={w}/></td>)}
                  </tr>
                ))
              : data.map((p,i) => {
                  const isSel = selectedId === p.id
                  const claimsDisp = fi(p.available_points / 5)
                  return (
                    <tr key={p.id} onClick={() => onSelect(p)}
                      style={{borderBottom:'1px solid #120808', background:isSel?'#1a0808':'transparent', cursor:'pointer', borderLeft:isSel?'3px solid #e05050':'3px solid transparent', transition:'background 0.15s'}}
                      onMouseEnter={e => {if(!isSel)(e.currentTarget as HTMLElement).style.background='#140a0a'}}
                      onMouseLeave={e => {if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td className="font-cinzel text-center" style={{padding:'11px 14px', color:'#666', fontSize:12}}>
                        {i<3?['🥇','🥈','🥉'][i]:i+1}
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        <div className="font-cinzel font-semibold" style={{color:isSel?'#e07070':'#e8e0d0', fontSize:14}}>{p.name}</div>
                        {p.chars && <div className="font-rajdhani" style={{fontSize:11, color:'#666', marginTop:2, lineHeight:1.3}}>{p.chars}</div>}
                      </td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'11px 14px', color:'#e05050', fontSize:15}}>{f2(p.available_points)}</td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'11px 14px', color:G, fontSize:16}}>{claimsDisp}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'11px 14px', color:'#40d0a0', fontSize:14}}>{p.total_claims}</td>
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

// ─── FV Table ──────────────────────────────────────────────────
function FVTable({ data, loading }: { data:LeaderboardEntry[]; loading:boolean }) {
  const [fvData, setFvData] = useState<Record<string,any>>({})
  const [lastDate, setLastDate] = useState('')

  useEffect(() => {
    supabase.from('fv_rune_points').select('*, players(name)')
      .then(({data:d}) => {
        const map: Record<string,any> = {}
        ;(d??[]).forEach((r:any) => { if(r.players?.name) map[r.players.name] = r })
        setFvData(map)
      })
    supabase.from('report_dates').select('last_date').eq('maze_type','FV').single()
      .then(({data:d}) => { if(d) setLastDate(d.last_date) })
  }, [])

  return (
    <div style={{background:CARD, border:'1px solid #4ab8f035', borderRadius:14, overflow:'hidden'}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:'1px solid #4ab8f025', background:'#080e10'}}>
        <div className="flex items-center gap-2">
          <span style={{fontSize:18}}>❄️</span>
          <span className="font-cinzel font-bold uppercase tracking-widest" style={{fontSize:12, color:'#4ab8f0'}}>Frozen Ville</span>
        </div>
        {lastDate && <span className="font-rajdhani" style={{fontSize:11, color:'#4ab8f0', opacity:0.65}}>Último reporte: {lastDate}</span>}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
          <thead>
            {/* Rune headers */}
            <tr style={{borderBottom:'1px solid #0a1414'}}>
              <th className="font-cinzel text-left" style={{padding:'8px 14px', fontSize:8.5, color:'#777', fontWeight:600, minWidth:160}}>Jugador</th>
              {FV_RUNES.map(r => (
                <th key={r.key} colSpan={2} className="font-cinzel text-center uppercase tracking-widest"
                  style={{padding:'8px 6px', fontSize:8, color:r.color, fontWeight:700, borderLeft:'1px solid #1a2a3a', letterSpacing:'0.08em'}}>
                  {r.label}
                </th>
              ))}
            </tr>
            {/* Sub-headers */}
            <tr style={{borderBottom:'1px solid #0a1414', background:'#060c0e'}}>
              <th/>
              {FV_RUNES.map(r => (
                <>
                  <th key={`${r.key}-a`} className="font-cinzel text-right" style={{padding:'4px 8px', fontSize:7.5, color:'#777', fontWeight:500, borderLeft:'1px solid #1a2a3a'}}>Pts Disp.</th>
                  <th key={`${r.key}-c`} className="font-cinzel text-right" style={{padding:'4px 8px', fontSize:7.5, color:'#777', fontWeight:500}}>Claims</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({length:5}).map((_,i) => (
                  <tr key={i} style={{borderBottom:'1px solid #0a1414'}}>
                    <td style={{padding:'9px 14px'}}><Sk w={120}/></td>
                    {FV_RUNES.map(r => (
                      <>
                        <td key={`${r.key}-a`} style={{padding:'9px 8px', borderLeft:'1px solid #1a2a3a'}}><Sk w={45}/></td>
                        <td key={`${r.key}-c`} style={{padding:'9px 8px'}}><Sk w={30}/></td>
                      </>
                    ))}
                  </tr>
                ))
              : data.map((p,i) => {
                  const fv = fvData[p.name]
                  return (
                    <tr key={p.id} style={{borderBottom:'1px solid #0a1414'}}
                      onMouseEnter={e => {(e.currentTarget as HTMLElement).style.background='#0a1214'}}
                      onMouseLeave={e => {(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td style={{padding:'10px 14px', minWidth:160}}>
                        <div className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:13}}>{p.name}</div>
                        {p.chars && <div className="font-rajdhani" style={{fontSize:10, color:'#666', marginTop:1}}>{p.chars}</div>}
                      </td>
                      {FV_RUNES.map(r => (
                        <>
                          <td key={`${r.key}-a`} className="font-rajdhani font-bold text-right"
                            style={{padding:'10px 8px', color:r.color, fontSize:13, borderLeft:'1px solid #1a2a3a'}}>
                            {f2(fv?.[`${r.key}_avail`] ?? 0)}
                          </td>
                          <td key={`${r.key}-c`} className="font-rajdhani text-right"
                            style={{padding:'10px 8px', color:'#40d0a0', fontSize:13}}>
                            {fv?.[`${r.key}_claims`] ?? 0}
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

// ─── Last Time Boss ───────────────────────────────────────────
type BossType = 'BD'|'FV'
function BossPostForm({ type, onCreated }: { type:BossType; onCreated:()=>void }) {
  const [name, setName] = useState(''), [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false)
  const col = type==='BD'?'#e05050':'#4ab8f0'
  async function submit() {
    if (!name.trim()) return; setBusy(true)
    await supabase.from('boss_posts').insert({boss_type:type, player_name:name, kill_date:date, kill_time:time||null, notes:notes||null})
    setName(''); setNotes(''); setBusy(false); onCreated()
  }
  return (
    <div className="rounded-xl p-4 mb-3" style={{background:CARD, border:`1px solid ${col}30`}}>
      <p className="font-cinzel uppercase tracking-widest mb-3" style={{fontSize:9, color:col}}>Publicar kill</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="font-rajdhani mb-1" style={{fontSize:11, color:'#888'}}>Tu nombre / PJ</p>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Morgan" className="font-rajdhani w-full"
            style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:6, padding:'7px 10px', color:'#e8e0d0', fontSize:13}}/>
        </div>
        <div>
          <p className="font-rajdhani mb-1" style={{fontSize:11, color:'#888'}}>Fecha</p>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="font-rajdhani w-full"
            style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:6, padding:'7px 10px', color:'#e8e0d0', fontSize:13}}/>
        </div>
      </div>
      <div className="mb-2">
        <p className="font-rajdhani mb-1" style={{fontSize:11, color:'#888'}}>Hora (opc.)</p>
        <input value={time} onChange={e=>setTime(e.target.value)} placeholder="21:00" className="font-rajdhani w-full"
          style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:6, padding:'7px 10px', color:'#e8e0d0', fontSize:13}}/>
      </div>
      <div className="mb-3">
        <p className="font-rajdhani mb-1" style={{fontSize:11, color:'#888'}}>Notas (opc.)</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Descripción..."
          className="font-rajdhani w-full" style={{background:DEEP, border:`1px solid ${BORDER}`, borderRadius:6, padding:'7px 10px', color:'#e8e0d0', fontSize:13, resize:'none'}}/>
      </div>
      <button onClick={submit} disabled={busy||!name.trim()} className="font-cinzel uppercase tracking-wider"
        style={{fontSize:9, padding:'8px 18px', borderRadius:6, background:`${col}20`, border:`1px solid ${col}60`, color:col, cursor:'pointer', opacity:(busy||!name.trim())?0.4:1}}>
        {busy?'Publicando...':'+ Publicar Kill'}
      </button>
    </div>
  )
}

function BossPostsList({ type, posts }: { type:BossType; posts:any[] }) {
  const col = type==='BD'?'#e05050':'#4ab8f0'
  const filtered = posts.filter(p=>p.boss_type===type).slice(0,8)
  return (
    <div className="space-y-2">
      {filtered.length===0
        ? <p className="font-rajdhani text-center py-6" style={{color:'#333', fontSize:12}}>Sin publicaciones — ¡sé el primero!</p>
        : filtered.map(p=>(
          <div key={p.id} className="rounded-lg px-4 py-3 flex items-center justify-between"
            style={{background:DEEP, border:`1px solid ${col}20`}}>
            <div>
              <span className="font-cinzel font-semibold" style={{color:'#e8e0d0', fontSize:13}}>{p.player_name}</span>
              {p.notes&&<p className="font-rajdhani mt-0.5" style={{fontSize:11, color:'#777'}}>{p.notes}</p>}
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
  async function load() {
    const {data} = await supabase.from('boss_posts').select('*').order('created_at',{ascending:false}).limit(30)
    setPosts(data??[])
  }
  useEffect(()=>{load()},[])
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span style={{fontSize:14}}>⚔️</span>
        <h2 className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD}}>Last Time Boss</h2>
      </div>
      <div className="grid grid-cols-2 gap-5">
        {(['BD','FV'] as BossType[]).map(t=>(
          <div key={t}>
            <div className="font-cinzel uppercase tracking-widest mb-2" style={{fontSize:9, color:t==='BD'?'#e05050':'#4ab8f0'}}>
              {t==='BD'?'🐉 Black Dragon':'❄️ Frozen Ville'}
            </div>
            <BossPostForm type={t} onCreated={load}/>
            <BossPostsList type={t} posts={posts}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const [lb, setLb] = useState<LeaderboardEntry[]>([])
  const [fvTotals, setFvTotals] = useState<Record<string,{avail:number;claims:number}>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<LeaderboardEntry|null>(null)

  // Stats públicos — calculados dinámicamente desde la DB
  // Admin y Guild EVENTS están EXCLUIDOS de la vista pública
  const publicLb = lb.filter(p => p.name !== 'Administrador' && p.name !== 'Guild EVENTS')
  const publicTotalAvail = publicLb.reduce((s,p) => s + p.available_points, 0)
  // Redondear al múltiplo de 5 más bajo para claims exactos
  const TOTAL_PTS_PUBLIC = Math.floor(publicTotalAvail / 5) * 5
  const CLAIMS_DISP_PUBLIC = Math.floor(TOTAL_PTS_PUBLIC / 5)
  const LOOTS_BANCO = bankData?.loots_banco ?? 46
  const LOOTS_FUERA = bankData?.loots_fuera ?? 77
  const LOOTS_CLAIMS = bankData?.loots_claims ?? 0
  const EVENTS_AVAIL = lb.find(p=>p.name==='Guild EVENTS')?.available_points ?? 148.41

  const [bankData, setBankData] = useState<any>(null)

  async function loadData() {
    const l = await getPublicLeaderboard()
    setLb(l)
    // Load bank snapshot for loot counts
    const { data: bank } = await supabase.from('bank_snapshot').select('loots_banco,loots_fuera,loots_claims').order('created_at', {ascending:false}).limit(1).maybeSingle()
    if (bank) setBankData(bank)
    // FV totals per rune
    const {data: fvRows} = await supabase.from('fv_rune_points').select('*')
    const totals: Record<string,{avail:number;claims:number}> = {}
    for (const rune of ['curse','illusory','piercing','riven','favor','prayer','scroll_ring']) {
      totals[rune] = { avail:0, claims:0 }
      for (const row of (fvRows??[])) {
        totals[rune].avail += row[`${rune}_avail`] ?? 0
        totals[rune].claims += row[`${rune}_claims`] ?? 0
      }
    }
    setFvTotals(totals)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // ── Realtime: auto-refresh when Discord posts update players ──
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', {event:'*', schema:'public', table:'players'}, ()=>loadData())
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'maze_sessions'}, ()=>loadData())
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'claims'}, ()=>loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleClaimed() {
    const fresh = await getPublicLeaderboard()
    setLb(fresh)
    if (selected) setSelected(fresh.find(p=>p.id===selected.id)??null)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return publicLb
    const s = search.toLowerCase()
    return publicLb.filter(p =>
      p.name.toLowerCase().includes(s) ||
      (p.owner||'').toLowerCase().includes(s) ||
      (p.chars||'').toLowerCase().includes(s)
    )
  }, [publicLb, search])

  // Summary stats
  const totalAvail = lb.reduce((s,p) => s+p.available_points, 0)
  const totalClaimsDisp = fi(totalAvail / 5)
  const totalClaimsDone = lb.reduce((s,p) => s+p.total_claims, 0)

  return (
    <div style={{minHeight:'100vh', background:VOID, fontFamily:'Rajdhani, sans-serif'}}>
      {/* Header */}
      <header style={{background:'linear-gradient(180deg,#0c0014 0%,#04040e 100%)', borderBottom:'1px solid #c9a84c28'}}>
        <div style={{maxWidth:1300, margin:'0 auto', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span style={{fontSize:26}}>🐉</span>
              <h1 className="font-cinzel font-black text-gold-gradient" style={{fontSize:24, letterSpacing:'0.08em'}}>THE ORIGINALS</h1>
            </div>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:9, color:GD}}>Tales of Pirates · Guild Point Tracker</p>
          </div>
          <a href="/admin" className="font-cinzel uppercase tracking-widest" style={{fontSize:10, color:GD, border:'1px solid #7a603055', padding:'7px 16px', borderRadius:6, textDecoration:'none'}}>Admin →</a>
        </div>
      </header>

      <div style={{maxWidth:1300, margin:'0 auto', padding:'24px'}}>

        {/* ── ANUNCIOS ── */}
        <Announcements/>

        {/* ── TOP STAT CARDS ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
          <StatCard icon="🏆" label="Claims Disponibles" value={loading?'…':CLAIMS_DISP_PUBLIC} sub={`${Number(publicTotalAvail).toFixed(2)} pts disponibles`} color={G}/>
          <StatCard icon="🏦" label="Loots en Banco" value={LOOTS_BANCO} sub="BD loots en banco" color="#4ab8f0"/>
          <StatCard icon="📦" label="Loots Fuera Banco" value={LOOTS_FUERA} sub="BD loots fuera del banco" color="#f0a020"/>
          <StatCard icon="🎪" label="Pts Events Disp." value={f2(EVENTS_AVAIL)} sub="Guild EVENTS disponibles" color="#40d0a0"/>
        </div>

        {/* ── 7 FV RUNE CARDS ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
          {FV_RUNES.map(r => (
            <RuneStatCard key={r.key} rune={r}
              avail={fvTotals[r.key]?.avail ?? 0}
              claims={fvTotals[r.key]?.claims ?? 0}/>
          ))}
        </div>

        {/* ── SEARCH ── */}
        <div style={{position:'relative',display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <div style={{flex:1,position:'relative'}}>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setSelected(null) }}
              placeholder="Buscar jugador por nombre, owner o personaje..."
              className="font-rajdhani w-full"
              style={{background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'12px 18px 12px 44px', color:'#e8e0d0', fontSize:15}}/>
            <span style={{position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:15, color:'#555'}}>🔍</span>
            {search && <button onClick={()=>{setSearch('');setSelected(null)}} style={{position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', color:'#555', fontSize:15, background:'none', border:'none', cursor:'pointer'}}>✕</button>}
          </div>
          <button onClick={()=>{setLoading(true);loadData()}}
            title="Actualizar datos"
            style={{padding:'11px 16px',borderRadius:10,background:CARD,border:`1px solid ${BORDER}`,color:'#888',cursor:'pointer',fontSize:16,flexShrink:0}}>
            🔄
          </button>
        </div>
        {search && <p className="font-rajdhani mb-3" style={{fontSize:12, color:GD}}>{filtered.length} resultado{filtered.length!==1?'s':''}</p>}

        {/* ── CLAIM PANEL ── */}
        {selected && <ClaimPanel player={selected} onClose={()=>setSelected(null)} onClaimed={handleClaimed}/>}

        {/* ── BD TABLE ── */}
        <div className="mb-5">
          <BDTable data={filtered.filter(p=>p.name!=='Administrador'&&p.name!=='Guild EVENTS')} loading={loading} selectedId={selected?.id} onSelect={p=>setSelected(prev=>prev?.id===p.id?null:p)}/>
        </div>

        {/* ── FV TABLE ── */}
        <div className="mb-6">
          <FVTable data={filtered.filter(p=>p.name!=='Administrador'&&p.name!=='Guild EVENTS')} loading={loading}/>
        </div>

        {/* ── LAST TIME BOSS ── */}
        <LastTimeBoss/>

      </div>
    </div>
  )
}
