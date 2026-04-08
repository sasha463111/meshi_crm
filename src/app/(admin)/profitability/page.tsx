'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { DateRangePicker, type DateRange } from '@/components/dashboard/date-range-picker'
import { useState } from 'react'
import { subDays, startOfDay } from 'date-fns'
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']

export default function ProfitabilityPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['profitability', dateRange],
    queryFn: async () => {
      const from = startOfDay(dateRange.from).toISOString()
      const to = new Date(dateRange.to.getTime() + 86400000).toISOString()

      const [profitRes, expensesRes, campaignRes] = await Promise.all([
        supabase
          .from('order_profitability')
          .select('*')
          .gte('order_date', from)
          .lt('order_date', to),
        supabase
          .from('expenses')
          .select('*, expense_categories(name)')
          .gte('date', from.split('T')[0])
          .lte('date', to.split('T')[0]),
        supabase
          .from('campaign_insights')
          .select('spend')
          .gte('date', from.split('T')[0])
          .lte('date', to.split('T')[0]),
      ])

      const orders = profitRes.data || []
      const expenses = expensesRes.data || []
      const campaignSpend = (campaignRes.data || []).reduce((s, c) => s + Number(c.spend), 0)

      const totalRevenue = orders.reduce((s, o) => s + Number(o.revenue), 0)
      const totalProductCost = orders.reduce((s, o) => s + Number(o.product_cost), 0)
      const totalShippingCost = orders.reduce((s, o) => s + Number(o.shipping_cost), 0)
      const totalAdditionalExpenses = orders.reduce((s, o) => s + Number(o.additional_expenses), 0)
      const totalProfit = orders.reduce((s, o) => s + Number(o.profit), 0)
      const netProfit = totalProfit - campaignSpend

      // Expenses by category
      const byCategory = new Map<string, number>()
      byCategory.set('עלות מוצר', totalProductCost)
      byCategory.set('משלוח', totalShippingCost)
      byCategory.set('קמפיינים', campaignSpend)
      expenses.forEach((e) => {
        const catName = (e.expense_categories as { name: string })?.name || 'אחר'
        byCategory.set(catName, (byCategory.get(catName) || 0) + Number(e.amount))
      })
      const costBreakdown = Array.from(byCategory.entries())
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value }))

      // Daily profit
      const dailyMap = new Map<string, { revenue: number; cost: number; profit: number }>()
      orders.forEach((o) => {
        const day = o.order_date.split('T')[0]
        const existing = dailyMap.get(day) || { revenue: 0, cost: 0, profit: 0 }
        existing.revenue += Number(o.revenue)
        existing.cost += Number(o.product_cost) + Number(o.shipping_cost)
        existing.profit += Number(o.profit)
        dailyMap.set(day, existing)
      })
      const dailyProfit = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date))

      return {
        totalRevenue,
        totalProductCost,
        totalShippingCost,
        totalAdditionalExpenses,
        campaignSpend,
        totalProfit,
        netProfit,
        profitMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
        costBreakdown,
        dailyProfit,
        orderCount: orders.length,
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">רווחיות</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard title="הכנסות" value={formatCurrency(data!.totalRevenue)} />
            <SummaryCard title="עלויות כולל" value={formatCurrency(data!.totalRevenue - data!.netProfit)} variant="muted" />
            <SummaryCard
              title="רווח נקי"
              value={formatCurrency(data!.netProfit)}
              variant={data!.netProfit >= 0 ? 'positive' : 'negative'}
            />
            <SummaryCard title="מרווח רווח" value={`${data!.profitMargin.toFixed(1)}%`} />
          </div>

          {/* Cost Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>פירוט עלויות</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data!.costBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {data!.costBreakdown.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>סיכום פיננסי</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <FinancialRow label="הכנסות" value={data!.totalRevenue} />
                <Separator />
                <FinancialRow label="עלות מוצרים" value={-data!.totalProductCost} negative />
                <FinancialRow label="עלות משלוח" value={-data!.totalShippingCost} negative />
                <FinancialRow label="הוצאות נוספות" value={-data!.totalAdditionalExpenses} negative />
                <FinancialRow label="קמפיינים (Meta)" value={-data!.campaignSpend} negative />
                <Separator />
                <FinancialRow label="רווח נקי" value={data!.netProfit} bold />
                <p className="text-xs text-muted-foreground">{data!.orderCount} הזמנות בתקופה</p>
              </CardContent>
            </Card>
          </div>

          {/* Daily Profit Chart */}
          <Card>
            <CardHeader>
              <CardTitle>רווח יומי</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data!.dailyProfit}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }}
                  />
                  <YAxis orientation="right" tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="revenue" fill="#0088FE" name="הכנסות" />
                  <Bar dataKey="profit" fill="#00C49F" name="רווח" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function SummaryCard({ title, value, variant }: { title: string; value: string; variant?: string }) {
  const colorClass = variant === 'positive' ? 'text-green-600' : variant === 'negative' ? 'text-red-600' : variant === 'muted' ? 'text-muted-foreground' : ''
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={`mt-1 text-2xl font-bold ${colorClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function FinancialRow({ label, value, negative, bold }: { label: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold text-base' : ''}`}>
      <span>{label}</span>
      <span className={negative ? 'text-red-500' : value >= 0 ? 'text-green-600' : 'text-red-600'}>
        {formatCurrency(Math.abs(value))}
        {negative ? '-' : ''}
      </span>
    </div>
  )
}
