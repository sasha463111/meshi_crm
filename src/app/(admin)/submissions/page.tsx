'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { CheckCircle2, XCircle, Clock, Package, ZoomIn, Loader2, ExternalLink } from 'lucide-react'
import Image from 'next/image'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

interface Submission {
  id: string
  supplier_id: string
  title: string
  description: string | null
  price: number | null
  cost_price: number | null
  sku: string | null
  variants: Array<{ title: string; inventory: number; price: number | null }>
  image_urls: string[]
  notes: string | null
  status: string
  rejection_reason: string | null
  shopify_product_id: string | null
  created_at: string
  reviewed_at: string | null
  suppliers: { id: string; name: string; contact_name: string | null } | null
}

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  rejected: 'נדחה',
}

const statusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

export default function AdminSubmissionsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-submissions', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' ? '/api/submissions' : `/api/submissions?status=${statusFilter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ submissions: Submission[] }>
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/submissions/${id}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approve failed')
      return data
    },
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
    },
    onError: (error) => {
      setActionError((error as Error).message)
      setTimeout(() => setActionError(null), 8000)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/submissions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error('Reject failed')
      return res.json()
    },
    onSuccess: () => {
      setRejectingId(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
    },
  })

  const submissions = data?.submissions || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הצעות מוצרים מספקים</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg border p-1 self-start w-fit flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'ghost'}
            onClick={() => setStatusFilter(s)}
            className="text-xs h-7 px-3"
          >
            {s === 'all' ? 'הכל' : statusLabels[s]}
          </Button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
          שגיאה: {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>אין הצעות {statusFilter !== 'all' && `בסטטוס "${statusLabels[statusFilter]}"`}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {submissions.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.suppliers?.name} · {formatDateTime(s.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[s.status]}`}>
                    {s.status === 'pending' && <Clock className="size-3 me-1" />}
                    {s.status === 'approved' && <CheckCircle2 className="size-3 me-1" />}
                    {s.status === 'rejected' && <XCircle className="size-3 me-1" />}
                    {statusLabels[s.status]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Images */}
                <div className="grid grid-cols-4 gap-2">
                  {s.image_urls.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-md overflow-hidden border cursor-pointer group" onClick={() => setZoomedImage(url)}>
                      <Image src={url} alt="" fill className="object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="size-4 text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Details */}
                <div className="text-sm space-y-1">
                  {s.description && <p className="text-muted-foreground">{s.description}</p>}
                  <div className="flex items-center gap-3 flex-wrap text-xs">
                    {s.price && <span>מחיר: <span className="font-semibold">{formatCurrency(s.price)}</span></span>}
                    {s.sku && <span dir="ltr">SKU: {s.sku}</span>}
                  </div>
                  {s.variants?.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      {s.variants.map((v, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {v.title} ({v.inventory})
                        </Badge>
                      ))}
                    </div>
                  )}
                  {s.notes && (
                    <p className="text-xs italic text-muted-foreground border-t pt-2 mt-2">
                      הערת ספק: {s.notes}
                    </p>
                  )}
                  {s.rejection_reason && (
                    <p className="text-xs text-red-600 border-t pt-2 mt-2">
                      סיבת דחייה: {s.rejection_reason}
                    </p>
                  )}
                  {s.shopify_product_id && (
                    <a
                      href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || '75snke-n1.myshopify.com'}/admin/products/${s.shopify_product_id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      פתח ב-Shopify
                    </a>
                  )}
                </div>

                {/* Actions */}
                {s.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(s.id)}
                    >
                      {approveMutation.isPending && approveMutation.variables === s.id ? (
                        <Loader2 className="size-4 me-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4 me-1" />
                      )}
                      אשר והעלה ל-Shopify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => setRejectingId(s.id)}
                    >
                      <XCircle className="size-4 me-1" />
                      דחה
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Image zoom */}
      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomedImage && (
            <Image src={zoomedImage} alt="" width={1200} height={1200} className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={() => setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>דחיית הצעת מוצר</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="סיבת הדחייה (הספק יראה את זה)"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejectingId(null)}>
                ביטול
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={rejectMutation.isPending}
                onClick={() => rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
              >
                {rejectMutation.isPending ? <Loader2 className="size-4 me-1 animate-spin" /> : null}
                דחה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
