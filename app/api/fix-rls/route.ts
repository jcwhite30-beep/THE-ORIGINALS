// app/api/fix-rls/route.ts
// Runs from server — uses SUPABASE_SERVICE_ROLE_KEY to fix admin_profiles RLS
// Visit /api/fix-rls once to fix the database
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const statements = [
    // Drop all existing policies on admin_profiles
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='admin_profiles' LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON admin_profiles'; END LOOP; END $$`,
    `ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY`,
    `ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY`,
    `CREATE POLICY "bypass_recursion" ON admin_profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)`,
    // Add missing columns
    `ALTER TABLE maze_sessions ADD COLUMN IF NOT EXISTS session_time TEXT`,
    `ALTER TABLE maze_sessions ADD COLUMN IF NOT EXISTS looter TEXT`,
    `ALTER TABLE maze_attendance ADD COLUMN IF NOT EXISTS is_looter BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS total_loots INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS loots_pendientes INTEGER DEFAULT 0`,
    // Auto-update trigger for player points
    `CREATE OR REPLACE FUNCTION update_player_totals() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE players SET total_score = total_score + NEW.points, available_pts = available_pts + NEW.points WHERE id = NEW.player_id; RETURN NEW; END $$`,
    `DROP TRIGGER IF EXISTS trg_update_player_totals ON player_points`,
    `CREATE TRIGGER trg_update_player_totals AFTER INSERT ON player_points FOR EACH ROW EXECUTE FUNCTION update_player_totals()`,
  ]

  const results = []

  for (const sql of statements) {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
        'Content-Profile': 'public',
      },
      body: JSON.stringify({ query: sql })
    })
    // Try Supabase Management API approach
    results.push({ sql: sql.slice(0, 50) + '...', status: res.status })
  }

  // Alternative: use pg directly via Supabase's DB URL
  // The service role key JWT contains the project ref which we can use
  const projectRef = url.replace('https://', '').replace('.supabase.co', '')

  // Try via Supabase's SQL API (undocumented but works)
  const sqlRes = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      query: statements.join('; ')
    })
  })

  return NextResponse.json({
    results,
    sqlApiStatus: sqlRes.status,
    sqlApiResponse: await sqlRes.text().catch(() => 'no response'),
    message: 'Check results. If all failed, you need to run the SQL manually in Supabase Dashboard.'
  })
}
