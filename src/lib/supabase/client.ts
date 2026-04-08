'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const STORAGE_KEY = 'meshi-auth-session'

let client: SupabaseClient | null = null

export function createClient() {
  if (client) return client

  // Use @supabase/supabase-js directly (not @supabase/ssr)
  // Auth is managed separately via our auth-provider
  // We use a custom fetch wrapper to inject auth headers dynamically
  // on each request, so the token is always fresh from localStorage.
  client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        // Inject auth header from localStorage on every request
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
              const session = JSON.parse(stored)
              if (session?.access_token) {
                headers.set('Authorization', `Bearer ${session.access_token}`)
              }
            }
          } catch {}
        }
        return fetch(input, { ...init, headers })
      },
    },
  })
  return client
}

// Force refresh the client's auth headers (call after login)
// Kept for backwards compatibility but no longer strictly necessary
// since headers are now injected dynamically on each request.
export function refreshClientAuth() {
  client = null
}
