// lib/ocr.ts
// Handles both Tesseract.js OCR and plain-text paste parsing

/**
 * Parse a maze report (from OCR text or clipboard paste).
 * Expected format examples:
 *   "Morgan 3pts"  |  "DragonSlayer - 2"  |  "IceMage: 1.5"
 * Returns array of { name, points }
 */
export function parseMazeReport(raw: string): Array<{ name: string; points: number }> {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean)
  const results: Array<{ name: string; points: number }> = []

  for (const line of lines) {
    // Try different formats:
    // "PlayerName 3"  |  "PlayerName: 3"  |  "PlayerName - 3"  |  "PlayerName 3pts"
    const match = line.match(/^([A-Za-z0-9_\s]+?)[\s:\-]+(\d+(?:\.\d+)?)\s*(?:pts?)?$/i)
    if (match) {
      const name = match[1].trim()
      const points = parseFloat(match[2])
      if (name && !isNaN(points)) {
        results.push({ name, points })
      }
    }
  }

  return results
}

/**
 * Calculate per-participant point share given total maze points,
 * admin reservation, event reservation, and number of participants.
 */
export function calcPointShare(
  totalPoints: number,
  adminPoints: number,
  eventPoints: number,
  participantCount: number
): number {
  const participantPool = totalPoints - adminPoints - eventPoints
  if (participantCount <= 0) return 0
  return parseFloat((participantPool / participantCount).toFixed(4))
}

/**
 * Load Tesseract.js lazily (only in browser) and run OCR on an image file.
 * Returns raw recognized text.
 */
export async function runOCR(imageFile: File): Promise<string> {
  // Dynamic import so it doesn't bloat SSR
  const Tesseract = (await import('tesseract.js')).default

  const result = await Tesseract.recognize(imageFile, 'eng', {
    // Tales of Pirates uses a bitmap font — block mode helps
    tessedit_pageseg_mode: '6',
  } as any)

  return result.data.text
}
