'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Package,
  BarChart3,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { DateRangePicker, type DateRange } from '@/components/dashboard/date-range-picker'
import { useState } from 'react'
import { subDays, startOfDay } from 'date-fns'

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })

  const supabase = createClient()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', dateRange],
    queryFn: async () => {
      const from = startOfDay(dateRange.from).toISOString()
      const to = new Date(dateRange.to.getTime() + 86400000).toISOString()

      const [ordersRes, profitRes, campaignRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total, order_date, status, fulfillment_status')
          .gte('order_date', from)
          .lt('order_date', to)
          .order('order_date', { ascending: false }),
        supabase
          .from('order_profitability')
          .select('*')
          .gte('order_date', from)
          .lt('order_date', to),
        supabase
          .from('campaign_insights')
          .select('spend, conversions, conversion_value')
          .gte('date', from.split('T')[0])
          .lte('date', to.split('T')[0]),
      ])

      const orders = ordersRes.data || []
      const profitability = profitRes.data || []
      const campaigns = campaignRes.data || []

      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0)
      const totalOrders = orders.length
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
      const totalProfit = profitability.reduce((sum, p) => sum + Number(p.profit), 0)
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
      const totalAdSpend = campaigns.reduce((sum, c) => sum + Number(c.spend), 0)

      // Daily revenue for chart
      const dailyMap = new Map<string, number>()
      orders.forEach((o) => {
        const day = o.order_date.split('T')[0]
        dailyMap.set(day, (dailyMap.get(day) || 0) + Number(o.total))
      })
      const dailyRevenue = Array.from(dailyMap.entries())
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date))

      return {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalProfit,
        profitMargin,
        totalAdSpend,
        dailyRevenue,
        recentOrders: orders.slice(0, 10),
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">דשבורד</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="הכנסות"
          value={isLoading ? undefined : formatCurrency(stats!.totalRevenue)}
          icon={DollarSign}
        />
        <KpiCard
          title="הזמנות"
          value={isLoading ? undefined : formatNumber(stats!.totalOrders)}
          icon={ShoppingCart}
        />
        <KpiCard
          title="ממוצע הזמנה"
          value={isLoading ? undefined : formatCurrency(stats!.avgOrderValue)}
          icon={BarChart3}
        />
        <KpiCard
          title="רווח"
          value={isLoading ? undefined : formatCurrency(stats!.totalProfit)}
          icon={TrendingUp}
        />
        <KpiCard
          title="מרווח רווח"
          value={isLoading ? undefined : `${stats!.profitMargin.toFixed(1)}%`}
          icon={Package}
        />
        <KpiCard
          title="הוצאות פרסום"
          value={isLoading ? undefined : formatCurrency(stats!.totalAdSpend)}
          icon={Users}
        />
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>הכנסות יומיות</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <RevenueChart data={stats!.dailyRevenue} />
          )}
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>הזמנות אחרונות</CardTitle>
          <Link href="/orders" className="text-sm text-primary hover:underline">
            הצג הכל
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {stats!.recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-medium">
                      {formatDate(order.order_date)}
                    </span>
                  </div>
                  <span className="font-semibold">{formatCurrency(Number(order.total))}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string | undefined
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        {value === undefined ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <p className="mt-2 text-2xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    paid: 'secondary',
    fulfilled: 'default',
    partially_fulfilled: 'secondary',
    refunded: 'destructive',
  }
  const labels: Record<string, string> = {
    pending: 'ממתין',
    paid: 'שולם',
    fulfilled: 'נשלח',
    partially_fulfilled: 'נשלח חלקית',
    refunded: 'הוחזר',
  }

  return (
    <Badge variant={variants[status] || 'outline'}>
      {labels[status] || status}
    </Badge>
  )
}
