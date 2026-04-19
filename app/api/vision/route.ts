// app/api/vision/route.ts
// Server-side proxy for Claude Vision — browser can't call api.anthropic.com directly
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()
    if (!base64) return NextResponse.json({ error: 'No image data' }, { status: 400 })

    const prompt = `You are reading a Tales of Pirates guild maze/lair report image from Discord or WhatsApp.

Extract ALL information visible. Respond ONLY with valid JSON, no markdown, no explanation:

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
- mazeType: "Bd lair" or "BD lair" or "Black Dragon" → "BD"; "Frozen Ville" or "FV" → "FV"
- sessionDate: dates like "15/03/2026", "03/15/2026" → convert to YYYY-MM-DD
- sessionTime: times like "21:00", "03:00am" → convert to 24h format HH:MM
- looter: look for "Loot on [name]", "Loot by [name]", "Win/[name]" — the char who got the loot
- entries: ALL participant character names in the message list
  - isSupport=true if name has * suffix (apoyo mágico) e.g. "Western*"  
  - isLooter=true for the char who got the loot
- Common names: Morgan, Gokuld, Maryn, Neones, AlexGhotico, Latina, Ultimate, Stylegood, Western, LinkaToP, Linka, Legilas, Prometeo, UlisesPat, Gaviria, Tyler, B4D, Marin10, Diego, Socrates, Luis, Kio`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'Vision API error: ' + response.status }, { status: 500 })
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text ?? ''

    // Parse JSON
    let parsed: any
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      // Try to extract JSON from text
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch { /* fall through */ }
      }
      if (!parsed) {
        return NextResponse.json({ error: 'Could not parse vision response', rawText }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      mazeType:    parsed.mazeType    ?? 'unknown',
      sessionDate: parsed.sessionDate ?? null,
      sessionTime: parsed.sessionTime ?? null,
      looter:      parsed.looter      ?? null,
      entries:     (parsed.entries ?? []).filter((e: any) => e.rawName?.trim()),
      rawText
    })
  } catch (err: any) {
    console.error('Vision route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
