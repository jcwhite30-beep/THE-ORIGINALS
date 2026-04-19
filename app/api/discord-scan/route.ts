// app/api/discord-scan/route.ts
// Called by the bot when admin requests a channel scan
// Reads Discord message history and detects unregistered reports
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DISCORD_API = 'https://discord.com/api/v10'
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN

// ── Fetch messages from Discord REST API ─────────────────────
async function fetchDiscordMessages(channelId: string, limit = 100) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` }
  })
  if (!res.ok) throw new Error(`Discord API error: ${res.status}`)
  return res.json()
}

// ── Check if a message_id was already processed ───────────────
async function isProcessed(messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from('discord_processed_messages')
    .select('message_id').eq('message_id', messageId).single()
  return !!data
}

// ── Detect if message looks like a maze report ────────────────
function detectReportContent(content: string, channelName: string): {
  looksLikeReport: boolean
  mazeType: 'BD' | 'FV'
  names: string[]
  sessionDate: string | null
} {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  
  // Names: lines with 2-25 chars, only letters/numbers/symbols
  const nameLines = lines.filter(l => /^[A-Za-z0-9_\*\(\)\s]{2,25}$/.test(l) && l.split(' ').length <= 3)
  
  // Must have at least 3 name-like lines
  const looksLikeReport = nameLines.length >= 3

  // Detect maze type from channel or content
  const ch = channelName.toLowerCase()
  const ct = content.toLowerCase()
  const mazeType: 'BD' | 'FV' =
    ch.includes('frozen') || ch.includes('fv') || ct.includes('frozen') ? 'FV' : 'BD'

  // Detect date
  let sessionDate: string | null = null
  const m1 = content.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m1) {
    const [, d, mo, y] = m1
    const year = y.length === 2 ? '20' + y : y
    sessionDate = `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  return { looksLikeReport, mazeType, names: nameLines, sessionDate }
}

// ── Use Claude Vision to detect names in image ────────────────
async function visionDetect(imageUrl: string): Promise<{ names: string[]; mazeType: string; sessionDate: string | null }> {
  const buf = await fetch(imageUrl).then(r => r.arrayBuffer())
  const b64 = Buffer.from(buf).toString('base64')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: `Is this a Tales of Pirates maze report? If yes, extract participant names.
Respond ONLY with JSON: {"isReport":true/false,"mazeType":"BD/FV/unknown","sessionDate":"YYYY-MM-DD or null","names":["name1","name2"]}` }
      ]}]
    })
  })
  const data = await res.json()
  try {
    const parsed = JSON.parse((data.content?.[0]?.text ?? '{}').replace(/```json|```/g, '').trim())
    if (!parsed.isReport) return { names: [], mazeType: 'unknown', sessionDate: null }
    return { names: parsed.names ?? [], mazeType: parsed.mazeType ?? 'unknown', sessionDate: parsed.sessionDate ?? null }
  } catch {
    return { names: [], mazeType: 'unknown', sessionDate: null }
  }
}

// ── Main handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (req.headers.get('x-bot-secret') !== process.env.DISCORD_BOT_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { channelId, channelName, limit = 50 } = await req.json()
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

  try {
    const messages = await fetchDiscordMessages(channelId, Math.min(limit, 100))
    const found: any[] = []
    const skipped: number[] = []

    for (const msg of messages) {
      // Skip bots
      if (msg.author?.bot) continue

      // Skip already processed
      if (await isProcessed(msg.id)) { skipped.push(msg.id); continue }

      const content = msg.content ?? ''
      const author  = msg.member?.nick || msg.author?.global_name || msg.author?.username || 'Unknown'
      const msgDate = msg.timestamp?.split('T')[0] ?? new Date().toISOString().split('T')[0]

      // Check for image attachment
      const image = (msg.attachments ?? []).find((a: any) =>
        a.content_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(a.filename ?? '')
      )

      if (image) {
        const vision = await visionDetect(image.url)
        if (vision.names.length >= 3) {
          found.push({
            message_id:     msg.id,
            channel_name:   channelName,
            maze_type:      vision.mazeType === 'unknown' ? (channelName.includes('frozen') ? 'FV' : 'BD') : vision.mazeType,
            session_date:   vision.sessionDate ?? msgDate,
            author_name:    author,
            content:        content || '[imagen]',
            image_url:      image.url,
            detected_names: vision.names,
            status:         'pending'
          })
        }
        continue
      }

      // ── Check if it's a claim message: "@jugador claim N loots"
      const claimMatch = content.match(/@([\w]+)\s+claim\s+(\d+)\s+(?:auto\s+)?loots?(?:\s*\(([^)]+)\))?/i)
      if (claimMatch && (channelName.includes('claim'))) {
        // Mark as claim — don't add to pending reports, just mark as processed
        // Claims are handled in realtime by the bot
        found.push({
          message_id:     msg.id,
          channel_name:   channelName,
          maze_type:      channelName.includes('frozen') || channelName.includes('fv') ? 'FV' : 'BD',
          session_date:   msgDate,
          author_name:    author,
          content:        content,
          image_url:      null,
          detected_names: [`@${claimMatch[1]} × ${claimMatch[2]} loots`],
          status:         'pending'  // admin can review
        })
        continue
      }

      // Check text content
        const { looksLikeReport, mazeType, names, sessionDate } = detectReportContent(content, channelName)
        if (looksLikeReport) {
          found.push({
            message_id:     msg.id,
            channel_name:   channelName,
            maze_type:      mazeType,
            session_date:   sessionDate ?? msgDate,
            author_name:    author,
            content,
            image_url:      null,
            detected_names: names,
            status:         'pending'
          })
        }
      }
    }

    // Upsert pending reports into DB
    if (found.length > 0) {
      await supabase.from('discord_pending_reports').upsert(found, { onConflict: 'message_id' })
    }

    return NextResponse.json({
      scanned: messages.length,
      detected: found.length,
      skipped:  skipped.length,
      message:  found.length > 0
        ? `✅ Scan completado — ${found.length} reporte(s) nuevo(s) detectado(s). Revisa el panel admin → Mazes → Pendientes de Discord.`
        : `✅ Scan completado — ningún reporte nuevo encontrado (${messages.length} mensajes revisados).`
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
