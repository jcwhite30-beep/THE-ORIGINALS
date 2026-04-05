'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'
import {
  supabase, getAdminLeaderboard, getAllPlayers, getPendingAlerts,
  getClaims, approveClaim, processClaim, resolveAlert, createMazeSession,
  addPlayerPoints, createPlayer, updatePlayer, suggestPlayerName,
  getAnnouncements, createAnnouncement, deleteAnnouncement,
  getFVRunePoints, upsertFVRunePoints, updateReportDate,
  LeaderboardEntry, Player, PointAlert, Claim, MazeType, Announcement, FVRunePoints
} from '@/lib/supabase'
import { parseMazeReport, calcPointShare, runOCR } from '@/lib/ocr'

type Tab = 'rankings'|'players'|'upload'|'claims'|'alerts'|'events'|'anuncios'|'fv'|'users'
const G='#c9a84c',GD='#7a6030',CARD='#0c0c22',DEEP='#07071a',VOID='#04040e',BORDER='#1e1e40'

// ── Toast ──────────────────────────────────────────────────────
type TT={msg:string;type:'ok'|'err'|'warn'}
function Toast({t,onClose}:{t:TT;onClose:()=>void}) {
  useEffect(()=>{const x=setTimeout(onClose,3500);return()=>clearTimeout(x)},[])
  const c={ok:{bg:'#0a2a1a',border:'#20a060',text:'#40d090'},err:{bg:'#2a0a0a',border:'#a02020',text:'#e04040'},warn:{bg:'#2a1a00',border:'#a06000',text:'#d09020'}}[t.type]
  return <div className="fade-in font-rajdhani font-semibold" style={{position:'fixed',bottom:24,right:24,zIndex:9999,padding:'11px 18px',borderRadius:8,fontSize:14,background:c.bg,border:`1px solid ${c.border}`,color:c.text}}>{t.msg}</div>
}

