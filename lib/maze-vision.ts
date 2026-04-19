// lib/maze-vision.ts
// Calls /api/vision (server-side) to extract maze report data from images
// Browser cannot call api.anthropic.com directly — must go through our API route

export interface ExtractedEntry {
  rawName:   string
  isSupport: boolean   // * suffix = apoyo mágico
  isLooter:  boolean   // this char got the loot
  order:     number
}

export interface MazeImageResult {
  success:     boolean
  entries:     ExtractedEntry[]
  mazeType:    'BD' | 'FV' | 'unknown'
  sessionDate: string | null   // YYYY-MM-DD
  sessionTime: string | null   // HH:MM
  looter:      string | null
  rawText:     string
  error?:      string
}

// ── Point distribution ────────────────────────────────────────
// 5 pts ÷ totalSlots — same fraction for everyone
// Admin/event points are INVISIBLE to public — same share, different bucket
export interface PointDist {
  perSlot:    number
  playerPts:  number
  adminPts:   number
  eventPts:   number
  totalSlots: number
}

export function calcPointDistribution(
  totalPoints: number,
  playerCount: number,
  adminSlots:  number,
  eventSlots:  number
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

export const calcPointShare = (
  totalPoints: number, adminSlots: number, eventSlots: number, playerCount: number
): number => calcPointDistribution(totalPoints, playerCount, adminSlots, eventSlots).playerPts

// ── Convert File to base64 ────────────────────────────────────
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Call /api/vision (server-side proxy) ──────────────────────
export async function extractMazeFromImage(imageFile: File): Promise<MazeImageResult> {
  try {
    const base64    = await fileToBase64(imageFile)
    const mediaType = imageFile.type || 'image/jpeg'

    const response = await fetch('/api/vision', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ base64, mediaType })
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return {
        success: false, entries: [], mazeType: 'unknown',
        sessionDate: null, sessionTime: null, looter: null,
        rawText: data.rawText ?? '',
        error: data.error ?? `Error ${response.status}`
      }
    }

    const entries: ExtractedEntry[] = (data.entries ?? []).map((e: any, i: number) => ({
      rawName:   String(e.rawName ?? '').replace(/\*/g, '').trim(),
      isSupport: Boolean(e.isSupport),
      isLooter:  Boolean(e.isLooter),
      order:     i
    })).filter((e: ExtractedEntry) => e.rawName.length > 0)

    return {
      success:     true,
      entries,
      mazeType:    data.mazeType    ?? 'unknown',
      sessionDate: data.sessionDate ?? null,
      sessionTime: data.sessionTime ?? null,
      looter:      data.looter      ?? null,
      rawText:     data.rawText     ?? ''
    }
  } catch (err: any) {
    return {
      success: false, entries: [], mazeType: 'unknown',
      sessionDate: null, sessionTime: null, looter: null,
      rawText: '', error: err.message ?? 'Error de conexión'
    }
  }
}

// ── Fuzzy match helpers ───────────────────────────────────────
export function normalizeName(name: string): string {
  return name.replace(/\*/g, '').toLowerCase().trim()
}

export function similarity(a: string, b: string): number {
  const s1 = normalizeName(a), s2 = normalizeName(b)
  if (s1 === s2) return 1
  if (!s1.length || !s2.length) return 0
  return 1 - levenshtein(s1, s2) / Math.max(s1.length, s2.length)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({length:m+1}, (_,i) =>
    Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0))
  for (let i=1; i<=m; i++)
    for (let j=1; j<=n; j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]
               : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1])
  return dp[m][n]
}
