import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// DELETE — delete session and reverse all points
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('id')
  if (!sessionId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  try {
    // 1. Get all point records for this session
    const { data: pts } = await db().from('player_points')
      .select('player_id, points').eq('session_id', sessionId)

    // 2. Reverse points for each player
    const reversed: string[] = []
    for (const pt of pts ?? []) {
      const { data: p } = await db().from('players')
        .select('total_score, available_pts').eq('id', pt.player_id).single()
      if (p) {
        await db().from('players').update({
          total_score:   Math.max(0, Number(p.total_score)   - Number(pt.points)),
          available_pts: Math.max(0, Number(p.available_pts) - Number(pt.points))
        }).eq('id', pt.player_id)
        reversed.push(pt.player_id)
      }
    }

    // 3. Delete all related records
    await db().from('maze_attendance').delete().eq('session_id', sessionId)
    await db().from('player_points').delete().eq('session_id', sessionId)
    await db().from('maze_sessions').delete().eq('id', sessionId)

    // 4. Reverse loot fuera de banco
    const { data: bank } = await db().from('bank_snapshot')
      .select('id, loots_fuera').limit(1).maybeSingle()
    if (bank) {
      await db().from('bank_snapshot').update({
        loots_fuera: Math.max(0, bank.loots_fuera - 1)
      }).eq('id', bank.id)
    }

    return NextResponse.json({ success: true, reversed: reversed.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
