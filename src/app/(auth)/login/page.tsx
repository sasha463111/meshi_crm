'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Direct fetch to Supabase Auth API - bypasses navigator.locks issue
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError('אימייל או סיסמה שגויים')
        setLoading(false)
        return
      }

      // Store session in our own localStorage key (NOT the Supabase client's key)
      // to avoid conflicts with @supabase/ssr's internal storage
      const sessionPayload = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: data.user,
      }
      localStorage.setItem('meshi-auth-session', JSON.stringify(sessionPayload))

      // Check user role to redirect accordingly
      try {
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=role`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${data.access_token}`,
            },
          }
        )
        const profiles = await profileRes.json()
        if (profiles?.[0]?.role === 'supplier') {
          window.location.href = '/portal'
          return
        }
      } catch {
        // If profile fetch fails, default to dashboard
      }

      window.location.href = '/dashboard'
    } catch {
      setError('שגיאת חיבור')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">משי הום</CardTitle>
          <CardDescription>מערכת ניהול - התחברות</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'מתחבר...' : 'התחברות'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
