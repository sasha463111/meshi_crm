'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/dates'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Package, Truck, Clock, CheckCircle2, Filter } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type StatusFilter = 'all' | 'pending' | 'packed' | 'shipped' | 'delivered'

const internalStatusLabels: Record<string, string> = {
  pending: 'ממתין',
  packed: 'נארז',
  shipped: 'נשלח',
  delivered: 'נמסר',
}

const internalStatusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  packed: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
}

export default function SupplierPortalPage() {
  const { supplier } = useSupplierAuth()
  const supabase = createClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-orders', supplier?.supplier_id],
    enabled: !!supplier?.supplier_id,
    queryFn: async () => {
      // Get order items for this supplier with internal_status
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, fulfillment_status, internal_status')
        .eq('supplier_id', supplier!.supplier_id)

      if (!orderItems?.length) return { orders: [], orderItems: [], counts: { pending: 0, packed: 0, shipped: 0, delivered: 0 } }

      const orderIds = [...new Set(orderItems.map(i => i.order_id))]

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .in('id', orderIds)
        .order('order_date', { ascending: false })

      // Count by internal_status
      const counts = {
        pending: orderItems.filter(i => !i.internal_status || i.internal_status === 'pending').length,
        packed: orderItems.filter(i => i.internal_status === 'packed').length,
        shipped: orderItems.filter(i => i.internal_status === 'shipped').length,
        delivered: orderItems.filter(i => i.internal_status === 'delivered').length,
      }

      // Map order_id to its item statuses
      const orderStatusMap = new Map<string, string[]>()
      orderItems.forEach(item => {
        const statuses = orderStatusMap.get(item.order_id) || []
        statuses.push(item.internal_status || 'pending')
        orderStatusMap.set(item.order_id, statuses)
      })

      return { orders: orders || [], orderItems, counts, orderStatusMap }
    },
  })

  // Get the "worst" status for an order (pending > packed > shipped > delivered)
  const getOrderInternalStatus = (orderId: string): string => {
    const statuses = data?.orderStatusMap?.get(orderId) || ['pending']
    const priority = ['pending', 'packed', 'shipped', 'delivered']
    let worst = 3
    for (const s of statuses) {
      const idx = priority.indexOf(s)
      if (idx < worst) worst = idx
    }
    return priority[worst]
  }

  const filteredOrders = data?.orders.filter(order => {
    if (statusFilter === 'all') return true
    const orderStatus = getOrderInternalStatus(order.id)
    return orderStatus === statusFilter
  }) || []

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">הזמנות</h1>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className={`cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-orange-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="size-7 text-orange-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">ממתינים</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-2xl font-bold">{data?.counts.pending || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'packed' ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'packed' ? 'all' : 'packed')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Package className="size-7 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">נארזו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-2xl font-bold">{data?.counts.packed || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'shipped' ? 'ring-2 ring-purple-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'shipped' ? 'all' : 'shipped')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Truck className="size-7 text-purple-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">נשלחו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-2xl font-bold">{data?.counts.shipped || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${statusFilter === 'delivered' ? 'ring-2 ring-green-400' : ''}`} onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="size-7 text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">נמסרו</p>
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-2xl font-bold">{data?.counts.delivered || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status filter bar */}
      <div className="flex items-center gap-1 rounded-lg border p-1 self-start w-fit">
        <Button
          size="sm"
          variant={statusFilter === 'all' ? 'default' : 'ghost'}
          onClick={() => setStatusFilter('all')}
          className="text-xs h-7 px-2"
        >
          הכל ({data?.orders.length || 0})
        </Button>
        <Button
          size="sm"
          variant={statusFilter === 'pending' ? 'default' : 'ghost'}
          onClick={() => setStatusFilter('pending')}
          className="text-xs h-7 px-2"
        >
          ממתינים ({data?.counts.pending || 0})
        </Button>
        <Button
          size="sm"
          variant={statusFilter === 'packed' ? 'default' : 'ghost'}
          onClick={() => setStatusFilter('packed')}
          className="text-xs h-7 px-2"
        >
          נארזו ({data?.counts.packed || 0})
        </Button>
        <Button
          size="sm"
          variant={statusFilter === 'shipped' ? 'default' : 'ghost'}
          onClick={() => setStatusFilter('shipped')}
          className="text-xs h-7 px-2"
        >
          נשלחו ({data?.counts.shipped || 0})
        </Button>
      </div>

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
          {filteredOrders.map((order) => {
            const orderStatus = getOrderInternalStatus(order.id)
            return (
              <Link
                key={order.id}
                href={`/portal/orders/${order.id}`}
                className="block rounded-lg border p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold">{order.shopify_order_number}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${internalStatusColors[orderStatus]}`}>
                      {internalStatusLabels[orderStatus] || orderStatus}
                    </span>
                  </div>
                  <span className="font-bold">{formatCurrency(Number(order.total))}</span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{order.customer_name}</span>
                  <span>{formatDateTime(order.order_date)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
