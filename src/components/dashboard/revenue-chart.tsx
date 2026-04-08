'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils/currency'

interface RevenueChartProps {
  data: { date: string; revenue: number }[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        אין נתונים לתקופה הנבחרת
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => {
            const d = new Date(v)
            return `${d.getDate()}/${d.getMonth() + 1}`
          }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => formatCurrency(v)}
          orientation="right"
        />
        <Tooltip
          formatter={(v) => [formatCurrency(Number(v)), 'הכנסות']}
          labelFormatter={(label) => {
            const d = new Date(label)
            return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="hsl(var(--primary))"
          fillOpacity={1}
          fill="url(#colorRevenue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
