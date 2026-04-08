'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/dates'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  paid: 'שולם',
  fulfilled: 'נשלח',
  partially_fulfilled: 'חלקית',
  refunded: 'הוחזר',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  paid: 'secondary',
  fulfilled: 'default',
  partially_fulfilled: 'secondary',
  refunded: 'destructive',
}

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const supabase = createClient()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*')
        .order('order_date', { ascending: false })
        .limit(100)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data } = await query
      return data || []
    },
  })

  const filtered = orders?.filter((o) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      o.shopify_order_number?.toLowerCase().includes(s) ||
      o.customer_name?.toLowerCase().includes(s) ||
      o.customer_email?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">הזמנות</h1>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי מספר הזמנה, שם, אימייל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="pending">ממתין</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
            <SelectItem value="fulfilled">נשלח</SelectItem>
            <SelectItem value="refunded">הוחזר</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 p-3 text-sm font-medium text-muted-foreground">
            <span>מספר הזמנה</span>
            <span>לקוח</span>
            <span>תאריך</span>
            <span>סטטוס</span>
            <span>סכום</span>
          </div>
          {filtered?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">לא נמצאו הזמנות</div>
          ) : (
            filtered?.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr] gap-4 border-b p-3 hover:bg-muted/30 transition-colors items-center"
              >
                <span className="font-medium">{order.shopify_order_number}</span>
                <div>
                  <p className="text-sm font-medium">{order.customer_name || '-'}</p>
                  <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                </div>
                <span className="text-sm">{formatDateTime(order.order_date)}</span>
                <Badge variant={statusVariants[order.status] || 'outline'}>
                  {statusLabels[order.status] || order.status}
                </Badge>
                <span className="font-semibold">{formatCurrency(Number(order.total))}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
