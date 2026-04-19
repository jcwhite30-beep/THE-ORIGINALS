// app/api/discord/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function norm(s:string){return s.replace(/\*/g,'').toLowerCase().trim()}
function lev(a:string,b:string):number{
  const m=a.length,n=b.length
  const d=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0))
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1])
  return d[m][n]
}
function sim(a:string,b:string):number{const s1=norm(a),s2=norm(b);if(s1===s2)return 1;const mx=Math.max(s1.length,s2.length);return mx===0?1:1-lev(s1,s2)/mx}

async function findPlayer(raw:string){
  const{data:players}=await supabase.from('players').select('id,name,chars').eq('is_active',true)
  if(!players)return null
  let best:{id:string;name:string;score:number}|null=null
  for(const p of players){
    const ns=sim(raw,p.name);if(ns>(best?.score??0))best={id:p.id,name:p.name,score:ns}
    for(const ch of(p.chars||'').split(/[,;\/]/)){const cs=sim(raw,ch.trim());if(cs>(best?.score??0))best={id:p.id,name:p.name,score:cs}}
  }
  return best&&best.score>=0.70?best:null
}

async function visionExtract(imageUrl:string){
  const buf=await fetch(imageUrl).then(r=>r.arrayBuffer())
  const b64=Buffer.from(buf).toString('base64')
  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
      {type:'text',text:`Tales of Pirates maze report. Extract all participant character names. Respond ONLY with JSON (no markdown):
{"mazeType":"BD or FV or unknown","sessionDate":"YYYY-MM-DD or null","names":[{"rawName":"Morgan","isSupport":false}]}
isSupport=true if name has * suffix.`}
    ]}]})
  })
  const data=await res.json()
  try{return JSON.parse((data.content?.[0]?.text??'{}').replace(/\`\`\`json|\`\`\`/g,'').trim())}
  catch{return{mazeType:'unknown',sessionDate:null,names:[]}}
}

async function saveMaze(names:{rawName:string;isSupport:boolean}[],mazeType:'BD'|'FV',sessionDate:string,by:string){
  const seen=new Set<string>()
  const unique=names.filter(n=>{const k=norm(n.rawName);if(seen.has(k))return false;seen.add(k);return true})
  if(!unique.length)return{reply:'⚠️ Sin participantes válidos.'}
  const pts=parseFloat((5/unique.length).toFixed(4))
  const{data:sess,error:sErr}=await supabase.from('maze_sessions').insert({
    maze_type:mazeType,total_points:5,admin_points:0,event_points:0,session_date:sessionDate,
    raw_report:`Discord: ${by} — ${unique.map(n=>n.rawName).join(', ')}`
  }).select('id').single()
  if(sErr||!sess)return{reply:'❌ Error creando sesión.'}
  const matched:string[]=[],notFound:string[]=[],seenIds=new Set<string>()
  for(const entry of unique){
    const player=await findPlayer(entry.rawName)
    if(player&&!seenIds.has(player.id)){
      seenIds.add(player.id)
      await supabase.from('player_points').insert({player_id:player.id,session_id:sess.id,points:pts})
      const{data:cur}=await supabase.from('players').select('total_score,available_pts').eq('id',player.id).single()
      if(cur)await supabase.from('players').update({total_score:Number(cur.total_score)+pts,available_pts:Number(cur.available_pts)+pts}).eq('id',player.id)
      await supabase.from('maze_attendance').upsert({session_id:sess.id,player_id:player.id,attended:true,points_earned:pts,is_support:entry.isSupport})
      matched.push(`${entry.rawName}${entry.isSupport?' ★':''}  →  ${player.name}`)
    }else if(!player){
      notFound.push(entry.rawName)
      await supabase.from('point_alerts').insert({raw_name:entry.rawName,session_id:sess.id})
    }
  }
  await supabase.from('report_dates').upsert({maze_type:mazeType,last_date:sessionDate})
  return{reply:[
    `✅ **Maze ${mazeType} — ${sessionDate}**`,
    `📊 **${matched.length} jugadores · ${pts} pts c/u**`,
    matched.slice(0,12).map(m=>`✓ ${m}`).join('\n'),
    matched.length>12?`_...y ${matched.length-12} más_`:'',
    notFound.length>0?`\n⚠️ **Sin registro** (revisar en el panel):\n${notFound.map(n=>`• ${n}`).join('\n')}`:'' ,
    `\n_Por: ${by}_`
  ].filter(Boolean).join('\n')}
}

export async function POST(req:NextRequest){
  if(req.headers.get('x-bot-secret')!==process.env.DISCORD_BOT_SECRET)
    return NextResponse.json({error:'Unauthorized'},{status:401})
  let body:any
  try{body=await req.json()}catch{return NextResponse.json({error:'Bad request'},{status:400})}
  const{type,content,imageUrl,mazeType,sessionDate,authorName,channelName}=body
  const date=sessionDate||new Date().toISOString().split('T')[0]

  // /ranking
  if(type==='command'&&content?.startsWith('/ranking')){
    const{data:lb}=await supabase.from('public_leaderboard').select('name,available_points,claims_available,total_claims').order('available_points',{ascending:false}).limit(10)
    if(!lb?.length)return NextResponse.json({reply:'Sin datos aún.'})
    const medals=['🥇','🥈','🥉']
    return NextResponse.json({reply:`📊 **TOP 10 — THE ORIGINALS**\n\n${lb.map((p,i)=>`${medals[i]??`${i+1}.`} **${p.name}** — ${Number(p.available_points).toFixed(2)} pts · ${p.claims_available} claims disp.`).join('\n')}`})
  }

  // /puntos
  if(type==='command'&&content?.startsWith('/puntos')){
    const pName=content.replace('/puntos','').trim()
    const player=await findPlayer(pName)
    if(!player)return NextResponse.json({reply:`❌ \`${pName}\` no encontrado.`})
    const{data:p}=await supabase.from('public_leaderboard').select('*').eq('id',player.id).single()
    if(!p)return NextResponse.json({reply:'❌ Error.'})
    return NextResponse.json({reply:`👤 **${p.name}**\n💰 Pts: **${Number(p.available_points).toFixed(2)}**\n🏆 Claims disp.: **${p.claims_available}**\n✅ Claims realizados: **${p.total_claims}**`})
  }

  // /claim — formato Discord: "@nombre claim N loots" o "!claim nombre N"
  if(type==='command'&&content?.startsWith('/claim')){
    // Parse: /claim mention qty [alias] — viene del bot ya parseado
    const parts = content.replace('/claim','').trim().split('|')
    // parts[0] = player name/mention, parts[1] = qty, parts[2] = alias (opcional)
    const rawName = (parts[0]||'').trim()
    const qty = Math.max(1, parseInt(parts[1]||'1')||1)
    const alias = (parts[2]||'').trim()||null
    if(!rawName) return NextResponse.json({reply:'Uso: `!claim @jugador N loots`'})
    
    // Try alias first, then rawName
    const searchName = alias || rawName
    const player = await findPlayer(searchName) || (alias ? await findPlayer(rawName) : null)
    if(!player) return NextResponse.json({reply:`❌ Jugador \`${searchName}\` no encontrado. ¿Está registrado en el sistema?`})
    
    const ptsTotal = qty * 5
    const{data:cur}=await supabase.from('players').select('available_pts').eq('id',player.id).single()
    const avail = Number(cur?.available_pts??0)
    
    if(!cur||avail<ptsTotal){
      return NextResponse.json({reply:[
        `❌ **${player.name}** — puntos insuficientes para ${qty} claim(s)`,
        `💰 Disponible: **${avail.toFixed(2)} pts** — Necesita: **${ptsTotal} pts** (${qty} × 5)`,
        avail>=5?`ℹ️ Puede hacer máximo **${Math.floor(avail/5)}** claim(s) con sus puntos actuales.`:''
      ].filter(Boolean).join('\n')})
    }
    
    // Register all N claims
    const claimsToInsert = Array.from({length:qty}, ()=>({
      player_id: player.id, pts_used: 5,
      notes: `Discord claim (${mazeType||'BD'}) por ${authorName}`,
      approved: false
    }))
    await supabase.from('claims').insert(claimsToInsert)
    await supabase.from('players').update({available_pts: avail - ptsTotal}).eq('id',player.id)
    
    return NextResponse.json({reply:[
      `🏆 **${qty} claim(s) registrado(s) — ${player.name}**`,
      `💰 Descontado: **${ptsTotal} pts** (${qty} × 5)`,
      `💰 Restante: **${(avail-ptsTotal).toFixed(2)} pts**`,
      `⏳ Pendiente de aprobación en el panel admin.`
    ].join('\n')})
  }

  // boss kill
  if(type==='boss_kill'){
    const bType=channelName?.includes('frozen')||channelName?.includes('fv')?'FV':'BD'
    await supabase.from('boss_posts').insert({boss_type:bType,player_name:authorName,kill_date:date,notes:content||null})
    return NextResponse.json({reply:null})
  }

  // image
  if(type==='image'&&imageUrl){
    const ex=await visionExtract(imageUrl)
    if(!ex.names?.length)return NextResponse.json({reply:'⚠️ No se detectaron nombres. Intenta con texto.'})
    const mType=(mazeType||ex.mazeType==='unknown'?'BD':ex.mazeType) as 'BD'|'FV'
    const{reply}=await saveMaze(ex.names,mType,ex.sessionDate||date,authorName)
    return NextResponse.json({reply})
  }

  // text report
  if(type==='report'&&content){
    const names=content.split('\n').map((l:string)=>l.trim()).filter((l:string)=>l.length>1)
      .map((line:string)=>({rawName:line.replace(/\*/g,'').trim(),isSupport:line.includes('*')}))
      .filter((n:{rawName:string})=>n.rawName.length>0)
    if(names.length<2)return NextResponse.json({reply:'⚠️ Muy pocos nombres. Uno por línea.'})
    const{reply}=await saveMaze(names,(mazeType||'BD') as 'BD'|'FV',date,authorName)
    return NextResponse.json({reply})
  }

  // mark_processed — bot tells us a message was handled
  if(type==='mark_processed'&&body.messageId){
    await supabase.from('discord_processed_messages').upsert({
      message_id: body.messageId,
      channel_name: channelName||'',
      status: 'processed'
    }).catch(()=>{})
    return NextResponse.json({ok:true})
  }

  return NextResponse.json({reply:'❓ No reconocido.'})
}
export async function GET(){return NextResponse.json({status:'ok',service:'The Originals Discord Bot Webhook'})}
