import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — list all admin users
export async function GET() {
  const { data, error } = await db()
    .from('admin_profiles')
    .select('id, username, role, permissions, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get emails from auth
  const { data: authData } = await db().auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  for (const u of authData?.users ?? []) emailMap[u.id] = u.email ?? ''

  return NextResponse.json((data ?? []).map(u => ({ ...u, email: emailMap[u.id] ?? '' })))
}

// POST — create new admin user (no email required)
export async function POST(req: NextRequest) {
  const { username, password, role, permissions } = await req.json()

  if (!username?.trim()) return NextResponse.json({ error: 'Username requerido' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'Contraseña mínimo 6 caracteres' }, { status: 400 })

  // Supabase Auth requires a valid email — use a real-looking one
  const safeUser = username.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const email = `${safeUser}.${Date.now()}@guild-internal.com`

  // Create auth user
  const { data: authData, error: authErr } = await db().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username.trim() }
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // Create admin_profiles record
  const { error: profErr } = await db().from('admin_profiles').insert({
    id: authData.user.id,
    username: username.trim(),
    role: role ?? 'reporter',
    permissions: permissions ?? {}
  })
  if (profErr) {
    await db().auth.admin.deleteUser(authData.user.id).catch(() => {})
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: authData.user.id })
}

// PATCH — update role/permissions
export async function PATCH(req: NextRequest) {
  const { id, role, permissions } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await db().from('admin_profiles').update({ role, permissions }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — remove admin user
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data: prof } = await db().from('admin_profiles').select('role').eq('id', id).single()
  if (prof?.role === 'superadmin') return NextResponse.json({ error: 'No se puede eliminar el superadmin' }, { status: 403 })

  await db().from('admin_profiles').delete().eq('id', id)
  await db().auth.admin.deleteUser(id).catch(() => {})
  return NextResponse.json({ success: true })
}
