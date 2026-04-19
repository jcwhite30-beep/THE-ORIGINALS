import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel → Settings → Environment Variables')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── POST: Crear usuario ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, nombre, username, rol, agencia_id, telefono, ocupacion, lugar_trabajo } = body

    const admin = getAdmin()

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) throw authError
    if (!authData.user) throw new Error('No se pudo crear el usuario en Auth')

    const { error: dbError } = await admin.from('usuarios').insert({
      id:            authData.user.id,
      agencia_id,
      nombre,
      username:      username.toLowerCase(),
      rol,
      activo:        true,
      telefono:      telefono      || null,
      ocupacion:     ocupacion     || null,
      lugar_trabajo: lugar_trabajo || null,
    })

    if (dbError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }

    return NextResponse.json({ success: true, id: authData.user.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

// ── PATCH: Cambiar contraseña ────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const { user_id, password } = await request.json()

    if (!user_id || !password) {
      return NextResponse.json({ error: 'user_id y password son requeridos' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener mínimo 6 caracteres' }, { status: 400 })
    }

    const admin = getAdmin()

    // Intentar con Admin API
    const { data, error } = await admin.auth.admin.updateUserById(user_id, { password })

    if (!error && data?.user) {
      // Verificar que realmente se actualizó comparando updated_at
      return NextResponse.json({ success: true, method: 'admin_api' })
    }

    // Fallback: SQL directo via función RPC
    const { error: rpcError } = await admin.rpc('reset_password_direct', {
      p_user_id: user_id,
      p_password: password
    })

    if (!rpcError) {
      return NextResponse.json({ success: true, method: 'sql_rpc' })
    }

    // Ambos fallaron — devolver error detallado
    return NextResponse.json({
      error: `No se pudo cambiar la contraseña. Admin API: ${error?.message ?? 'sin error'}. SQL RPC: ${rpcError?.message ?? 'sin error'}. Usa el SQL de respaldo en Supabase.`
    }, { status: 500 })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PUT: Editar datos del usuario ────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, nombre, username, rol, agencia_id, telefono, ocupacion, lugar_trabajo, activo } = body

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const admin = getAdmin()

    const { error } = await admin.from('usuarios').update({
      nombre,
      username: username?.toLowerCase(),
      rol,
      agencia_id: agencia_id || null,
      telefono:   telefono   || null,
      ocupacion:  ocupacion  || null,
      lugar_trabajo: lugar_trabajo || null,
      activo: activo ?? true,
    }).eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
