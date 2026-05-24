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
