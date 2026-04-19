// lib/maze-vision.ts
// Uses Claude API vision to read maze report images
// Extracts char names from screenshots like the one shown

export interface ExtractedEntry {
  rawName: string       // exactly as seen in image
  isSupport: boolean    // true if has * suffix
  order: number         // position in list (for dedup)
}

export interface MazeImageResult {
  success: boolean
  entries: ExtractedEntry[]
  mazeType: 'BD' | 'FV' | 'unknown'
  sessionDate: string | null
  sessionTime: string | null
  rawText: string
  error?: string
}

/**
 * Convert a File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data:image/...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Use Claude vision API to extract maze participants from an image
 */
export async function extractMazeFromImage(imageFile: File): Promise<MazeImageResult> {
  const base64 = await fileToBase64(imageFile)
  const mediaType = (imageFile.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const prompt = `You are reading a Tales of Pirates guild maze report image.

Extract ONLY the list of player/character names who participated in this maze session.

Rules:
- Names may be in a chat message, a list, or visible on screen
- If a name ends with * it means "magical support" (apoyo mágico) — keep the * in the name
- Include ALL names you can see, even if unclear
- Common names in this guild: Morgan, Gokuld, Maryn, Neones, AlexGhotico, Latina, Ultimate, Diego, Socrates, Luis, Kio, Marin10, Eduardo, UlisesPat, Gaviria, Tyler, B4D, etc.
- If you see "Loot on [CharName]" or "Loot by [CharName]" — that char got the loot, include them
- Detect maze type: if you see "Bd" or "BD" or "Black Dragon" → BD; if "FV" or "Frozen" → FV
- Detect date if visible (format: DD/MM/YYYY or similar)
- Detect time if visible (format: HH:MM)

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "mazeType": "BD" | "FV" | "unknown",
  "sessionDate": "YYYY-MM-DD" or null,
  "sessionTime": "HH:MM" or null,
  "entries": [
    {"rawName": "Morgan", "isSupport": false},
    {"rawName": "Gokuld*", "isSupport": true}
  ]
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    const data = await response.json()
    const rawText = data.content?.[0]?.text ?? ''

    // Parse JSON response
    let parsed: any
    try {
      // Strip any markdown code fences just in case
      const clean = rawText.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      return {
        success: false,
        entries: [],
        mazeType: 'unknown',
        sessionDate: null,
        sessionTime: null,
        rawText,
        error: 'No se pudo parsear la respuesta de visión: ' + rawText.slice(0, 100)
      }
    }

    const entries: ExtractedEntry[] = (parsed.entries ?? []).map((e: any, i: number) => ({
      rawName: String(e.rawName ?? '').trim(),
      isSupport: Boolean(e.isSupport),
      order: i
    })).filter((e: ExtractedEntry) => e.rawName.length > 0)

    return {
      success: true,
      entries,
      mazeType: parsed.mazeType ?? 'unknown',
      sessionDate: parsed.sessionDate ?? null,
      sessionTime: parsed.sessionTime ?? null,
      rawText
    }
  } catch (err: any) {
    return {
      success: false,
      entries: [],
      mazeType: 'unknown',
      sessionDate: null,
      sessionTime: null,
      rawText: '',
      error: err.message ?? 'Error al llamar la API de visión'
    }
  }
}

/**
 * Normalize a char name for fuzzy matching
 * Removes *, lowercases, trims
 */
export function normalizeName(name: string): string {
  return name.replace(/\*/g, '').toLowerCase().trim()
}

/**
 * Simple similarity score between two strings (0-1)
 * Uses Levenshtein distance ratio
 */
export function similarity(a: string, b: string): number {
  const s1 = normalizeName(a)
  const s2 = normalizeName(b)
  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const maxLen = Math.max(s1.length, s2.length)
  const dist = levenshtein(s1, s2)
  return 1 - dist / maxLen
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

export const calcPointShare = (
  totalPoints: number,
  adminPoints: number,
  eventPoints: number,
  participantCount: number
): number => {
  const pool = totalPoints - adminPoints - eventPoints
  if (participantCount <= 0) return 0
  return parseFloat((pool / participantCount).toFixed(4))
}
