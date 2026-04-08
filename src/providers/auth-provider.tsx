'use client'

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { Profile } from '@/types/database'
import type { User } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const STORAGE_KEY = 'meshi-auth-session'

interface SessionData {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: User
}

interface AuthContext {
  user: User | null
  profile: Profile | null
  loading: boolean
  accessToken: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContext>({
  user: null,
  profile: null,
  loading: true,
  accessToken: null,
  signOut: async () => {},
})

async function fetchWithAuth(url: string, token: string) {
  return fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    let mounted = true

    const fetchProfile = async (userId: string, token: string) => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            },
          }
        )
        const rows = await res.json()
        if (mounted && rows?.[0]) setProfile(rows[0])
      } catch {
        // Profile fetch failed
      }
    }

    const refreshSession = async (refreshToken: string): Promise<SessionData | null> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (res.ok) {
          const data = await res.json()
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
          return data
        }
      } catch {}
      return null
    }

    const initAuth = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) {
          if (mounted) setLoading(false)
          return
        }

        const session: SessionData = JSON.parse(stored)
        if (!session?.access_token || !session?.user) {
          if (mounted) setLoading(false)
          return
        }

        // Verify token is still valid
        const res = await fetchWithAuth(`${SUPABASE_URL}/auth/v1/user`, session.access_token)

        if (res.ok) {
          const userData = await res.json()
          if (mounted) {
            setUser(userData)
            setAccessToken(session.access_token)
            await fetchProfile(userData.id, session.access_token)
            setLoading(false)
          }
          return
        }

        // Token expired - try refresh
        if (session.refresh_token) {
          const newSession = await refreshSession(session.refresh_token)
          if (newSession && mounted) {
            setUser(newSession.user)
            setAccessToken(newSession.access_token)
            await fetchProfile(newSession.user.id, newSession.access_token)
            setLoading(false)
            return
          }
        }

        // All failed - clear and mark as unauthenticated
        localStorage.removeItem(STORAGE_KEY)
        if (mounted) setLoading(false)
      } catch {
        if (mounted) setLoading(false)
      }
    }

    initAuth()

    // Hard timeout safety net
    const hardTimeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(hardTimeout)
    }
  }, [])

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
    setProfile(null)
    setAccessToken(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, accessToken, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
