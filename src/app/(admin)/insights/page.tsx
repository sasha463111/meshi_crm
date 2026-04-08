'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronRight, ChevronLeft, Calendar, TrendingUp, TrendingDown,
  ShoppingCart, Eye, MousePointerClick, MessageCircle, Megaphone,
  DollarSign, Users, Package, ArrowUpDown, Send
} from 'lucide-react'
import { useState } from 'react'

export default function InsightsPage() {
  const supabase = createClient()
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  const goToDate = (offset: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  const formatDateHebrew = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `יום ${days[d.getDay()]} - ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }

  // Fetch all data for the selected date
  const { data, isLoading } = useQuery({
    queryKey: ['daily-insights', selectedDate],
    queryFn: async () => {
      const nextDate = new Date(selectedDate)
      nextDate.setDate(nextDate.getDate() + 1)
      const nextDateStr = nextDate.toISOString().split('T')[0]

      // Previous day for comparison
      const prevDate = new Date(selectedDate)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDateStr = prevDate.toISOString().split('T')[0]

      // Fetch all data in parallel
      const [
        ordersRes,
        prevOrdersRes,
        campaignInsightsRes,
        prevCampaignInsightsRes,
        clarityRes,
        prevClarityRes,
        whatsappRes,
        prevWhatsappRes,
      ] = await Promise.all([
        // Orders for selected date
        supabase
          .from('orders')
          .select('*')
          .gte('order_date', selectedDate)
          .lt('order_date', nextDateStr),

        // Orders for previous day (comparison)
        supabase
          .from('orders')
          .select('*')
          .gte('order_date', prevDateStr)
          .lt('order_date', selectedDate),

        // Campaign insights for selected date
        supabase
          .from('campaign_insights')
          .select('*')
          .eq('date', selectedDate),

        // Campaign insights for previous day
        supabase
          .from('campaign_insights')
          .select('*')
          .eq('date', prevDateStr),

        // Clarity snapshot for selected date
        supabase
          .from('clarity_snapshots')
          .select('*')
          .eq('date', selectedDate)
          .single(),

        // Clarity snapshot for previous day
        supabase
          .from('clarity_snapshots')
          .select('*')
          .eq('date', prevDateStr)
          .single(),

        // WhatsApp messages for selected date
        supabase
          .from('whatsapp_messages')
          .select('*')
          .gte('created_at', `${selectedDate}T00:00:00`)
          .lt('created_at', `${nextDateStr}T00:00:00`),

        // WhatsApp messages for previous day
        supabase
          .from('whatsapp_messages')
          .select('*')
          .gte('created_at', `${prevDateStr}T00:00:00`)
          .lt('created_at', `${selectedDate}T00:00:00`),
      ])

      const orders = ordersRes.data || []
      const prevOrders = prevOrdersRes.data || []
      const insights = campaignInsightsRes.data || []
      const prevInsights = prevCampaignInsightsRes.data || []
      const clarity = clarityRes.data
      const prevClarity = prevClarityRes.data
      const whatsapp = whatsappRes.data || []
      const prevWhatsapp = prevWhatsappRes.data || []

      // Shopify metrics
      const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0)
      const prevRevenue = prevOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
      const orderCount = orders.length
      const prevOrderCount = prevOrders.length
      const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0

      // Meta metrics
      const adSpend = insights.reduce((sum, i) => sum + Number(i.spend || 0), 0)
      const prevAdSpend = prevInsights.reduce((sum, i) => sum + Number(i.spend || 0), 0)
      const clicks = insights.reduce((sum, i) => sum + Number(i.clicks || 0), 0)
      const impressions = insights.reduce((sum, i) => sum + Number(i.impressions || 0), 0)
      const conversions = insights.reduce((sum, i) => sum + Number(i.conversions || 0), 0)
      const conversionValue = insights.reduce((sum, i) => sum + Number(i.conversion_value || 0), 0)
      const roas = adSpend > 0 ? conversionValue / adSpend : 0
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0

      // Clarity metrics
      const sessions = clarity?.total_sessions || 0
      const prevSessions = prevClarity?.total_sessions || 0
      const users = clarity?.total_users || 0
      const bounceRate = clarity?.bounce_rate || 0
      const rageClicks = clarity?.rage_clicks || 0
      const deadClicks = clarity?.dead_clicks || 0

      // WhatsApp metrics
      const inboundMessages = whatsapp.filter(m => m.direction === 'inbound').length
      const outboundMessages = whatsapp.filter(m => m.direction === 'outbound').length
      const prevInbound = prevWhatsapp.filter(m => m.direction === 'inbound').length
      const prevOutbound = prevWhatsapp.filter(m => m.direction === 'outbound').length

      return {
        shopify: { revenue, prevRevenue, orderCount, prevOrderCount, avgOrderValue, orders },
        meta: { adSpend, prevAdSpend, clicks, impressions, conversions, conversionValue, roas, ctr },
        clarity: { sessions, prevSessions, users, bounceRate, rageClicks, deadClicks, topPages: clarity?.top_pages, deviceBreakdown: clarity?.device_breakdown },
        whatsapp: { inboundMessages, outboundMessages, prevInbound, prevOutbound, totalMessages: whatsapp.length },
      }
    },
  })

  const getChangeIndicator = (current: number, previous: number) => {
    if (previous === 0) return null
    const change = ((current - previous) / previous) * 100
    const isPositive = change > 0
    return {
      value: Math.abs(change).toFixed(0),
      isPositive,
      label: isPositive ? `+${Math.abs(change).toFixed(0)}%` : `${change.toFixed(0)}%`,
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Navigation */}
      <div className="flex flex-col gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">Insights - תמונת יום</h1>
        <div className="flex items-center gap-2 self-start">
          <Button size="icon" variant="outline" className="size-8" onClick={() => goToDate(-1)}>
            <ChevronRight className="size-4" />
          </Button>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 justify-center">
            <Calendar className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{formatDateHebrew(selectedDate)}</span>
            {isToday && <Badge variant="secondary" className="text-[10px]">היום</Badge>}
          </div>
          <Button size="icon" variant="outline" className="size-8" onClick={() => goToDate(1)} disabled={isToday}>
            <ChevronLeft className="size-4" />
          </Button>
          {!isToday && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
              היום
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            אין נתונים ליום זה
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Shopify Section */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ShoppingCart className="size-5 text-blue-600" />
              Shopify - מכירות
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <InsightCard
                title="הכנסות"
                value={formatCurrency(data.shopify.revenue)}
                icon={DollarSign}
                change={getChangeIndicator(data.shopify.revenue, data.shopify.prevRevenue)}
                color="blue"
              />
              <InsightCard
                title="הזמנות"
                value={data.shopify.orderCount.toString()}
                icon={ShoppingCart}
                change={getChangeIndicator(data.shopify.orderCount, data.shopify.prevOrderCount)}
                color="blue"
              />
              <InsightCard
                title="ממוצע הזמנה"
                value={formatCurrency(data.shopify.avgOrderValue)}
                icon={ArrowUpDown}
                color="blue"
              />
              <InsightCard
                title="מוצרים נמכרו"
                value={formatNumber(data.shopify.orders.reduce((sum: number, o: Record<string, unknown>) => {
                  const items = o.shopify_data as Record<string, unknown> | null
                  return sum + 1
                }, 0))}
                icon={Package}
                color="blue"
              />
            </div>
          </div>

          {/* Meta Ads Section */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Megaphone className="size-5 text-orange-600" />
              Meta Ads - פרסום
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <InsightCard
                title="הוצאות פרסום"
                value={formatCurrency(data.meta.adSpend)}
                icon={DollarSign}
                change={getChangeIndicator(data.meta.adSpend, data.meta.prevAdSpend)}
                color="orange"
                invertChange
              />
              <InsightCard
                title="ROAS"
                value={`${data.meta.roas.toFixed(2)}x`}
                icon={TrendingUp}
                color="orange"
                highlight={data.meta.roas < 1}
              />
              <InsightCard
                title="הקלקות / CTR"
                value={`${formatNumber(data.meta.clicks)} (${data.meta.ctr.toFixed(1)}%)`}
                icon={MousePointerClick}
                color="orange"
              />
              <InsightCard
                title="המרות"
                value={`${data.meta.conversions} | ${formatCurrency(data.meta.conversionValue)}`}
                icon={TrendingUp}
                color="orange"
              />
            </div>
          </div>

          {/* Clarity Section */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Eye className="size-5 text-purple-600" />
              Clarity - התנהגות גולשים
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <InsightCard
                title="סשנים"
                value={formatNumber(data.clarity.sessions)}
                icon={Eye}
                change={getChangeIndicator(data.clarity.sessions, data.clarity.prevSessions)}
                color="purple"
              />
              <InsightCard
                title="משתמשים"
                value={formatNumber(data.clarity.users)}
                icon={Users}
                color="purple"
              />
              <InsightCard
                title="Bounce Rate"
                value={`${data.clarity.bounceRate.toFixed(1)}%`}
                icon={TrendingDown}
                color="purple"
                highlight={data.clarity.bounceRate > 60}
              />
              <InsightCard
                title="Rage / Dead Clicks"
                value={`${data.clarity.rageClicks} / ${data.clarity.deadClicks}`}
                icon={MousePointerClick}
                color="purple"
                highlight={data.clarity.rageClicks > 10}
              />
            </div>
          </div>

          {/* WhatsApp Section */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MessageCircle className="size-5 text-green-600" />
              WhatsApp - תקשורת
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
              <InsightCard
                title="הודעות נכנסות"
                value={data.whatsapp.inboundMessages.toString()}
                icon={MessageCircle}
                change={getChangeIndicator(data.whatsapp.inboundMessages, data.whatsapp.prevInbound)}
                color="green"
              />
              <InsightCard
                title="הודעות יוצאות"
                value={data.whatsapp.outboundMessages.toString()}
                icon={Send}
                change={getChangeIndicator(data.whatsapp.outboundMessages, data.whatsapp.prevOutbound)}
                color="green"
              />
              <InsightCard
                title="סה״כ הודעות"
                value={data.whatsapp.totalMessages.toString()}
                icon={MessageCircle}
                color="green"
              />
            </div>
          </div>

          {/* Daily Summary */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg">סיכום יום</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground">פיננסי</h3>
                  <div className="space-y-2">
                    <SummaryRow label="הכנסות" value={formatCurrency(data.shopify.revenue)} />
                    <SummaryRow label="הוצאות פרסום" value={formatCurrency(data.meta.adSpend)} negative />
                    <SummaryRow
                      label="רווח גולמי (לפני עלויות מוצר)"
                      value={formatCurrency(data.shopify.revenue - data.meta.adSpend)}
                      bold
                      highlight={data.shopify.revenue - data.meta.adSpend > 0}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground">יעילות</h3>
                  <div className="space-y-2">
                    <SummaryRow label="ROAS" value={`${data.meta.roas.toFixed(2)}x`} highlight={data.meta.roas >= 1} />
                    <SummaryRow label="עלות להזמנה" value={data.shopify.orderCount > 0 ? formatCurrency(data.meta.adSpend / data.shopify.orderCount) : '—'} />
                    <SummaryRow label="עלות להמרה" value={data.meta.conversions > 0 ? formatCurrency(data.meta.adSpend / data.meta.conversions) : '—'} />
                    <SummaryRow label="יחס המרה (סשנים להזמנות)" value={data.clarity.sessions > 0 ? `${((data.shopify.orderCount / data.clarity.sessions) * 100).toFixed(2)}%` : '—'} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// --- Helper Components ---

function InsightCard({ title, value, icon: Icon, change, color, highlight, invertChange }: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  change?: { value: string; isPositive: boolean; label: string } | null
  color: 'blue' | 'orange' | 'purple' | 'green'
  highlight?: boolean
  invertChange?: boolean
}) {
  const colorMap = {
    blue: 'text-blue-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    green: 'text-green-600',
  }

  const isGood = change ? (invertChange ? !change.isPositive : change.isPositive) : null

  return (
    <Card className={highlight ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : ''}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <Icon className={`size-4 ${colorMap[color]}`} />
        </div>
        <p className="text-xl font-bold">{value}</p>
        {change && (
          <p className={`text-xs mt-1 ${isGood ? 'text-green-600' : 'text-red-600'}`}>
            {change.label} מאתמול
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value, negative, bold, highlight }: {
  label: string
  value: string
  negative?: boolean
  bold?: boolean
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? 'border-t pt-2 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-base' : ''} ${negative ? 'text-red-600' : ''} ${highlight ? 'text-green-600' : ''}`}>
        {negative ? `-${value.replace('-', '')}` : value}
      </span>
    </div>
  )
}

