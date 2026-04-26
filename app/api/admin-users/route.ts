// app/api/admin-users/route.ts
// Full user management — create, edit, delete admin users
// Uses service role key to manage Supabase Auth + admin_profiles
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

function getDb(){
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — list all admin users
export async function GET(){
  const db = getDb()
  const { data, error } = await db
    .from('admin_profiles')
    .select('id, username, role, permissions, created_at')
    .order('created_at', { ascending: false })
  if(error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get emails from auth.users
  const { data: authUsers } = await db.auth.admin.listUsers()
  const emailMap: Record<string,string> = {}
  for(const u of authUsers?.users ?? []) emailMap[u.id] = u.email ?? ''

  return NextResponse.json((data??[]).map(u => ({
    ...u,
    email: emailMap[u.id] ?? ''
  })))
}

// POST — create new admin user
export async function POST(req: NextRequest){
  const db = getDb()
  const { username, email: rawEmail, password, role, permissions } = await req.json()

  if(!username||!password)
    return NextResponse.json({ error: 'Faltan username y contraseña' }, { status: 400 })

  // Email is optional — auto-generate if not provided
  const email = rawEmail?.trim() || `${username.toLowerCase().replace(/\s+/g,'')}@theoriginals.guild`

  // 1. Create auth user
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username }
  })
  if(authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // 2. Create admin_profile
  const { error: profErr } = await db.from('admin_profiles').insert({
    id: authData.user.id,
    username,
    role: role ?? 'reporter',
    permissions: permissions ?? {}
  })
  if(profErr){
    // Rollback auth user
    await db.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: authData.user.id })
}

// PATCH — update role and permissions
export async function PATCH(req: NextRequest){
  const db = getDb()
  const { id, role, permissions } = await req.json()
  if(!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await db.from('admin_profiles')
    .update({ role, permissions })
    .eq('id', id)
  if(error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — remove admin user
export async function DELETE(req: NextRequest){
  const db = getDb()
  const id = req.nextUrl.searchParams.get('id')
  if(!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Check it's not the superadmin
  const { data: prof } = await db.from('admin_profiles').select('role,username').eq('id',id).single()
  if(prof?.role === 'superadmin')
    return NextResponse.json({ error: 'No se puede eliminar el superadmin' }, { status: 403 })

  await db.from('admin_profiles').delete().eq('id', id)
  await db.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
