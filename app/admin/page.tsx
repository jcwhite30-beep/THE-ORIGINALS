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
import { parseMazeReport, calcPointShare, runOCR } from '@/lib/ocr'

// ─── Design tokens ────────────────────────────────────────────
const G='#c9a84c', GD='#7a6030', CARD='#0d0d1e', DEEP='#070712', VOID='#04040e', BORDER='#22224a'
const f2 = (n:number) => Number(n??0).toFixed(2)
const fi = (n:number) => Math.floor(n??0)

// ─── Tab definition ───────────────────────────────────────────
type TabKey = 'ranking'|'jugadores'|'upload'|'claims'|'contabilidad'|'stats'|'anuncios'|'fv'|'usuarios'

// ─── FV Runes ─────────────────────────────────────────────────
const FV_RUNES = [
  {key:'curse',       label:'Curse',       color:'#c040c0'},
  {key:'illusory',    label:'Illusory',    color:'#4080f0'},
  {key:'piercing',    label:'Piercing',    color:'#f0a020'},
  {key:'riven',       label:'Riven Soul',  color:'#e03030'},
  {key:'favor',       label:'Favor',       color:'#40d0a0'},
  {key:'prayer',      label:'Prayer',      color:'#d0d040'},
  {key:'scroll_ring', label:'Scroll Ring', color:'#c9a84c'},
] as const

// ─── Toast ────────────────────────────────────────────────────
type TT = {msg:string; type:'ok'|'err'|'warn'}
function Toast({t,onClose}:{t:TT;onClose:()=>void}) {
  useEffect(()=>{const x=setTimeout(onClose,3500);return()=>clearTimeout(x)},[])
  const c={ok:{bg:'#0a2a1a',border:'#20a060',text:'#40d090'},err:{bg:'#2a0a0a',border:'#a02020',text:'#e04040'},warn:{bg:'#2a1a00',border:'#a06000',text:'#d09020'}}[t.type]
  return <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,padding:'11px 18px',borderRadius:8,fontSize:14,fontFamily:'Rajdhani,sans-serif',fontWeight:600,background:c.bg,border:`1px solid ${c.border}`,color:c.text}}>{t.msg}</div>
}

// ─── Skeleton ─────────────────────────────────────────────────
function Sk({w,h=14}:{w:number;h?:number}) {
  return <div className="skeleton rounded" style={{width:w,height:h,display:'inline-block'}}/>
}

// ─── Section card ─────────────────────────────────────────────
function SCard({children,title,color=BORDER}:{children:React.ReactNode;title?:string;color?:string}) {
  return (
    <div style={{background:CARD,border:`1px solid ${color}`,borderRadius:12,overflow:'hidden',marginBottom:16}}>
      {title&&<div className="px-5 py-3 font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD,borderBottom:`1px solid ${BORDER}`}}>{title}</div>}
      <div className="p-5">{children}</div>
    </div>
  )
}

function Input({label,value,onChange,type='text',placeholder=''}:{label:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string}) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>{label}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 12px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
    </div>
  )
}

