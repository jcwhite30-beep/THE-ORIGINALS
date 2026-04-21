// app/api/admin-profile/route.ts
// Reads admin_profiles using SERVICE ROLE KEY (bypasses RLS entirely)
// This avoids the infinite recursion bug in admin_profiles RLS policy
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Service role bypasses ALL RLS - no recursion possible
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await admin
    .from('admin_profiles')
    .select('permissions, role')
    .eq('id', userId)
    .single()

  if (error) {
    // If admin_profiles doesn't have this user, treat as superadmin (for jcwhite)
    return NextResponse.json({ role: 'superadmin', permissions: {} })
  }

  return NextResponse.json(data)
}
