// lib/maze-parser.ts
// Pure text parser — NO AI needed, NO tokens consumed
// Parses maze reports in the format used by The Originals guild:
//   Bd lair 21.00.00svt 20/04/2026
//   PlayerName
//   PlayerName*    <- apoyo mágico
//   Win nadie      <- nobody won
//   Linka on loot  <- looter
//   ATT 6          <- attendance count

import { ExtractedEntry } from './maze-vision'

export interface ParseResult {
  mazeType:    'BD' | 'FV' | 'unknown'
  sessionDate: string | null
  sessionTime: string | null
  looter:      string | null
  entries:     ExtractedEntry[]
}

export function parseMazeText(raw: string): ParseResult {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean)

  const result: ParseResult = {
    mazeType:    'unknown',
    sessionDate: null,
    sessionTime: null,
    looter:      null,
    entries:     []
  }

  let order = 0

  for (const line of lines) {
    const l = line.toLowerCase()

    // ── Maze type ─────────────────────────────────────────────
    if (/bd\s*(lair)?|black\s*dragon/.test(l)) result.mazeType = 'BD'
    else if (/fv|frozen\s*ville/.test(l))       result.mazeType = 'FV'

    // ── Date: DD/MM/YYYY or MM/DD/YYYY ───────────────────────
    const dm = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (dm) {
      const [, d, mo, y] = dm
      const year = y.length === 2 ? '20' + y : y
      result.sessionDate = `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
    }

    // ── Time: 21.00.00svt | 21:00 | 03:00am | 9pm ────────────
    const tm = line.match(/(\d{1,2})[\.:](\d{2})(?:[\.:](\d{2}))?(?:svt|am|pm)?/i)
    if (tm && !result.sessionTime) {
      let h = parseInt(tm[1]), m = parseInt(tm[2])
      if (/pm/i.test(line) && h < 12) h += 12
      if (/am/i.test(line) && h === 12) h = 0
      result.sessionTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    }

    // ── ATT count line — skip ─────────────────────────────────
    if (/^att\s*\d+/i.test(l)) continue

    // ── Looter patterns ───────────────────────────────────────
    // "Linka on loot" | "Loot on Linka" | "Loot by Linka" | "Win/Linka" | "Win Linka"
    const looterM = (
      line.match(/^(.+?)\s+on\s+loot/i)     ||
      line.match(/^loot\s+(?:on|by)\s+(.+)/i) ||
      line.match(/^win\s*[\/\s]\s*(.+)/i)
    )
    if (looterM) {
      const name = looterM[1].trim()
      if (!/^nadie$/i.test(name)) result.looter = name
      continue
    }

    // ── Skip header/meta lines ────────────────────────────────
    if (/^(bd|fv|frozen|black)/i.test(l)) continue  // maze type header
    if (dm && line.length < 20) continue             // date-only line
    if (tm && line.length < 10) continue             // time-only line

    // ── Participant name ──────────────────────────────────────
    const isSupport = line.includes('*')
    const rawName   = line.replace(/\*/g, '').trim()

    // Skip empty, numbers only, or clearly not a name
    if (rawName.length < 2)     continue
    if (/^\d+$/.test(rawName))  continue

    result.entries.push({ rawName, isSupport, isLooter: false, order: order++ })
  }

  // Mark looter in entries
  if (result.looter) {
    const lt = result.looter.toLowerCase()
    for (const e of result.entries) {
      if (e.rawName.toLowerCase() === lt) e.isLooter = true
    }
  }

  return result
}
