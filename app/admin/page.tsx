'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'
import {
  supabase, getAdminLeaderboard, getAllPlayers, getPendingAlerts,
  getClaims, approveClaim, processClaim, resolveAlert, createMazeSession,
  addPlayerPoints, createPlayer, updatePlayer, suggestPlayerName,
  LeaderboardEntry, Player, PointAlert, Claim, MazeType
} from '@/lib/supabase'
import { parseMazeReport, calcPointShare, runOCR } from '@/lib/ocr'

type Tab = 'rankings'|'players'|'upload'|'claims'|'alerts'|'events'|'users'
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
  const [email,setEmail]=useState(''),  [pass,setPass]=useState('')
  const [uname,setUname]=useState(''),  [role,setRole]=useState<'manager'|'superadmin'>('manager')
  const [busy,setBusy]=useState(false)

  async function loadUsers(){const{data}=await supabase.from('admin_profiles').select('*').order('created_at',{ascending:false});setUsers(data??[])}
  useEffect(()=>{loadUsers()},[])

  return (
    <div style={{maxWidth:700}}>
      <div className="rounded-xl p-5 mb-4" style={{background:CARD,border:`1px solid ${BORDER}`}}>
        <p className="font-cinzel uppercase tracking-widest mb-4" style={{fontSize:10,color:GD}}>Pasos para crear Admin / Manager</p>
        <p className="font-rajdhani mb-3" style={{fontSize:13,color:'#888',lineHeight:1.7}}>
          1. Ve a Supabase → Authentication → Users → <strong style={{color:'#e8e0d0'}}>Add user</strong><br/>
          2. Ingresa email y contraseña del nuevo admin<br/>
          3. Activa "Auto Confirm User" → Create<br/>
          4. Copia el UID del usuario creado<br/>
          5. Ejecuta en SQL Editor:
        </p>
        <div className="rounded-lg p-4 font-mono" style={{background:VOID,border:`1px solid ${BORDER}`,fontSize:12,color:G,lineHeight:1.8}}>
          {"INSERT INTO admin_profiles (id, username, role)\nVALUES (\n  'PEGA-EL-UUID-AQUI',\n  'nombre_usuario',\n  'manager'  -- o superadmin\n);"}
        </div>
      </div>
      {users.length>0&&(
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
          <div className="px-5 py-3" style={{borderBottom:`1px solid ${BORDER}`}}>
            <p className="font-cinzel uppercase tracking-widest" style={{fontSize:10,color:GD}}>Admins registrados</p>
          </div>
          {users.map((u,i)=>(
            <div key={u.id} className="flex items-center justify-between px-5 py-3"
              style={{borderBottom:i<users.length-1?'1px solid #0f0f20':'none'}}>
              <span className="font-cinzel" style={{color:'#e8e0d0',fontSize:14}}>{u.username}</span>
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
  const [email,setEmail]=useState(''),  [password,setPassword]=useState(''),  [authErr,setAuthErr]=useState('')
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
    e.preventDefault();setAuthErr('')
    const{error}=await supabase.auth.signInWithPassword({email,password})
    if(error)setAuthErr(error.message)
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
          {[['Email',email,setEmail,'email'],['Contraseña',password,setPassword,'password']].map(([l,v,s,t]:any)=>(
            <div key={l} style={{marginBottom:14}}>
              <p className="font-cinzel uppercase tracking-widest mb-1" style={{fontSize:9,color:GD}}>{l}</p>
              <input type={t} value={v} onChange={(e:any)=>s(e.target.value)} required className="font-rajdhani w-full"
                style={{background:DEEP,border:`1px solid ${BORDER}`,borderRadius:6,padding:'10px 14px',color:'#e8e0d0',fontSize:15}}/>
            </div>
          ))}
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
    {key:'rankings' as Tab,label:'📊 Rankings'},
    {key:'players'  as Tab,label:'👥 Jugadores'},
    {key:'upload'   as Tab,label:'📤 Cargar Maze'},
    {key:'claims'   as Tab,label:'🏆 Claims'},
    {key:'alerts'   as Tab,label:'⚠ Alertas',badge:pendingAlerts},
    {key:'events'   as Tab,label:'🎪 Eventos'},
    {key:'users'    as Tab,label:'🔑 Usuarios'},
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
        {tab==='users'&&<UsersTab showToast={showToast}/>}
      </div>
    </div>
  )
}
