import { createClient } from '@supabase/supabase-js'

export type MazeType = 'BD' | 'FV'

export interface Player {
  id: string; name: string; class?: string
  owner?: string; chars?: string; is_active: boolean
}
export interface Runes {
  id: string; player_id: string
  curse: number; illusory: number; piercing: number
  riven_soul: number; favor: number; prayer: number; scroll_ring: number
}
export interface LeaderboardEntry {
  id: string; name: string; class?: string; owner?: string; chars?: string
  total_points: number; bd_points: number; fv_points: number
  admin_points_total?: number; total_claims: number
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
  notes?: string; approved: boolean; approved_at?: string
  players?: { name: string }
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
  const { data } = await supabase.from('players').select('*').order('name')
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
  const { data } = await supabase.from('claims').select('*, players(name)').order('created_at', { ascending: false })
  return data ?? []
}
export async function createClaim(playerId: string, notes?: string) {
  const { data, error } = await supabase.from('claims').insert({ player_id: playerId, notes, approved: false }).select().single()
  if (error) throw error
  return data
}
export async function approveClaim(claimId: string) {
  const { error } = await supabase.from('claims').update({ approved: true, approved_at: new Date().toISOString() }).eq('id', claimId)
  if (error) throw error
}
export async function createPlayer(name: string, owner?: string, chars?: string, playerClass?: string) {
  const { data, error } = await supabase.from('players').insert({ name, owner, chars, class: playerClass }).select().single()
  if (error) throw error
  return data
}
export async function updatePlayer(id: string, updates: Partial<Player>) {
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
}
export async function resolveAlert(alertId: string, action: string, playerName?: string) {
  await supabase.from('point_alerts').update({ resolved: true }).eq('id', alertId)
}
export async function suggestPlayerName(input: string) {
  const { data } = await supabase.rpc('suggest_player_name', { input_name: input })
  return data ?? []
}
