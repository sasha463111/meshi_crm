'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/dates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Package, Truck, Clock, CheckCircle2, XCircle, Eye, ChevronUp, ZoomIn, CheckSquare, RefreshCw, Loader2, Phone, MapPin, Mail, User } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

type StatusFilter = 'all' | 'pending' | 'packed' | 'shipped' | 'delivered' | 'cancelled'

const internalStatusLabels: Record<string, string> = {
  pending: 'ממתין',
  packed: 'נארז',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
}

const internalStatusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  packed: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

const allStatuses = ['pending', 'packed', 'shipped', 'delivered', 'cancelled']

interface OrderItem {
  id: string
  order_id: string
  title: string
  variant_title: string | null
  sku: string | null
  quantity: number
  unit_price: number
  total_price: number
  image_url: string | null
  internal_status: string | null
}

interface ShippingAddress {
  address1?: string
  address2?: string
  city?: string
  zip?: string
  province?: string
  country?: string
  phone?: string
  name?: string
}

interface Order {
  id: string
  shopify_order_number: string
  order_date: string
  status: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  shipping_address: ShippingAddress | null
  total: number
}

export default function SupplierPortalPage() {
  const { supplier } = useSupplierAuth()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync-orders', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: (data) => {
      const msg = `סונכרנו ${data.created || 0} חדשות, ${data.updated || 0} עודכנו`
      setSyncResult(msg)
      setTimeout(() => setSyncResult(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] })
    },
    onError: () => {
      setSyncResult('שגיאה בסנכרון')
      setTimeout(() => setSyncResult(null), 5000)
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-orders', supplier?.supplier_id],
    enabled: !!supplier?.access_token,
    queryFn: async () => {
      const res = await fetch('/api/suppliers/orders', {
        headers: { 'x-supplier-token': supplier!.access_token },
      })
      if (!res.ok) throw new Error('Failed to fetch orders')
      const { orders, orderItems } = await res.json() as { orders: Order[]; orderItems: OrderItem[] }

      // Build maps client-side
      const orderItemsMap = new Map<string, OrderItem[]>()
      const orderStatusMap = new Map<string, string[]>()
      orderItems.forEach((item: OrderItem) => {
        const items = orderItemsMap.get(item.order_id) || []
        items.push(item)
        orderItemsMap.set(item.order_id, items)

        const statuses = orderStatusMap.get(item.order_id) || []
        statuses.push(item.internal_status || 'pending')
        orderStatusMap.set(item.order_id, statuses)
      })

      // Count orders by status
      const orderCounts = { pending: 0, packed: 0, shipped: 0, delivered: 0, cancelled: 0 }
      const statusPriority = ['cancelled', 'pending', 'packed', 'shipped', 'delivered']

      for (const order of orders) {
        const statuses = orderStatusMap.get(order.id) || ['pending']
        if (statuses.includes('cancelled')) { orderCounts.cancelled++; continue }
        let worst = 4
        for (const s of statuses) {
          const idx = statusPriority.indexOf(s)
          if (idx >= 0 && idx < worst) worst = idx
        }
        const resolved = statusPriority[worst] as keyof typeof orderCounts
        if (resolved in orderCounts) orderCounts[resolved]++
      }

      return { orders, orderItemsMap, orderStatusMap, orderCounts }
    },
  })

  // Bulk status update via API
  const bulkStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const itemIds: string[] = []
      selectedOrders.forEach(orderId => {
        const items = data?.orderItemsMap?.get(orderId)
        items?.forEach(item => itemIds.push(item.id))
      })
      if (!itemIds.length) return

      const res = await fetch('/api/suppliers/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-supplier-token': supplier!.access_token,
        },
        body: JSON.stringify({ itemIds, status }),
      })
      if (!res.ok) throw new Error('Failed to update')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] })
      setSelectedOrders(new Set())
    },
  })

  const getOrderInternalStatus = (orderId: string): string => {
    const statuses = data?.orderStatusMap?.get(orderId) || ['pending']
    if (statuses.includes('cancelled')) return 'cancelled'
    const priority = ['pending', 'packed', 'shipped', 'delivered']
    let worst = 3
    for (const s of statuses) {
      const idx = priority.indexOf(s)
      if (idx >= 0 && idx < worst) worst = idx
    }
    return priority[worst]
  }

  const filteredOrders = data?.orders.filter((order: Order) => {
    if (statusFilter === 'all') return true
    return getOrderInternalStatus(order.id) === statusFilter
  }) || []

  const counts = data?.orderCounts || { pending: 0, packed: 0, shipped: 0, delivered: 0, cancelled: 0 }
  const totalOrders = data?.orders.length || 0

  const toggleSelect = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(filteredOrders.map((o: Order) => o.id)))
    }
  }

  const toggleExpand = (orderId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpandedOrder(prev => prev === orderId ? null : orderId)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">הזמנות</h1>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className="text-sm text-muted-foreground">{syncResult}</span>
          )}
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant="outline"
            size="sm"
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-4 me-1.5 animate-spin" />
            ) : (
              <RefreshCw className="size-4 me-1.5" />
            )}
            סנכרן הזמנות
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <Card className={`cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-orange-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="size-6 text-orange-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">ממתינים</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{counts.pending}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'packed' ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'packed' ? 'all' : 'packed')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Package className="size-6 text-blue-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">נארזו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{counts.packed}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'shipped' ? 'ring-2 ring-purple-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'shipped' ? 'all' : 'shipped')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Truck className="size-6 text-purple-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">נשלחו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{counts.shipped}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'delivered' ? 'ring-2 ring-green-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="size-6 text-green-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">נמסרו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{counts.delivered}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'cancelled' ? 'ring-2 ring-red-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <XCircle className="size-6 text-red-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">בוטלו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-bold">{counts.cancelled}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status filter bar */}
      <div className="flex items-center gap-1 rounded-lg border p-1 self-start w-fit flex-wrap">
        <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'ghost'} onClick={() => setStatusFilter('all')} className="text-xs h-7 px-2">הכל ({totalOrders})</Button>
        <Button size="sm" variant={statusFilter === 'pending' ? 'default' : 'ghost'} onClick={() => setStatusFilter('pending')} className="text-xs h-7 px-2">ממתינים ({counts.pending})</Button>
        <Button size="sm" variant={statusFilter === 'packed' ? 'default' : 'ghost'} onClick={() => setStatusFilter('packed')} className="text-xs h-7 px-2">נארזו ({counts.packed})</Button>
        <Button size="sm" variant={statusFilter === 'shipped' ? 'default' : 'ghost'} onClick={() => setStatusFilter('shipped')} className="text-xs h-7 px-2">נשלחו ({counts.shipped})</Button>
        <Button size="sm" variant={statusFilter === 'cancelled' ? 'default' : 'ghost'} onClick={() => setStatusFilter('cancelled')} className="text-xs h-7 px-2">בוטלו ({counts.cancelled})</Button>
      </div>

      {/* Bulk action bar */}
      {selectedOrders.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-3 shadow-sm">
          <span className="text-sm font-medium flex items-center gap-1.5">
            <CheckSquare className="size-4" />
            {selectedOrders.size} הזמנות נבחרו
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground me-1">שנה סטטוס ל:</span>
            {allStatuses.map(status => (
              <Button
                key={status}
                size="sm"
                variant="outline"
                className={`text-xs h-7 px-2 ${status === 'cancelled' ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}`}
                onClick={() => bulkStatusMutation.mutate(status)}
                disabled={bulkStatusMutation.isPending}
              >
                {status === 'pending' && <Clock className="size-3 me-1" />}
                {status === 'packed' && <Package className="size-3 me-1" />}
                {status === 'shipped' && <Truck className="size-3 me-1" />}
                {status === 'delivered' && <CheckCircle2 className="size-3 me-1" />}
                {status === 'cancelled' && <XCircle className="size-3 me-1" />}
                {internalStatusLabels[status]}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelectedOrders(new Set())} className="text-xs h-7 px-2">ביטול</Button>
          </div>
        </div>
      )}

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>{statusFilter === 'all' ? 'אין הזמנות עדיין' : `אין הזמנות בסטטוס "${internalStatusLabels[statusFilter]}"`}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select all */}
          <div className="flex items-center gap-2 px-2">
            <Checkbox
              checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
              onCheckedChange={toggleSelectAll}
              className="size-4"
            />
            <span className="text-xs text-muted-foreground">בחר הכל</span>
          </div>

          {filteredOrders.map((order: Order) => {
            const orderStatus = getOrderInternalStatus(order.id)
            const isExpanded = expandedOrder === order.id
            const orderItems = data?.orderItemsMap?.get(order.id) || []

            return (
              <div key={order.id} className="rounded-lg border overflow-hidden">
                <div className={`p-4 hover:bg-muted/30 transition-colors ${selectedOrders.has(order.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedOrders.has(order.id)}
                      onCheckedChange={() => toggleSelect(order.id)}
                      className="size-4 shrink-0 mt-1"
                    />
                    <Link href={`/portal/orders/${order.id}`} className="flex-1 min-w-0">
                      {/* Order header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold">{order.shopify_order_number}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${internalStatusColors[orderStatus]}`}>
                            {internalStatusLabels[orderStatus] || orderStatus}
                          </span>
                          <span className="text-xs text-muted-foreground">{orderItems.length} פריטים</span>
                        </div>
                        <span className="font-bold">{formatCurrency(Number(order.total))}</span>
                      </div>
                      {/* Customer details */}
                      <div className="mt-2 rounded-md bg-muted/40 p-2.5 space-y-1">
                        <div className="flex items-center gap-4 flex-wrap text-sm">
                          {order.customer_name && (
                            <span className="flex items-center gap-1.5">
                              <User className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{order.customer_name}</span>
                            </span>
                          )}
                          {(order.customer_phone || order.shipping_address?.phone) && (
                            <span className="flex items-center gap-1.5" dir="ltr">
                              <Phone className="size-3.5 text-muted-foreground shrink-0" />
                              {order.customer_phone || order.shipping_address?.phone}
                            </span>
                          )}
                          {order.customer_email && (
                            <span className="flex items-center gap-1.5 text-xs">
                              <Mail className="size-3.5 text-muted-foreground shrink-0" />
                              {order.customer_email}
                            </span>
                          )}
                        </div>
                        {order.shipping_address && (order.shipping_address.address1 || order.shipping_address.city) && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0 mt-0.5" />
                            <span>
                              {[order.shipping_address.address1, order.shipping_address.city, order.shipping_address.zip].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        {formatDateTime(order.order_date)}
                      </div>
                    </Link>
                    <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={(e) => toggleExpand(order.id, e)}>
                      {isExpanded ? <ChevronUp className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>

                {/* Quick view */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-3 space-y-2">
                    {orderItems.map((item: OrderItem) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg bg-background p-2.5 border">
                        {item.image_url ? (
                          <div className="relative group cursor-pointer shrink-0" onClick={() => setZoomedImage(item.image_url)}>
                            <Image src={item.image_url} alt={item.title} width={60} height={60} className="size-14 rounded-md object-cover" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                              <ZoomIn className="size-4 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="size-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Package className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {item.variant_title && <p className="text-xs text-muted-foreground">{item.variant_title}</p>}
                          {item.sku && <p className="text-[10px] text-muted-foreground" dir="ltr">SKU: {item.sku}</p>}
                        </div>
                        <div className="text-end shrink-0">
                          <p className="text-sm font-bold">×{item.quantity}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.unit_price))}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomedImage && <Image src={zoomedImage} alt="Product zoom" width={800} height={800} className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
