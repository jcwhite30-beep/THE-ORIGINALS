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

  // Get ALL active players
  const { data: active } = await db.from('players')
    .select('id,name,owner,chars,class,total_score,available_pts')
    .eq('is_active', true)
    .order('total_score', { ascending: false })

  // Get Administrador and Guild EVENTS regardless of is_active
  const { data: special } = await db.from('players')
    .select('id,name,owner,chars,class,total_score,available_pts')
    .in('name', ['Administrador', 'Guild EVENTS'])

  // Merge — special players always included
  const seen = new Set((active ?? []).map((p:any) => p.id))
  const all = [
    ...(active ?? []),
    ...(special ?? []).filter((p:any) => !seen.has(p.id))
  ].sort((a:any,b:any) => Number(b.total_score) - Number(a.total_score))

  // Get claims counts
  const { data: claims } = await db.from('claims')
    .select('player_id').eq('approved', true)
  const cc: Record<string,number> = {}
  for (const c of claims ?? []) cc[c.player_id] = (cc[c.player_id]??0)+1

  return NextResponse.json(all.map((p:any) => ({
    id: p.id,
    name: p.name,
    owner: p.owner ?? p.name,
    chars: p.chars ?? '',
    class: p.class ?? '',
    total_points: Number(p.total_score ?? 0),
    available_points: Number(p.available_pts ?? 0),
    total_claims: cc[p.id] ?? 0,
    bd_points: 0,
    fv_points: 0,
  })))
}
