// lib/maze-vision.ts
// Uses Claude API vision to read maze report images
//
// REGLA DE PUNTOS:
// 5 puntos totales ÷ (N jugadores + slots admin + slots event)
// Todos reciben la MISMA fracción — admin no tiene puntos "extra"
// Los puntos de admin son INVISIBLES para el público

export interface ExtractedEntry {
  rawName:   string    // nombre exacto de la imagen
  isSupport: boolean   // true si tiene * (apoyo mágico)
  isLooter:  boolean   // true si "Loot on [nombre]"
  order:     number
}

export interface MazeImageResult {
  success:     boolean
  entries:     ExtractedEntry[]
  mazeType:    'BD' | 'FV' | 'unknown'
  sessionDate: string | null   // YYYY-MM-DD
  sessionTime: string | null   // HH:MM
  looter:      string | null   // nombre del que agarró el loot
  rawText:     string
  error?:      string
}

// ── Point distribution ────────────────────────────────────────
// 5 pts ÷ totalSlots — misma fracción para todos
export interface PointDist {
  perSlot:    number  // puntos por slot (igual para todos)
  playerPts:  number  // lo que recibe cada jugador
  adminPts:   number  // lo que recibe admin (mismo que jugador, solo visible en admin)
  eventPts:   number  // lo que recibe guild events
  totalSlots: number
}

export function calcPointDistribution(
  totalPoints: number,   // siempre 5
  playerCount: number,
  adminSlots:  number,   // 1 si se incluye admin, 0 si no
  eventSlots:  number    // 1 si se incluye guild events, 0 si no
): PointDist {
  const totalSlots = playerCount + adminSlots + eventSlots
  if (totalSlots <= 0) return { perSlot:0, playerPts:0, adminPts:0, eventPts:0, totalSlots:0 }
  const perSlot = parseFloat((totalPoints / totalSlots).toFixed(4))
  return {
    perSlot,
    playerPts: perSlot,
    adminPts:  adminSlots > 0 ? perSlot : 0,
    eventPts:  eventSlots > 0 ? perSlot : 0,
    totalSlots
  }
}

// Backward compat — adminPoints/eventPoints now mean "number of slots" (0 or 1)
export const calcPointShare = (
  totalPoints:    number,
  adminSlots:     number,
  eventSlots:     number,
  participantCount: number
): number => {
  const dist = calcPointDistribution(totalPoints, participantCount, adminSlots, eventSlots)
  return dist.playerPts
}

// ── base64 helper ─────────────────────────────────────────────
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Claude Vision extraction ──────────────────────────────────
export async function extractMazeFromImage(imageFile: File): Promise<MazeImageResult> {
  const base64    = await fileToBase64(imageFile)
  const mediaType = (imageFile.type || 'image/jpeg') as 'image/jpeg'|'image/png'|'image/webp'|'image/gif'

  const prompt = `You are reading a Tales of Pirates guild maze/lair report image from Discord or WhatsApp.

Extract ALL information visible. Respond ONLY with valid JSON, no markdown:

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
- mazeType: look for "Bd", "BD", "Black Dragon" → "BD"; "FV", "Frozen" → "FV"
- sessionDate: look for dates like "14/03/2026", "03/14/2026", "14-03-26" → convert to YYYY-MM-DD
- sessionTime: look for times like "21:00", "03:00am" → convert to 24h HH:MM
- looter: look for "Loot on [name]", "Loot by [name]", "looter: [name]" — the char who got the item
- entries: ALL participant character names listed in the message
  - isSupport=true if the name has * suffix (magical support / apoyo mágico) — e.g. "Western*"
  - isLooter=true if this char is the one who got the loot
  - Include ALL names even if they also appear in "Loot on" text
- Common guild names: Morgan, Gokuld, Maryn, Neones, AlexGhotico, Latina, Ultimate, Diego, Socrates, Luis, Kio, Marin10, Eduardo, UlisesPat, Gaviria, Tyler, B4D, Western, Stylegood, LinkaToP, Linka`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text',  text: prompt }
          ]
        }]
      })
    })

    const data    = await response.json()
    const rawText = data.content?.[0]?.text ?? ''

    let parsed: any
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      return { success: false, entries: [], mazeType: 'unknown',
               sessionDate: null, sessionTime: null, looter: null, rawText,
               error: 'No se pudo parsear: ' + rawText.slice(0, 120) }
    }

    const entries: ExtractedEntry[] = (parsed.entries ?? [])
      .map((e: any, i: number) => ({
        rawName:   String(e.rawName ?? '').trim(),
        isSupport: Boolean(e.isSupport),
        isLooter:  Boolean(e.isLooter),
        order:     i
      }))
      .filter((e: ExtractedEntry) => e.rawName.length > 0)

    return {
      success:     true,
      entries,
      mazeType:    parsed.mazeType   ?? 'unknown',
      sessionDate: parsed.sessionDate ?? null,
      sessionTime: parsed.sessionTime ?? null,
      looter:      parsed.looter      ?? null,
      rawText
    }
  } catch (err: any) {
    return { success: false, entries: [], mazeType: 'unknown',
             sessionDate: null, sessionTime: null, looter: null,
             rawText: '', error: err.message ?? 'Error de visión' }
  }
}

// ── Fuzzy string helpers ──────────────────────────────────────
export function normalizeName(name: string): string {
  return name.replace(/\*/g, '').toLowerCase().trim()
}

export function similarity(a: string, b: string): number {
  const s1 = normalizeName(a), s2 = normalizeName(b)
  if (s1 === s2) return 1
  if (!s1.length || !s2.length) return 0
  const mx = Math.max(s1.length, s2.length)
  return 1 - levenshtein(s1, s2) / mx
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m+1 }, (_,i) =>
    Array.from({ length: n+1 }, (_,j) => i===0 ? j : j===0 ? i : 0))
  for (let i=1; i<=m; i++)
    for (let j=1; j<=n; j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]
               : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}
