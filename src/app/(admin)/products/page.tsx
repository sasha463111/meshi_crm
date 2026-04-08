'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Search, Package, X, Check, ListChecks, Grid3X3, Save, CheckSquare } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'

type ViewMode = 'grid' | 'bulk'
type ProductFilter = 'active' | 'published' | 'all'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState<ProductFilter>('published')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [costValue, setCostValue] = useState('')
  // Bulk editing
  const [bulkCosts, setBulkCosts] = useState<Record<string, string>>({})
  const [bulkSaving, setBulkSaving] = useState(false)
  // Selection for bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .order('title')
      return data || []
    },
  })

  const updateCostMutation = useMutation({
    mutationFn: async ({ id, cost }: { id: string; cost: number }) => {
      const { error } = await supabase
        .from('products')
        .update({ cost_price: cost, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditingProduct(null)
      setCostValue('')
    },
  })

  const handleBulkSave = async () => {
    const entries = Object.entries(bulkCosts).filter(([, v]) => v.trim() !== '')
    if (entries.length === 0) return

    setBulkSaving(true)
    try {
      for (const [id, val] of entries) {
        const cost = parseFloat(val)
        if (!isNaN(cost) && cost >= 0) {
          await supabase
            .from('products')
            .update({ cost_price: cost, updated_at: new Date().toISOString() })
            .eq('id', id)
        }
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setBulkCosts({})
    } finally {
      setBulkSaving(false)
    }
  }

  const isPublished = (p: Record<string, unknown>) => {
    // Check shopify_data for published_at or status
    const sd = p.shopify_data as Record<string, unknown> | null
    if (sd?.published_at) return true
    if (sd?.status === 'active') return true
    return false
  }

  const filtered = products?.filter((p) => {
    if (productFilter === 'active' && p.status !== 'active' && p.status !== 'ACTIVE') return false
    if (productFilter === 'published') {
      if (p.status !== 'active' && p.status !== 'ACTIVE') return false
      if (!isPublished(p)) return false
    }
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.title.toLowerCase().includes(s) ||
      p.sku?.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s) ||
      p.tags?.some((t: string) => t.toLowerCase().includes(s))
    )
  })

  const totalProducts = filtered?.length || 0
  const withCost = filtered?.filter(p => p.cost_price && Number(p.cost_price) > 0).length || 0
  const totalCostValue = filtered?.reduce((sum, p) => sum + (Number(p.cost_price || 0) * p.inventory_quantity), 0) || 0
  const totalRetailValue = filtered?.reduce((sum, p) => sum + (Number(p.price) * p.inventory_quantity), 0) || 0
  const changedCount = Object.values(bulkCosts).filter(v => v.trim() !== '').length

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!filtered) return
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  const isAllSelected = filtered && filtered.length > 0 && selectedIds.size === filtered.length

  const handleSaveCost = (productId: string) => {
    const cost = parseFloat(costValue)
    if (isNaN(cost) || cost < 0) return
    updateCostMutation.mutate({ id: productId, cost })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">מוצרים</h1>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              size="sm"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              onClick={() => setViewMode('grid')}
              className="text-xs h-7 px-2"
            >
              <Grid3X3 className="size-3.5 me-1" />
              תצוגה
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'bulk' ? 'default' : 'ghost'}
              onClick={() => setViewMode('bulk')}
              className="text-xs h-7 px-2"
            >
              <ListChecks className="size-3.5 me-1" />
              עלויות
            </Button>
          </div>
          {/* Product filter */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              size="sm"
              variant={productFilter === 'published' ? 'default' : 'ghost'}
              onClick={() => setProductFilter('published')}
              className="text-xs h-7 px-2"
            >
              בחנות
            </Button>
            <Button
              size="sm"
              variant={productFilter === 'active' ? 'default' : 'ghost'}
              onClick={() => setProductFilter('active')}
              className="text-xs h-7 px-2"
            >
              פעילים
            </Button>
            <Button
              size="sm"
              variant={productFilter === 'all' ? 'default' : 'ghost'}
              onClick={() => setProductFilter('all')}
              className="text-xs h-7 px-2"
            >
              הכל
            </Button>
          </div>
        </div>
      </div>

      {/* Search & Summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם, SKU, ברקוד, קטגוריה..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span><strong>{totalProducts}</strong> מוצרים</span>
          <span><strong>{withCost}</strong> עם עלות</span>
          <span>שווי: <strong>{formatCurrency(totalRetailValue)}</strong></span>
          <span>עלות: <strong>{formatCurrency(totalCostValue)}</strong></span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>לא נמצאו מוצרים</p>
          </CardContent>
        </Card>
      ) : viewMode === 'bulk' ? (
        /* ===== BULK COST EDITING VIEW ===== */
        <div className="space-y-3">
          {/* Selection & Bulk actions bar */}
          {(selectedIds.size > 0 || changedCount > 0) && (
            <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 shadow-sm">
              {/* Selection bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <CheckSquare className="size-4" />
                    {selectedIds.size} מוצרים נבחרו
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="עלות לכולם..."
                      className="h-8 w-28 text-sm"
                      dir="ltr"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value
                          if (val) {
                            const newCosts = { ...bulkCosts }
                            selectedIds.forEach(id => { newCosts[id] = val })
                            setBulkCosts(newCosts)
                            ;(e.target as HTMLInputElement).value = ''
                          }
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const input = document.querySelector('input[placeholder="עלות לכולם..."]') as HTMLInputElement
                        const val = input?.value
                        if (val) {
                          const newCosts = { ...bulkCosts }
                          selectedIds.forEach(id => { newCosts[id] = val })
                          setBulkCosts(newCosts)
                          input.value = ''
                        }
                      }}
                      className="text-xs h-8"
                    >
                      החל עלות
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs h-8"
                    >
                      <X className="size-3.5 me-1" />
                      בטל בחירה
                    </Button>
                  </div>
                </div>
              )}
              {/* Save bar */}
              {changedCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {changedCount} מוצרים עם שינויים
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkCosts({})}
                    >
                      <X className="size-3.5 me-1" />
                      בטל
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleBulkSave}
                      disabled={bulkSaving}
                    >
                      <Save className="size-3.5 me-1" />
                      {bulkSaving ? 'שומר...' : `שמור ${changedCount} מוצרים`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table-like list */}
          <div className="rounded-lg border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center px-3 py-2 bg-muted text-xs font-medium text-muted-foreground">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={toggleSelectAll}
                className="size-4"
              />
              <span>מוצר</span>
              <span className="w-20 text-center">מחיר</span>
              <span className="w-24 text-center">עלות</span>
              <span className="w-16 text-center">מרווח</span>
            </div>

            {/* Rows */}
            {filtered?.map((product) => {
              const price = Number(product.price) || 0
              const currentCost = Number(product.cost_price) || 0
              const editedValue = bulkCosts[product.id]
              const displayCost = editedValue !== undefined ? editedValue : (currentCost > 0 ? currentCost.toString() : '')
              const costForCalc = editedValue !== undefined ? parseFloat(editedValue) || 0 : currentCost
              const margin = price > 0 && costForCalc > 0 ? ((1 - costForCalc / price) * 100) : null
              const isChanged = editedValue !== undefined && editedValue.trim() !== '' && parseFloat(editedValue) !== currentCost
              const firstImage = (product.images as { url: string; alt: string }[])?.[0]

              return (
                <div
                  key={product.id}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center px-3 py-2 border-t ${
                    isChanged ? 'bg-green-50/50 dark:bg-green-950/20' : ''
                  } ${selectedIds.has(product.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={() => toggleSelect(product.id)}
                    className="size-4"
                  />
                  {/* Product info */}
                  <div className="flex items-center gap-2 min-w-0">
                    {firstImage ? (
                      <Image
                        src={firstImage.url}
                        alt={product.title}
                        width={36}
                        height={36}
                        className="size-9 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="size-9 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{product.title}</p>
                      {product.sku && (
                        <p className="text-[10px] text-muted-foreground" dir="ltr">{product.sku}</p>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <span className="w-20 text-center text-sm font-medium">
                    {formatCurrency(price)}
                  </span>

                  {/* Cost input */}
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={displayCost}
                      onChange={(e) => {
                        setBulkCosts(prev => ({ ...prev, [product.id]: e.target.value }))
                      }}
                      className="h-8 text-sm text-center"
                      dir="ltr"
                    />
                  </div>

                  {/* Margin */}
                  <span className={`w-16 text-center text-xs font-bold ${
                    margin === null ? 'text-muted-foreground' :
                    margin >= 30 ? 'text-green-600' :
                    margin >= 15 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {margin !== null ? `${margin.toFixed(0)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ===== GRID VIEW ===== */
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((product) => {
            const firstImage = (product.images as { url: string; alt: string }[])?.[0]
            const costPrice = Number(product.cost_price) || 0
            const price = Number(product.price) || 0
            const margin = price > 0 && costPrice > 0 ? ((1 - costPrice / price) * 100) : null
            const isEditing = editingProduct === product.id

            return (
              <div key={product.id} className="rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
                {firstImage ? (
                  <Image
                    src={firstImage.url}
                    alt={firstImage.alt || product.title}
                    width={400}
                    height={200}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="h-40 w-full bg-muted flex items-center justify-center text-muted-foreground">
                    אין תמונה
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <h3 className="font-medium text-sm line-clamp-1">{product.title}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold">{formatCurrency(price)}</span>
                    <Badge variant={product.inventory_quantity > 0 ? 'secondary' : 'destructive'} className="text-[10px]">
                      {product.inventory_quantity > 0 ? `${product.inventory_quantity} במלאי` : 'אזל'}
                    </Badge>
                  </div>

                  {product.sku && (
                    <p className="text-[10px] text-muted-foreground" dir="ltr">SKU: {product.sku}</p>
                  )}

                  {/* Cost section - inline edit */}
                  <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1 w-full">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="עלות"
                          value={costValue}
                          onChange={(e) => setCostValue(e.target.value)}
                          className="h-7 text-sm w-20"
                          dir="ltr"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCost(product.id)
                            if (e.key === 'Escape') { setEditingProduct(null); setCostValue('') }
                          }}
                        />
                        <Button size="icon" variant="ghost" className="size-6" onClick={() => handleSaveCost(product.id)} disabled={updateCostMutation.isPending}>
                          <Check className="size-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-6" onClick={() => { setEditingProduct(null); setCostValue('') }}>
                          <X className="size-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs">
                          {costPrice > 0 ? (
                            <>
                              <span className="text-muted-foreground">עלות: </span>
                              <span className="font-medium">{formatCurrency(costPrice)}</span>
                              {margin !== null && (
                                <span className={`ms-1 font-bold ${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {margin.toFixed(0)}%
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">ללא עלות</span>
                          )}
                        </div>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingProduct(product.id)
                            setCostValue(costPrice > 0 ? costPrice.toString() : '')
                          }}
                        >
                          <span className="text-[10px] underline">ערוך</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
