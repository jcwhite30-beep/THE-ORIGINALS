import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: players } = await db.from('players')
    .select('id, name, total_score, available_pts')
    .order('total_score', { ascending: false })

  const { data: sessions } = await db.from('maze_sessions')
    .select('id, maze_type, session_date, admin_points, event_points')
    .order('created_at', { ascending: false }).limit(5)

  const { data: ptsSums } = await db.from('player_points')
    .select('player_id, points')

  const sums: Record<string, number> = {}
  for (const r of ptsSums ?? []) {
    sums[r.player_id] = (sums[r.player_id] ?? 0) + Number(r.points)
  }

  const result = (players ?? []).map(p => ({
    name: p.name,
    total_score_db: Number(p.total_score),
    available_pts_db: Number(p.available_pts),
    sum_from_player_points: Number((sums[p.id] ?? 0).toFixed(4)),
    discrepancy: Number((Number(p.total_score) - (sums[p.id] ?? 0)).toFixed(4))
  }))

  return NextResponse.json({ players: result, recent_sessions: sessions })
}
