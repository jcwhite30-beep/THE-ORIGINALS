// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export type MazeType = 'BD' | 'FV'
export type AdminRole = 'superadmin' | 'manager'

export interface Player {
  id: string
  name: string
  class?: string
  is_active: boolean
  created_at: string
}

export interface Runes {
  id: string
  player_id: string
  curse: number
  illusory: number
  piercing: number
  riven_soul: number
  favor: number
  prayer: number
  scroll_ring: number
}

export interface LeaderboardEntry {
  id: string
  name: string
  class?: string
  total_points: number
  bd_points: number
  fv_points: number
  admin_points_total?: number // only in admin view
}

export interface GuildEvent {
  id: string
  name: string
  description?: string
  points: number
  event_date: string
}

export interface MazeSession {
  id: string
  maze_type: MazeType
  total_points: number
  admin_points: number
  event_points: number
  participant_pts: number
  session_date: string
  notes?: string
  raw_report?: string
}

export interface PointAlert {
  id: string
  raw_name: string
  suggested_name?: string
  session_id: string
  resolved: boolean
  created_at: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Public API ──────────────────────────────────────────────

export async function getPublicLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('public_leaderboard')
    .select('*')
  if (error) throw error
  return data ?? []
}

export async function getPlayerRunes(playerId: string): Promise<Runes | null> {
  const { data, error } = await supabase
    .from('runes')
    .select('*')
    .eq('player_id', playerId)
    .single()
  if (error) return null
  return data
}

export async function getGuildEvents(): Promise<GuildEvent[]> {
  const { data, error } = await supabase
    .from('guild_events')
    .select('*')
    .order('event_date', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

// ─── Admin API ───────────────────────────────────────────────

export async function getAdminLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('admin_leaderboard')
    .select('*')
  if (error) throw error
  return data ?? []
}

export async function createMazeSession(session: Omit<MazeSession, 'id' | 'participant_pts'>) {
  const { data, error } = await supabase
    .from('maze_sessions')
    .insert(session)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addPlayerPoints(
  playerId: string,
  sessionId: string,
  points: number
) {
  const { error } = await supabase
    .from('player_points')
    .upsert({ player_id: playerId, session_id: sessionId, points })
  if (error) throw error
}

export async function createPlayer(name: string, playerClass?: string) {
  const { data, error } = await supabase
    .from('players')
    .insert({ name, class: playerClass })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getPendingAlerts(): Promise<PointAlert[]> {
  const { data, error } = await supabase
    .from('point_alerts')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function resolveAlert(alertId: string, action: 'create' | 'link', playerName?: string) {
  const { error } = await supabase
    .from('point_alerts')
    .update({ resolved: true })
    .eq('id', alertId)
  if (error) throw error
}

export async function suggestPlayerName(inputName: string) {
  const { data, error } = await supabase
    .rpc('suggest_player_name', { input_name: inputName })
  if (error) throw error
  return data ?? []
}
