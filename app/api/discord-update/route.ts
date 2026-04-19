// app/api/discord-update/route.ts
// Server-Sent Events endpoint — pushes realtime updates to the web app
// when Discord sends a new report/claim
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  )
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'connected', message: 'Discord sync activo' })}\n\n`
      ))

      // Subscribe to Supabase realtime for changes in maze_sessions and claims
      const channel = getSupabase()
        .channel('discord-sync')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'maze_sessions'
        }, payload => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'new_session', data: payload.new })}\n\n`
          ))
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'claims'
        }, payload => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'new_claim', data: payload.new })}\n\n`
          ))
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'discord_pending_reports'
        }, payload => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'pending_report', data: payload.new })}\n\n`
          ))
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'players'
        }, payload => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'player_updated', data: payload.new })}\n\n`
          ))
        })
        .subscribe()

      // Heartbeat every 25s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 25000)

      // Cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        getSupabase().removeChannel(channel)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
