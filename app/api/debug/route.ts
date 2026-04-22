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

  // Fix is_active for Administrador and Guild EVENTS
  await db.from('players').update({ is_active: true })
    .in('name', ['Administrador', 'Guild EVENTS'])

  const { data: players } = await db.from('players')
    .select('id,name,is_active,total_score,available_pts')
    .order('total_score', { ascending: false })

  const { data: ptsSums } = await db.from('player_points').select('player_id,points')
  const sums: Record<string,number> = {}
  for (const r of ptsSums ?? []) sums[r.player_id] = (sums[r.player_id]??0)+Number(r.points)

  return NextResponse.json({
    message: 'Fixed is_active for Administrador and Guild EVENTS',
    players: (players??[]).map(p => ({
      name: p.name,
      is_active: p.is_active,
      total_score_db: Number(p.total_score),
      available_pts_db: Number(p.available_pts),
      sum_player_points: Number((sums[p.id]??0).toFixed(4)),
    }))
  })
}
