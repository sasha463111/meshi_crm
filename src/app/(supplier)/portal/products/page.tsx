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
import { Label } from '@/components/ui/label'
import { Search, X, Upload, Package, ZoomIn, Loader2, RefreshCw, EyeOff, Eye, Plus } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

// Map Shopify product types to Hebrew category labels
const CATEGORY_MAP: Record<string, string> = {
  'Bed Sheets': 'מצעים',
  'Curtains': 'וילונות',
  'Rugs': 'שטיחים',
  'Towels': 'מגבות',
  'Chairs': 'כיסאות',
  'Sofa Covers': 'כיסויי ספה',
  'Pillows': 'כריות',
  'Blankets': 'שמיכות',
}

function categoryLabel(productType: string | null): string {
  if (!productType) return 'אחר'
  return CATEGORY_MAP[productType] || productType
}

interface Variant {
  id: string
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
  const [filter, setFilter] = useState<'available' | 'inactive' | 'all'>('available')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [variantBusy, setVariantBusy] = useState<string | null>(null) // variantId or "add-<productId>"
  const [addSizeProduct, setAddSizeProduct] = useState<Product | null>(null)
  const [newSize, setNewSize] = useState('')
  const [newSizePrice, setNewSizePrice] = useState<number | ''>('')
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

  const statusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      setTogglingId(id)
      const res = await fetch(`/api/suppliers/products/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supplier-token': supplier!.access_token },
        body: JSON.stringify({ active }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-products'] })
      setTogglingId(null)
    },
    onError: (e) => {
      setSyncResult(`שגיאה: ${(e as Error).message}`)
      setTimeout(() => setSyncResult(null), 6000)
      setTogglingId(null)
    },
  })

  const variantMutation = useMutation({
    mutationFn: async (vars: { productId: string; action: 'add' | 'delete'; variantId?: string; size?: string; price?: number }) => {
      const res = await fetch(`/api/suppliers/products/${vars.productId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supplier-token': supplier!.access_token },
        body: JSON.stringify(vars),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-products'] })
      setVariantBusy(null)
      setAddSizeProduct(null)
      setNewSize('')
      setNewSizePrice('')
    },
    onError: (e) => {
      setSyncResult(`שגיאה: ${(e as Error).message}`)
      setTimeout(() => setSyncResult(null), 6000)
      setVariantBusy(null)
    },
  })

  const products = data?.products || []
  const searchLower = search.trim().toLowerCase()

  // "available" = active AND has stock > 0 AND has at least one real size variant
  const isAvailable = (p: Product) => p.status === 'active' && p.total_inventory > 0 && p.variants.length > 0

  const availableCount = products.filter(isAvailable).length
  const inactiveCount = products.filter((p) => p.status !== 'active').length

  const filtered = products.filter((p) => {
    if (filter === 'available' && !isAvailable(p)) return false
    if (filter === 'inactive' && p.status === 'active') return false
    if (!searchLower) return true
    return (
      p.title.toLowerCase().includes(searchLower) ||
      p.variants.some((v) => v.sku?.toLowerCase().includes(searchLower) || v.title.toLowerCase().includes(searchLower))
    )
  })

  // Build category list (from currently filtered set) and group
  const categoryCounts = new Map<string, number>()
  for (const p of filtered) {
    const cat = categoryLabel(p.product_type)
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1)
  }
  const categories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])

  const visibleProducts = activeCategory === 'all'
    ? filtered
    : filtered.filter((p) => categoryLabel(p.product_type) === activeCategory)

  // Group visible products by category for sectioned display
  const grouped = new Map<string, Product[]>()
  for (const p of visibleProducts) {
    const cat = categoryLabel(p.product_type)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(p)
  }
  const groupedSorted = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length)

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
          <Button size="sm" variant={filter === 'available' ? 'default' : 'ghost'} onClick={() => { setFilter('available'); setActiveCategory('all') }} className="text-xs h-7 px-3">
            זמינים ({availableCount})
          </Button>
          <Button size="sm" variant={filter === 'inactive' ? 'default' : 'ghost'} onClick={() => { setFilter('inactive'); setActiveCategory('all') }} className="text-xs h-7 px-3">
            לא פעילים ({inactiveCount})
          </Button>
          <Button size="sm" variant={filter === 'all' ? 'default' : 'ghost'} onClick={() => { setFilter('all'); setActiveCategory('all') }} className="text-xs h-7 px-3">
            הכל ({products.length})
          </Button>
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveCategory('all')}
            className="text-xs h-7 px-3 rounded-full"
          >
            הכל ({filtered.length})
          </Button>
          {categories.map(([cat, count]) => (
            <Button
              key={cat}
              size="sm"
              variant={activeCategory === cat ? 'default' : 'outline'}
              onClick={() => setActiveCategory(cat)}
              className="text-xs h-7 px-3 rounded-full"
            >
              {cat} ({count})
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>{search ? `לא נמצאו תוצאות עבור "${search}"` : filter === 'inactive' ? 'אין מוצרים לא פעילים' : 'אין מוצרים'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedSorted.map(([cat, catProducts]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-base font-bold">{cat}</h2>
                <span className="text-xs text-muted-foreground">({catProducts.length})</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catProducts.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-lg border overflow-hidden flex flex-col ${p.status !== 'active' ? 'border-muted bg-muted/30 opacity-80' : ''}`}
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

                    {/* Variants / sizes — each removable, plus add-size */}
                    <div className="px-3 pb-2">
                      <div className="flex flex-wrap gap-1 items-center">
                        {p.variants.map((v) => (
                          <span
                            key={v.id}
                            className={`group/chip inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${v.inventory > 0 ? 'bg-background' : 'bg-muted text-muted-foreground'}`}
                            title={v.sku || ''}
                          >
                            {v.title}
                            <span className="text-muted-foreground">·</span>
                            {v.inventory > 0 ? `${v.inventory} במלאי` : 'אזל'}
                            <button
                              className="ms-0.5 rounded-full hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                              title="הסר גודל זה"
                              disabled={variantBusy === v.id || p.variants.length <= 1}
                              onClick={() => {
                                if (p.variants.length <= 1) return
                                if (!confirm(`להסיר את הגודל "${v.title}"?`)) return
                                setVariantBusy(v.id)
                                variantMutation.mutate({ productId: p.id, action: 'delete', variantId: v.id })
                              }}
                            >
                              {variantBusy === v.id ? <Loader2 className="size-2.5 animate-spin" /> : <X className="size-2.5" />}
                            </button>
                          </span>
                        ))}
                        <button
                          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                          onClick={() => { setAddSizeProduct(p); setNewSize(''); setNewSizePrice(p.price || '') }}
                        >
                          <Plus className="size-2.5" />
                          גודל
                        </button>
                      </div>
                    </div>

                    {/* Activate / Deactivate action */}
                    <div className="mt-auto border-t px-3 py-2">
                      {p.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-xs h-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => statusMutation.mutate({ id: p.id, active: false })}
                          disabled={togglingId === p.id}
                        >
                          {togglingId === p.id ? <Loader2 className="size-3 me-1 animate-spin" /> : <EyeOff className="size-3 me-1" />}
                          הורד מהאתר
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-xs h-7 text-green-600 hover:bg-green-50 hover:text-green-700"
                          onClick={() => statusMutation.mutate({ id: p.id, active: true })}
                          disabled={togglingId === p.id}
                        >
                          {togglingId === p.id ? <Loader2 className="size-3 me-1 animate-spin" /> : <Eye className="size-3 me-1" />}
                          החזר לאתר
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add size dialog */}
      <Dialog open={!!addSizeProduct} onOpenChange={(v) => !v && setAddSizeProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת גודל ל&quot;{addSizeProduct?.title}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-size">גודל</Label>
              <Input
                id="new-size"
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                placeholder="לדוגמה: 200X180"
                className="mt-1"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="new-size-price">מחיר (₪)</Label>
              <Input
                id="new-size-price"
                type="number"
                value={newSizePrice}
                onChange={(e) => setNewSizePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="79"
                className="mt-1"
                dir="ltr"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              הגודל יתווסף למוצר ב-Shopify. את כמות המלאי תוכל לעדכן ב-Shopify.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddSizeProduct(null)}>
                ביטול
              </Button>
              <Button
                className="flex-1"
                disabled={!newSize.trim() || variantBusy === `add-${addSizeProduct?.id}`}
                onClick={() => {
                  if (!addSizeProduct) return
                  setVariantBusy(`add-${addSizeProduct.id}`)
                  variantMutation.mutate({
                    productId: addSizeProduct.id,
                    action: 'add',
                    size: newSize.trim(),
                    price: newSizePrice === '' ? 0 : Number(newSizePrice),
                  })
                }}
              >
                {variantBusy === `add-${addSizeProduct?.id}` && <Loader2 className="size-4 me-1 animate-spin" />}
                הוסף גודל
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
