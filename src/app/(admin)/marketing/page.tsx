'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/currency'
import { TrendingUp, TrendingDown, RefreshCw, Eye, MousePointerClick, Loader2, AlertTriangle, Sparkles } from 'lucide-react'
import Image from 'next/image'

type Window = 7 | 14 | 30

interface Creative {
  adId: string
  name: string
  thumbnail: string | null
  status: string | null
  campaignName: string | null
  impressions: number
  clicks: number
  spend: number
  revenue: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
}

interface MarketingResp {
  days: number
  kpi: {
    spend: number
    revenue: number
    conversions: number
    roas: number
    cpa: number
    ctr: number
    impressions: number
    clicks: number
  }
  creatives: Creative[]
}

function fmt(n: number, decimals = 0) {
  return Number(n).toLocaleString('he-IL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function roasColor(r: number): string {
  if (r >= 2) return 'text-green-700 bg-green-50 border-green-200'
  if (r >= 1) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export default function MarketingPage() {
  const qc = useQueryClient()
  const [days, setDays] = useState<Window>(7)

  const { data, isLoading } = useQuery({
    queryKey: ['marketing', days],
    queryFn: async () => {
      const res = await fetch(`/api/marketing?days=${days}`)
      if (!res.ok) throw new Error('failed')
      return (await res.json()) as MarketingResp
    },
    refetchInterval: 5 * 60_000,
  })

  const sync = useMutation({
    mutationFn: async () => (await fetch('/api/marketing/sync', { method: 'POST' })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing'] }),
  })

  const kpi = data?.kpi
  const top = data?.creatives.slice(0, 6) ?? []
  const losers = (data?.creatives || []).filter((c) => c.roas < 1).slice(-4).reverse() // bottom = worst

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">שיווק ממומן</h1>
          <p className="text-sm text-muted-foreground">ביצועי הקריאייטיבים ב-{days} הימים האחרונים</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {([7, 14, 30] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'ghost'}
                onClick={() => setDays(d as Window)}
                className="text-xs h-7 px-3"
              >
                {d} ימים
              </Button>
            ))}
          </div>
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} size="sm" variant="outline">
            {sync.isPending ? <Loader2 className="size-4 me-1 animate-spin" /> : <RefreshCw className="size-4 me-1" />}
            סנכרן Meta
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="הוצאה" value={kpi ? formatCurrency(kpi.spend) : '—'} loading={isLoading} icon={<TrendingDown className="size-4 text-red-500" />} />
        <KpiCard label="הכנסות (ייחוס)" value={kpi ? formatCurrency(kpi.revenue) : '—'} loading={isLoading} icon={<TrendingUp className="size-4 text-green-600" />} />
        <KpiCard label="ROAS כללי" value={kpi ? `${fmt(kpi.roas, 2)}x` : '—'} loading={isLoading} highlight={kpi && kpi.roas >= 2 ? 'good' : kpi && kpi.roas < 1 ? 'bad' : 'mid'} />
        <KpiCard label="המרות" value={kpi ? fmt(kpi.conversions) : '—'} loading={isLoading} sub={kpi && kpi.cpa ? `${formatCurrency(kpi.cpa)} להמרה` : ''} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="חשיפות" value={kpi ? fmt(kpi.impressions) : '—'} loading={isLoading} icon={<Eye className="size-4 text-muted-foreground" />} />
        <KpiCard label="קליקים" value={kpi ? fmt(kpi.clicks) : '—'} loading={isLoading} icon={<MousePointerClick className="size-4 text-muted-foreground" />} />
        <KpiCard label="CTR" value={kpi ? `${fmt(kpi.ctr, 2)}%` : '—'} loading={isLoading} />
        <KpiCard label="קריאייטיבים פעילים" value={data ? String(data.creatives.length) : '—'} loading={isLoading} />
      </div>

      {/* Top performers */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-green-600" />
          <h2 className="text-lg font-bold">המנצחים — ROAS הכי גבוה</h2>
        </div>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
          </div>
        ) : top.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">אין נתוני קריאייטיבים בחלון הזה — סנכרן מ-Meta כדי להתחיל.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {top.map((c) => <CreativeCard key={c.adId} c={c} />)}
          </div>
        )}
      </section>

      {/* Underperformers */}
      {losers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="size-4 text-red-500" />
            <h2 className="text-lg font-bold">לבדוק/לכבות — ROAS מתחת ל-1</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {losers.map((c) => <CreativeCard key={c.adId} c={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function KpiCard({ label, value, loading, icon, sub, highlight }: { label: string; value: string; loading?: boolean; icon?: React.ReactNode; sub?: string; highlight?: 'good' | 'mid' | 'bad' }) {
  const cls = highlight === 'good' ? 'border-green-200 bg-green-50' : highlight === 'bad' ? 'border-red-200 bg-red-50' : ''
  return (
    <Card className={cls}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon}
        </div>
        {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1.5 text-2xl font-bold">{value}</p>}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function CreativeCard({ c }: { c: Creative }) {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video relative bg-muted">
        {c.thumbnail ? (
          <Image src={c.thumbnail} alt={c.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">אין תצוגה מקדימה</div>
        )}
        <span className={`absolute top-2 start-2 rounded-full border px-2 py-0.5 text-xs font-bold ${roasColor(c.roas)}`}>
          ROAS {fmt(c.roas, 2)}x
        </span>
      </div>
      <CardContent className="space-y-2 pt-3">
        <p className="font-semibold text-sm line-clamp-2" title={c.name}>{c.name}</p>
        {c.campaignName && <p className="text-xs text-muted-foreground truncate">{c.campaignName}</p>}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">הוצאה</p>
            <p className="font-semibold">{formatCurrency(c.spend)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">הכנסה</p>
            <p className="font-semibold">{formatCurrency(c.revenue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">המרות</p>
            <p className="font-semibold">{c.conversions}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CTR</p>
            <p className="font-semibold">{fmt(c.ctr, 2)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">CPC</p>
            <p className="font-semibold">{formatCurrency(c.cpc)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CPA</p>
            <p className="font-semibold">{c.conversions > 0 ? formatCurrency(c.cpa) : '—'}</p>
          </div>
        </div>
        {c.status && c.status !== 'ACTIVE' && <Badge variant="outline" className="text-[10px]">{c.status}</Badge>}
      </CardContent>
    </Card>
  )
}