function Btn({children,onClick,disabled,variant='gold',size='md'}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;variant?:'gold'|'ghost'|'danger'|'green';size?:'sm'|'md'}) {
  const bg = {gold:`linear-gradient(135deg,#8a6020,#c9a84c)`,ghost:'transparent',danger:'#2a0a0a',green:'linear-gradient(135deg,#2a6030,#40a060)'}[variant]
  const col = {gold:VOID,ghost:'#888',danger:'#e04040',green:'#e8ffe8'}[variant]
  const border = {gold:'none',ghost:`1px solid ${BORDER}`,danger:'1px solid #a0202060',green:'none'}[variant]
  const pad = size==='sm' ? '6px 14px' : '9px 20px'
  return (
    <button onClick={onClick} disabled={disabled}
      style={{fontSize:size==='sm'?9:10,padding:pad,borderRadius:7,background:bg,border,color:col,cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:700}}>
      {children}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── RANKING TAB (mismo que dashboard público + admin_pts) ────
// ══════════════════════════════════════════════════════════════
function RankingTab() {
  const [lb, setLb] = useState<LeaderboardEntry[]>([])
  const [fvData, setFvData] = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [bdDate, setBdDate] = useState(''), [fvDate, setFvDate] = useState('')

  useEffect(()=>{
    getAdminLeaderboard().then(d=>{setLb(d);setLoading(false)})
    supabase.from('fv_rune_points').select('*, players(name)').then(({data:d})=>{
      const map:Record<string,any>={}
      ;(d??[]).forEach((r:any)=>{if(r.players?.name)map[r.players.name]=r})
      setFvData(map)
    })
    supabase.from('report_dates').select('*').then(({data:d})=>{
      d?.forEach((r:any)=>{ if(r.maze_type==='BD') setBdDate(r.last_date); if(r.maze_type==='FV') setFvDate(r.last_date) })
    })
  },[])

  const filtered = useMemo(()=>{
    if(!search.trim()) return lb
    const s=search.toLowerCase()
    return lb.filter(p=>p.name.toLowerCase().includes(s)||(p.chars||'').toLowerCase().includes(s))
  },[lb,search])

  // Admin row (Administrador special)
  const adminPts = { total:232.12, avail:132.12, claimsDisp:0, claimsDone:20 }
  const totalAvail = lb.reduce((s,p)=>s+p.available_points,0)

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {icon:'🏆',label:'Claims Disp. (Guild)',val:fi(totalAvail/5),sub:`${f2(totalAvail)} pts totales`,col:G},
          {icon:'👑',label:'Pts Admin Disp.',val:f2(adminPts.avail),sub:'Solo visible para admins',col:'#e05050'},
          {icon:'🏦',label:'Claims Admin Hechos',val:adminPts.claimsDone,sub:`${f2(adminPts.total)} total score`,col:'#4ab8f0'},
          {icon:'📊',label:'Jugadores activos',val:lb.length,sub:'con puntos registrados',col:'#40d0a0'},
        ].map(s=>(
          <div key={s.label} style={{background:CARD,border:`1px solid ${s.col}30`,borderRadius:12,padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontSize:14}}>{s.icon}</span>
              <span style={{fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase',letterSpacing:'0.1em'}}>{s.label}</span>
            </div>
            <div style={{fontFamily:'Cinzel,serif',fontSize:22,fontWeight:700,color:s.col,lineHeight:1}}>{s.val}</div>
            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555',marginTop:3}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{position:'relative',marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar jugador..."
          style={{width:'100%',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'11px 16px 11px 42px',color:'#e8e0d0',fontSize:15,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
        <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'#555'}}>🔍</span>
      </div>

      {/* BD Table */}
      <div style={{background:CARD,border:'1px solid #e0505035',borderRadius:14,overflow:'hidden',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',borderBottom:'1px solid #e0505025',background:'#0e080a'}}>
          <span style={{fontFamily:'Cinzel,serif',fontSize:12,fontWeight:700,color:'#e05050',letterSpacing:'0.1em'}}>🐉 BLACK DRAGON</span>
          {bdDate&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#e05050',opacity:0.6}}>Último reporte: {bdDate}</span>}
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1a0808'}}>
                {[['#','center',36,'#555'],['Jugador / PJs','left',180,'#aaa'],['Total Score','right',120,'#e8e0d0'],['Pts Disp.','right',110,'#e05050'],['Admin Pts ★','right',120,G],['Claims Disp.','right',110,G],['Claims Hechos','right',120,'#40d0a0']].map(([h,a,w,c])=>(
                  <th key={String(h)} style={{padding:'8px 12px',textAlign:a as any,width:Number(w),fontSize:8.5,color:String(c),fontWeight:700,fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Admin row (only visible here) */}
              <tr style={{borderBottom:'1px solid #1a0a0a',background:'#140a05'}}>
                <td style={{padding:'10px 12px',fontFamily:'Cinzel,serif',color:'#555',fontSize:12,textAlign:'center'}}>★</td>
                <td style={{padding:'10px 12px'}}>
                  <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:G,fontSize:13}}>Administrador</div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666'}}>Puntos de administración del guild</div>
                </td>
                <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:'#aaa',fontSize:13}}>{f2(232.12)}</td>
                <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:'#e05050',fontSize:14}}>{f2(132.12)}</td>
                <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:14}}>{f2(132.12)}</td>
                <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:15}}>0</td>
                <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:'#40d0a0',fontSize:13}}>20</td>
              </tr>
              {loading
                ? Array.from({length:5}).map((_,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid #120808'}}>
                      {[30,180,90,90,90,80,80].map((w,j)=><td key={j} style={{padding:'10px 12px'}}><Sk w={w}/></td>)}
                    </tr>
                  ))
                : filtered.map((p,i)=>(
                    <tr key={p.id} style={{borderBottom:'1px solid #120808'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#130a0a'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                      <td style={{padding:'10px 12px',textAlign:'center',fontFamily:'Cinzel,serif',color:'#555',fontSize:12}}>
                        {i<3?['🥇','🥈','🥉'][i]:i+1}
                      </td>
                      <td style={{padding:'10px 12px'}}>
                        <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{p.name}</div>
                        {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666',marginTop:1}}>{p.chars}</div>}
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',color:'#aaa',fontSize:13}}>{f2(p.total_points)}</td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:'#e05050',fontSize:14}}>{f2(p.available_points)}</td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:13}}>{f2((p as any).admin_points_total??0)}</td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:15}}>{fi(p.available_points/5)}</td>
                      <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:'#40d0a0',fontSize:13}}>{p.total_claims}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* FV Table */}
      <div style={{background:CARD,border:'1px solid #4ab8f035',borderRadius:14,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',borderBottom:'1px solid #4ab8f025',background:'#080e10'}}>
          <span style={{fontFamily:'Cinzel,serif',fontSize:12,fontWeight:700,color:'#4ab8f0',letterSpacing:'0.1em'}}>❄️ FROZEN VILLE</span>
          {fvDate&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#4ab8f0',opacity:0.6}}>Último reporte: {fvDate}</span>}
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid #0a1414'}}>
                <th style={{padding:'7px 12px',textAlign:'left',fontFamily:'Cinzel,serif',fontSize:8,color:'#777',minWidth:150}}>Jugador</th>
                {FV_RUNES.map(r=>(
                  <th key={r.key} colSpan={2} style={{padding:'7px 6px',textAlign:'center',fontFamily:'Cinzel,serif',fontSize:7.5,color:r.color,borderLeft:'1px solid #1a2a3a',textTransform:'uppercase',letterSpacing:'0.06em'}}>{r.label}</th>
                ))}
              </tr>
              <tr style={{borderBottom:'1px solid #0a1414',background:'#060c0e'}}>
                <th/>
                {FV_RUNES.map(r=>(
                  <><th key={`${r.key}-a`} style={{padding:'3px 7px',textAlign:'right',fontFamily:'Cinzel,serif',fontSize:7,color:'#666',borderLeft:'1px solid #1a2a3a'}}>Pts</th>
                  <th key={`${r.key}-c`} style={{padding:'3px 7px',textAlign:'right',fontFamily:'Cinzel,serif',fontSize:7,color:'#666'}}>Claims</th></>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>{
                const fv=fvData[p.name]
                return (
                  <tr key={p.id} style={{borderBottom:'1px solid #0a1414'}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0a1214'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:12}}>{p.name}</div>
                      {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666'}}>{p.chars}</div>}
                    </td>
                    {FV_RUNES.map(r=>(
                      <><td key={`${r.key}-a`} style={{padding:'9px 7px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:r.color,fontSize:13,borderLeft:'1px solid #1a2a3a'}}>
                        {f2(fv?.[`${r.key}_avail`]??0)}
                      </td>
                      <td key={`${r.key}-c`} style={{padding:'9px 7px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',color:'#40d0a0',fontSize:13}}>
                        {fv?.[`${r.key}_claims`]??0}
                      </td></>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── JUGADORES TAB ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function JugadoresTab({showToast}:{showToast:(t:TT)=>void}) {
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
    if(!newP.name){showToast({msg:'El nombre es requerido',type:'warn'});return}
    setBusy(true)
    try{await createPlayer(newP.name,newP.owner,newP.chars,newP.class);showToast({msg:'PJ creado',type:'ok'});setShowNew(false);setNewP({name:'',owner:'',chars:'',class:''});load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar jugador..."
          style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 14px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif',width:280}}/>
        <Btn onClick={()=>setShowNew(v=>!v)}>+ Nuevo Jugador</Btn>
      </div>

      {showNew&&(
        <SCard title="Nuevo Jugador" color={`${G}40`}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[['Nombre / Owner',newP.name,'name'],['Clase (opc.)',newP.class,'class'],['PJs (coma)',newP.chars,'chars'],['Owner real',newP.owner,'owner']].map(([l,v,k])=>(
              <Input key={k} label={l} value={v} onChange={val=>setNewP(d=>({...d,[k]:val}))}/>
            ))}
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <Btn onClick={handleCreate} disabled={busy}>{busy?'Creando...':'Crear'}</Btn>
            <Btn onClick={()=>setShowNew(false)} variant='ghost'>Cancelar</Btn>
          </div>
        </SCard>
      )}

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'10px 20px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:10,color:GD,textTransform:'uppercase',letterSpacing:'0.1em'}}>
          {filtered.length} jugadores
        </div>
        {filtered.map((p,i)=>(
          <div key={p.id} style={{borderBottom:i<filtered.length-1?`1px solid #0f0f20`:'none',padding:'12px 16px'}}>
            {editing===p.id?(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  {[['Nombre',(editData.name??p.name),'name'],['Owner',(editData.owner??p.owner??''),'owner'],['PJs',(editData.chars??p.chars??''),'chars'],['Clase',(editData.class??p.class??''),'class']].map(([l,v,k])=>(
                    <Input key={k} label={l} value={String(v)} onChange={val=>setEditData((d:any)=>({...d,[k]:val}))}/>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn onClick={()=>saveEdit(p.id)} disabled={busy} size='sm'>{busy?'Guardando...':'✓ Guardar'}</Btn>
                  <Btn onClick={()=>setEditing(null)} variant='ghost' size='sm'>Cancelar</Btn>
                </div>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:14}}>{p.name}</span>
                  {p.chars&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#666',marginTop:2}}>{p.chars}</div>}
                </div>
                <Btn onClick={()=>{setEditing(p.id);setEditData({})}} variant='ghost' size='sm'>✏ Editar</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── CARGAR MAZE TAB ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function UploadTab({showToast}:{showToast:(t:TT)=>void}) {
  const [mazeType,setMazeType]=useState<MazeType>('BD')
  const [adminPts,setAdminPts]=useState(0)
  const [eventPts,setEventPts]=useState(0)
  const [rawText,setRawText]=useState('')
  const [imageFile,setImageFile]=useState<File|null>(null)
  const [parsed,setParsed]=useState<{name:string;points:number;isSupport:boolean}[]>([])
  const [busy,setBusy]=useState(false)
  const [ocrBusy,setOcrBusy]=useState(false)
  const [sessionDate,setSessionDate]=useState(new Date().toISOString().split('T')[0])
  const fileRef=useRef<HTMLInputElement>(null)
  const share=calcPointShare(5,adminPts,eventPts,parsed.length)

  function parseWithSupport(text:string) {
    const lines = text.split(/\n/).map(l=>l.trim()).filter(Boolean)
    return lines.map(line => {
      const isSupport = line.includes('*')
      const clean = line.replace(/\*/g,'')
      const match = clean.match(/^([A-Za-z0-9_\s]+?)[\s:\-]+(\d+(?:\.\d+)?)\s*(?:pts?)?$/i)
      if (!match) return null
      return { name: match[1].trim(), points: parseFloat(match[2]), isSupport }
    }).filter(Boolean) as {name:string;points:number;isSupport:boolean}[]
  }

  async function handleOCR(){
    if(!imageFile)return;setOcrBusy(true)
    try{const t=await runOCR(imageFile);setRawText(t);setParsed(parseWithSupport(t));showToast({msg:'OCR completado',type:'ok'})}
    catch{showToast({msg:'OCR falló — usa pegado de texto',type:'err'})}
    finally{setOcrBusy(false)}
  }

  async function handleSubmit(){
    if(parsed.length===0){showToast({msg:'Sin datos',type:'warn'});return}
    setBusy(true)
    try{
      const session=await createMazeSession({maze_type:mazeType,total_points:5,admin_points:adminPts,event_points:eventPts,session_date:sessionDate,raw_report:rawText})
      for(const entry of parsed){
        const {data:pl}=await supabase.from('players').select('id').ilike('name',entry.name).limit(1)
        if(pl&&pl.length>0){
          await addPlayerPoints(pl[0].id,session.id,entry.points)
          // Record attendance
          await supabase.from('maze_attendance').upsert({
            session_id:session.id, player_id:pl[0].id,
            attended:true, points_earned:entry.points, is_support:entry.isSupport
          })
        } else {
          await supabase.from('point_alerts').insert({raw_name:entry.name,session_id:session.id})
        }
      }
      await updateReportDate(mazeType, sessionDate)
      showToast({msg:'Sesión guardada',type:'ok'});setRawText('');setParsed([]);setImageFile(null)
      if(fileRef.current)fileRef.current.value=''
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:700}}>
      <SCard title="Configuración del Maze">
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {(['BD','FV'] as MazeType[]).map(t=>(
            <button key={t} onClick={()=>setMazeType(t)} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${mazeType===t?(t==='BD'?'#e05050':'#4ab8f0'):BORDER}`,background:mazeType===t?`${t==='BD'?'#e05050':'#4ab8f0'}20`:'transparent',color:mazeType===t?(t==='BD'?'#e05050':'#4ab8f0'):'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em'}}>
              {t==='BD'?'🐉 Black Dragon':'❄️ Frozen Ville'}
            </button>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <Input label="Fecha del Maze" value={sessionDate} onChange={setSessionDate} type="date"/>
          <Input label="Pts Admin" value={String(adminPts)} onChange={v=>setAdminPts(parseFloat(v)||0)} type="number"/>
          <Input label="Pts Guild Event" value={String(eventPts)} onChange={v=>setEventPts(parseFloat(v)||0)} type="number"/>
        </div>
        {parsed.length>0&&(
          <div style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 14px'}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:13}}>Pts/participante: </span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:700,fontSize:20,color:G}}>{share}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:12,marginLeft:8}}>({parsed.length} participantes — {parsed.filter(p=>p.isSupport).length} apoyos mágicos ★)</span>
          </div>
        )}
      </SCard>

      <SCard title="📷 Subir Foto del Reporte">
        <input ref={fileRef} type="file" accept="image/*" onChange={e=>setImageFile(e.target.files?.[0]??null)} style={{fontSize:13,color:'#888',marginBottom:12,display:'block'}}/>
        {imageFile&&<Btn onClick={handleOCR} disabled={ocrBusy}>{ocrBusy?'Procesando...':'Leer con OCR'}</Btn>}
      </SCard>

      <SCard title="📋 Pegado Rápido de Texto">
        <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#666',marginBottom:8}}>
          Formato: NombrePJ 3 / NombrePJ: 2.5 — Apoyos mágicos: Morgan* 3 (con asterisco)
        </div>
        <textarea rows={8} value={rawText} onChange={e=>setRawText(e.target.value)}
          placeholder={"Morgan 3\nDragonSlayer* 2\nIceMage 1.5"}
          style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'9px 12px',color:'#e8e0d0',fontSize:13,fontFamily:'monospace',resize:'vertical',boxSizing:'border-box'}}/>
        <div style={{marginTop:8}}>
          <Btn onClick={()=>setParsed(parseWithSupport(rawText))} variant='ghost'>Parsear texto</Btn>
        </div>
      </SCard>

      {parsed.length>0&&(
        <SCard title={`Vista previa — ${parsed.length} jugadores`}>
          {parsed.map((e,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:i<parsed.length-1?`1px solid #0f0f20`:'none'}}>
              <span style={{fontFamily:'Rajdhani,sans-serif',color:'#e8e0d0',fontSize:14}}>
                {e.name} {e.isSupport&&<span style={{color:'#f0a020',fontSize:12}}>★ Apoyo mágico</span>}
              </span>
              <span style={{fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:14}}>{e.points} pts</span>
            </div>
          ))}
          <div style={{marginTop:16}}>
            <Btn onClick={handleSubmit} disabled={busy} variant='gold'>{busy?'Guardando...':'✓ Guardar Sesión'}</Btn>
          </div>
        </SCard>
      )}

      {/* Pending alerts */}
      <AlertsInline/>
    </div>
  )
}

function AlertsInline() {
  const [alerts,setAlerts]=useState<PointAlert[]>([])
  const [sugg,setSugg]=useState<Record<string,any[]>>({})
  useEffect(()=>{
    getPendingAlerts().then(a=>{
      setAlerts(a)
      a.forEach(al=>suggestPlayerName(al.raw_name).then(s=>setSugg(p=>({...p,[al.id]:s}))))
    })
  },[])
  if(alerts.length===0) return null
  return (
    <SCard title={`⚠ Nombres no encontrados — ${alerts.length}`} color='#a0600040'>
      {alerts.map(al=>(
        <div key={al.id} style={{marginBottom:12,paddingBottom:12,borderBottom:`1px solid #1a1a3a`}}>
          <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:14,marginBottom:6}}>"{al.raw_name}"</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
            {(sugg[al.id]??[]).map((s:any)=>(
              <button key={s.name} onClick={()=>resolveAlert(al.id,'link',s.name).then(()=>setAlerts(a=>a.filter(x=>x.id!==al.id)))}
                style={{fontSize:12,padding:'4px 10px',borderRadius:5,border:`1px solid ${BORDER}`,background:CARD,color:'#e8e0d0',cursor:'pointer'}}>
                {s.name} <span style={{color:'#555',fontSize:10}}>({Math.round(s.similarity*100)}%)</span>
              </button>
            ))}
            <button onClick={()=>createPlayer(al.raw_name).then(()=>resolveAlert(al.id,'create')).then(()=>setAlerts(a=>a.filter(x=>x.id!==al.id)))}
              style={{fontSize:11,padding:'4px 10px',borderRadius:5,border:`1px solid ${GD}`,background:`${G}15`,color:G,cursor:'pointer',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.08em'}}>
              + Crear PJ
            </button>
          </div>
        </div>
      ))}
    </SCard>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── CLAIMS TAB ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function ClaimsTab({showToast}:{showToast:(t:TT)=>void}) {
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
    setBusy(true)
    try{
      await processClaim(selPlayer,`${mazeType}: ${note||'Claim registrado por admin'}`)
      showToast({msg:'Claim registrado — se restaron 5 pts',type:'ok'});setSelPlayer('');setNote('');load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  const pending=claims.filter(c=>!c.approved)
  const approved=claims.filter(c=>c.approved)
  const selP=players.find(p=>p.id===selPlayer)

  return (
    <div style={{maxWidth:720}}>
      <SCard title="Registrar Claim" color={`${G}40`}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Jugador</div>
            <select value={selPlayer} onChange={e=>setSelPlayer(e.target.value)}
              style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 12px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif'}}>
              <option value="">— Seleccionar —</option>
              {players.map(p=><option key={p.id} value={p.id}>{p.name} ({f2(p.available_points)} pts)</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Tipo de Maze</div>
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
          <div style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 14px',marginBottom:12}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#888',fontSize:13}}>Disponible: </span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:700,fontSize:18,color:'#e05050'}}>{f2(selP.available_points)}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:12,marginLeft:8}}>→ después del claim: {f2(selP.available_points-5)}</span>
            {selP.available_points<5&&<div style={{fontFamily:'Rajdhani,sans-serif',color:'#e04040',fontSize:12,marginTop:4}}>⚠ Puntos insuficientes (mínimo 5)</div>}
          </div>
        )}
        <Input label="Notas (opcional)" value={note} onChange={setNote} placeholder="Claim de Black Dragon..."/>
        <Btn onClick={handleCreate} disabled={busy||!selPlayer||(selP?selP.available_points<5:false)}>
          {busy?'Registrando...':'+ Registrar Claim (-5 pts)'}
        </Btn>
      </SCard>

      {pending.length>0&&(
        <div style={{background:CARD,border:'1px solid #a0600040',borderRadius:12,overflow:'hidden',marginBottom:16}}>
          <div style={{padding:'10px 20px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:10,color:'#d09020',textTransform:'uppercase'}}>⏳ Pendientes — {pending.length}</div>
          {pending.map((c,i)=>(
            <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 20px',borderBottom:i<pending.length-1?`1px solid #0f0f20`:'none'}}>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>{(c as any).players?.name}</div>
                {c.notes&&<div style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#666'}}>{c.notes}</div>}
                <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555'}}>{c.claimed_at}</div>
              </div>
              <Btn onClick={()=>approveClaim(c.id).then(()=>load()).then(()=>showToast({msg:'Claim aprobado',type:'ok'}))} variant='green' size='sm'>✓ Aprobar</Btn>
            </div>
          ))}
        </div>
      )}

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'10px 20px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:10,color:GD,textTransform:'uppercase'}}>✓ Aprobados — {approved.length}</div>
        {approved.slice(0,20).map((c,i)=>(
          <div key={c.id} style={{display:'flex',justifyContent:'space-between',padding:'9px 20px',borderBottom:i<Math.min(approved.length,20)-1?`1px solid #0f0f20`:'none'}}>
            <span style={{fontFamily:'Cinzel,serif',color:'#e8e0d0',fontSize:13}}>{(c as any).players?.name}</span>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#40d0a0',fontSize:12}}>✓ {c.claimed_at} · {c.notes?.split(':')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── CONTABILIDAD TAB ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function ContabilidadTab({showToast}:{showToast:(t:TT)=>void}) {
  const [snap,setSnap]=useState<any>(null)
  const [history,setHistory]=useState<any[]>([])
  const [newSnap,setNewSnap]=useState({loots_banco:0,loots_fuera:0,loots_events:0,loots_claims:0,keys_count:0,gold_coins:0,bnotes:0,bd_soul:0,bd_eye:0,bd_heart:0,white_cat:0,green_cat:0,yellow_cat:0,red_cat:0,notes:''})
  const [busy,setBusy]=useState(false)

  async function load(){
    const{data}=await supabase.from('bank_snapshot').select('*').order('created_at',{ascending:false}).limit(10)
    setSnap((data??[])[0]??null);setHistory(data??[])
  }
  useEffect(()=>{load()},[])

  async function handleSave(){
    setBusy(true)
    try{
      await supabase.from('bank_snapshot').insert({...newSnap,snapshot_date:new Date().toISOString().split('T')[0]})
      showToast({msg:'Snapshot guardado',type:'ok'});load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div>
      {/* Current snapshot */}
      {snap&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          {[
            {label:'Loots en Banco',val:snap.loots_banco,col:'#4ab8f0'},
            {label:'Loots Fuera Banco',val:snap.loots_fuera,col:'#f0a020'},
            {label:'Loots para Claims',val:snap.loots_claims,col:G},
            {label:'Keys / Llaves',val:snap.keys_count,col:'#40d0a0'},
            {label:'BD Soul en Banco',val:snap.bd_soul,col:'#c040c0'},
            {label:'BD Eye en Banco',val:snap.bd_eye,col:'#4080f0'},
            {label:'BD Heart en Banco',val:snap.bd_heart,col:'#e03030'},
            {label:'Gold Coins',val:(snap.gold_coins||0).toLocaleString(),col:'#d0d040'},
          ].map(s=>(
            <div key={s.label} style={{background:CARD,border:`1px solid ${s.col}30`,borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>{s.label}</div>
              <div style={{fontFamily:'Cinzel,serif',fontSize:20,fontWeight:700,color:s.col}}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      <SCard title="Registrar Nuevo Snapshot de Contabilidad">
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[
            ['Loots en Banco','loots_banco'],['Loots Fuera Banco','loots_fuera'],['Loots para Claims','loots_claims'],
            ['BD Soul','bd_soul'],['BD Eye','bd_eye'],['BD Heart','bd_heart'],
            ['Cat. Blanca','white_cat'],['Cat. Verde','green_cat'],['Cat. Amarilla','yellow_cat'],
            ['Keys','keys_count'],['Gold Coins','gold_coins'],['BNotes','bnotes'],
          ].map(([l,k])=>(
            <div key={k}>
              <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>{l}</div>
              <input type="number" min="0" value={(newSnap as any)[k]}
                onChange={e=>setNewSnap(d=>({...d,[k]:parseFloat(e.target.value)||0}))}
                style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'7px 10px',color:'#e8e0d0',fontSize:14,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
            </div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <Input label="Notas" value={newSnap.notes} onChange={v=>setNewSnap(d=>({...d,notes:v}))} placeholder="Descripción del snapshot..."/>
        </div>
        <Btn onClick={handleSave} disabled={busy}>{busy?'Guardando...':'💾 Guardar Snapshot'}</Btn>
      </SCard>

      <SCard title="Historial de Snapshots">
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                {['Fecha','En Banco','Fuera','Claims','BD Soul','BD Eye','BD Heart','Notas'].map(h=>(
                  <th key={h} style={{padding:'7px 12px',textAlign:'left',fontFamily:'Cinzel,serif',fontSize:8,color:'#666',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h,i)=>(
                <tr key={h.id} style={{borderBottom:i<history.length-1?`1px solid #0f0f20`:'none'}}>
                  <td style={{padding:'8px 12px',fontFamily:'Cinzel,serif',color:'#e8e0d0',fontSize:12}}>{h.snapshot_date}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#4ab8f0',fontSize:13}}>{h.loots_banco}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#f0a020',fontSize:13}}>{h.loots_fuera}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:G,fontSize:13}}>{h.loots_claims}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#c040c0',fontSize:13}}>{h.bd_soul}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#4080f0',fontSize:13}}>{h.bd_eye}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#e03030',fontSize:13}}>{h.bd_heart}</td>
                  <td style={{padding:'8px 12px',fontFamily:'Rajdhani,sans-serif',color:'#666',fontSize:11}}>{h.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── STATS TAB (Asistencia, Loots, Apoyos mágicos) ───────────
// ══════════════════════════════════════════════════════════════
function StatsTab() {
  const [stats,setStats]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [mazeFilter,setMazeFilter]=useState<'BD'|'FV'|'all'>('all')

  useEffect(()=>{
    supabase.from('maze_attendance')
      .select('*, players(name,chars), maze_sessions(maze_type,session_date)')
      .order('created_at',{ascending:false})
      .limit(500)
      .then(({data})=>{setStats(data??[]);setLoading(false)})
  },[])

  const filtered = mazeFilter==='all' ? stats : stats.filter((s:any)=>s.maze_sessions?.maze_type===mazeFilter)

  // Aggregated stats per player
  const playerStats = useMemo(()=>{
    const map:Record<string,any>={}
    filtered.forEach((s:any)=>{
      const name=s.players?.name??'?'
      if(!map[name]) map[name]={name,attended:0,loots:0,supports:0}
      map[name].attended++
      if(s.got_loot) map[name].loots++
      if(s.is_support) map[name].supports++
    })
    return Object.values(map).sort((a:any,b:any)=>b.attended-a.attended)
  },[filtered])

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {(['all','BD','FV'] as const).map(t=>(
          <button key={t} onClick={()=>setMazeFilter(t)} style={{padding:'7px 16px',borderRadius:6,border:`1px solid ${mazeFilter===t?G:BORDER}`,background:mazeFilter===t?`${G}18`:'transparent',color:mazeFilter===t?G:'#666',cursor:'pointer',fontFamily:'Cinzel,serif',fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em'}}>
            {t==='all'?'Todos':t==='BD'?'🐉 BD':'❄️ FV'}
          </button>
        ))}
      </div>

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'10px 20px',borderBottom:`1px solid ${BORDER}`,fontFamily:'Cinzel,serif',fontSize:10,color:GD,textTransform:'uppercase'}}>
          Estadísticas de Asistencia y Participación
        </div>
        {loading ? <div style={{padding:'40px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#555'}}>Cargando...</div> :
         playerStats.length===0 ? <div style={{padding:'40px',textAlign:'center',fontFamily:'Rajdhani,sans-serif',color:'#333',fontSize:13}}>Sin datos de asistencia aún. Carga un maze para empezar.</div> : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {['Jugador','Asistencias','Loots obtenidos','Apoyos mágicos ★'].map(h=>(
                    <th key={h} style={{padding:'9px 16px',textAlign:h==='Jugador'?'left':'right',fontFamily:'Cinzel,serif',fontSize:8.5,color:'#777',textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map((p:any,i:number)=>(
                  <tr key={p.name} style={{borderBottom:`1px solid #0f0f20`}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#0e0e26'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                    <td style={{padding:'10px 16px',fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:13}}>
                      {i<3?['🥇','🥈','🥉'][i]+' ':''}{p.name}
                    </td>
                    <td style={{padding:'10px 16px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:'#4ab8f0',fontSize:15}}>{p.attended}</td>
                    <td style={{padding:'10px 16px',textAlign:'right',fontFamily:'Cinzel,serif',fontWeight:700,color:G,fontSize:15}}>{p.loots}</td>
                    <td style={{padding:'10px 16px',textAlign:'right',fontFamily:'Rajdhani,sans-serif',fontWeight:700,color:'#f0a020',fontSize:14}}>{p.supports>0?`★ ${p.supports}`:'-'}</td>
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
function AnunciosTab({showToast}:{showToast:(t:TT)=>void}) {
  const [items,setItems]=useState<Announcement[]>([])
  const [title,setTitle]=useState(''), [content,setContent]=useState('')
  const [imageUrl,setImageUrl]=useState(''), [pinned,setPinned]=useState(false)
  const [busy,setBusy]=useState(false)

  async function load(){setItems(await getAnnouncements())}
  useEffect(()=>{load()},[])

  async function handleCreate(){
    if(!title.trim()){showToast({msg:'El título es requerido',type:'warn'});return}
    setBusy(true)
    try{await createAnnouncement({title,content:content||undefined,image_url:imageUrl||undefined,pinned});showToast({msg:'Anuncio publicado',type:'ok'});setTitle('');setContent('');setImageUrl('');setPinned(false);load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:700}}>
      <SCard title="Nuevo Anuncio" color={`${G}40`}>
        <Input label="Título *" value={title} onChange={setTitle}/>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Contenido / Texto</div>
          <textarea rows={4} value={content} onChange={e=>setContent(e.target.value)}
            style={{width:'100%',background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'8px 12px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif',resize:'vertical',boxSizing:'border-box'}}/>
        </div>
        <Input label="URL de imagen (opc.)" value={imageUrl} onChange={setImageUrl} placeholder="https://..."/>
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:16}}>
          <input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/>
          <span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#aaa'}}>📌 Fijar anuncio</span>
        </label>
        <Btn onClick={handleCreate} disabled={busy}>{busy?'Publicando...':'+ Publicar Anuncio'}</Btn>
      </SCard>

      <SCard title={`Anuncios publicados — ${items.length}`}>
        {items.length===0?<p style={{fontFamily:'Rajdhani,sans-serif',color:'#444',fontSize:13}}>Sin anuncios</p>:
          items.map((a,i)=>(
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'10px 0',borderBottom:i<items.length-1?`1px solid #0f0f20`:'none'}}>
              <div>
                {a.pinned&&<span style={{fontFamily:'Cinzel,serif',fontSize:8,padding:'2px 8px',borderRadius:10,background:`${G}20`,border:`1px solid ${GD}`,color:G,marginRight:8}}>📌</span>}
                <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:14}}>{a.title}</span>
                {a.content&&<p style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,color:'#666',marginTop:2}}>{a.content.slice(0,80)}...</p>}
              </div>
              <Btn onClick={()=>deleteAnnouncement(a.id).then(load).then(()=>showToast({msg:'Eliminado',type:'ok'}))} variant='danger' size='sm'>Eliminar</Btn>
            </div>
          ))
        }
      </SCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── USUARIOS TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const ALL_PERMS = [
  {key:'ranking',label:'Ranking / Dashboard'},
  {key:'jugadores',label:'Jugadores'},
  {key:'upload',label:'Cargar Maze'},
  {key:'claims',label:'Claims'},
  {key:'contabilidad',label:'Contabilidad'},
  {key:'stats',label:'Estadísticas'},
  {key:'anuncios',label:'Anuncios'},
  {key:'fv',label:'Frozen Ville'},
  {key:'usuarios',label:'Usuarios'},
]

function UsuariosTab({showToast}:{showToast:(t:TT)=>void}) {
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
    try{
      await supabase.from('admin_profiles').update({permissions:editPerms}).eq('id',id)
      showToast({msg:'Permisos actualizados',type:'ok'});setEditId(null);load()
    }catch(e:any){showToast({msg:'Error',type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:800}}>
      <SCard title="Instrucciones para crear nuevo admin">
        <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,color:'#aaa',lineHeight:1.8,marginBottom:12}}>
          Los usuarios entran con <strong style={{color:'#e8e0d0'}}>username</strong> y contraseña — nunca con email.<br/>
          Para crear un nuevo admin:
        </p>
        <div style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:8,padding:'14px 16px',fontFamily:'monospace',fontSize:12,color:G,lineHeight:1.9}}>
          {`-- 1. Supabase → Authentication → Users → Add user (cualquier email interno)\n-- 2. Copia el UUID del usuario creado\n\nINSERT INTO admin_profiles (id, username, role, permissions)\nVALUES (\n  'UUID-AQUI',\n  'username_del_admin',\n  'manager',  -- o 'superadmin'\n  '{"ranking":true,"players":true,"upload":true,"claims":true,"contabilidad":false,"stats":false,"anuncios":false,"fv":false,"usuarios":false}'\n);\n\nINSERT INTO admin_email_map (user_id, email, username)\nVALUES ('UUID-AQUI', 'email@ejemplo.com', 'username_del_admin');`}
        </div>
      </SCard>

      <SCard title={`Admins registrados — ${users.length}`}>
        {users.map((u,i)=>(
          <div key={u.id} style={{borderBottom:i<users.length-1?`1px solid #0f0f20`:'none',paddingBottom:16,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div>
                <span style={{fontFamily:'Cinzel,serif',fontWeight:600,color:'#e8e0d0',fontSize:15}}>{u.username}</span>
                <span style={{fontFamily:'Cinzel,serif',fontSize:9,padding:'2px 10px',borderRadius:20,border:`1px solid ${u.role==='superadmin'?G:BORDER}`,color:u.role==='superadmin'?G:'#888',marginLeft:10}}>
                  {u.role}
                </span>
                {u.admin_email_map?.email&&<span style={{fontFamily:'Rajdhani,sans-serif',fontSize:11,color:'#555',marginLeft:8}}>{u.admin_email_map.email}</span>}
              </div>
              <div style={{display:'flex',gap:8}}>
                {editId===u.id
                  ? <><Btn onClick={()=>savePerms(u.id)} disabled={busy} size='sm'>{busy?'...':'✓ Guardar'}</Btn><Btn onClick={()=>setEditId(null)} variant='ghost' size='sm'>Cancelar</Btn></>
                  : <Btn onClick={()=>{setEditId(u.id);setEditPerms(u.permissions??{})}} variant='ghost' size='sm'>⚙ Permisos</Btn>
                }
              </div>
            </div>
            {editId===u.id&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,paddingLeft:4}}>
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
      </SCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── MAIN ADMIN PAGE ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  const [tab,setTab]=useState<TabKey>('ranking')
  const [session,setSession]=useState<any>(null)
  const [loading,setLoading]=useState(true)
  const [toast,setToast]=useState<TT|null>(null)
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [authErr,setAuthErr]=useState('')
  const [userPerms,setUserPerms]=useState<Record<string,boolean>>({})
  const showToast=(t:TT)=>setToast(t)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    supabase.auth.onAuthStateChange((_,s)=>setSession(s))
  },[])

  useEffect(()=>{
    if(!session)return
    // Load user permissions
    supabase.from('admin_profiles').select('permissions,role').eq('id',session.user.id).single()
      .then(({data})=>{
        if(data?.role==='superadmin') setUserPerms(Object.fromEntries(ALL_PERMS.map(p=>[p.key,true])))
        else setUserPerms(data?.permissions??{})
      })
  },[session])

  async function handleLogin(e:React.FormEvent){
    e.preventDefault(); setAuthErr('')
    try{
      const{data:emailRow,error:eErr}=await supabase.from('admin_email_map').select('email,username').ilike('username',username.trim()).single()
      if(eErr||!emailRow){setAuthErr('Usuario no encontrado');return}
      const{error:loginErr}=await supabase.auth.signInWithPassword({email:emailRow.email,password})
      if(loginErr)setAuthErr('Contraseña incorrecta')
    }catch(err:any){setAuthErr('Error al iniciar sesión')}
  }

  if(loading) return <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{fontFamily:'Cinzel,serif',color:GD}}>Cargando...</div></div>

  if(!session) return (
    <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani,sans-serif'}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:12}}>🐉</div>
          <h1 style={{fontFamily:'Cinzel,serif',fontWeight:900,fontSize:24,letterSpacing:'0.12em',background:'linear-gradient(135deg,#f0d080,#c9a84c,#8a6020)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>THE ORIGINALS</h1>
          <p style={{fontFamily:'Cinzel,serif',fontSize:9,color:GD,textTransform:'uppercase',letterSpacing:'0.14em',marginTop:6}}>Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:24}}>
          <Input label="Usuario" value={username} onChange={setUsername} placeholder="jcwhite"/>
          <Input label="Contraseña" value={password} onChange={setPassword} type="password"/>
          {authErr&&<p style={{color:'#e04040',fontSize:13,marginBottom:12,fontFamily:'Rajdhani,sans-serif'}}>{authErr}</p>}
          <button type="submit" style={{width:'100%',fontSize:12,padding:14,borderRadius:8,background:`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:VOID,cursor:'pointer',fontFamily:'Cinzel,serif',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>
            Ingresar
          </button>
        </form>
        <div style={{textAlign:'center',marginTop:16}}>
          <a href="/dashboard" style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:13,textDecoration:'none'}}>← Dashboard público</a>
        </div>
      </div>
    </div>
  )

  const TABS: {key:TabKey; label:string; permKey:string}[] = [
    {key:'ranking',        label:'📊 Ranking',        permKey:'ranking'},
    {key:'jugadores',      label:'👥 Jugadores',       permKey:'jugadores'},
    {key:'upload',         label:'📤 Cargar Maze',     permKey:'upload'},
    {key:'claims',         label:'🏆 Claims',          permKey:'claims'},
    {key:'contabilidad',   label:'💰 Contabilidad',    permKey:'contabilidad'},
    {key:'stats',          label:'📈 Estadísticas',    permKey:'stats'},
    {key:'anuncios',       label:'📢 Anuncios',        permKey:'anuncios'},
    {key:'fv',             label:'❄️ Frozen Ville',    permKey:'fv'},
    {key:'usuarios',       label:'🔑 Usuarios',        permKey:'usuarios'},
  ].filter(t=>userPerms[t.permKey])

  return (
    <div style={{minHeight:'100vh',background:VOID,fontFamily:'Rajdhani,sans-serif'}}>
      {toast&&<Toast t={toast} onClose={()=>setToast(null)}/>}

      <header style={{background:'linear-gradient(180deg,#0c0014 0%,#04040e 100%)',borderBottom:'1px solid #c9a84c28'}}>
        <div style={{maxWidth:1300,margin:'0 auto',padding:'16px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:22}}>🐉</span>
            <span style={{fontFamily:'Cinzel,serif',fontWeight:900,fontSize:18,letterSpacing:'0.1em',background:'linear-gradient(135deg,#f0d080,#c9a84c)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>THE ORIGINALS — ADMIN</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <span style={{fontFamily:'Rajdhani,sans-serif',color:'#555',fontSize:13}}>{session.user.email}</span>
            <button onClick={()=>supabase.auth.signOut()} style={{fontFamily:'Cinzel,serif',fontSize:9,color:'#555',border:`1px solid ${BORDER}`,padding:'6px 14px',borderRadius:5,background:'none',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.1em'}}>Salir</button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:1300,margin:'0 auto',padding:'24px'}}>
        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginBottom:24,flexWrap:'wrap'}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{fontSize:9,padding:'8px 16px',borderRadius:8,cursor:'pointer',border:`1px solid ${tab===t.key?G:BORDER}`,background:tab===t.key?`${G}18`:CARD,color:tab===t.key?G:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.09em',fontWeight:tab===t.key?700:400}}>
              {t.label}
            </button>
          ))}
        </div>

        {tab==='ranking'      && <RankingTab/>}
        {tab==='jugadores'    && <JugadoresTab showToast={showToast}/>}
        {tab==='upload'       && <UploadTab showToast={showToast}/>}
        {tab==='claims'       && <ClaimsTab showToast={showToast}/>}
        {tab==='contabilidad' && <ContabilidadTab showToast={showToast}/>}
        {tab==='stats'        && <StatsTab/>}
        {tab==='anuncios'     && <AnunciosTab showToast={showToast}/>}
        {tab==='fv'           && <FVAdminTab showToast={showToast}/>}
        {tab==='usuarios'     && <UsuariosTab showToast={showToast}/>}
      </div>
    </div>
  )
}

// ─── FV Admin Tab (inline) ────────────────────────────────────
function FVAdminTab({showToast}:{showToast:(t:TT)=>void}) {
  const [players,setPlayers]=useState<Player[]>([])
  const [fvData,setFvData]=useState<Record<string,any>>({})
  const [selId,setSelId]=useState('')
  const [edits,setEdits]=useState<Record<string,number>>({})
  const [busy,setBusy]=useState(false)
  const [fvDate,setFvDate]=useState('')

  async function load(){
    setPlayers(await getAllPlayers())
    const{data}=await supabase.from('fv_rune_points').select('*, players(name)')
    const map:Record<string,any>={}
    ;(data??[]).forEach((r:any)=>{map[r.player_id]=r})
    setFvData(map)
  }
  useEffect(()=>{load()},[])

  const currentFV=selId?fvData[selId]:null

  return (
    <div style={{maxWidth:900}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,padding:'12px 16px',background:CARD,borderRadius:10,border:'1px solid #4ab8f030'}}>
        <span style={{fontFamily:'Cinzel,serif',fontSize:10,color:'#4ab8f0',textTransform:'uppercase',letterSpacing:'0.1em'}}>Último reporte FV:</span>
        <input type="date" value={fvDate} onChange={e=>setFvDate(e.target.value)}
          style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'5px 10px',color:'#e8e0d0',fontSize:13}}/>
        <Btn onClick={()=>updateReportDate('FV',fvDate).then(()=>showToast({msg:'Fecha actualizada',type:'ok'}))} size='sm'>Actualizar</Btn>
      </div>

      <SCard title="Editar Puntos FV por Jugador">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:'#888',fontFamily:'Cinzel,serif',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Jugador</div>
          <select value={selId} onChange={e=>{setSelId(e.target.value);setEdits({})}}
            style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13,fontFamily:'Rajdhani,sans-serif',width:300}}>
            <option value="">— Seleccionar —</option>
            {players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {selId&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
            {FV_RUNES.map(r=>(
              <div key={r.key} style={{background:DEEP,border:`1px solid ${r.color}30`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontFamily:'Cinzel,serif',fontSize:8,color:r.color,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{r.label}</div>
                {[['_avail','Pts Disp.'],['_claims','Claims']].map(([suf,lbl])=>(
                  <div key={suf} style={{marginBottom:6}}>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:10,color:'#666',marginBottom:2}}>{lbl}</div>
                    <input type="number" step="0.0001" min="0"
                      value={edits[`${r.key}${suf}`]??currentFV?.[`${r.key}${suf}`]??0}
                      onChange={e=>setEdits(d=>({...d,[`${r.key}${suf}`]:parseFloat(e.target.value)||0}))}
                      style={{width:'100%',background:'#04040e',border:`1px solid ${BORDER}`,borderRadius:4,padding:'5px 7px',color:'#e8e0d0',fontSize:12,fontFamily:'Rajdhani,sans-serif',boxSizing:'border-box'}}/>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <Btn onClick={()=>{
          if(!selId){showToast({msg:'Selecciona un jugador',type:'warn'});return}
          setBusy(true)
          upsertFVRunePoints(selId,edits).then(()=>{showToast({msg:'FV guardado',type:'ok'});setEdits({});load()}).catch((e:any)=>showToast({msg:'Error: '+e.message,type:'err'})).finally(()=>setBusy(false))
        }} disabled={busy||!selId}>{busy?'Guardando...':'✓ Guardar FV Points'}</Btn>
      </SCard>
    </div>
  )
}
