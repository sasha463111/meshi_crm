'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { formatCurrency } from '@/lib/utils/currency'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Search, X, Upload, Trash2, RotateCcw, Package, ZoomIn, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface Variant {
  title: string
  price: string
  sku: string | null
  inventory: number
}

interface Product {
  id: string
  shopify_product_id: string
  title: string
  price: number
  status: string
  image: string | null
  total_inventory: number
  variants: Variant[]
  product_type: string | null
  removal_requested: boolean
  removal_requested_at: string | null
}

export default function SupplierProductsPage() {
  const { supplier } = useSupplierAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [removalTarget, setRemovalTarget] = useState<Product | null>(null)
  const [removalReason, setRemovalReason] = useState('')
  const [filter, setFilter] = useState<'all' | 'flagged'>('all')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const autoSyncDone = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-products', supplier?.supplier_id],
    enabled: !!supplier?.access_token,
    queryFn: async () => {
      const res = await fetch('/api/suppliers/products', {
        headers: { 'x-supplier-token': supplier!.access_token },
      })
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ products: Product[] }>
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync-products', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Sync failed')
      return d
    },
    onSuccess: (d) => {
      setSyncResult(`סונכרנו ${d.created || 0} חדשים, ${d.updated || 0} עודכנו`)
      setTimeout(() => setSyncResult(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['supplier-products'] })
    },
    onError: (e) => {
      setSyncResult(`שגיאה: ${(e as Error).message}`)
      setTimeout(() => setSyncResult(null), 6000)
    },
  })

  // Auto-sync products from Shopify on first load
  useEffect(() => {
    if (supplier?.access_token && !autoSyncDone.current) {
      autoSyncDone.current = true
      fetch('/api/sync-products', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => {
          if (d.created > 0 || d.updated > 0) {
            queryClient.invalidateQueries({ queryKey: ['supplier-products'] })
          }
        })
        .catch(() => {})
    }
  }, [supplier?.access_token]) // eslint-disable-line react-hooks/exhaustive-deps

  const removalMutation = useMutation({
    mutationFn: async ({ id, requested, reason }: { id: string; requested: boolean; reason?: string }) => {
      const res = await fetch(`/api/suppliers/products/${id}/removal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supplier-token': supplier!.access_token },
        body: JSON.stringify({ requested, reason }),
      })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-products'] })
      setRemovalTarget(null)
      setRemovalReason('')
    },
  })

  const products = data?.products || []
  const searchLower = search.trim().toLowerCase()
  const filtered = products.filter((p) => {
    if (filter === 'flagged' && !p.removal_requested) return false
    if (!searchLower) return true
    return (
      p.title.toLowerCase().includes(searchLower) ||
      p.variants.some((v) => v.sku?.toLowerCase().includes(searchLower) || v.title.toLowerCase().includes(searchLower))
    )
  })

  const flaggedCount = products.filter((p) => p.removal_requested).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">המוצרים שלי</h1>
        <div className="flex items-center gap-2">
          {syncResult && <span className="text-xs text-muted-foreground">{syncResult}</span>}
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="size-4 me-1 animate-spin" /> : <RefreshCw className="size-4 me-1" />}
            סנכרן מ-Shopify
          </Button>
          <Button render={<Link href="/portal/submit" />} size="sm">
            <Upload className="size-4 me-1" />
            העלה מוצר חדש
          </Button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="חפש לפי שם מוצר או מק״ט"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9 pe-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'ghost'} onClick={() => setFilter('all')} className="text-xs h-7 px-3">
            הכל ({products.length})
          </Button>
          <Button size="sm" variant={filter === 'flagged' ? 'default' : 'ghost'} onClick={() => setFilter('flagged')} className="text-xs h-7 px-3">
            סומנו להסרה ({flaggedCount})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>{search ? `לא נמצאו תוצאות עבור "${search}"` : filter === 'flagged' ? 'אין מוצרים שסומנו להסרה' : 'אין מוצרים'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border overflow-hidden flex flex-col ${p.removal_requested ? 'border-red-300 bg-red-50/40' : ''}`}
            >
              <div className="flex gap-3 p-3">
                {p.image ? (
                  <div className="relative size-20 rounded-md overflow-hidden shrink-0 cursor-pointer group" onClick={() => setZoomedImage(p.image)}>
                    <Image src={p.image} alt={p.title} fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="size-4 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="size-20 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Package className="size-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight line-clamp-2">{p.title}</p>
                  <p className="text-sm font-bold mt-1">{formatCurrency(Number(p.price))}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {p.status === 'active' ? 'באתר' : p.status === 'draft' ? 'טיוטה' : p.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">מלאי: {p.total_inventory}</span>
                  </div>
                </div>
              </div>

              {/* Variants / sizes */}
              {p.variants.length > 0 && (
                <div className="px-3 pb-2">
                  <div className="flex flex-wrap gap-1">
                    {p.variants.map((v, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${v.inventory > 0 ? 'bg-background' : 'bg-muted text-muted-foreground'}`}
                        title={v.sku || ''}
                      >
                        {v.title}
                        <span className="text-muted-foreground">·</span>
                        {v.inventory > 0 ? `${v.inventory} במלאי` : 'אזל'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Removal action */}
              <div className="mt-auto border-t px-3 py-2">
                {p.removal_requested ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      סומן להסרה
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={() => removalMutation.mutate({ id: p.id, requested: false })}
                      disabled={removalMutation.isPending}
                    >
                      <RotateCcw className="size-3 me-1" />
                      בטל
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs h-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => { setRemovalTarget(p); setRemovalReason('') }}
                  >
                    <Trash2 className="size-3 me-1" />
                    סמן להסרה מהאתר
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Removal reason dialog */}
      <Dialog open={!!removalTarget} onOpenChange={(v) => !v && setRemovalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>סימון מוצר להסרה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              המוצר &quot;{removalTarget?.title}&quot; יסומן להסרה. האדמין יקבל התראה ויסיר אותו מהאתר.
            </p>
            <Textarea
              value={removalReason}
              onChange={(e) => setRemovalReason(e.target.value)}
              placeholder="סיבה (אופציונלי) — למשל: אזל מהמלאי, הופסק..."
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRemovalTarget(null)}>
                ביטול
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={removalMutation.isPending}
                onClick={() => removalTarget && removalMutation.mutate({ id: removalTarget.id, requested: true, reason: removalReason })}
              >
                {removalMutation.isPending && <Loader2 className="size-4 me-1 animate-spin" />}
                סמן להסרה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image zoom */}
      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {zoomedImage && <Image src={zoomedImage} alt="" width={900} height={900} className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
