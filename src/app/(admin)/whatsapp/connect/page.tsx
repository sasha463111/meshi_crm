'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, RefreshCw, ArrowRight, Smartphone } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

interface StatusResponse {
  state: string
  connected: boolean
}
interface QrResponse {
  base64: string | null
  code: string | null
  pairingCode: string | null
  error?: string
}

export default function WhatsAppConnectPage() {
  // Poll connection state every 3s so the page flips to "connected" automatically
  const status = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => (await fetch('/api/whatsapp/status')).json() as Promise<StatusResponse>,
    refetchInterval: 3000,
  })
  const connected = !!status.data?.connected

  // Fetch a QR; refresh every 30s (QR codes expire) while not connected
  const qr = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: async () => (await fetch('/api/whatsapp/connect')).json() as Promise<QrResponse>,
    enabled: !connected,
    refetchInterval: connected ? false : 30000,
  })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">חיבור וואטסאפ</h1>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowRight className="size-4 me-1" />
            חזרה לדשבורד
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-green-600" />
            {connected ? 'המספר מחובר' : 'סריקת קוד QR'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-14 text-green-600" />
              <p className="text-lg font-semibold">וואטסאפ מחובר ופעיל ✅</p>
              <p className="text-sm text-muted-foreground">
                המספר באוויר וההודעות יישלחו כרגיל.
              </p>
              <Link href="/dashboard">
                <Button className="mt-2">חזרה לדשבורד</Button>
              </Link>
            </div>
          ) : (
            <>
              <ol className="list-decimal pr-5 text-sm text-muted-foreground space-y-1">
                <li>פתחו וואטסאפ בטלפון של העסק</li>
                <li>הגדרות ← מכשירים מקושרים ← קישור מכשיר</li>
                <li>סרקו את הקוד שמופיע כאן</li>
              </ol>

              <div className="flex flex-col items-center justify-center gap-3 py-2">
                {qr.isLoading ? (
                  <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border bg-muted">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  </div>
                ) : qr.data?.base64 ? (
                  <div className="rounded-lg border bg-white p-3">
                    <Image
                      src={qr.data.base64}
                      alt="WhatsApp QR"
                      width={280}
                      height={280}
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-2 rounded-lg border bg-muted text-center text-sm text-muted-foreground">
                    <p>לא הצלחנו לקבל קוד QR.</p>
                    {qr.data?.error && <p className="text-xs text-red-500">{qr.data.error}</p>}
                  </div>
                )}

                {qr.data?.pairingCode && (
                  <p className="text-sm">
                    או הזינו קוד קישור:{' '}
                    <span dir="ltr" className="font-mono font-bold tracking-widest">
                      {qr.data.pairingCode}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                ממתין לסריקה... (הדף יתעדכן אוטומטית כשהחיבור יושלם)
              </div>

              <Button variant="outline" className="w-full" onClick={() => qr.refetch()} disabled={qr.isFetching}>
                <RefreshCw className={`size-4 me-1 ${qr.isFetching ? 'animate-spin' : ''}`} />
                רענן קוד
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
