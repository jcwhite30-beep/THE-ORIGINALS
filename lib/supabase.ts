import { createClient } from '@supabase/supabase-js'

export type MazeType = 'BD' | 'FV'

export interface Player {
  id: string; name: string; class?: string
  owner?: string; chars?: string; is_active: boolean
  total_score?: number; available_pts?: number
}

export interface LeaderboardEntry {
  id: string; name: string; owner?: string; chars?: string; class?: string
  total_points: number;   // total_score
  available_points: number; // available_pts (lo que ve el jugador)
  bd_points: number; fv_points: number
  admin_points_total?: number
  total_claims: number
}

export interface Runes {
  id: string; player_id: string
  curse: number; illusory: number; piercing: number
  riven_soul: number; favor: number; prayer: number; scroll_ring: number
}

export interface GuildEvent {
  id: string; name: string; description?: string; points: number; event_date: string
}

export interface MazeSession {
  id: string; maze_type: MazeType; total_points: number
  admin_points: number; event_points: number; participant_pts: number
  session_date: string; notes?: string; raw_report?: string
}

export interface PointAlert {
  id: string; raw_name: string; suggested_name?: string
  session_id: string; resolved: boolean; created_at: string
}

export interface Claim {
  id: string; player_id: string; claimed_at: string
  pts_used: number; notes?: string; approved: boolean; approved_at?: string
  players?: { name: string; available_pts: number }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'
export const supabase = createClient(url, key)

export async function getPublicLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await supabase.from('public_leaderboard').select('*')
  return data ?? []
}
export async function getAdminLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await supabase.from('admin_leaderboard').select('*')
  return data ?? []
}
export async function getAllPlayers(): Promise<Player[]> {
  const { data } = await supabase.from('players').select('*')
    .not('name', 'in', '("Administrador","Guild EVENTS")')
    .eq('is_active', true).order('name')
  return data ?? []
}
export async function getPlayerRunes(playerId: string): Promise<Runes | null> {
  const { data } = await supabase.from('runes').select('*').eq('player_id', playerId).single()
  return data
}
export async function getGuildEvents(): Promise<GuildEvent[]> {
  const { data } = await supabase.from('guild_events').select('*').order('event_date', { ascending: false }).limit(20)
  return data ?? []
}
export async function getPendingAlerts(): Promise<PointAlert[]> {
  const { data } = await supabase.from('point_alerts').select('*').eq('resolved', false).order('created_at', { ascending: false })
  return data ?? []
}
export async function getClaims(): Promise<Claim[]> {
  const { data } = await supabase.from('claims')
    .select('*, players(name, available_pts)')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Claim via RPC — resta 5pts automáticamente
export async function processClaim(playerId: string, notes?: string) {
  const { data, error } = await supabase.rpc('process_claim', {
    p_player_id: playerId,
    p_notes: notes ?? null
  })
  if (error) throw error
  return data
}

export async function approveClaim(claimId: string) {
  const { error } = await supabase.from('claims')
    .update({ approved: true, approved_at: new Date().toISOString() }).eq('id', claimId)
  if (error) throw error
}

export async function createPlayer(name: string, owner?: string, chars?: string, playerClass?: string) {
  const { data, error } = await supabase.from('players')
    .insert({ name, owner: owner??name, chars, class: playerClass, total_score:0, available_pts:0 })
    .select().single()
  if (error) throw error
  return data
}
export async function updatePlayer(id: string, updates: Partial<Player & { total_score: number; available_pts: number }>) {
  const { error } = await supabase.from('players').update(updates).eq('id', id)
  if (error) throw error
}
export async function createMazeSession(s: Omit<MazeSession, 'id' | 'participant_pts'>) {
  const { data, error } = await supabase.from('maze_sessions').insert(s).select().single()
  if (error) throw error
  return data
}
export async function addPlayerPoints(playerId: string, sessionId: string, points: number) {
  const { error } = await supabase.from('player_points').upsert({ player_id: playerId, session_id: sessionId, points })
  if (error) throw error
  // available_pts se actualiza via migration_v3 directamente en la DB
}
export async function resolveAlert(alertId: string, action: string, playerName?: string) {
  await supabase.from('point_alerts').update({ resolved: true }).eq('id', alertId)
}
export async function suggestPlayerName(input: string) {
  const { data } = await supabase.rpc('suggest_player_name', { input_name: input })
  return data ?? []
}

// ── Announcements ─────────────────────────────────────────────
export interface Announcement {
  id: string; title: string; content?: string
  image_url?: string; pinned: boolean; created_at: string
}
export async function getAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase.from('announcements').select('*')
    .order('pinned', { ascending: false }).order('created_at', { ascending: false })
  return data ?? []
}
export async function createAnnouncement(a: Omit<Announcement,'id'|'created_at'>) {
  const { error } = await supabase.from('announcements').insert(a)
  if (error) throw error
}
export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}

// ── FV Rune Points ────────────────────────────────────────────
export interface FVRunePoints {
  id: string; player_id: string
  curse_avail: number;    curse_claims: number
  illusory_avail: number; illusory_claims: number
  piercing_avail: number; piercing_claims: number
  riven_avail: number;    riven_claims: number
  favor_avail: number;    favor_claims: number
  prayer_avail: number;   prayer_claims: number
}
export async function getFVRunePoints(): Promise<(FVRunePoints & { players: { name: string } }  )[]> {
  const { data } = await supabase.from('fv_rune_points').select('*, players(name)')
  return data ?? []
}
export async function upsertFVRunePoints(playerId: string, updates: Partial<FVRunePoints>) {
  const { error } = await supabase.from('fv_rune_points')
    .upsert({ player_id: playerId, ...updates, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── Report dates ──────────────────────────────────────────────
export async function updateReportDate(mazeType: 'BD'|'FV', date: string) {
  const { error } = await supabase.from('report_dates')
    .upsert({ maze_type: mazeType, last_date: date, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── Username-based login ──────────────────────────────────────
// Supabase Auth requiere email, pero nosotros guardamos username en admin_profiles
// Este helper busca el email real a partir del username para hacer login
export async function loginWithUsername(username: string, password: string) {
  // 1. Buscar el usuario en admin_profiles por username
  const { data: profile, error: profileErr } = await supabase
    .from('admin_profiles')
    .select('id, username, role')
    .eq('username', username)
    .single()

  if (profileErr || !profile) {
    throw new Error('Usuario no encontrado')
  }

  // 2. Buscar el email en auth.users via función RPC (necesita permisos)
  // Como alternativa, guardamos el email en admin_profiles también
  const { data: emailData, error: emailErr } = await supabase
    .rpc('get_user_email_by_id', { user_id: profile.id })

  if (emailErr || !emailData) {
    throw new Error('No se pudo obtener el email del usuario')
  }

  // 3. Login con email + password
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailData,
    password,
  })
  if (error) throw new Error('Contraseña incorrecta')
  return data
}
