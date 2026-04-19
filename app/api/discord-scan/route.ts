// app/api/discord-scan/route.ts
// Scans Discord channel history and detects unregistered maze reports
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DISCORD_API = 'https://discord.com/api/v10'

async function fetchDiscordMessages(channelId: string, limit: number) {
  const res = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  )
  if (!res.ok) throw new Error(`Discord API ${res.status}`)
  return res.json()
}

async function isProcessed(messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from('discord_processed_messages')
    .select('message_id').eq('message_id', messageId).maybeSingle()
  return !!data
}

function detectReportContent(content: string, channelName: string) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const nameLines = lines.filter(l =>
    /^[A-Za-z0-9_\*\(\)\s]{2,25}$/.test(l) && l.split(' ').length <= 3
  )
  const looksLikeReport = nameLines.length >= 3
  const ch = channelName.toLowerCase()
  const ct = content.toLowerCase()
  const mazeType: 'BD' | 'FV' =
    ch.includes('frozen') || ch.includes('fv') || ct.includes('frozen') ? 'FV' : 'BD'
  let sessionDate: string | null = null
  const m = content.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3]
    sessionDate = `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }
  return { looksLikeReport, mazeType, names: nameLines, sessionDate }
}

async function visionDetect(imageUrl: string) {
  try {
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
Respond ONLY with JSON: {"isReport":true,"mazeType":"BD","sessionDate":null,"names":["name1","name2"]}` }
        ]}]
      })
    })
    const data = await res.json()
    const parsed = JSON.parse((data.content?.[0]?.text ?? '{}').replace(/```json|```/g, '').trim())
    if (!parsed.isReport) return null
    return parsed
  } catch {
    return null
  }
}

// Claim pattern: @jugador claim N loots (Alias)
const CLAIM_RE = /@([\w]+)\s+claim\s+(\d+)\s+(?:auto\s+)?loots?(?:\s*\(([^)]+)\))?/i

export async function POST(req: NextRequest) {
  if (req.headers.get('x-bot-secret') !== process.env.DISCORD_BOT_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { channelId, channelName, limit = 50 } = await req.json()
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

  try {
    const messages = await fetchDiscordMessages(channelId, Math.min(limit, 100))
    const found: any[] = []
    let skippedCount = 0

    for (const msg of messages) {
      // Skip bots
      if (msg.author?.bot) continue

      // Skip already processed
      if (await isProcessed(msg.id)) { skippedCount++; continue }

      const content = (msg.content ?? '').trim()
      const author  = msg.member?.nick || msg.author?.global_name || msg.author?.username || 'Unknown'
      const msgDate = (msg.timestamp ?? '').split('T')[0] || new Date().toISOString().split('T')[0]
      const ch      = (channelName ?? '').toLowerCase()

      // ── Check for image ─────────────────────────────────────
      const image = (msg.attachments ?? []).find((a: any) =>
        a.content_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(a.filename ?? '')
      )
      if (image) {
        const vision = await visionDetect(image.url)
        if (vision && (vision.names ?? []).length >= 3) {
          found.push({
            message_id:     msg.id,
            channel_name:   ch,
            maze_type:      vision.mazeType === 'unknown' ? (ch.includes('frozen') ? 'FV' : 'BD') : vision.mazeType,
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

      // ── Check for claim format ────────────────────────────
      const claimM = CLAIM_RE.exec(content)
      if (claimM && ch.includes('claim')) {
        found.push({
          message_id:     msg.id,
          channel_name:   ch,
          maze_type:      ch.includes('frozen') || ch.includes('fv') ? 'FV' : 'BD',
          session_date:   msgDate,
          author_name:    author,
          content,
          image_url:      null,
          detected_names: [`@${claimM[1]} × ${claimM[2]} claims`, claimM[3] ? `(alias: ${claimM[3]})` : ''].filter(Boolean),
          status:         'pending'
        })
        continue
      }

      // ── Check for text name list ──────────────────────────
      if (content.length > 5) {
        const { looksLikeReport, mazeType, names, sessionDate } = detectReportContent(content, ch)
        if (looksLikeReport) {
          found.push({
            message_id:     msg.id,
            channel_name:   ch,
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

    // Save to DB
    if (found.length > 0) {
      await supabase
        .from('discord_pending_reports')
        .upsert(found, { onConflict: 'message_id' })
    }

    return NextResponse.json({
      scanned:  messages.length,
      detected: found.length,
      skipped:  skippedCount,
      message:  found.length > 0
        ? `✅ Scan completado — ${found.length} mensaje(s) detectado(s) sin registrar. Revisa el panel admin → Mazes.`
        : `✅ Scan completado — ningún mensaje nuevo (${messages.length} revisados, ${skippedCount} ya procesados).`
    })

  } catch (err: any) {
    console.error('discord-scan error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
