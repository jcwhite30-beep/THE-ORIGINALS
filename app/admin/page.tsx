'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useMemo } from 'react'
import {
  supabase, getAdminLeaderboard, getAllPlayers, getPendingAlerts,
  getClaims, approveClaim, processClaim, resolveAlert, createMazeSession,
  addPlayerPoints, createPlayer, updatePlayer, suggestPlayerName,
  getAnnouncements, createAnnouncement, deleteAnnouncement,
  getFVRunePoints, upsertFVRunePoints, updateReportDate,
  LeaderboardEntry, Player, PointAlert, Claim, MazeType, Announcement
} from '@/lib/supabase'
import { extractMazeFromImage, calcPointDistribution, normalizeName, similarity, ExtractedEntry } from '@/lib/maze-vision'

// ─── Design tokens ────────────────────────────────────────────
const G='#c9a84c', GD='#7a6030', CARD='#0d0d1e', DEEP='#070712', VOID='#04040e', BORDER='#22224a'
const f2=(n:number)=>Number(n??0).toFixed(2)
const fi=(n:number)=>Math.floor(n??0)

type TabKey='ranking'|'jugadores'|'mazes'|'claims'|'conciliacion'|'stats'|'anuncios'|'historico'|'usuarios'

const FV_RUNES=[
  {key:'curse',       label:'Curse',       color:'#c040c0'},
  {key:'illusory',    label:'Illusory',    color:'#4080f0'},
  {key:'piercing',    label:'Piercing',    color:'#f0a020'},
  {key:'riven',       label:'Riven Soul',  color:'#e03030'},
  {key:'favor',       label:'Favor',       color:'#40d0a0'},
  {key:'prayer',      label:'Prayer',      color:'#d0d040'},
  {key:'scroll_ring', label:'Scroll Ring', color:'#c9a84c'},
] as const

const ALL_PERMS=[
  {key:'ranking',      label:'Ranking / Dashboard'},
  {key:'jugadores',    label:'Jugadores'},
  {key:'mazes',        label:'Mazes (Reportes)'},
  {key:'claims',       label:'Claims'},
  {key:'conciliacion', label:'Conciliación'},
  {key:'stats',        label:'Estadísticas'},
  {key:'anuncios',     label:'Anuncios'},
  {key:'historico',    label:'Histórico'},
  {key:'usuarios',     label:'Usuarios'},
]

// ─── Toast ────────────────────────────────────────────────────
type TT={msg:string;type:'ok'|'err'|'warn'}
function Toast({t,onClose}:{t:TT;onClose:()=>void}){
  useEffect(()=>{const x=setTimeout(onClose,3500);return()=>clearTimeout(x)},[])
  const c={ok:{bg:'#0a2a1a',bd:'#20a060',tx:'#40d090'},err:{bg:'#2a0a0a',bd:'#a02020',tx:'#e04040'},warn:{bg:'#2a1a00',bd:'#a06000',tx:'#d09020'}}[t.type]
  return <div style={{position:'fixed',bottom:20,right:16,zIndex:9999,padding:'10px 16px',borderRadius:8,fontSize:13,fontFamily:'Rajdhani,sans-serif',fontWeight:600,background:c.bg,border:`1px solid ${c.bd}`,color:c.tx,maxWidth:'calc(100vw - 32px)',wordBreak:'break-word'}}>{t.msg}</div>
}

// ─── UI primitives ────────────────────────────────────────────
function Sk({w,h=14}:{w:number;h?:number}){return <div className="skeleton rounded" style={{width:w,height:h,display:'inline-block'}}/>}

function Inp({label,value,onChange,type='text',placeholder='',full=true}:{label:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string;full?:boolean}){
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:full?'100%':'auto',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 10px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
    </div>
  )
}

function Btn({children,onClick,disabled,color=G,bg='transparent',size='md'}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;color?:string;bg?:string;size?:'sm'|'md'}){
  const isGold=bg==='gold'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize:size==='sm'?9:10,padding:size==='sm'?'5px 12px':'8px 18px',borderRadius:6,
      background:isGold?`linear-gradient(135deg,#8a6020,#c9a84c)`:bg==='green'?`linear-gradient(135deg,#2a6030,#40a060)`:bg==='danger'?'#2a0a0a':'transparent',
      border:isGold||bg==='green'?'none':bg==='danger'?'1px solid #a0202060':`1px solid ${color}60`,
      color:isGold?VOID:bg==='green'?'#e8ffe8':bg==='danger'?'#e04040':color,
      cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,
      fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,whiteSpace:'nowrap'
    }}>{children}</button>
  )
}

function Card({children,title,color=BORDER,mb=true}:{children:React.ReactNode;title?:string;color?:string;mb?:boolean}){
  return (
    <div style={{background:CARD,border:`1px solid ${color}`,borderRadius:12,overflow:'hidden',marginBottom:mb?14:0}}>
      {title&&<div style={{padding:'9px 16px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase',letterSpacing:'0.1em'}}>{title}</div>}
      <div style={{padding:'14px 16px'}}>{children}</div>
    </div>
  )
}

