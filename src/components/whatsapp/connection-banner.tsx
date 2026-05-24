'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MessageCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface StatusResponse {
  state: string
  connected: boolean
}

/**
 * Checks the WhatsApp (Evolution) connection on mount and shows a banner with a
 * "connect" button when the number is offline. Re-checks every minute.
 */
export function WhatsAppConnectionBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json() as Promise<StatusResponse>
    },
    refetchInterval: 60000,
    staleTime: 30000,
  })

  if (isLoading || data?.connected) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <AlertTriangle className="size-4 shrink-0" />
        <span>וואטסאפ מנותק — לא נשלחות הודעות ללקוחות עד שתחברו מחדש את המספר.</span>
      </div>
      <Link href="/whatsapp/connect">
        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white shrink-0">
          <MessageCircle className="size-4 me-1" />
          לחיבור
        </Button>
      </Link>
    </div>
  )
}

/** Small inline green indicator for when it IS connected (optional use). */
export function WhatsAppConnectedPill() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700">
      <CheckCircle2 className="size-3.5" />
      וואטסאפ מחובר
    </span>
  )
}

function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status')
      return res.json() as Promise<StatusResponse>
    },
    refetchInterval: 60000,
    staleTime: 30000,
  })
}

/**
 * Always-visible status bar (green = connected, red = disconnected) with a
 * connect/manage button. For the top of the WhatsApp page.
 */
export function WhatsAppStatusBar() {
  const { data, isLoading } = useWhatsAppStatus()
  const connected = !!data?.connected

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        isLoading ? 'bg-muted/40' : connected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span
          className={`size-2.5 rounded-full ${
            isLoading ? 'bg-muted-foreground' : connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
          }`}
        />
        <span className={connected ? 'text-green-800' : isLoading ? '' : 'text-red-800'}>
          {isLoading ? 'בודק חיבור וואטסאפ...' : connected ? 'וואטסאפ מחובר ופעיל' : 'וואטסאפ מנותק'}
        </span>
      </div>
      {!isLoading && (
        <Link href="/whatsapp/connect">
          {connected ? (
            <Button variant="outline" size="sm">
              נהל חיבור
            </Button>
          ) : (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <MessageCircle className="size-4 me-1" />
              לחיבור
            </Button>
          )}
        </Link>
      )}
    </div>
  )
}

/** Tiny status dot for the sidebar nav item. */
export function WhatsAppNavDot() {
  const { data } = useWhatsAppStatus()
  if (!data) return null
  return (
    <span
      className={`ms-auto size-2 shrink-0 rounded-full ${data.connected ? 'bg-green-500' : 'bg-red-500'}`}
      title={data.connected ? 'וואטסאפ מחובר' : 'וואטסאפ מנותק'}
    />
  )
}
