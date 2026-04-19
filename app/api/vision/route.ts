// app/api/vision/route.ts
// Server-side vision — requires ANTHROPIC_API_KEY in Vercel env vars
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  let base64: string, mediaType: string
  try {
    const body = await req.json()
    base64    = body.base64
    mediaType = body.mediaType || 'image/jpeg'
    if (!base64) throw new Error('No image data')
  } catch {
    return NextResponse.json({ error: 'Datos de imagen inválidos' }, { status: 400 })
  }

  const prompt = `You are reading a Tales of Pirates guild maze/lair report image.

Extract ALL visible information. Return ONLY valid JSON, no markdown:

{
  "mazeType": "BD" or "FV" or "unknown",
  "sessionDate": "YYYY-MM-DD" or null,
  "sessionTime": "HH:MM" or null,
  "looter": "CharName" or null,
  "entries": [
    {"rawName": "Gokuld", "isSupport": false, "isLooter": false},
    {"rawName": "Western", "isSupport": true, "isLooter": false},
    {"rawName": "Linka", "isSupport": false, "isLooter": true}
  ]
}

Rules:
- mazeType: "Bd lair" / "BD lair" / "Black Dragon" → "BD"; "Frozen Ville" / "FV" → "FV"
- sessionDate: parse any date format (DD/MM/YYYY, MM/DD/YYYY) → YYYY-MM-DD
- sessionTime: parse any time (21:00, 9pm, 03:00am) → 24h HH:MM
- looter: look for "Loot on X", "Loot by X", "Win/X", "X on loot" — extract just the char name
- entries: ALL participant names in the list. isSupport=true if name has * (apoyo mágico). isLooter=true for the looter.
- Common names: Gokuld, Stylegood, Western, Neones, Legilas, Alexghotico, Linka, Morgan, Maryn, Prometeo, UlisesPat, Gaviria, Tyler, Latina, Ultimate, Diego, Marin10, Luis, Kio`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',  // fastest + cheapest
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text',  text: prompt }
          ]
        }]
      })
    })

    const data = await resp.json()

    if (!resp.ok) {
      console.error('Anthropic error:', JSON.stringify(data))
      return NextResponse.json({
        error: `Anthropic API error ${resp.status}: ${data?.error?.message ?? JSON.stringify(data)}`
      }, { status: 500 })
    }

    const rawText = data.content?.[0]?.text ?? ''

    // Parse JSON — try multiple strategies
    let parsed: any = null
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch { /* noop */ }
      }
    }

    if (!parsed) {
      console.error('Could not parse vision response:', rawText)
      return NextResponse.json({ error: 'No se pudo interpretar la imagen. Intenta con texto manual.', rawText }, { status: 500 })
    }

    const entries = (parsed.entries ?? [])
      .filter((e: any) => typeof e.rawName === 'string' && e.rawName.trim().length > 0)
      .map((e: any, i: number) => ({
        rawName:   e.rawName.replace(/\*/g, '').trim(),
        isSupport: Boolean(e.isSupport),
        isLooter:  Boolean(e.isLooter),
        order:     i
      }))

    return NextResponse.json({
      success:     true,
      mazeType:    parsed.mazeType    ?? 'unknown',
      sessionDate: parsed.sessionDate ?? null,
      sessionTime: parsed.sessionTime ?? null,
      looter:      parsed.looter      ?? null,
      entries,
      rawText
    })

  } catch (err: any) {
    console.error('Vision route exception:', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