function StatMini({icon,label,val,col}:{icon:string;label:string;val:string|number;col:string}){
  return (
    <div style={{background:CARD,border:`1px solid ${col}25`,borderRadius:10,padding:'12px 14px'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
        <span style={{fontSize:14}}>{icon}</span>
        <span style={{fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase',letterSpacing:'0.09em'}}>{label}</span>
      </div>
      <div style={{fontFamily:'Cinzel,serif',fontWeight:700,fontSize:20,color:col,lineHeight:1}}>{val}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── RANKING TAB ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function RankingTab({showToast,isSuperAdmin}:{showToast:(t:TT)=>void;isSuperAdmin:boolean}){
  const [lb,setLb]=useState<LeaderboardEntry[]>([])
  const [fvData,setFvData]=useState<Record<string,any>>({})
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [editing,setEditing]=useState<string|null>(null)
  const [editPts,setEditPts]=useState({total:'',avail:''})
  const [bdDate,setBdDate]=useState(''), [fvDate,setFvDate]=useState('')
  const [viewMode,setViewMode]=useState<'bd'|'fv'>('bd')

  async function load(){
    setLoading(true)
    getAdminLeaderboard().then(d=>{setLb(d);setLoading(false)})
    supabase.from('fv_rune_points').select('*, players(name)').then(({data:d})=>{
      const map:Record<string,any>={}
      ;(d??[]).forEach((r:any)=>{if(r.players?.name)map[r.players.name]=r})
      setFvData(map)
    })
    supabase.from('report_dates').select('*').then(({data:d})=>{
      d?.forEach((r:any)=>{if(r.maze_type==='BD')setBdDate(r.last_date);if(r.maze_type==='FV')setFvDate(r.last_date)})
    })
  }
  useEffect(()=>{load()},[])

  // Filter out admin and guild events from public list — BEFORE useMemo
  const adminPlayer=lb.find(p=>p.name==='Administrador')
  const guildEvents=lb.find(p=>p.name==='Guild EVENTS')
  const publicLb=lb.filter(p=>p.name!=='Administrador'&&p.name!=='Guild EVENTS')

  const filtered=useMemo(()=>{
    if(!search.trim())return publicLb
    const s=search.toLowerCase()
    return publicLb.filter(p=>p.name.toLowerCase().includes(s)||(p.chars||'').toLowerCase().includes(s))
  },[publicLb,search])
  const adminAvail=adminPlayer?adminPlayer.available_points:0
  const adminTotal=adminPlayer?adminPlayer.total_points:0
  const totalPlayerAvail=publicLb.reduce((s,p)=>s+p.available_points,0)
  const grandTotalAvail=totalPlayerAvail+adminAvail+(guildEvents?.available_points??0)
  const totalClaimsDisp=fi(grandTotalAvail/5)

  async function savePlayerPts(p:LeaderboardEntry){
    try{
      await supabase.from('players').update({
        total_score:parseFloat(editPts.total)||p.total_points,
        available_pts:parseFloat(editPts.avail)||p.available_points
      }).eq('id',p.id)
      showToast({msg:'Puntos actualizados',type:'ok'});setEditing(null);load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
  }

  const thStyle=(txt:string,align='right')=>({padding:'8px 10px',textAlign:align as any,fontFamily:'Cinzel,serif',fontSize:8,color:'#777',textTransform:'uppercase' as any,letterSpacing:'0.08em',whiteSpace:'nowrap' as any})
  const tdN=(val:string|number,col:string,sz=14)=>(<td style={{padding:'9px 10px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:col,fontSize:sz,whiteSpace:'nowrap'}}>{val}</td>)

  return (
    <div>
      {/* Summary */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
        <StatMini icon="🏆" label="Claims Disp. Total" val={totalClaimsDisp} col={G}/>
        <StatMini icon="👑" label="Claims Admin Hechos" val={0} col="#e05050"/>
      </div>

      {/* Search + View toggle */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar jugador..."
          style={{flex:1,minWidth:160,background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 12px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif'}}/>
        <div style={{display:'flex',gap:4}}>
          {(['bd','fv'] as const).map(v=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:'8px 14px',borderRadius:6,border:`1px solid ${viewMode===v?(v==='bd'?'#e05050':'#4ab8f0'):BORDER}`,background:viewMode===v?`${v==='bd'?'#e05050':'#4ab8f0'}18`:'transparent',color:viewMode===v?(v==='bd'?'#e05050':'#4ab8f0'):'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:9,textTransform:'uppercase'}}>
              {v==='bd'?'🐉 BD':'❄️ FV'}
            </button>
          ))}
        </div>
      </div>

      {/* BD Table */}
      {viewMode==='bd'&&(
        <div style={{background:CARD,border:'1px solid #e0505035',borderRadius:12,overflow:'hidden',marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 14px',borderBottom:'1px solid #e0505025',background:'#0e080a',flexWrap:'wrap',gap:6}}>
            <span style={{fontFamily:'Cinzel,serif',fontSize:11,fontWeight:700,color:'#e05050',letterSpacing:'0.1em'}}>🐉 BLACK DRAGON</span>
            {bdDate&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#e05050',opacity:0.6}}>Último reporte: {bdDate}</span>}
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'1px solid #1a0808'}}>
                  <th style={{...thStyle('#',  'center'),width:36}}>#</th>
                  <th style={thStyle('Jugador','left')}>Jugador / PJs</th>
                  <th style={thStyle('Total')}>Total Score</th>
                  <th style={thStyle('Disp')}>Pts Disp.</th>
                  <th style={thStyle('Admin','')}>Admin ★</th>
                  <th style={thStyle('Claims')}>Claims Disp.</th>
                  <th style={thStyle('Hechos')}>Claims Hechos</th>
                  {isSuperAdmin&&<th style={thStyle('Edit','center')}>Editar</th>}
                </tr>
              </thead>
              <tbody>
                {/* Admin row — solo cuando NO hay búsqueda activa */}
                {!search.trim()&&(
                <tr style={{borderBottom:'1px solid #1a0a0a',background:'#120805'}}>
                  <td style={{padding:'9px 10px',textAlign:'center',color:'#c9a84c',fontSize:12}}>★</td>
                  <td style={{padding:'9px 10px'}}>
                    <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:G,fontSize:13}}>Administrador</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666'}}>Puntos de administración (privado)</div>
                  </td>
                  {tdN(f2(adminTotal),'#aaa',13)}
                  {tdN(f2(adminAvail),'#e05050',14)}
                  {tdN(f2(adminAvail),G,14)}
                  {tdN(fi(adminAvail/5),G,15)}
                  {tdN(adminPlayer?.total_claims??0,'#40d0a0',13)}
                  {isSuperAdmin&&<td style={{padding:'9px 10px',textAlign:'center'}}><span style={{color:'#444',fontSize:11}}>—</span></td>}
                </tr>
                )}
                {loading?Array.from({length:5}).map((_,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #120808'}}>
                    {[30,160,80,80,70,70,70,40].map((w,j)=><td key={j} style={{padding:'9px 10px'}}><Sk w={w}/></td>)}
                  </tr>
                )):filtered.map((p,i)=>(
                  <tr key={p.id} style={{borderBottom:'1px solid #120808'}}>
                    <td style={{padding:'9px 10px',textAlign:'center',fontFamily:'Cinzel,serif',color:'#555',fontSize:11}}>{i<3?['🥇','🥈','🥉'][i]:i+1}</td>
                    <td style={{padding:'9px 10px',minWidth:140}}>
                      {editing===p.id&&isSuperAdmin?(
                        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                          <input value={editPts.avail} onChange={e=>setEditPts(d=>({...d,avail:e.target.value}))} placeholder={f2(p.available_points)}
                            style={{width:80,background:DEEP,border:`1px solid ${G}`,borderRadius:4,padding:'4px 6px',color:'#e8e0d0',fontSize:12,fontFamily:'Rajdhani,sans-serif'}}/>
                          <Btn onClick={()=>savePlayerPts(p)} size='sm' bg='gold'>✓</Btn>
                          <Btn onClick={()=>setEditing(null)} size='sm'>✕</Btn>
                        </div>
                      ):(
                        <>
                          <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{p.name}</div>
                          {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666',marginTop:1}}>{p.chars}</div>}
                        </>
                      )}
                    </td>
                    {tdN(f2(p.total_points),'#aaa',12)}
                    {tdN(f2(p.available_points),'#e05050',14)}
                    {tdN(f2((p as any).admin_points_total??0),G,13)}
                    {tdN(fi(p.available_points/5),G,15)}
                    {tdN(p.total_claims,'#40d0a0',13)}
                    {isSuperAdmin&&<td style={{padding:'9px 10px',textAlign:'center'}}>
                      <Btn onClick={()=>{setEditing(p.id);setEditPts({total:f2(p.total_points),avail:f2(p.available_points)})}} size='sm'>✏</Btn>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FV Table */}
      {viewMode==='fv'&&(
        <div style={{background:CARD,border:'1px solid #4ab8f035',borderRadius:12,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 14px',borderBottom:'1px solid #4ab8f025',background:'#080e10',flexWrap:'wrap',gap:6}}>
            <span style={{fontFamily:'Cinzel,serif',fontSize:11,fontWeight:700,color:'#4ab8f0',letterSpacing:'0.1em'}}>❄️ FROZEN VILLE</span>
            {fvDate&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#4ab8f0',opacity:0.6}}>Último reporte: {fvDate}</span>}
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid #0a1414'}}>
                  <th style={{padding:'7px 10px',textAlign:'left',fontFamily:'Cinzel,serif',fontSize:8,color:'#777',minWidth:130}}>Jugador</th>
                  {FV_RUNES.map(r=>(
                    <th key={r.key} colSpan={2} style={{padding:'7px 5px',textAlign:'center',fontFamily:'Cinzel,serif',fontSize:7.5,color:r.color,borderLeft:'1px solid #1a2a3a',textTransform:'uppercase',letterSpacing:'0.06em'}}>{r.label}</th>
                  ))}
                  {isSuperAdmin&&<th style={{padding:'7px 5px',textAlign:'center',fontFamily:'Cinzel,serif',fontSize:7.5,color:'#888',borderLeft:'1px solid #1a2a3a'}}>Edit</th>}
                </tr>
                <tr style={{borderBottom:'1px solid #0a1414',background:'#060c0e'}}>
                  <th/>
                  {FV_RUNES.map(r=>(
                    <><th key={`${r.key}-a`} style={{padding:'3px 5px',textAlign:'right',fontFamily:'Cinzel,serif',fontSize:7,color:'#666',borderLeft:'1px solid #1a2a3a'}}>Pts</th>
                    <th key={`${r.key}-c`} style={{padding:'3px 5px',textAlign:'right',fontFamily:'Cinzel,serif',fontSize:7,color:'#666'}}>Cl.</th></>
                  ))}
                  <th/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p=>{
                  const fv=fvData[p.name]
                  return (
                    <tr key={p.id} style={{borderBottom:'1px solid #0a1414'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0a1214'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td style={{padding:'8px 10px'}}>
                        <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:12}}>{p.name}</div>
                        {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:9,color:'#666'}}>{p.chars}</div>}
                      </td>
                      {FV_RUNES.map(r=>(
                        <><td key={`${r.key}-a`} style={{padding:'8px 5px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:r.color,fontSize:12,borderLeft:'1px solid #1a2a3a'}}>
                          {f2(fv?.[`${r.key}_avail`]??0)}
                        </td>
                        <td key={`${r.key}-c`} style={{padding:'8px 5px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',color:'#40d0a0',fontSize:12}}>
                          {fv?.[`${r.key}_claims`]??0}
                        </td></>
                      ))}
                      {isSuperAdmin&&<td style={{padding:'8px 5px',textAlign:'center',borderLeft:'1px solid #1a2a3a'}}>
                        <Btn size='sm' onClick={()=>showToast({msg:'Usa la pestaña Frozen Ville para editar',type:'warn'})}>✏</Btn>
                      </td>}
                      {/* FV edit only superadmin */}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── JUGADORES TAB ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function JugadoresTab({showToast}:{showToast:(t:TT)=>void}){
  const [players,setPlayers]=useState<Player[]>([])
  const [editing,setEditing]=useState<string|null>(null)
  const [editData,setEditData]=useState<any>({})
  const [showNew,setShowNew]=useState(false)
  const [newP,setNewP]=useState({name:'',owner:'',chars:'',class:''})
  const [search,setSearch]=useState('')
  const [busy,setBusy]=useState(false)

  async function load(){setPlayers(await getAllPlayers())}
  useEffect(()=>{load()},[])

  const filtered=useMemo(()=>{
    if(!search.trim())return players
    const s=search.toLowerCase()
    return players.filter(p=>p.name.toLowerCase().includes(s)||(p.chars||'').toLowerCase().includes(s))
  },[players,search])

  async function saveEdit(id:string){
    setBusy(true)
    try{await updatePlayer(id,editData);showToast({msg:'Guardado',type:'ok'});setEditing(null);load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }
  async function handleCreate(){
    if(!newP.name){showToast({msg:'Nombre requerido',type:'warn'});return}
    setBusy(true)
    try{await createPlayer(newP.name,newP.owner,newP.chars,newP.class);showToast({msg:'Creado',type:'ok'});setShowNew(false);setNewP({name:'',owner:'',chars:'',class:''});load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{flex:1,minWidth:160,background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 12px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif'}}/>
        <Btn onClick={()=>setShowNew(v=>!v)} bg='gold'>+ Nuevo</Btn>
      </div>
      {showNew&&(
        <Card title="Nuevo Jugador" color={`${G}40`}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[['Nombre',newP.name,'name'],['Clase',newP.class,'class'],['PJs (coma)',newP.chars,'chars'],['Owner',newP.owner,'owner']].map(([l,v,k])=>(
              <Inp key={k} label={l} value={v} onChange={val=>setNewP(d=>({...d,[k]:val}))}/>
            ))}
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <Btn onClick={handleCreate} disabled={busy} bg='gold'>{busy?'...':'Crear'}</Btn>
            <Btn onClick={()=>setShowNew(false)}>Cancelar</Btn>
          </div>
        </Card>
      )}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase',letterSpacing:'0.1em'}}>{filtered.length} jugadores</div>
        {filtered.map((p,i)=>(
          <div key={p.id} style={{borderBottom:i<filtered.length-1?`1px solid #0f0f20`:'none',padding:'11px 14px'}}>
            {editing===p.id?(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  {[['Nombre',(editData.name??p.name),'name'],['Owner',(editData.owner??p.owner??''),'owner'],['PJs',(editData.chars??p.chars??''),'chars'],['Clase',(editData.class??p.class??''),'class']].map(([l,v,k])=>(
                    <Inp key={k} label={l} value={String(v)} onChange={val=>setEditData((d:any)=>({...d,[k]:val}))}/>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn onClick={()=>saveEdit(p.id)} disabled={busy} size='sm' bg='gold'>{busy?'...':'✓ Guardar'}</Btn>
                  <Btn onClick={()=>setEditing(null)} size='sm'>✕</Btn>
                </div>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                  {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.chars}</div>}
                </div>
                <Btn onClick={()=>{setEditing(p.id);setEditData({})}} size='sm'>✏ Editar</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── MAZES TAB (Reportes BD y FV) ────────────────────────────
// ══════════════════════════════════════════════════════════════
// ─── Types for Vision Maze ───────────────────────────────────

// Global Ctrl+V paste listener — captures images pasted anywhere on page
function PasteImageListener({onImage}:{onImage:(f:File)=>void}){
  useEffect(()=>{
    const handler=(e:ClipboardEvent)=>{
      const item=Array.from(e.clipboardData?.items??[]).find(i=>i.type.startsWith('image/'))
      if(item){const f=item.getAsFile();if(f)onImage(f)}
    }
    window.addEventListener('paste',handler as EventListener)
    return()=>window.removeEventListener('paste',handler as EventListener)
  },[onImage])
  return null
}
type ResolveAction = 'match'|'newplayer'|'skip'
interface PendingChar {
  rawName: string
  isSupport: boolean
  options: {id:string;name:string;chars:string;score:number}[]
  action?: ResolveAction
  resolvedPlayerId?: string
  resolvedPlayerName?: string
  isDuplicate?: boolean   // char already seen in this session
}

// ══════════════════════════════════════════════════════════════
// ─── MAZES TAB — Vision powered ───────────────────────────────
// ══════════════════════════════════════════════════════════════
function MazesTab({showToast}:{showToast:(t:TT)=>void}){
  // Config
  const [mazeType,setMazeType]=useState<MazeType>('BD')
  const [adminSlot,setAdminSlot]=useState(false)  // include admin slot in distribution
  const [eventSlot,setEventSlot]=useState(false)  // include guild events slot
  const [sessionDate,setSessionDate]=useState(new Date().toISOString().split('T')[0])
  // Image
  const [imageFile,setImageFile]=useState<File|null>(null)
  const [imagePreview,setImagePreview]=useState<string|null>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  // States
  const [step,setStep]=useState<'idle'|'reading'|'resolving'|'preview'|'saving'>('idle')
  const [rawExtracted,setRawExtracted]=useState<ExtractedEntry[]>([])
  const [pending,setPending]=useState<PendingChar[]>([])
  const [allPlayers,setAllPlayers]=useState<{id:string;name:string;chars:string}[]>([])
  const [confirmed,setConfirmed]=useState<{playerId:string;playerName:string;rawName:string;isSupport:boolean;points:number}[]>([])
  const [visionRawText,setVisionRawText]=useState('')
  // Manual paste fallback
  const [showPaste,setShowPaste]=useState(false)
  const [pasteText,setPasteText]=useState('')

  const dist=calcPointDistribution(5, confirmed.length, adminSlot?1:0, eventSlot?1:0)
  const share=dist.playerPts

  useEffect(()=>{
    supabase.from('players').select('id,name,chars').eq('is_active',true)
      .then(({data})=>setAllPlayers(data??[]))
  },[])

  // ── Step 1: Read image with Vision ───────────────────────────
  async function handleReadImage(){
    if(!imageFile)return
    setStep('reading')
    try{
      const result=await extractMazeFromImage(imageFile)
      setVisionRawText(result.rawText)
      if(!result.success||result.entries.length===0){
        showToast({msg:result.error||'No se detectaron participantes en la imagen',type:'warn'})
        setStep('idle');return
      }
      // Auto-detect maze type and date
      if(result.mazeType!=='unknown') setMazeType(result.mazeType as MazeType)
      if(result.sessionDate) setSessionDate(result.sessionDate)
      setRawExtracted(result.entries)
      await resolveChars(result.entries)
    }catch(e:any){
      showToast({msg:'Error: '+e.message,type:'err'});setStep('idle')
    }
  }

  // ── Step 2: Match each char to players ───────────────────────
  async function resolveChars(entries: ExtractedEntry[]){
    setStep('resolving')
    const pendingList: PendingChar[]=[]
    const seenNames=new Set<string>()   // dedup within session

    for(const entry of entries){
      const cleanRaw=normalizeName(entry.rawName)
      
      // Deduplicate: same char twice in image
      if(seenNames.has(cleanRaw)){
        pendingList.push({rawName:entry.rawName,isSupport:entry.isSupport,options:[],isDuplicate:true})
        continue
      }
      seenNames.add(cleanRaw)

      // Search in players.name AND players.chars
      const matches: {id:string;name:string;chars:string;score:number}[]=[]
      for(const p of allPlayers){
        // Match against player name
        const nameSim=similarity(cleanRaw,normalizeName(p.name))
        if(nameSim>0.65) matches.push({...p,score:nameSim})
        // Match against each char
        else if(p.chars){
          const charList=p.chars.split(/[,;\/]/).map((c:string)=>c.trim())
          for(const ch of charList){
            const cs=similarity(cleanRaw,normalizeName(ch))
            if(cs>0.65){matches.push({...p,score:cs});break}
          }
        }
      }
      // Sort by score
      matches.sort((a,b)=>b.score-a.score)
      // Remove duplicate player entries (same player matched via name and char)
      const unique=matches.filter((m,i)=>matches.findIndex(x=>x.id===m.id)===i).slice(0,4)

      // Auto-resolve if perfect match (score >= 0.95)
      if(unique.length>0&&unique[0].score>=0.95){
        pendingList.push({
          rawName:entry.rawName, isSupport:entry.isSupport,
          options:unique, action:'match',
          resolvedPlayerId:unique[0].id, resolvedPlayerName:unique[0].name
        })
      } else {
        pendingList.push({rawName:entry.rawName,isSupport:entry.isSupport,options:unique})
      }
    }
    setPending(pendingList)
    setStep('resolving')
  }

  // ── Resolve action for a pending char ────────────────────────
  function resolvePending(idx:number,action:ResolveAction,playerId?:string,playerName?:string){
    setPending(prev=>{
      const next=[...prev]
      next[idx]={...next[idx],action,resolvedPlayerId:playerId,resolvedPlayerName:playerName}
      return next
    })
  }

  async function createAndResolve(idx:number,name:string){
    const {data,error}=await supabase.from('players').insert({name,is_active:true}).select('id').single()
    if(error||!data){showToast({msg:'Error al crear jugador',type:'err'});return}
    // Also add char to new player
    await supabase.from('players').update({chars:name}).eq('id',data.id)
    resolvePending(idx,'newplayer',data.id,name)
    setAllPlayers(p=>[...p,{id:data.id,name,chars:name}])
    showToast({msg:`Jugador "${name}" creado`,type:'ok'})
  }

  // ── Step 3: Build confirmed list and go to preview ───────────
  function buildPreview(){
    const pts=share
    const list=pending
      .filter(p=>!p.isDuplicate&&p.action!=='skip'&&p.resolvedPlayerId)
      .map(p=>({
        playerId:p.resolvedPlayerId!,
        playerName:p.resolvedPlayerName!,
        rawName:p.rawName,
        isSupport:p.isSupport,
        points:pts
      }))
    // Check for duplicate player IDs (same player resolved twice)
    const seenIds=new Set<string>()
    const dedupList=list.filter(e=>{
      if(seenIds.has(e.playerId)){
        showToast({msg:`Duplicado detectado: ${e.playerName} — solo se contará una vez`,type:'warn'})
        return false
      }
      seenIds.add(e.playerId);return true
    })
    setConfirmed(dedupList)
    setStep('preview')
  }

  // ── Step 4: Save session ──────────────────────────────────────
  async function handleSave(){
    if(!confirmed.length){showToast({msg:'Sin participantes confirmados',type:'warn'});return}
    setStep('saving')
    try{
      const session=await createMazeSession({
        maze_type:mazeType,
        total_points:5,
        admin_points: dist.adminPts,   // same per-slot as players, INVISIBLE to public
        event_points: dist.eventPts,   // same per-slot as players
        session_date:sessionDate,
        raw_report:visionRawText
      })
      // Credit admin player if admin slot is enabled
      if(adminSlot&&dist.adminPts>0){
        const{data:adminPlayer}=await supabase.from('players').select('id').eq('name','Administrador').single()
        if(adminPlayer){
          await supabase.from('player_points').insert({player_id:adminPlayer.id,session_id:session.id,points:dist.adminPts})
          const{data:cur}=await supabase.from('players').select('total_score,available_pts').eq('id',adminPlayer.id).single()
          if(cur)await supabase.from('players').update({
            total_score:Number(cur.total_score)+dist.adminPts,
            available_pts:Number(cur.available_pts)+dist.adminPts
          }).eq('id',adminPlayer.id)
        }
      }
      for(const entry of confirmed){
        await addPlayerPoints(entry.playerId,session.id,entry.points)
        await supabase.from('maze_attendance').upsert({
          session_id:session.id,player_id:entry.playerId,
          attended:true,points_earned:entry.points,is_support:entry.isSupport
        })
      }
      await updateReportDate(mazeType,sessionDate)
      showToast({msg:`✓ Sesión guardada — ${confirmed.length} jugadores`,type:'ok'})
      // Reset
      setStep('idle');setImageFile(null);setImagePreview(null);setPending([]);setConfirmed([]);setRawExtracted([])
      if(fileRef.current)fileRef.current.value=''
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'});setStep('preview')}
  }

  // ── Paste fallback ────────────────────────────────────────────
  async function handlePaste(){
    const lines=pasteText.split(/\n/).map(l=>l.trim()).filter(Boolean)
    const entries:ExtractedEntry[]=lines.map((line,i)=>{
      const isSupport=line.includes('*')
      return {rawName:line.replace(/\*/g,'').trim(),isSupport,isLooter:false,order:i}
    }).filter(e=>e.rawName.length>0)
    setRawExtracted(entries)
    await resolveChars(entries)
    setShowPaste(false)
  }

  const unresolvedCount=pending.filter(p=>!p.isDuplicate&&!p.action).length
  const col=(t:MazeType)=>t==='BD'?'#e05050':'#4ab8f0'

  return (
    <div style={{maxWidth:760}}>

      {/* ── CONFIG ── */}
      <Card title="⚙️ Configuración del Maze">
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          {(['BD','FV'] as MazeType[]).map(t=>(
            <button key={t} onClick={()=>setMazeType(t)} style={{flex:1,padding:'9px',borderRadius:8,
              border:`1px solid ${mazeType===t?col(t):BORDER}`,
              background:mazeType===t?`${col(t)}18`:'transparent',
              color:mazeType===t?col(t):'#666',
              cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:10,textTransform:'uppercase',letterSpacing:'0.1em'}}>
              {t==='BD'?'🐉 Black Dragon':'❄️ Frozen Ville'}
            </button>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          <Inp label="Fecha" value={sessionDate} onChange={setSessionDate} type="date"/>
          <div>
            <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Slot Administrador</div>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:DEEP,borderRadius:6,border:`1px solid ${adminSlot?G:BORDER}`}}>
              <input type="checkbox" checked={adminSlot} onChange={e=>setAdminSlot(e.target.checked)}/>
              <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:adminSlot?G:'#888'}}>
                {adminSlot?'✓ Incluir (privado)':'Sin slot admin'}
              </span>
            </label>
          </div>
          <div>
            <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Slot Guild Events</div>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:DEEP,borderRadius:6,border:`1px solid ${eventSlot?'#40d0a0':BORDER}`}}>
              <input type="checkbox" checked={eventSlot} onChange={e=>setEventSlot(e.target.checked)}/>
              <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:eventSlot?'#40d0a0':'#888'}}>
                {eventSlot?'✓ Incluir':'Sin slot events'}
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* ── IMAGE UPLOAD ── */}
      {step==='idle'&&(
        <Card title="📸 Subir o Pegar Imagen del Reporte">
          <div
            style={{border:`2px dashed ${BORDER}`,borderRadius:10,padding:'20px',textAlign:'center',marginBottom:12,cursor:'pointer',background:imagePreview?'transparent':DEEP}}
            onClick={()=>fileRef.current?.click()}
            onDrop={e=>{
              e.preventDefault()
              const f=e.dataTransfer.files?.[0]??null
              if(f&&f.type.startsWith('image/')){
                setImageFile(f)
                setImagePreview(URL.createObjectURL(f))
              }
            }}
            onDragOver={e=>e.preventDefault()}
            onPaste={e=>{
              // Allow pasting image with Ctrl+V directly on this area
              const item=Array.from(e.clipboardData.items).find(i=>i.type.startsWith('image/'))
              if(item){const f=item.getAsFile();if(f){setImageFile(f);setImagePreview(URL.createObjectURL(f))}}
            }}
            tabIndex={0}
          >
            {imagePreview
              ? <img src={imagePreview} alt="preview" style={{maxWidth:'100%',maxHeight:300,borderRadius:8,objectFit:'contain'}}/>
              : <div>
                  <div style={{fontSize:32,marginBottom:8}}>📷</div>
                  <p style={{fontFamily:'Cinzel,serif',fontSize:10,color:'#666',textTransform:'uppercase',letterSpacing:'0.1em'}}>Toca · Arrastra · o Pega con Ctrl+V</p>
                  <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#444',marginTop:4}}>Screenshot de WhatsApp, Discord o del juego</p>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
            onChange={e=>{
              const f=e.target.files?.[0]??null;setImageFile(f)
              if(f){const url=URL.createObjectURL(f);setImagePreview(url)}
            }}/>
          {/* Global paste listener — Ctrl+V anywhere on the page */}
          {step==='idle'&&<PasteImageListener onImage={(f)=>{setImageFile(f);setImagePreview(URL.createObjectURL(f))}}/>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {imageFile&&<Btn onClick={handleReadImage} bg='gold'>🔍 Leer con IA</Btn>}
            {imageFile&&<Btn onClick={()=>{setImageFile(null);setImagePreview(null);if(fileRef.current)fileRef.current.value=''}} color='#e04040'>✕ Quitar</Btn>}
            <Btn onClick={()=>setShowPaste(v=>!v)} color='#888'>✏ Ingresar texto manual</Btn>
          </div>
          {showPaste&&(
            <div style={{marginTop:12}}>
              <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#666',marginBottom:6}}>
                Un nombre por línea. Agrega * para apoyo mágico: <code style={{color:G}}>Morgan*</code>
              </p>
              <textarea rows={8} value={pasteText} onChange={e=>setPasteText(e.target.value)}
                placeholder={"Gokuld\nMaryn\nNeones\nMorgan*\nAlexghotico\nLatina\nUltimate"}
                style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 10px',color:'#e8e0d0',fontSize:13,fontFamily:'monospace',resize:'vertical',boxSizing:'border-box'}}/>
              <div style={{marginTop:8}}>
                <Btn onClick={handlePaste} bg='gold' disabled={!pasteText.trim()}>▶ Procesar lista</Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── READING ── */}
      {step==='reading'&&(
        <Card title="🤖 Analizando imagen...">
          <div style={{textAlign:'center',padding:'32px'}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <p style={{fontFamily:'Cinzel,serif',fontSize:12,color:G,letterSpacing:'0.1em',textTransform:'uppercase'}}>Claude está leyendo el reporte...</p>
            <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#666',marginTop:8}}>Extrayendo nombres de participantes de la imagen</p>
          </div>
        </Card>
      )}

      {/* ── RESOLVING ── */}
      {step==='resolving'&&pending.length>0&&(
        <div>
          {/* Header */}
          <div style={{background:CARD,border:`1px solid ${G}40`,borderRadius:12,padding:'12px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
            <div>
              <span style={{fontFamily:'Cinzel,serif',fontSize:11,color:G,textTransform:'uppercase',letterSpacing:'0.1em'}}>
                {pending.length} chars detectados
              </span>
              {unresolvedCount>0&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#f0a020',marginLeft:12}}>
                ⚠ {unresolvedCount} sin resolver
              </span>}
            </div>
            {unresolvedCount===0&&(
              <Btn onClick={buildPreview} bg='gold'>▶ Continuar a vista previa</Btn>
            )}
          </div>

          {/* Each char */}
          {pending.map((p,idx)=>{
            const isResolved=!!p.action&&p.action!=='skip'
            const isSkipped=p.action==='skip'
            const borderCol=p.isDuplicate?'#555':isResolved?'#20a060':isSkipped?'#555':'#a06020'
            return (
              <div key={idx} style={{background:CARD,border:`1px solid ${borderCol}`,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,flexWrap:'wrap',gap:6}}>
                  <div>
                    <span style={{fontFamily:'Cinzel,serif',fontWeight:700,color:'#e8e0d0',fontSize:15}}>
                      {p.rawName.replace(/\*/g,'')}
                    </span>
                    {p.isSupport&&<span style={{color:'#f0a020',marginLeft:6,fontSize:12}}>★ apoyo mágico</span>}
                    {p.isDuplicate&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#888',marginLeft:8}}>— duplicado, se omite</span>}
                    {p.action==='match'&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#40d090',marginLeft:8}}>✓ → {p.resolvedPlayerName}</span>}
                    {p.action==='newplayer'&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#40d090',marginLeft:8}}>✓ nuevo → {p.resolvedPlayerName}</span>}
                    {p.action==='skip'&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#888',marginLeft:8}}>— omitido</span>}
                  </div>
                  {!p.isDuplicate&&!p.action&&(
                    <Btn onClick={()=>resolvePending(idx,'skip')} size='sm' color='#555'>Omitir</Btn>
                  )}
                  {(p.action||p.isDuplicate)&&!p.isDuplicate&&(
                    <Btn onClick={()=>setPending(prev=>{const n=[...prev];n[idx]={...n[idx],action:undefined,resolvedPlayerId:undefined,resolvedPlayerName:undefined};return n})} size='sm' color='#888'>↩ Cambiar</Btn>
                  )}
                </div>

                {/* Options — only when unresolved and not duplicate */}
                {!p.isDuplicate&&!p.action&&(
                  <div>
                    {p.options.length>0&&(
                      <div>
                        <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#888',marginBottom:6}}>¿A cuál jugador pertenece este char?</p>
                        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                          {p.options.map(opt=>(
                            <button key={opt.id} onClick={()=>resolvePending(idx,'match',opt.id,opt.name)}
                              style={{padding:'6px 12px',borderRadius:6,
                                border:`1px solid ${opt.score>0.85?'#20a060':'#3a3a5a'}`,
                                background:opt.score>0.85?'#0a2a1a':'transparent',
                                color:'#e8e0d0',cursor:'pointer',fontFamily:'Rajdhani,sans-serif',fontSize:13}}>
                              <strong style={{color:opt.score>0.85?'#40d090':G}}>{opt.name}</strong>
                              <span style={{color:'#555',marginLeft:4,fontSize:10}}>{Math.round(opt.score*100)}%</span>
                              {opt.chars&&<div style={{fontSize:10,color:'#666'}}>{opt.chars.slice(0,40)}</div>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.options.length===0&&(
                      <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#a06020',marginBottom:8}}>
                        ⚠ No se encontró ningún jugador con este nombre en la base de datos.
                      </p>
                    )}
                    {/* Search all players */}
                    <SearchPlayerForChar rawName={p.rawName} allPlayers={allPlayers}
                      onSelect={(id,name)=>resolvePending(idx,'match',id,name)}
                      onCreateNew={()=>createAndResolve(idx,p.rawName.replace(/\*/g,'').trim())}/>
                  </div>
                )}
              </div>
            )
          })}

          {unresolvedCount===0&&pending.filter(p=>!p.isDuplicate&&p.action!=='skip').length>0&&(
            <div style={{marginTop:12}}>
              <Btn onClick={buildPreview} bg='gold'>▶ Continuar a vista previa →</Btn>
            </div>
          )}
        </div>
      )}

      {/* ── PREVIEW ── */}
      {(step==='preview'||step==='saving')&&(()=>{
        const isSaving=step==='saving'
        return (
        <Card title={`✅ Vista previa — ${confirmed.length} jugadores confirmados`} color='#20a06040'>
          <div style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 14px',marginBottom:14}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:13}}>Pts/slot: </span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:700,fontSize:20,color:G}}>{share}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:12,marginLeft:8}}>
              ({dist.totalSlots} slots totales: {confirmed.length} jugadores
              {adminSlot?' + 1 admin':''}
              {eventSlot?' + 1 events':''}
              · {confirmed.filter(e=>e.isSupport).length} ★ apoyos)
            </span>
          </div>
          <div style={{maxHeight:320,overflowY:'auto',marginBottom:14}}>
            {confirmed.map((e,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'8px 0',borderBottom:i<confirmed.length-1?`1px solid #0f0f20`:'none'}}>
                <div>
                  <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{e.playerName}</span>
                  <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555',marginLeft:8}}>{e.rawName}</span>
                  {e.isSupport&&<span style={{color:'#f0a020',marginLeft:6,fontSize:12}}>★</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:14}}>{e.points} pts</span>
                  <button onClick={()=>setConfirmed(prev=>prev.filter((_,j)=>j!==i))}
                    style={{color:'#e04040',background:'none',border:'none',cursor:'pointer',fontSize:14}}>✕</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn onClick={handleSave} bg='gold' disabled={isSaving}>{isSaving?'Guardando...':'💾 Guardar Sesión'}</Btn>
            <Btn onClick={()=>setStep('resolving')} color='#888'>← Revisar</Btn>
            <Btn onClick={()=>{setStep('idle');setPending([]);setConfirmed([]);setImageFile(null);setImagePreview(null);if(fileRef.current)fileRef.current.value=''}} color='#555'>✕ Cancelar</Btn>
          </div>
        </Card>
        )
      })()}

      {/* ── DISCORD PENDING REPORTS ── */}
      <DiscordPendingPanel showToast={showToast} allPlayers={allPlayers}
        onApproved={()=>{/* refresh handled inside */}}/>

    </div>
  )
}

// ── Inline search helper for resolving chars ──────────────────
function SearchPlayerForChar({rawName,allPlayers,onSelect,onCreateNew}:{
  rawName:string
  allPlayers:{id:string;name:string;chars:string}[]
  onSelect:(id:string,name:string)=>void
  onCreateNew:()=>void
}){
  const [q,setQ]=useState('')
  const results=q.length>1
    ?allPlayers.filter(p=>
        p.name.toLowerCase().includes(q.toLowerCase())||
        (p.chars||'').toLowerCase().includes(q.toLowerCase())
      ).slice(0,6)
    :[]
  return (
    <div>
      <input value={q} onChange={e=>setQ(e.target.value)}
        placeholder="Buscar jugador por nombre o PJ..."
        style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'7px 10px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box',marginBottom:6}}/>
      {results.length>0&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
          {results.map(p=>(
            <button key={p.id} onClick={()=>{onSelect(p.id,p.name);setQ('')}}
              style={{padding:'5px 10px',borderRadius:5,border:`1px solid ${BORDER}`,background:CARD,color:'#e8e0d0',cursor:'pointer',fontFamily:'Rajdhani,sans-serif',fontSize:12}}>
              {p.name}{p.chars&&<span style={{color:'#555',fontSize:10,marginLeft:4}}>{p.chars.slice(0,25)}</span>}
            </button>
          ))}
        </div>
      )}
      <Btn size='sm' onClick={onCreateNew} bg='gold'>+ Crear nuevo jugador "{rawName.replace(/\*/g,'').trim()}"</Btn>
    </div>
  )
}
// ══════════════════════════════════════════════════════════════
// ─── DISCORD PENDING REPORTS PANEL ───────────────────────────
// Shows unregistered reports detected from Discord history
// ══════════════════════════════════════════════════════════════
function DiscordPendingPanel({showToast,allPlayers,onApproved}:{
  showToast:(t:TT)=>void
  allPlayers:{id:string;name:string;chars:string}[]
  onApproved:()=>void
}){
  const [reports,setReports]=useState<any[]>([])
  const [busy,setBusy]=useState<string|null>(null)
  const [lastSync,setLastSync]=useState<string|null>(null)

  async function load(){
    const{data}=await supabase.from('discord_pending_reports')
      .select('*').eq('status','pending').order('created_at',{ascending:false}).limit(20)
    setReports(data??[])
  }
  useEffect(()=>{load()},[])

  // Realtime: auto-refresh when new pending reports arrive from Discord
  useEffect(()=>{
    const channel=supabase.channel('discord-pending')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'discord_pending_reports'},
        payload=>{
          setReports(prev=>[payload.new as any,...prev])
          setLastSync(new Date().toLocaleTimeString('es-PA'))
          showToast({msg:'📡 Nuevo reporte detectado desde Discord',type:'ok'})
        })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'players'},
        ()=>setLastSync(new Date().toLocaleTimeString('es-PA')))
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[])

  async function approve(report:any){
    setBusy(report.id)
    try{
      // Process each detected name
      const names=(report.detected_names as string[]).map(n=>({
        rawName:n.replace(/\*/g,'').trim(), isSupport:n.includes('*')
      }))
      const pts=parseFloat((5/names.length).toFixed(4))

      // Create session
      const{data:sess}=await supabase.from('maze_sessions').insert({
        maze_type:report.maze_type, total_points:5, admin_points:0, event_points:0,
        session_date:report.session_date||new Date().toISOString().split('T')[0],
        raw_report:`Discord (pendiente aprobado): ${report.author_name} — ${names.map(n=>n.rawName).join(', ')}`
      }).select('id').single()
      if(!sess) throw new Error('Error creando sesión')

      // Match and credit players
      const seenIds=new Set<string>()
      for(const entry of names){
        const{data:pl}=await supabase.from('players').select('id,total_score,available_pts')
          .or(`name.ilike.%${entry.rawName}%,chars.ilike.%${entry.rawName}%`).limit(1)
        if(pl?.length&&!seenIds.has(pl[0].id)){
          seenIds.add(pl[0].id)
          await supabase.from('player_points').insert({player_id:pl[0].id,session_id:sess.id,points:pts})
          await supabase.from('players').update({
            total_score:Number(pl[0].total_score)+pts,
            available_pts:Number(pl[0].available_pts)+pts
          }).eq('id',pl[0].id)
          await supabase.from('maze_attendance').upsert({
            session_id:sess.id,player_id:pl[0].id,attended:true,
            points_earned:pts,is_support:entry.isSupport
          })
        }
      }
      // Mark as approved and processed
      await supabase.from('discord_pending_reports').update({status:'approved'}).eq('id',report.id)
      await supabase.from('discord_processed_messages').upsert({
        message_id:report.message_id,channel_name:report.channel_name,status:'processed',session_id:sess.id
      })
      await supabase.from('report_dates').upsert({maze_type:report.maze_type,last_date:report.session_date})
      showToast({msg:`✓ Sesión ${report.maze_type} aprobada`,type:'ok'})
      load(); onApproved()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(null)}
  }

  async function reject(id:string){
    await supabase.from('discord_pending_reports').update({status:'rejected'}).eq('id',id)
    setReports(prev=>prev.filter(r=>r.id!==id))
    showToast({msg:'Reporte descartado',type:'warn'})
  }

  if(reports.length===0) return null

  return (
    <div style={{marginTop:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:6}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontFamily:'Cinzel,serif',fontSize:10,color:'#f0a020',textTransform:'uppercase',letterSpacing:'0.1em'}}>
            📡 Pendientes de Discord — {reports.length}
          </span>
          {lastSync&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555'}}>última sync: {lastSync}</span>}
        </div>
        <Btn onClick={load} size='sm' color='#888'>↻ Actualizar</Btn>
      </div>

      {reports.map(r=>(
        <div key={r.id} style={{background:CARD,border:'1px solid #f0a02040',borderRadius:10,padding:'12px 14px',marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,flexWrap:'wrap',gap:6}}>
            <div>
              <span style={{fontFamily:'Cinzel,serif',fontWeight:700,color:r.maze_type==='BD'?'#e05050':'#4ab8f0',fontSize:13}}>
                {r.maze_type==='BD'?'🐉':'❄️'} {r.maze_type}
              </span>
              <span style={{fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:12,marginLeft:8}}>
                {r.session_date} · por {r.author_name}
              </span>
              <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:11,marginLeft:8}}>
                #{r.channel_name}
              </span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <Btn onClick={()=>approve(r)} disabled={busy===r.id} bg='green' size='sm'>
                {busy===r.id?'Procesando...':'✓ Aprobar'}
              </Btn>
              <Btn onClick={()=>reject(r.id)} bg='danger' size='sm'>✕</Btn>
            </div>
          </div>

          {/* Detected names */}
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {(r.detected_names as string[]).map((name,i)=>(
              <span key={i} style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,padding:'3px 8px',
                borderRadius:12,background:DEEP,border:`1px solid ${BORDER}`,color:'#e8e0d0'}}>
                {name.replace(/\*/g,'')}
                {name.includes('*')&&<span style={{color:'#f0a020',marginLeft:3}}>★</span>}
              </span>
            ))}
          </div>

          {/* Image preview if available */}
          {r.image_url&&(
            <div style={{marginTop:8}}>
              <img src={r.image_url} alt="Discord report" style={{maxHeight:80,maxWidth:'100%',borderRadius:6,opacity:0.8}}/>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── CLAIMS TAB ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function ClaimsTab({showToast}:{showToast:(t:TT)=>void}){
  const [claims,setClaims]=useState<Claim[]>([])
  const [players,setPlayers]=useState<{id:string;name:string;available_points:number}[]>([])
  const [selPlayer,setSelPlayer]=useState('')
  const [mazeType,setMazeType]=useState<'BD'|'FV'>('BD')
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)

  async function load(){
    setClaims(await getClaims())
    const{data}=await supabase.from('public_leaderboard').select('id,name,available_points').order('name')
    setPlayers(data??[])
  }
  useEffect(()=>{load()},[])

  async function handleCreate(){
    if(!selPlayer){showToast({msg:'Selecciona un jugador',type:'warn'});return}
    const selP=players.find(p=>p.id===selPlayer)
    if(selP&&selP.available_points<5){showToast({msg:'Puntos insuficientes',type:'warn'});return}
    setBusy(true)
    try{
      await processClaim(selPlayer,`${mazeType}: ${note||'Claim registrado'}`)
      showToast({msg:'Claim registrado — 5 pts descontados',type:'ok'});setSelPlayer('');setNote('');load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  const selP=players.find(p=>p.id===selPlayer)
  const pending=claims.filter(c=>!c.approved)
  const approved=claims.filter(c=>c.approved)

  return (
    <div style={{maxWidth:720}}>
      <Card title="Registrar Claim" color={`${G}40`}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>Jugador</div>
            <select value={selPlayer} onChange={e=>setSelPlayer(e.target.value)} style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 10px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif'}}>
              <option value="">— Seleccionar —</option>
              {players.map(p=><option key={p.id} value={p.id}>{p.name} ({f2(p.available_points)} pts)</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>Tipo</div>
            <div style={{display:'flex',gap:6}}>
              {(['BD','FV'] as const).map(t=>(
                <button key={t} onClick={()=>setMazeType(t)} style={{flex:1,padding:'8px',borderRadius:6,border:`1px solid ${mazeType===t?(t==='BD'?'#e05050':'#4ab8f0'):BORDER}`,background:mazeType===t?`${t==='BD'?'#e05050':'#4ab8f0'}20`:'transparent',color:mazeType===t?(t==='BD'?'#e05050':'#4ab8f0'):'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:10,textTransform:'uppercase'}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {selP&&(
          <div style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:8,padding:'9px 12px',marginBottom:10}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:13}}>Disponible: </span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:700,fontSize:18,color:'#e05050'}}>{f2(selP.available_points)}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:12,marginLeft:8}}>→ después: {f2(selP.available_points-5)}</span>
            {selP.available_points<5&&<div style={{color:'#e04040',fontSize:12,fontFamily:'Rajdhani,sans-serif',marginTop:4}}>⚠ Puntos insuficientes</div>}
          </div>
        )}
        <Inp label="Notas (opc.)" value={note} onChange={setNote} placeholder="Claim BD..."/>
        <Btn onClick={handleCreate} disabled={busy||!selPlayer} bg='gold'>{busy?'...':'+ Registrar Claim (-5 pts)'}</Btn>
      </Card>

      {pending.length>0&&(
        <div style={{background:CARD,border:'1px solid #a0600040',borderRadius:12,overflow:'hidden',marginBottom:12}}>
          <div style={{padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:'#d09020',textTransform:'uppercase'}}>⏳ Pendientes — {pending.length}</div>
          {pending.map((c,i)=>(
            <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:i<pending.length-1?`1px solid #0f0f20`:'none',gap:8,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{(c as any).players?.name}</div>
                {c.notes&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#666',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.notes}</div>}
                <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#555'}}>{c.claimed_at}</div>
              </div>
              <Btn onClick={()=>approveClaim(c.id).then(load).then(()=>showToast({msg:'Aprobado',type:'ok'}))} bg='green' size='sm'>✓ Aprobar</Btn>
            </div>
          ))}
        </div>
      )}

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase'}}>✓ Aprobados — {approved.length}</div>
        {approved.slice(0,30).map((c,i)=>(
          <div key={c.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 14px',borderBottom:i<Math.min(approved.length,30)-1?`1px solid #0f0f20`:'none',gap:8,flexWrap:'wrap'}}>
            <span style={{fontFamily:'Cinzel,serif',color:'#e8e0d0',fontSize:12}}>{(c as any).players?.name}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#40d0a0',fontSize:11,whiteSpace:'nowrap'}}>✓ {c.claimed_at} · {(c.notes||'').split(':')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── CONCILIACIÓN TAB ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function ConciliacionTab({showToast}:{showToast:(t:TT)=>void}){
  const [snap,setSnap]=useState<any>(null)
  const [history,setHistory]=useState<any[]>([])
  const [form,setForm]=useState({loots_banco:0,loots_fuera:0,loots_events:0,loots_claims:0,keys_count:0,gold_coins:0,bnotes:0,bd_soul:0,bd_eye:0,bd_heart:0,white_cat:0,green_cat:0,yellow_cat:0,red_cat:0,notes:''})
  const [busy,setBusy]=useState(false)

  async function load(){
    const{data}=await supabase.from('bank_snapshot').select('*').order('created_at',{ascending:false}).limit(10)
    setSnap((data??[])[0]??null);setHistory(data??[])
  }
  useEffect(()=>{load()},[])

  async function handleSave(){
    setBusy(true)
    try{
      await supabase.from('bank_snapshot').insert({...form,snapshot_date:new Date().toISOString().split('T')[0]})
      showToast({msg:'Snapshot guardado',type:'ok'});load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  const n=(k:string)=>form[k as keyof typeof form] as number
  const setN=(k:string,v:number)=>setForm(d=>({...d,[k]:v}))

  return (
    <div>
      {/* Current status */}
      {snap&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
          {[
            {l:'En Banco',v:snap.loots_banco,c:'#4ab8f0'},
            {l:'Fuera Banco',v:snap.loots_fuera,c:'#f0a020'},
            {l:'Para Claims',v:snap.loots_claims,c:G},
            {l:'BD Soul',v:snap.bd_soul,c:'#c040c0'},
            {l:'BD Eye',v:snap.bd_eye,c:'#4080f0'},
            {l:'BD Heart',v:snap.bd_heart,c:'#e03030'},
          ].map(s=><StatMini key={s.l} icon="" label={s.l} val={s.v} col={s.c}/>)}
        </div>
      )}

      <Card title="Registrar Conciliación" color={`${G}40`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
          {[['Loots en Banco','loots_banco'],['Loots Fuera Banco','loots_fuera'],['Loots para Claims','loots_claims'],['BD Soul','bd_soul'],['BD Eye','bd_eye'],['BD Heart','bd_heart'],['Cat. Blanca','white_cat'],['Cat. Verde','green_cat'],['Cat. Amarilla','yellow_cat'],['Keys','keys_count'],['Gold Coins','gold_coins'],['BNotes','bnotes']].map(([l,k])=>(
            <div key={k}>
              <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>{l}</div>
              <input type="number" min="0" value={n(k)} onChange={e=>setN(k,parseFloat(e.target.value)||0)}
                style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 9px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
            </div>
          ))}
        </div>
        <div style={{marginTop:10}}>
          <Inp label="Notas" value={form.notes} onChange={v=>setForm(d=>({...d,notes:v}))} placeholder="Descripción..."/>
        </div>
        <Btn onClick={handleSave} disabled={busy} bg='gold'>{busy?'Guardando...':'💾 Guardar Conciliación'}</Btn>
      </Card>

      <Card title="Historial">
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                {['Fecha','En Banco','Fuera','Claims','BD Soul','BD Eye','BD Heart'].map(h=>(
                  <th key={h} style={{padding:'6px 10px',textAlign:'left',fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h,i)=>(
                <tr key={h.id} style={{borderBottom:i<history.length-1?`1px solid #0f0f20`:'none'}}>
                  <td style={{padding:'7px 10px',fontFamily:'Cinzel,serif',color:'#e8e0d0',fontSize:12,whiteSpace:'nowrap'}}>{h.snapshot_date}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:'#4ab8f0',fontSize:13}}>{h.loots_banco}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:'#f0a020',fontSize:13}}>{h.loots_fuera}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:G,fontSize:13}}>{h.loots_claims}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:'#c040c0',fontSize:13}}>{h.bd_soul}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:'#4080f0',fontSize:13}}>{h.bd_eye}</td>
                  <td style={{padding:'7px 10px',fontFamily:'Rajdhani,sans-serif',color:'#e03030',fontSize:13}}>{h.bd_heart}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── STATS TAB ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function StatsTab(){
  const [stats,setStats]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState<'BD'|'FV'|'all'>('all')

  useEffect(()=>{
    supabase.from('maze_attendance').select('*, players(name), maze_sessions(maze_type,session_date)')
      .order('created_at',{ascending:false}).limit(500)
      .then(({data})=>{setStats(data??[]);setLoading(false)})
  },[])

  const filtered=filter==='all'?stats:stats.filter((s:any)=>s.maze_sessions?.maze_type===filter)
  const byPlayer=useMemo(()=>{
    const map:Record<string,any>={}
    filtered.forEach((s:any)=>{
      const name=s.players?.name??'?'
      if(!map[name])map[name]={name,attended:0,loots:0,supports:0}
      map[name].attended++;if(s.got_loot)map[name].loots++;if(s.is_support)map[name].supports++
    })
    return Object.values(map).sort((a:any,b:any)=>b.attended-a.attended)
  },[filtered])

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {(['all','BD','FV'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${filter===f?G:BORDER}`,background:filter===f?`${G}18`:CARD,color:filter===f?G:'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:9,textTransform:'uppercase'}}>
            {f==='all'?'Todos':f==='BD'?'🐉 BD':'❄️ FV'}
          </button>
        ))}
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase'}}>Asistencia y Participación</div>
        {loading?<div style={{padding:'40px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#555'}}>Cargando...</div>:
         byPlayer.length===0?<div style={{padding:'40px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#333',fontSize:13}}>Sin datos. Carga un maze primero.</div>:(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {['Jugador','Asistencias','Loots','Apoyos ★'].map((h,i)=>(
                    <th key={h} style={{padding:'8px 12px',textAlign:i===0?'left':'right',fontFamily:'Cinzel,serif',fontSize:8,color:'#777',textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPlayer.map((p:any,i:number)=>(
                  <tr key={p.name} style={{borderBottom:`1px solid #0f0f20`}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0e0e26'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                    <td style={{padding:'9px 12px',fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{i<3?['🥇','🥈','🥉'][i]+' ':''}{p.name}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:'#4ab8f0',fontSize:15}}>{p.attended}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:15}}>{p.loots}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:'#f0a020',fontSize:14}}>{p.supports>0?`★ ${p.supports}`:'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── ANUNCIOS TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function AnunciosTab({showToast}:{showToast:(t:TT)=>void}){
  const [items,setItems]=useState<Announcement[]>([])
  const [title,setTitle]=useState(''), [content,setContent]=useState('')
  const [imageUrl,setImageUrl]=useState(''), [pinned,setPinned]=useState(false), [busy,setBusy]=useState(false)

  async function load(){setItems(await getAnnouncements())}
  useEffect(()=>{load()},[])

  async function handleCreate(){
    if(!title.trim()){showToast({msg:'Título requerido',type:'warn'});return}
    setBusy(true)
    try{await createAnnouncement({title,content:content||undefined,image_url:imageUrl||undefined,pinned});showToast({msg:'Publicado',type:'ok'});setTitle('');setContent('');setImageUrl('');setPinned(false);load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:700}}>
      <Card title="Nuevo Anuncio" color={`${G}40`}>
        <Inp label="Título *" value={title} onChange={setTitle}/>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:9,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>Contenido</div>
          <textarea rows={3} value={content} onChange={e=>setContent(e.target.value)}
            style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 10px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif',resize:'vertical',boxSizing:'border-box'}}/>
        </div>
        <Inp label="URL Imagen (opc.)" value={imageUrl} onChange={setImageUrl} placeholder="https://..."/>
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:12}}>
          <input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/>
          <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#aaa'}}>📌 Fijar</span>
        </label>
        <Btn onClick={handleCreate} disabled={busy} bg='gold'>{busy?'...':'+ Publicar'}</Btn>
      </Card>
      <Card title={`Publicados — ${items.length}`}>
        {items.length===0?<p style={{fontFamily:'Rajdhani,sans-serif',color:'#444',fontSize:13}}>Sin anuncios</p>:
          items.map((a,i)=>(
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'9px 0',borderBottom:i<items.length-1?`1px solid #0f0f20`:'none',gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                {a.pinned&&<span style={{fontFamily:'Cinzel,serif',fontSize:8,padding:'2px 6px',borderRadius:8,background:`${G}20`,border:`1px solid ${GD}`,color:G,marginRight:6}}>📌</span>}
                <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{a.title}</span>
                {a.content&&<p style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#666',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.content}</p>}
              </div>
              <Btn onClick={()=>deleteAnnouncement(a.id).then(load).then(()=>showToast({msg:'Eliminado',type:'ok'}))} bg='danger' size='sm'>✕</Btn>
            </div>
          ))
        }
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── HISTÓRICO TAB ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function HistoricoTab(){
  const [logs,setLogs]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState<string>('all')

  async function load(){
    setLoading(true)
    let q=supabase.from('admin_audit_log').select('*, admin_profiles(username)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all')q=q.eq('action_type',filter)
    const{data}=await q;setLogs(data??[]);setLoading(false)
  }
  useEffect(()=>{load()},[filter])

  const typeCol:Record<string,string>={claims:'#40d0a0',players:'#4ab8f0',maze:'#e05050',accounting:G,announcements:'#c040c0',fv:'#4ab8f0',users:'#888'}
  const typeLbl:Record<string,string>={claims:'Claim',players:'Jugador',maze:'Maze',accounting:'Contab.',announcements:'Anuncio',fv:'FV',users:'Usuario'}

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {['all','claims','players','maze','accounting','announcements'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 12px',borderRadius:6,border:`1px solid ${filter===f?G:BORDER}`,background:filter===f?`${G}18`:CARD,color:filter===f?G:'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:9,textTransform:'uppercase'}}>
            {f==='all'?'Todos':typeLbl[f]??f}
          </button>
        ))}
        <button onClick={load} style={{padding:'6px 12px',borderRadius:6,border:`1px solid ${BORDER}`,background:'transparent',color:'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:9,textTransform:'uppercase',marginLeft:'auto'}}>↻</button>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase'}}>📋 {logs.length} registros</div>
        {loading?<div style={{padding:'32px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#555'}}>Cargando...</div>:
         logs.length===0?<div style={{padding:'32px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#333',fontSize:13}}>Sin registros. Los movimientos aparecen aquí automáticamente.</div>:(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {['Fecha','Admin','Tipo','Acción','Detalle'].map(h=>(
                    <th key={h} style={{padding:'7px 10px',textAlign:'left',fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log,i)=>{
                  const col=typeCol[log.action_type]??'#888'
                  const dt=new Date(log.created_at)
                  return (
                    <tr key={log.id} style={{borderBottom:`1px solid #0f0f20`}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0e0e26'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td style={{padding:'8px 10px',fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:11,whiteSpace:'nowrap'}}>{dt.toLocaleDateString('es-PA')} {dt.toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'})}</td>
                      <td style={{padding:'8px 10px',fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:12,whiteSpace:'nowrap'}}>{log.admin_profiles?.username??'—'}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{fontFamily:'Cinzel,serif',fontSize:8,padding:'2px 7px',borderRadius:8,border:`1px solid ${col}50`,color:col,textTransform:'uppercase',whiteSpace:'nowrap'}}>{typeLbl[log.action_type]??log.action_type}</span>
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:'Rajdhani,sans-serif',color:'#e8e0d0',fontSize:12}}>{log.action}</td>
                      <td style={{padding:'8px 10px',fontFamily:'Rajdhani,sans-serif',color:'#666',fontSize:11,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {log.details?JSON.stringify(log.details).slice(0,100):'—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── USUARIOS TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function UsuariosTab({showToast}:{showToast:(t:TT)=>void}){
  const [users,setUsers]=useState<any[]>([])
  const [editId,setEditId]=useState<string|null>(null)
  const [editPerms,setEditPerms]=useState<Record<string,boolean>>({})
  const [busy,setBusy]=useState(false)

  async function load(){
    const{data}=await supabase.from('admin_profiles').select('*, admin_email_map(email)').order('created_at',{ascending:false})
    setUsers(data??[])
  }
  useEffect(()=>{load()},[])

  async function savePerms(id:string){
    setBusy(true)
    try{await supabase.from('admin_profiles').update({permissions:editPerms}).eq('id',id);showToast({msg:'Permisos actualizados',type:'ok'});setEditId(null);load()}
    catch(e:any){showToast({msg:'Error',type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:800}}>
      <Card title="Cómo crear nuevo Admin" color={`${G}30`}>
        <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#aaa',lineHeight:1.8,marginBottom:12}}>Los usuarios entran con <strong style={{color:'#e8e0d0'}}>username</strong> y contraseña — nunca con email.</p>
        <div style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 14px',fontFamily:'monospace',fontSize:11,color:G,lineHeight:1.9,overflowX:'auto'}}>
          {`-- 1. Supabase → Auth → Users → Add user (cualquier email interno)\n-- 2. Copia el UUID\n\nINSERT INTO admin_profiles (id, username, role, permissions)\nVALUES ('UUID','username','manager','{"ranking":true,"jugadores":true,"mazes":true,"claims":true}');\n\nINSERT INTO admin_email_map (user_id, email, username)\nVALUES ('UUID','email@ejemplo.com','username');`}
        </div>
      </Card>

      <Card title={`Admins registrados — ${users.length}`}>
        {users.map((u,i)=>(
          <div key={u.id} style={{borderBottom:i<users.length-1?`1px solid #0f0f20`:'none',paddingBottom:14,marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8}}>
              <div>
                <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:14}}>{u.username}</span>
                <span style={{fontFamily:'Cinzel,serif',fontSize:8,padding:'2px 8px',borderRadius:12,border:`1px solid ${u.role==='superadmin'?G:BORDER}`,color:u.role==='superadmin'?G:'#888',marginLeft:8}}>{u.role}</span>
                {u.admin_email_map?.email&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555',marginLeft:8}}>{u.admin_email_map.email}</span>}
              </div>
              <div style={{display:'flex',gap:6}}>
                {editId===u.id
                  ?<><Btn onClick={()=>savePerms(u.id)} disabled={busy} size='sm' bg='gold'>{busy?'...':'✓'}</Btn><Btn onClick={()=>setEditId(null)} size='sm'>✕</Btn></>
                  :<Btn onClick={()=>{setEditId(u.id);setEditPerms(u.permissions??{})}} size='sm'>⚙ Permisos</Btn>
                }
              </div>
            </div>
            {editId===u.id&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,paddingLeft:4}}>
                {ALL_PERMS.map(p=>(
                  <label key={p.key} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    <input type="checkbox" checked={!!editPerms[p.key]} onChange={e=>setEditPerms(d=>({...d,[p.key]:e.target.checked}))}/>
                    <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#aaa'}}>{p.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── MAIN ADMIN PAGE ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function AdminPage(){
  const [tab,setTab]=useState<TabKey>('ranking')
  const [session,setSession]=useState<any>(null)
  const [loading,setLoading]=useState(true)
  const [toast,setToast]=useState<TT|null>(null)
  const [username,setUsername]=useState(''), [password,setPassword]=useState(''), [authErr,setAuthErr]=useState('')
  const [userPerms,setUserPerms]=useState<Record<string,boolean>>({})
  const [isSuperAdmin,setIsSuperAdmin]=useState(false)
  const showToast=(t:TT)=>setToast(t)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    supabase.auth.onAuthStateChange((_,s)=>setSession(s))
  },[])

  useEffect(()=>{
    if(!session)return
    supabase.from('admin_profiles').select('permissions,role').eq('id',session.user.id).single()
      .then(({data})=>{
        if(data?.role==='superadmin'){
          const all:Record<string,boolean>={}
          ALL_PERMS.forEach(p=>all[p.key]=true)
          setUserPerms(all)
          setIsSuperAdmin(true)
        } else {
          setUserPerms(data?.permissions??{})
          setIsSuperAdmin(false)
        }
      })
  },[session])

  async function handleLogin(e:React.FormEvent){
    e.preventDefault();setAuthErr('')
    try{
      const{data:er,error:eErr}=await supabase.from('admin_email_map').select('email').ilike('username',username.trim()).single()
      if(eErr||!er){setAuthErr('Usuario no encontrado');return}
      const{error:lErr}=await supabase.auth.signInWithPassword({email:er.email,password})
      if(lErr)setAuthErr('Contraseña incorrecta')
    }catch{setAuthErr('Error al iniciar sesión')}
  }

  if(loading) return <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{fontFamily:'Cinzel,serif',color:GD}}>Cargando...</div></div>

  if(!session) return (
    <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:44,marginBottom:10}}>🐉</div>
          <h1 style={{fontFamily:'Cinzel,serif',fontWeight:900,fontSize:22,letterSpacing:'0.1em',background:'linear-gradient(135deg,#f0d080,#c9a84c,#8a6020)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',margin:0}}>THE ORIGINALS</h1>
          <p style={{fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase',letterSpacing:'0.12em',marginTop:6}}>Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:20}}>
          <Inp label="Usuario" value={username} onChange={setUsername} placeholder="jcwhite"/>
          <Inp label="Contraseña" value={password} onChange={setPassword} type="password"/>
          {authErr&&<p style={{color:'#e04040',fontSize:13,marginBottom:10,fontFamily:'Rajdhani,sans-serif'}}>{authErr}</p>}
          <button type="submit" style={{width:'100%',fontSize:12,padding:'13px',borderRadius:8,background:`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:VOID,cursor:'pointer',fontFamily:'Cinzel,serif',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>Ingresar</button>
        </form>
        <div style={{textAlign:'center',marginTop:14}}>
          <a href="/dashboard" style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:13,textDecoration:'none'}}>← Dashboard público</a>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:VOID,fontFamily:'Rajdhani,sans-serif'}}>
      {toast&&<Toast t={toast} onClose={()=>setToast(null)}/>}

      {/* Top header — slim */}
      <header style={{background:'linear-gradient(90deg,#0c0014,#04040e)',borderBottom:'1px solid #c9a84c28',position:'sticky',top:0,zIndex:200}}>
        <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18}}>🐉</span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:900,fontSize:13,letterSpacing:'0.08em',background:'linear-gradient(135deg,#f0d080,#c9a84c)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',whiteSpace:'nowrap'}}>THE ORIGINALS · ADMIN</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:12,display:'none'}}>{session.user.email}</span>
            <button onClick={()=>supabase.auth.signOut()} style={{fontFamily:'Cinzel,serif',fontSize:8,color:'#666',border:`1px solid ${BORDER}`,padding:'5px 12px',borderRadius:5,background:'none',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em',whiteSpace:'nowrap'}}>Salir</button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div style={{display:'flex',minHeight:'calc(100vh - 45px)'}}>

        {/* LEFT SIDEBAR */}
        <nav style={{
          width:200,flexShrink:0,
          background:'#080814',
          borderRight:`1px solid ${BORDER}`,
          position:'sticky',top:45,
          height:'calc(100vh - 45px)',
          overflowY:'auto',
          padding:'16px 0'
        }}>
          {/* Always show all tabs — filter if perms loaded */}
          {([
            {key:'ranking'      as TabKey,label:'📊 Ranking',        permKey:'ranking'},
            {key:'jugadores'    as TabKey,label:'👥 Jugadores',       permKey:'jugadores'},
            {key:'mazes'        as TabKey,label:'📤 Mazes',           permKey:'mazes'},
            {key:'claims'       as TabKey,label:'🏆 Claims',          permKey:'claims'},
            {key:'conciliacion' as TabKey,label:'💰 Conciliación',    permKey:'conciliacion'},
            {key:'stats'        as TabKey,label:'📈 Estadísticas',    permKey:'stats'},
            {key:'anuncios'     as TabKey,label:'📢 Anuncios',        permKey:'anuncios'},
            {key:'historico'    as TabKey,label:'📋 Histórico',       permKey:'historico'},
            {key:'usuarios'     as TabKey,label:'🔑 Usuarios',        permKey:'usuarios'},
          ] as {key:TabKey;label:string;permKey:string}[])
          .filter(t => !session || Object.keys(userPerms).length === 0 || isSuperAdmin || userPerms[t.permKey])
          .map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{
                display:'block',width:'100%',textAlign:'left',
                padding:'11px 18px',
                background:tab===t.key?`${G}15`:'transparent',
                border:'none',
                borderLeft:tab===t.key?`3px solid ${G}`:'3px solid transparent',
                borderRight:'none',borderTop:'none',borderBottom:'none',
                color:tab===t.key?G:'#888',
                cursor:'pointer',
                fontFamily:'Cinzel,serif',fontSize:10,
                textTransform:'uppercase',letterSpacing:'0.08em',
                fontWeight:tab===t.key?700:400,
                transition:'all 0.15s',
                whiteSpace:'nowrap',
              }}
              onMouseEnter={e=>{if(tab!==t.key)(e.currentTarget as HTMLElement).style.color='#bbb'}}
              onMouseLeave={e=>{if(tab!==t.key)(e.currentTarget as HTMLElement).style.color='#888'}}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* MAIN CONTENT */}
        <main style={{flex:1,minWidth:0,padding:'20px',overflowX:'hidden'}}>
          {tab==='ranking'      &&<RankingTab showToast={showToast} isSuperAdmin={isSuperAdmin}/>}
          {tab==='jugadores'    &&<JugadoresTab showToast={showToast}/>}
          {tab==='mazes'        &&<MazesTab showToast={showToast}/>}
          {tab==='claims'       &&<ClaimsTab showToast={showToast}/>}
          {tab==='conciliacion' &&<ConciliacionTab showToast={showToast}/>}
          {tab==='stats'        &&<StatsTab/>}
          {tab==='anuncios'     &&<AnunciosTab showToast={showToast}/>}
          {tab==='historico'    &&<HistoricoTab/>}
          {tab==='usuarios'     &&<UsuariosTab showToast={showToast}/>}
        </main>

      </div>
    </div>
  )
}