// ── Players Tab ───────────────────────────────────────────────
function PlayersTab({showToast}:{showToast:(t:TT)=>void}) {
  const [players, setPlayers] = useState<Player[]>([])
  const [editing, setEditing] = useState<string|null>(null)
  const [editData, setEditData] = useState<Partial<Player>>({})
  const [showNew, setShowNew] = useState(false)
  const [newP, setNewP] = useState({name:'',owner:'',chars:'',class:''})
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  async function load() { setPlayers(await getAllPlayers()) }
  useEffect(()=>{load()},[])

  async function saveEdit(id:string) {
    setBusy(true)
    try { await updatePlayer(id,editData); showToast({msg:'Guardado',type:'ok'}); setEditing(null); load() }
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  async function handleCreate() {
    if(!newP.name){showToast({msg:'El nombre es requerido',type:'warn'});return}
    setBusy(true)
    try{await createPlayer(newP.name,newP.owner,newP.chars,newP.class);showToast({msg:'PJ creado',type:'ok'});setShowNew(false);setNewP({name:'',owner:'',chars:'',class:''});load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  const filtered = players.filter(p=>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.owner||'').toLowerCase().includes(search.toLowerCase()) ||
    (p.chars||'').toLowerCase().includes(search.toLowerCase())
  )

  const field = (label:string,val:string,key:keyof Player,placeholder?:string)=>(
    <div>
      <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>{label}</p>
      <input value={val} onChange={e=>setEditData(d=>({...d,[key]:e.target.value}))} placeholder={placeholder}
        className="font-rajdhani w-full" style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:5,padding:'6px 10px',color:'#e8e0d0',fontSize:13}}/>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar jugador..."
          className="font-rajdhani" style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 14px',color:'#e8e0d0',fontSize:14,width:280}}/>
        <button onClick={()=>setShowNew(v=>!v)} className="font-cinzel uppercase tracking-wider"
          style={{fontSize:10,padding:'9px 18px',borderRadius:7,border:`1px solid ${GD}`,background:`${G}15`,color:G,cursor:'pointer'}}>
          + Nuevo Jugador
        </button>
      </div>

      {showNew && (
        <div className="rounded-xl p-5 mb-4 fade-in" style={{background:CARD,border:`1px solid ${G}40`}}>
          <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Nuevo Jugador</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[['Nombre / Owner',newP.name,'name'],['Clase (opcional)',newP.class,'class'],['PJs (separados por coma)',newP.chars,'chars'],['Owner real',newP.owner,'owner']].map(([l,v,k])=>(
              <div key={k}>
                <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>{l}</p>
                <input value={v} onChange={e=>setNewP(d=>({...d,[k]:e.target.value}))}
                  className="font-rajdhani w-full" style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:5,padding:'6px 10px',color:'#e8e0d0',fontSize:13}}/>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={busy} className="font-cinzel uppercase tracking-wider"
              style={{fontSize:10,padding:'9px 20px',borderRadius:6,background:`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:VOID,cursor:'pointer',fontWeight:700}}>
              {busy?'Creando...':'Crear'}
            </button>
            <button onClick={()=>setShowNew(false)} className="font-rajdhani"
              style={{fontSize:12,padding:'9px 16px',borderRadius:6,border:`1px solid ${BORDER}`,background:'transparent',color:'#555',cursor:'pointer'}}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
          <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>{filtered.length} jugadores</p>
        </div>
        {filtered.map((p,i)=>(
          <div key={p.id} style={{borderBottom:i<filtered.length-1?'1px solid #0f0f20':'none',padding:'12px 16px'}}>
            {editing===p.id ? (
              <div className="fade-in">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {field('Nombre',(editData.name??p.name),'name')}
                  {field('Owner',(editData.owner??p.owner??''),'owner')}
                  {field('PJs (coma)',(editData.chars??p.chars??''),'chars')}
                  {field('Clase',(editData.class??p.class??''),'class')}
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>saveEdit(p.id)} disabled={busy} className="font-cinzel uppercase tracking-wider"
                    style={{fontSize:10,padding:'7px 16px',borderRadius:6,background:`${G}20`,border:`1px solid ${GD}`,color:G,cursor:'pointer'}}>
                    {busy?'Guardando...':'✓ Guardar'}
                  </button>
                  <button onClick={()=>setEditing(null)} className="font-rajdhani"
                    style={{fontSize:12,padding:'7px 12px',borderRadius:6,border:`1px solid ${BORDER}`,background:'transparent',color:'#555',cursor:'pointer'}}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:14}}>{p.name}</span>
                  {p.owner&&p.owner!==p.name&&<span className="font-rajdhani ml-2" style={{fontSize:12,color:'#666'}}>({p.owner})</span>}
                  {p.chars&&<div className="font-rajdhani mt-0.5" style={{fontSize:11,color:'#555'}}>{p.chars}</div>}
                </div>
                <button onClick={()=>{setEditing(p.id);setEditData({})}}
                  className="font-cinzel uppercase tracking-wider"
                  style={{fontSize:9,padding:'5px 12px',borderRadius:5,border:`1px solid ${BORDER}`,background:'transparent',color:'#888',cursor:'pointer'}}>
                  ✏ Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Claims Tab ────────────────────────────────────────────────
function ClaimsTab({showToast}:{showToast:(t:TT)=>void}) {
  const [claims, setClaims] = useState<Claim[]>([])
  const [players, setPlayers] = useState<{id:string;name:string;total_points:number}[]>([])
  const [selPlayer, setSelPlayer] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setClaims(await getClaims())
    const {data} = await supabase.from('public_leaderboard').select('id,name,total_points').gte('total_points',0).order('name')
    setPlayers(data??[])
  }
  useEffect(()=>{load()},[])

  async function handleApprove(id:string) {
    setBusy(true)
    try{await approveClaim(id);showToast({msg:'Claim aprobado',type:'ok'});load()}
    catch(e:any){showToast({msg:'Error',type:'err'})}
    finally{setBusy(false)}
  }

  async function handleCreate() {
    if(!selPlayer){showToast({msg:'Selecciona un jugador',type:'warn'});return}
    setBusy(true)
    try{await processClaim(selPlayer,note);showToast({msg:'Claim registrado',type:'ok'});setSelPlayer('');setNote('');load()}
    catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  const pending = claims.filter(c=>!c.approved)
  const approved = claims.filter(c=>c.approved)

  return (
    <div style={{maxWidth:720}}>
      {/* Register claim manually */}
      <div className="rounded-xl p-5 mb-5" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Registrar Claim Manualmente</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>Jugador</p>
            <select value={selPlayer} onChange={e=>setSelPlayer(e.target.value)}
              className="font-rajdhani w-full" style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13}}>
              <option value="">— Seleccionar —</option>
              {players.map(p=><option key={p.id} value={p.id}>{p.name} ({p.total_points} pts)</option>)}
            </select>
          </div>
          <div>
            <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>Notas (opcional)</p>
            <input value={note} onChange={e=>setNote(e.target.value)}
              className="font-rajdhani w-full" style={{background:VOID,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13}}/>
          </div>
        </div>
        <button onClick={handleCreate} disabled={busy} className="font-cinzel uppercase tracking-wider"
          style={{fontSize:10,padding:'9px 20px',borderRadius:6,background:`${G}20`,border:`1px solid ${GD}`,color:G,cursor:'pointer'}}>
          {busy?'Registrando...':'+ Registrar Claim'}
        </button>
      </div>

      {/* Pending */}
      {pending.length>0 && (
        <div className="rounded-xl overflow-hidden mb-4" style={{background:CARD,border:'1px solid #a0600040'}}>
          <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:'#d09020'}}>⏳ Pendientes de aprobación — {pending.length}</p>
          </div>
          {pending.map((c,i)=>(
            <div key={c.id} className="flex items-center justify-between px-5 py-3"
              style={{borderBottom:i<pending.length-1?'1px solid #0f0f20':'none'}}>
              <div>
                <p className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:14}}>{(c as any).players?.name}</p>
                {c.notes&&<p className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{c.notes}</p>}
                <p className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{c.claimed_at}</p>
              </div>
              <button onClick={()=>handleApprove(c.id)} disabled={busy}
                className="font-cinzel uppercase tracking-wider"
                style={{fontSize:9,padding:'7px 14px',borderRadius:6,background:'#0a2a1a',border:'1px solid #20a060',color:'#40d090',cursor:'pointer'}}>
                ✓ Aprobar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Approved */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
          <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>✓ Aprobados — {approved.length}</p>
        </div>
        {approved.length===0 ? (
          <p className="font-rajdhani text-center" style={{padding:'24px',color:'#333',fontSize:13}}>Sin claims aprobados</p>
        ) : approved.slice(0,30).map((c,i)=>(
          <div key={c.id} className="flex items-center justify-between px-5 py-3"
            style={{borderBottom:i<Math.min(approved.length,30)-1?'1px solid #0f0f20':'none'}}>
            <span className="font-cinzel" style={{color:'#e8e0d0',fontSize:13}}>{(c as any).players?.name}</span>
            <span className="font-rajdhani" style={{fontSize:12,color:'#40d0a0'}}>✓ {c.claimed_at}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Upload Module ─────────────────────────────────────────────
function UploadModule({showToast}:{showToast:(t:TT)=>void}) {
  const [mazeType,setMazeType]=useState<MazeType>('BD')
  const [adminPts,setAdminPts]=useState(0)
  const [eventPts,setEventPts]=useState(0)
  const [rawText,setRawText]=useState('')
  const [imageFile,setImageFile]=useState<File|null>(null)
  const [parsed,setParsed]=useState<{name:string;points:number}[]>([])
  const [busy,setBusy]=useState(false)
  const [ocrBusy,setOcrBusy]=useState(false)
  const fileRef=useRef<HTMLInputElement>(null)
  const share=calcPointShare(5,adminPts,eventPts,parsed.length)

  async function handleOCR(){
    if(!imageFile)return;setOcrBusy(true)
    try{const t=await runOCR(imageFile);setRawText(t);setParsed(parseMazeReport(t));showToast({msg:'OCR completado',type:'ok'})}
    catch{showToast({msg:'OCR falló — usa pegado de texto',type:'err'})}
    finally{setOcrBusy(false)}
  }

  async function handleSubmit(){
    if(parsed.length===0){showToast({msg:'Sin datos',type:'warn'});return}
    setBusy(true)
    try{
      const session=await createMazeSession({maze_type:mazeType,total_points:5,admin_points:adminPts,event_points:eventPts,session_date:new Date().toISOString().split('T')[0],raw_report:rawText})
      for(const entry of parsed){
        const {data:pl}=await supabase.from('players').select('id').ilike('name',entry.name).limit(1)
        if(pl&&pl.length>0) await addPlayerPoints(pl[0].id,session.id,entry.points)
        else await supabase.from('point_alerts').insert({raw_name:entry.name,session_id:session.id})
      }
      showToast({msg:'Sesión guardada',type:'ok'});setRawText('');setParsed([]);setImageFile(null)
      if(fileRef.current)fileRef.current.value=''
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  return (
    <div style={{maxWidth:700}}>
      <div className="rounded-xl p-5 mb-4" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Tipo de Maze</p>
        <div className="flex gap-3 mb-4">
          {([['BD','🐉 Black Dragon','#e05050'],['FV','❄️ Frozen Ville','#4ab8f0']] as const).map(([k,label,col])=>(
            <button key={k} onClick={()=>setMazeType(k as MazeType)} className="font-cinzel uppercase tracking-wider flex-1"
              style={{fontSize:11,padding:'10px',borderRadius:8,border:`1px solid ${mazeType===k?col:BORDER}`,background:mazeType===k?`${col}20`:'transparent',color:mazeType===k?col:'#555',cursor:'pointer'}}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          {[['Puntos Admin (oculto al público)',adminPts,setAdminPts],['Puntos Guild Event',eventPts,setEventPts]].map(([label,val,setter]:any)=>(
            <div key={label}>
              <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>{label}</p>
              <input type="number" min={0} max={5} step={0.1} value={val} onChange={e=>setter(parseFloat(e.target.value)||0)}
                className="font-rajdhani w-full" style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:14}}/>
            </div>
          ))}
        </div>
        {parsed.length>0&&(
          <div className="rounded-lg p-3" style={{background:DEEP,border:`1px solid ${BORDER}`}}>
            <span className="font-rajdhani" style={{color:'#888',fontSize:13}}>Pts/participante: </span>
            <span className="font-cinzel font-bold" style={{color:G,fontSize:20}}>{share}</span>
            <span className="font-rajdhani ml-2" style={{color:'#555',fontSize:12}}>({parsed.length} participantes)</span>
          </div>
        )}
      </div>

      <div className="rounded-xl p-5 mb-4" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-3" style={{fontSize:10,color:GD}}>📷 Subir Foto del Reporte</p>
        <input ref={fileRef} type="file" accept="image/*" onChange={e=>setImageFile(e.target.files?.[0]??null)} className="font-rajdhani w-full mb-3" style={{fontSize:13,color:'#888'}}/>
        {imageFile&&<button onClick={handleOCR} disabled={ocrBusy} className="font-cinzel uppercase tracking-wider"
          style={{fontSize:10,padding:'8px 18px',borderRadius:6,border:`1px solid ${GD}80`,background:`${G}15`,color:G,cursor:'pointer',opacity:ocrBusy?0.6:1}}>
          {ocrBusy?'Procesando...':'Leer con OCR'}
        </button>}
      </div>

      <div className="rounded-xl p-5 mb-4" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-1" style={{fontSize:10,color:GD}}>📋 Pegado Rápido</p>
        <p className="font-rajdhani mb-2" style={{fontSize:12,color:'#555'}}>Formato: NombrePJ 3 / NombrePJ: 2.5</p>
        <textarea rows={7} value={rawText} onChange={e=>setRawText(e.target.value)} placeholder={"Morgan 3\nDragonSlayer 2"} className="font-rajdhani w-full"
          style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'9px 12px',color:'#e8e0d0',fontSize:13,fontFamily:'monospace',resize:'vertical'}}/>
        <button onClick={()=>setParsed(parseMazeReport(rawText))} className="font-cinzel uppercase tracking-wider mt-3"
          style={{fontSize:10,padding:'8px 16px',borderRadius:6,border:`1px solid ${BORDER}`,background:'transparent',color:'#888',cursor:'pointer'}}>
          Parsear texto
        </button>
      </div>

      {parsed.length>0&&(
        <div className="rounded-xl overflow-hidden mb-4 fade-in" style={{background:CARD,border:`1px solid ${BORDER}`}}>
          <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Vista previa — {parsed.length} jugadores</p>
          </div>
          {parsed.map((e,i)=>(
            <div key={i} className="flex justify-between px-5 py-2" style={{borderBottom:i<parsed.length-1?'1px solid #0f0f20':'none'}}>
              <span className="font-rajdhani" style={{color:'#e8e0d0',fontSize:14}}>{e.name}</span>
              <span className="font-cinzel font-bold" style={{color:G,fontSize:14}}>{e.points} pts</span>
            </div>
          ))}
          <div className="p-5">
            <button onClick={handleSubmit} disabled={busy} className="font-cinzel uppercase tracking-widest w-full"
              style={{fontSize:12,padding:'13px',borderRadius:8,background:busy?'#2a2010':`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:busy?GD:VOID,cursor:busy?'not-allowed':'pointer',fontWeight:700}}>
              {busy?'Guardando...':'✓ Guardar Sesión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Alert Card ─────────────────────────────────────────────────
function AlertCard({alert,onResolved}:{alert:PointAlert;onResolved:()=>void}) {
  const [sugg,setSugg]=useState<{name:string;similarity:number}[]>([])
  useEffect(()=>{suggestPlayerName(alert.raw_name).then(setSugg)},[alert.raw_name])
  return (
    <div className="rounded-xl p-4 mb-3" style={{background:'#1a0d00',border:'1px solid #a0600040'}}>
      <p className="font-cinzel uppercase tracking-widest mb-1" style={{fontSize:9,color:'#d09020'}}>⚠ Nombre no encontrado</p>
      <p className="font-cinzel font-bold mb-3" style={{fontSize:18,color:'#e8e0d0'}}>"{alert.raw_name}"</p>
      {sugg.length>0&&<div className="flex flex-wrap gap-2 mb-3">
        {sugg.map(s=><button key={s.name} onClick={()=>resolveAlert(alert.id,'link',s.name).then(onResolved)}
          className="font-rajdhani" style={{fontSize:13,padding:'5px 12px',borderRadius:6,border:`1px solid ${BORDER}`,background:CARD,color:'#e8e0d0',cursor:'pointer'}}>
          {s.name} <span style={{color:'#555',fontSize:11}}>({Math.round(s.similarity*100)}%)</span>
        </button>)}
      </div>}
      <div className="flex gap-2">
        <button onClick={()=>createPlayer(alert.raw_name).then(()=>resolveAlert(alert.id,'create')).then(onResolved)}
          className="font-cinzel uppercase tracking-wider"
          style={{fontSize:10,padding:'7px 14px',borderRadius:6,border:`1px solid ${GD}80`,background:`${G}15`,color:G,cursor:'pointer'}}>
          + Crear PJ
        </button>
        <button onClick={()=>resolveAlert(alert.id,'link').then(onResolved)}
          className="font-rajdhani" style={{fontSize:12,padding:'7px 14px',borderRadius:6,border:`1px solid ${BORDER}`,background:'transparent',color:'#555',cursor:'pointer'}}>
          Ignorar
        </button>
      </div>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────
function UsersTab({showToast}:{showToast:(t:TT)=>void}) {
  const [users,setUsers]=useState<any[]>([])

  async function loadUsers(){
    const{data}=await supabase.from('admin_profiles')
      .select('*, admin_email_map(email)')
      .order('created_at',{ascending:false})
    setUsers(data??[])
  }
  useEffect(()=>{loadUsers()},[])

  return (
    <div style={{maxWidth:720}}>
      <div className="rounded-xl p-5 mb-4" style={{background:CARD,border:`1px solid ${G}30`}}>
        <p className="font-cinzel uppercase tracking-widest mb-3" style={{fontSize:10,color:GD}}>Cómo crear un nuevo Admin / Manager</p>
        <p className="font-rajdhani mb-4" style={{fontSize:13,color:'#aaa',lineHeight:1.8}}>
          Los usuarios entran con <strong style={{color:'#e8e0d0'}}>username</strong> y contraseña (no con email).<br/>
          Sigue estos pasos para crear un nuevo admin:
        </p>
        <div className="space-y-3">
          {[
            ['1','Supabase → Authentication → Users → Add user','Ingresa cualquier email (interno) y la contraseña. Activa Auto Confirm.'],
            ['2','Copia el UID del usuario creado','Aparece en la columna UID de la lista de usuarios.'],
            ['3','Ejecuta este SQL (reemplaza los valores):',''],
          ].map(([n,title,sub])=>(
            <div key={n} className="flex gap-3 items-start">
              <span className="font-cinzel font-bold flex-shrink-0" style={{fontSize:13,color:G,width:20}}>{n}.</span>
              <div>
                <p className="font-rajdhani font-bold" style={{fontSize:13,color:'#e8e0d0'}}>{title}</p>
                {sub&&<p className="font-rajdhani" style={{fontSize:12,color:'#777'}}>{sub}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-4 mt-4" style={{background:VOID,border:`1px solid ${BORDER}`,fontFamily:'monospace',fontSize:12,color:G,lineHeight:1.9}}>
          {`-- 1. Perfil de admin\nINSERT INTO admin_profiles (id, username, role)\nVALUES (\n  'PEGA-EL-UUID-AQUI',\n  'el_username',        -- así va a entrar el usuario\n  'manager'             -- o 'superadmin'\n);\n\n-- 2. Mapa de email (para el login por username)\nINSERT INTO admin_email_map (user_id, email, username)\nVALUES (\n  'PEGA-EL-UUID-AQUI',\n  'el-email@ejemplo.com',  -- el email que pusiste en Auth\n  'el_username'\n);`}
        </div>
      </div>
      {users.length>0&&(
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Admins registrados — {users.length}</p>
          </div>
          {users.map((u,i)=>(
            <div key={u.id} className="flex items-center justify-between px-5 py-3"
              style={{borderBottom:i<users.length-1?'1px solid #0f0f20':'none'}}>
              <div>
                <span className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:14}}>{u.username}</span>
                {u.admin_email_map?.email&&<span className="font-rajdhani ml-2" style={{fontSize:11,color:'#555'}}>{u.admin_email_map.email}</span>}
              </div>
              <span className="font-cinzel uppercase tracking-wider"
                style={{fontSize:9,padding:'3px 10px',borderRadius:20,border:`1px solid ${u.role==='superadmin'?G:BORDER}`,color:u.role==='superadmin'?G:'#888'}}>
                {u.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Admin ─────────────────────────────────────────────────
export default function AdminPage() {
  const [tab,setTab]=useState<Tab>('rankings')
  const [session,setSession]=useState<any>(null)
  const [loading,setLoading]=useState(true)
  const [lb,setLb]=useState<LeaderboardEntry[]>([])
  const [alerts,setAlerts]=useState<PointAlert[]>([])
  const [toast,setToast]=useState<TT|null>(null)
  const [username,setUsername]=useState(''), [password,setPassword]=useState(''), [authErr,setAuthErr]=useState('')
  const showToast=(t:TT)=>setToast(t)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    supabase.auth.onAuthStateChange((_,s)=>setSession(s))
  },[])
  useEffect(()=>{
    if(!session)return
    getAdminLeaderboard().then(setLb)
    getPendingAlerts().then(setAlerts)
  },[session])

  async function handleLogin(e:React.FormEvent){
    e.preventDefault(); setAuthErr('')
    try {
      // 1. Buscar admin_profile por username para obtener el ID
      const {data:profile, error:pErr} = await supabase
        .from('admin_profiles').select('id,username,role').eq('username', username.toLowerCase().trim()).single()
      if (pErr || !profile) { setAuthErr('Usuario no encontrado'); return }

      // 2. El email está guardado en admin_profiles (columna email que vamos a agregar)
      // Por ahora usamos el email_map que guardamos en la tabla
      const {data:emailRow} = await supabase
        .from('admin_email_map').select('email').eq('user_id', profile.id).single()
      if (!emailRow) { setAuthErr('Credenciales no configuradas. Contacta al SuperAdmin.'); return }

      // 3. Login con email real + password
      const {error:loginErr} = await supabase.auth.signInWithPassword({
        email: emailRow.email, password
      })
      if (loginErr) setAuthErr('Contraseña incorrecta')
    } catch(err:any) {
      setAuthErr('Error al iniciar sesión')
    }
  }

  if(loading) return <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="font-cinzel" style={{color:GD}}>Cargando...</div></div>

  if(!session) return (
    <div style={{minHeight:'100vh',background:VOID,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div className="text-center mb-8">
          <div style={{fontSize:44,marginBottom:10}}>🐉</div>
          <h1 className="font-cinzel font-black text-gold-gradient" style={{fontSize:24,letterSpacing:'0.12em'}}>THE ORIGINALS</h1>
          <p className="font-cinzel uppercase tracking-widest mt-1" style={{fontSize:9,color:GD}}>Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:24}}>
          <div style={{marginBottom:14}}>
            <p className="font-cinzel uppercase tracking-widest mb-1" style={{fontSize:9,color:GD}}>Usuario</p>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} required
              autoComplete="username" placeholder="jcwhite"
              className="font-rajdhani w-full"
              style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'10px 14px',color:'#e8e0d0',fontSize:15}}/>
          </div>
          <div style={{marginBottom:14}}>
            <p className="font-cinzel uppercase tracking-widest mb-1" style={{fontSize:9,color:GD}}>Contraseña</p>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
              autoComplete="current-password"
              className="font-rajdhani w-full"
              style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'10px 14px',color:'#e8e0d0',fontSize:15}}/>
          </div>
          {authErr&&<p className="font-rajdhani mb-3" style={{color:'#e04040',fontSize:13}}>{authErr}</p>}
          <button type="submit" className="font-cinzel uppercase tracking-widest w-full"
            style={{fontSize:12,padding:14,borderRadius:8,background:`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:VOID,cursor:'pointer',fontWeight:700}}>
            Ingresar
          </button>
        </form>
        <div className="text-center mt-4">
          <a href="/dashboard" className="font-rajdhani" style={{color:'#555',fontSize:13}}>← Dashboard público</a>
        </div>
      </div>
    </div>
  )

  const pendingAlerts=alerts.filter(a=>!a.resolved).length
  const TABS=[
    {key:'rankings'  as Tab,label:'📊 Rankings'},
    {key:'players'   as Tab,label:'👥 Jugadores'},
    {key:'upload'    as Tab,label:'📤 Cargar Maze'},
    {key:'claims'    as Tab,label:'🏆 Claims'},
    {key:'fv'        as Tab,label:'❄️ Frozen Ville'},
    {key:'anuncios'  as Tab,label:'📢 Anuncios'},
    {key:'alerts'    as Tab,label:'⚠ Alertas',badge:pendingAlerts},
    {key:'events'    as Tab,label:'🎪 Eventos'},
    {key:'users'     as Tab,label:'🔑 Usuarios'},
  ]

  return (
    <div style={{minHeight:'100vh',background:VOID}}>
      {toast&&<Toast t={toast} onClose={()=>setToast(null)}/>}
      <header style={{background:`linear-gradient(180deg,#0a0010 0%,${VOID} 100%)`,borderBottom:'1px solid #c9a84c30'}}>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'18px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div className="flex items-center gap-3">
            <span style={{fontSize:22}}>🐉</span>
            <span className="font-cinzel font-black text-gold-gradient" style={{fontSize:18,letterSpacing:'0.1em'}}>THE ORIGINALS — ADMIN</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-rajdhani" style={{color:'#555',fontSize:13}}>{session.user.email}</span>
            <button onClick={()=>supabase.auth.signOut()} className="font-cinzel uppercase tracking-widest"
              style={{fontSize:9,color:'#555',border:`1px solid ${BORDER}`,padding:'6px 12px',borderRadius:5,background:'none',cursor:'pointer'}}>Salir</button>
          </div>
        </div>
      </header>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px'}}>
        <div className="flex gap-1 mb-6 flex-wrap">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} className="font-cinzel uppercase tracking-wider relative"
              style={{fontSize:9,padding:'8px 16px',borderRadius:7,cursor:'pointer',border:`1px solid ${tab===t.key?G:BORDER}`,background:tab===t.key?`${G}18`:CARD,color:tab===t.key?G:'#888'}}>
              {t.label}
              {t.badge!=null&&t.badge>0&&<span className="font-rajdhani font-bold" style={{position:'absolute',top:-6,right:-6,background:'#d09020',color:VOID,borderRadius:'50%',width:16,height:16,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {tab==='rankings'&&(
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
            <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
              <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Rankings Admin — con Admin Points</p>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                    {['#','Owner / PJs','🐉 BD','❄️ FV','★ Admin','Total','Claims'].map((h,i)=>(
                      <th key={h} className="font-cinzel uppercase tracking-widest"
                        style={{padding:'9px 14px',textAlign:i===0?'center':i>=2?'right':'left',fontSize:9,color:i===4?GD:'#555',fontWeight:600}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lb.map((p,i)=>(
                    <tr key={p.id} style={{borderBottom:'1px solid #0f0f20'}}>
                      <td className="font-cinzel text-center" style={{padding:'10px 14px',color:'#555',fontSize:12}}>{i+1}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span className="font-cinzel" style={{color:'#e8e0d0',fontSize:13}}>{p.name}</span>
                        {p.chars&&<div className="font-rajdhani" style={{fontSize:11,color:'#555'}}>{p.chars}</div>}
                      </td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'10px 14px',color:'#e05050',fontSize:14}}>{p.bd_points}</td>
                      <td className="font-rajdhani font-bold text-right" style={{padding:'10px 14px',color:'#4ab8f0',fontSize:14}}>{p.fv_points}</td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'10px 14px',color:G,fontSize:14}}>{(p as any).admin_points_total??0}</td>
                      <td className="font-cinzel font-bold text-right" style={{padding:'10px 14px',color:'#e8e0d0',fontSize:15}}>{p.total_points}</td>
                      <td className="font-rajdhani text-right" style={{padding:'10px 14px',color:'#40d0a0',fontSize:13}}>{p.total_claims}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab==='players'&&<PlayersTab showToast={showToast}/>}
        {tab==='upload'&&<UploadModule showToast={showToast}/>}
        {tab==='claims'&&<ClaimsTab showToast={showToast}/>}
        {tab==='alerts'&&(
          <div style={{maxWidth:720}}>
            {alerts.filter(a=>!a.resolved).length===0
              ?<div className="text-center rounded-xl py-14" style={{background:CARD,border:`1px solid ${BORDER}`}}>
                <p className="font-cinzel uppercase tracking-widest" style={{fontSize:11,color:'#333'}}>✓ Sin alertas pendientes</p>
              </div>
              :alerts.filter(a=>!a.resolved).map(a=><AlertCard key={a.id} alert={a} onResolved={()=>getPendingAlerts().then(setAlerts)}/>)
            }
          </div>
        )}
        {tab==='events'&&(
          <div className="text-center rounded-xl py-14" style={{background:CARD,border:`1px solid ${BORDER}`}}>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:11,color:'#333'}}>Módulo Eventos — próximamente</p>
          </div>
        )}
        {tab==='anuncios'&&<AnnouncementsTab showToast={showToast}/>}
        {tab==='fv'&&<FVTab showToast={showToast}/>}
        {tab==='users'&&<UsersTab showToast={showToast}/>}
      </div>
    </div>
  )
}

// ── Announcements Tab ─────────────────────────────────────────
function AnnouncementsTab({showToast}:{showToast:(t:any)=>void}) {
  const [items,setItems]=useState<Announcement[]>([])
  const [title,setTitle]=useState(''), [content,setContent]=useState('')
  const [imageUrl,setImageUrl]=useState(''), [pinned,setPinned]=useState(false)
  const [busy,setBusy]=useState(false)

  async function load(){setItems(await getAnnouncements())}
  useEffect(()=>{load()},[])

  async function handleCreate(){
    if(!title.trim()){showToast({msg:'El título es requerido',type:'warn'});return}
    setBusy(true)
    try{
      await createAnnouncement({title,content:content||undefined,image_url:imageUrl||undefined,pinned})
      showToast({msg:'Anuncio publicado',type:'ok'})
      setTitle('');setContent('');setImageUrl('');setPinned(false);load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  async function handleDelete(id:string){
    await deleteAnnouncement(id);showToast({msg:'Eliminado',type:'ok'});load()
  }

  return (
    <div style={{maxWidth:700}}>
      <div className="rounded-xl p-5 mb-5" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Nuevo Anuncio</p>
        <div className="space-y-3">
          <div>
            <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>Título *</p>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="font-rajdhani w-full"
              style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:14}}/>
          </div>
          <div>
            <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>Contenido / Texto</p>
            <textarea rows={4} value={content} onChange={e=>setContent(e.target.value)} className="font-rajdhani w-full"
              style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13,resize:'vertical'}}/>
          </div>
          <div>
            <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>URL de imagen (opcional)</p>
            <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..."
              className="font-rajdhani w-full"
              style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13}}/>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/>
            <span className="font-rajdhani" style={{fontSize:13,color:'#888'}}>📌 Fijar anuncio</span>
          </label>
          <button onClick={handleCreate} disabled={busy} className="font-cinzel uppercase tracking-widest"
            style={{fontSize:10,padding:'10px 24px',borderRadius:7,background:`linear-gradient(135deg,#8a6020,#c9a84c)`,border:'none',color:VOID,cursor:'pointer',fontWeight:700,opacity:busy?0.6:1}}>
            {busy?'Publicando...':'+ Publicar Anuncio'}
          </button>
        </div>
      </div>

      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
        <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
          <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Anuncios publicados — {items.length}</p>
        </div>
        {items.length===0
          ? <p className="font-rajdhani text-center" style={{padding:'28px',color:'#333',fontSize:13}}>Sin anuncios</p>
          : items.map((a,i)=>(
            <div key={a.id} className="flex items-start justify-between px-5 py-4"
              style={{borderBottom:i<items.length-1?'1px solid #0f0f20':'none'}}>
              <div>
                {a.pinned&&<span className="font-cinzel uppercase tracking-wider" style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:`${G}20`,border:`1px solid ${GD}`,color:G,marginRight:8}}>📌</span>}
                <span className="font-cinzel font-semibold" style={{color:'#e8e0d0',fontSize:14}}>{a.title}</span>
                {a.content&&<p className="font-rajdhani mt-1" style={{fontSize:12,color:'#666'}}>{a.content.slice(0,80)}{a.content.length>80?'...':''}</p>}
                {a.image_url&&<p className="font-rajdhani mt-1" style={{fontSize:10,color:'#4ab8f0'}}>📷 Con imagen</p>}
              </div>
              <button onClick={()=>handleDelete(a.id)} className="font-rajdhani"
                style={{fontSize:11,padding:'5px 12px',borderRadius:5,border:'1px solid #a0202040',background:'#2a0a0a',color:'#e04040',cursor:'pointer',whiteSpace:'nowrap',marginLeft:12}}>
                Eliminar
              </button>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── FV Tab — Puntos y Claims por runa ─────────────────────────
const FV_RUNES_ADMIN = [
  {key:'curse',    label:'Curse'},
  {key:'illusory', label:'Illusory'},
  {key:'piercing', label:'Piercing'},
  {key:'riven',    label:'Riven Soul'},
  {key:'favor',    label:'Favor'},
  {key:'prayer',   label:'Prayer'},
  {key:'scroll_ring', label:'Scroll Ring'},
] as const

function FVTab({showToast}:{showToast:(t:any)=>void}) {
  const [players,setPlayers]=useState<Player[]>([])
  const [fvData,setFvData]=useState<Record<string,any>>({})
  const [selId,setSelId]=useState('')
  const [edits,setEdits]=useState<Record<string,number>>({})
  const [busy,setBusy]=useState(false)
  const [fvDate,setFvDate]=useState('')

  async function load(){
    const pl=await getAllPlayers(); setPlayers(pl)
    const {data}=await supabase.from('fv_rune_points').select('*, players(name)')
    const map:Record<string,any>={}
    ;(data??[]).forEach((r:any)=>{ map[r.player_id]=r })
    setFvData(map)
  }
  useEffect(()=>{load()},[])

  async function handleSave(){
    if(!selId){showToast({msg:'Selecciona un jugador',type:'warn'});return}
    setBusy(true)
    try{
      await upsertFVRunePoints(selId,edits)
      showToast({msg:'FV points guardados',type:'ok'});setEdits({});load()
    }catch(e:any){showToast({msg:'Error: '+e.message,type:'err'})}
    finally{setBusy(false)}
  }

  async function handleUpdateDate(){
    if(!fvDate){showToast({msg:'Selecciona una fecha',type:'warn'});return}
    await updateReportDate('FV',fvDate)
    showToast({msg:'Fecha FV actualizada',type:'ok'})
  }

  const selPlayer=players.find(p=>p.id===selId)
  const currentFV=selId?fvData[selId]:null

  return (
    <div style={{maxWidth:900}}>
      {/* Fecha reporte FV */}
      <div className="rounded-xl p-4 mb-4 flex items-center gap-3" style={{background:CARD,border:'1px solid #4ab8f030'}}>
        <span className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:'#4ab8f0'}}>Último reporte FV:</span>
        <input type="date" value={fvDate} onChange={e=>setFvDate(e.target.value)}
          style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'5px 10px',color:'#e8e0d0',fontSize:13}}/>
        <button onClick={handleUpdateDate} className="font-cinzel uppercase tracking-wider"
          style={{fontSize:9,padding:'7px 14px',borderRadius:5,background:'#4ab8f020',border:'1px solid #4ab8f060',color:'#4ab8f0',cursor:'pointer'}}>
          Actualizar
        </button>
      </div>

      {/* Editor por jugador */}
      <div className="rounded-xl p-5 mb-5" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Editar puntos FV por jugador</p>
        <div className="mb-4">
          <p className="font-rajdhani mb-1" style={{fontSize:11,color:'#888'}}>Jugador</p>
          <select value={selId} onChange={e=>{setSelId(e.target.value);setEdits({})}}
            className="font-rajdhani" style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:5,padding:'7px 10px',color:'#e8e0d0',fontSize:13,width:280}}>
            <option value="">— Seleccionar —</option>
            {players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selId&&(
          <div className="grid grid-cols-3 gap-3 mb-4">
            {FV_RUNES_ADMIN.map(r=>(
              <div key={r.key} className="rounded-lg p-3" style={{background:DEEP,border:`1px solid ${BORDER}`}}>
                <p className="font-cinzel uppercase tracking-wider mb-2" style={{fontSize:9,color:'#888'}}>{r.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[['_avail','Pts Disp.'],['_claims','Claims']].map(([suffix,lbl])=>(
                    <div key={suffix}>
                      <p className="font-rajdhani" style={{fontSize:10,color:'#666'}}>{lbl}</p>
                      <input type="number" step="0.0001" min="0"
                        value={edits[`${r.key}${suffix}`]??currentFV?.[`${r.key}${suffix}`]??0}
                        onChange={e=>setEdits(d=>({...d,[`${r.key}${suffix}`]:parseFloat(e.target.value)||0}))}
                        className="font-rajdhani w-full" style={{background:'#04040e',border:`1px solid ${BORDER}`,borderRadius:4,padding:'5px 7px',color:'#e8e0d0',fontSize:12}}/>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSave} disabled={busy||!selId} className="font-cinzel uppercase tracking-widest"
          style={{fontSize:10,padding:'10px 24px',borderRadius:7,background:`${G}20`,border:`1px solid ${GD}`,color:G,cursor:'pointer',opacity:(busy||!selId)?0.5:1}}>
          {busy?'Guardando...':'✓ Guardar FV Points'}
        </button>
      </div>

      {/* Tabla resumen FV */}
      <div style={{background:CARD,border:'1px solid #4ab8f030',borderRadius:12,overflow:'hidden'}}>
        <div className="px-5 py-3" style={{borderBottom:'1px solid #4ab8f020'}}>
          <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:'#4ab8f0'}}>Resumen FV — todos los jugadores</p>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid #081010'}}>
                <th className="font-cinzel text-left" style={{padding:'7px 12px',fontSize:8,color:'#555'}}>Jugador</th>
                {FV_RUNES_ADMIN.map(r=>(
                  <th key={r.key} colSpan={2} className="font-cinzel text-center uppercase" style={{padding:'7px 8px',fontSize:8,color:'#888',borderLeft:'1px solid #1a1a3a'}}>{r.label}</th>
                ))}
              </tr>
              <tr style={{borderBottom:'1px solid #081010',background:'#060a0a'}}>
                <th/>
                {FV_RUNES_ADMIN.map(r=>(
                  <><th key={`${r.key}a`} className="font-cinzel text-right" style={{padding:'3px 6px',fontSize:7,color:'#666',borderLeft:'1px solid #1a1a3a'}}>Pts</th>
                  <th key={`${r.key}c`} className="font-cinzel text-right" style={{padding:'3px 6px',fontSize:7,color:'#666'}}>Claims</th></>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p,i)=>{
                const fv=fvData[p.id]
                return (
                  <tr key={p.id} style={{borderBottom:'1px solid #081010'}}>
                    <td className="font-cinzel" style={{padding:'8px 12px',color:'#e8e0d0',fontSize:12}}>{p.name}</td>
                    {FV_RUNES_ADMIN.map(r=>(
                      <><td key={`${r.key}a`} className="font-rajdhani text-right" style={{padding:'8px 6px',color:'#4ab8f0',fontSize:12,borderLeft:'1px solid #1a1a3a'}}>
                        {fv?.[`${r.key}_avail`]?.toFixed(2)??'—'}
                      </td>
                      <td key={`${r.key}c`} className="font-rajdhani text-right" style={{padding:'8px 6px',color:'#40d0a0',fontSize:12}}>
                        {fv?.[`${r.key}_claims`]??'—'}
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
