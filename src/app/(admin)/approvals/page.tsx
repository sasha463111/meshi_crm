'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils/dates'
import { CheckCircle2, XCircle, Clock, Loader2, EyeOff, Eye, Trash2, Plus, Package, Upload, ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

interface ChangeRequest {
  id: string
  product_title: string | null
  product_image: string | null
  action: 'deactivate' | 'activate' | 'remove_variant' | 'add_variant'
  payload: { variantId?: string; variant_title?: string; size?: string; price?: number }
  status: string
  rejection_reason: string | null
  created_at: string
  suppliers: { name: string } | null
}

const actionLabels: Record<string, { label: string; color: string; icon: typeof EyeOff }> = {
  deactivate: { label: 'הורדה מהאתר', color: 'text-red-600', icon: EyeOff },
  activate: { label: 'החזרה לאתר', color: 'text-green-600', icon: Eye },
  remove_variant: { label: 'הסרת גודל', color: 'text-red-600', icon: Trash2 },
  add_variant: { label: 'הוספת גודל', color: 'text-blue-600', icon: Plus },
}

function actionDetail(cr: ChangeRequest): string {
  if (cr.action === 'remove_variant') return `גודל: ${cr.payload.variant_title || cr.payload.variantId}`
  if (cr.action === 'add_variant') return `גודל: ${cr.payload.size}${cr.payload.price ? ` · ₪${cr.payload.price}` : ''}`
  return ''
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['change-requests', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' ? '/api/change-requests' : `/api/change-requests?status=${statusFilter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ requests: ChangeRequest[] }>
    },
  })

  // Count pending new-product submissions for the cross-link badge
  const { data: submissionsData } = useQuery({
    queryKey: ['admin-submissions-pending-count'],
    queryFn: async () => {
      const res = await fetch('/api/submissions?status=pending')
      if (!res.ok) return { submissions: [] }
      return res.json() as Promise<{ submissions: unknown[] }>
    },
  })

  const processMutation = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: 'approve' | 'reject'; reason?: string }) => {
      const res = await fetch(`/api/change-requests/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      return d
    },
    onSuccess: () => {
      setActionError(null)
      setRejectingId(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['change-requests'] })
    },
    onError: (e) => setActionError((e as Error).message),
  })

  const requests = data?.requests || []
  const pendingSubmissions = submissionsData?.submissions?.length || 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">אישורים</h1>

      {/* Cross-link to new product submissions */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Upload className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">מוצרים חדשים להעלאה</p>
              <p className="text-xs text-muted-foreground">
                {pendingSubmissions > 0 ? `${pendingSubmissions} ממתינים לאישור` : 'אין ממתינים'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/submissions" />}>
            לעמוד המוצרים החדשים
            <ArrowLeft className="size-4 ms-1" />
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-bold mb-2">בקשות שינוי ממוצרים קיימים</h2>
        {/* Filter */}
        <div className="flex items-center gap-1 rounded-lg border p-1 w-fit mb-4">
          {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'ghost'} onClick={() => setStatusFilter(s)} className="text-xs h-7 px-3">
              {s === 'pending' ? 'ממתינים' : s === 'approved' ? 'אושרו' : s === 'rejected' ? 'נדחו' : 'הכל'}
            </Button>
          ))}
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm mb-4">
            שגיאה: {actionError}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-4 size-12" />
              <p>אין בקשות {statusFilter === 'pending' ? 'ממתינות' : ''}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((cr) => {
              const meta = actionLabels[cr.action]
              const Icon = meta?.icon || Clock
              const detail = actionDetail(cr)
              return (
                <Card key={cr.id}>
                  <CardContent className="py-3 flex items-center gap-4">
                    {cr.product_image ? (
                      <div className="relative size-16 rounded-md overflow-hidden shrink-0">
                        <Image src={cr.product_image} alt="" fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="size-16 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Package className="size-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 font-semibold ${meta?.color || ''}`}>
                          <Icon className="size-4" />
                          {meta?.label || cr.action}
                        </span>
                        {detail && <span className="text-sm text-muted-foreground">· {detail}</span>}
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate">{cr.product_title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cr.suppliers?.name} · {formatDateTime(cr.created_at)}
                      </p>
                      {cr.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">סיבת דחייה: {cr.rejection_reason}</p>
                      )}
                    </div>
                    {cr.status === 'pending' ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={processMutation.isPending}
                          onClick={() => processMutation.mutate({ id: cr.id, decision: 'approve' })}
                        >
                          {processMutation.isPending && processMutation.variables?.id === cr.id ? (
                            <Loader2 className="size-4 me-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-4 me-1" />
                          )}
                          אשר
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => { setRejectingId(cr.id); setRejectReason('') }}
                        >
                          <XCircle className="size-4 me-1" />
                          דחה
                        </Button>
                      </div>
                    ) : (
                      <span className={`text-xs font-medium shrink-0 ${cr.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                        {cr.status === 'approved' ? 'אושר' : 'נדחה'}
                      </span>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(v) => !v && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>דחיית בקשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="סיבת הדחייה (הספק יראה)" rows={3} />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejectingId(null)}>ביטול</Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={processMutation.isPending}
                onClick={() => rejectingId && processMutation.mutate({ id: rejectingId, decision: 'reject', reason: rejectReason })}
              >
                {processMutation.isPending && <Loader2 className="size-4 me-1 animate-spin" />}
                דחה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
