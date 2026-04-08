'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/utils/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExternalLink, MousePointerClick, Eye, ArrowDown, AlertTriangle } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export default function ClarityPage() {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clarity'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clarity_snapshots')
        .select('*')
        .order('date', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  const latest = data?.[0]
  const chartData = data?.slice().reverse() || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clarity - התנהגות גולשים</h1>
        <a
          href={`https://clarity.microsoft.com/projects/view/${process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <ExternalLink className="size-4" />
          פתח ב-Clarity
        </a>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : !latest ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            אין נתונים עדיין. הנתונים מתעדכנים פעם ביום.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={Eye} title="סשנים" value={formatNumber(latest.total_sessions || 0)} />
            <MetricCard icon={Eye} title="משתמשים" value={formatNumber(latest.total_users || 0)} />
            <MetricCard icon={ArrowDown} title="Bounce Rate" value={`${(latest.bounce_rate || 0).toFixed(1)}%`} />
            <MetricCard icon={ArrowDown} title="עמקות גלילה" value={`${(latest.scroll_depth || 0).toFixed(0)}%`} />
            <MetricCard icon={AlertTriangle} title="Rage Clicks" value={formatNumber(latest.rage_clicks || 0)} alert={latest.rage_clicks > 10} />
            <MetricCard icon={MousePointerClick} title="Dead Clicks" value={formatNumber(latest.dead_clicks || 0)} alert={latest.dead_clicks > 20} />
            <MetricCard icon={ArrowDown} title="Quick Backs" value={formatNumber(latest.quick_backs || 0)} />
            <MetricCard icon={Eye} title="עמודים/סשן" value={(latest.pages_per_session || 0).toFixed(1)} />
          </div>

          {/* Sessions Trend */}
          <Card>
            <CardHeader>
              <CardTitle>מגמת סשנים</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}` }} />
                  <YAxis orientation="right" />
                  <Tooltip />
                  <Line type="monotone" dataKey="total_sessions" stroke="#0088FE" name="סשנים" />
                  <Line type="monotone" dataKey="total_users" stroke="#00C49F" name="משתמשים" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Behavior Issues Trend */}
          <Card>
            <CardHeader>
              <CardTitle>בעיות התנהגות</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}` }} />
                  <YAxis orientation="right" />
                  <Tooltip />
                  <Line type="monotone" dataKey="rage_clicks" stroke="#FF8042" name="Rage Clicks" />
                  <Line type="monotone" dataKey="dead_clicks" stroke="#FFBB28" name="Dead Clicks" />
                  <Line type="monotone" dataKey="quick_backs" stroke="#8884d8" name="Quick Backs" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, title, value, alert }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  alert?: boolean
}) {
  return (
    <Card className={alert ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${alert ? 'text-orange-500' : 'text-muted-foreground'}`} />
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
