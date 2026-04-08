'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useState } from 'react'

type StatusFilter = 'ACTIVE' | 'ALL' | 'PAUSED'

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE')
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: insights } = await supabase
        .from('campaign_insights')
        .select('*')
        .order('date', { ascending: false })

      // Aggregate insights per campaign
      const campaignStats = new Map<string, {
        totalSpend: number; totalClicks: number; totalImpressions: number
        totalConversions: number; totalConversionValue: number
      }>()

      insights?.forEach((i) => {
        const existing = campaignStats.get(i.campaign_id) || {
          totalSpend: 0, totalClicks: 0, totalImpressions: 0,
          totalConversions: 0, totalConversionValue: 0,
        }
        existing.totalSpend += Number(i.spend)
        existing.totalClicks += Number(i.clicks)
        existing.totalImpressions += Number(i.impressions)
        existing.totalConversions += Number(i.conversions)
        existing.totalConversionValue += Number(i.conversion_value)
        campaignStats.set(i.campaign_id, existing)
      })

      // Daily spend chart
      const dailyMap = new Map<string, number>()
      insights?.forEach((i) => {
        dailyMap.set(i.date, (dailyMap.get(i.date) || 0) + Number(i.spend))
      })
      const dailySpend = Array.from(dailyMap.entries())
        .map(([date, spend]) => ({ date, spend }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30)

      const totalSpend = Array.from(campaignStats.values()).reduce((s, c) => s + c.totalSpend, 0)
      const totalConvValue = Array.from(campaignStats.values()).reduce((s, c) => s + c.totalConversionValue, 0)

      return {
        campaigns: campaigns || [],
        campaignStats,
        dailySpend,
        totalSpend,
        overallRoas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
      }
    },
  })

  const filteredCampaigns = data?.campaigns.filter((c) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'ACTIVE') return c.status === 'ACTIVE'
    return c.status === 'PAUSED' || c.status === 'ARCHIVED'
  }) || []

  const activeCount = data?.campaigns.filter(c => c.status === 'ACTIVE').length || 0
  const inactiveCount = (data?.campaigns.length || 0) - activeCount

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">קמפיינים - Meta Ads</h1>

        {/* Status Filter */}
        <div className="flex items-center gap-1 rounded-lg border p-1 self-start">
          <Button
            size="sm"
            variant={statusFilter === 'ACTIVE' ? 'default' : 'ghost'}
            onClick={() => setStatusFilter('ACTIVE')}
            className="text-xs h-7 px-2"
          >
            פעילים ({activeCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'PAUSED' ? 'default' : 'ghost'}
            onClick={() => setStatusFilter('PAUSED')}
            className="text-xs h-7 px-2"
          >
            לא פעילים ({inactiveCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'ALL' ? 'default' : 'ghost'}
            onClick={() => setStatusFilter('ALL')}
            className="text-xs h-7 px-2"
          >
            הכל ({data?.campaigns.length || 0})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">סה"כ הוצאות</p>
                <p className="mt-1 text-2xl font-bold">{formatCurrency(data!.totalSpend)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">ROAS כולל</p>
                <p className="mt-1 text-2xl font-bold">{data!.overallRoas.toFixed(2)}x</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">קמפיינים פעילים</p>
                <p className="mt-1 text-2xl font-bold">{activeCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Daily Spend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>הוצאות יומיות</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data!.dailySpend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}` }} />
                  <YAxis orientation="right" tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="spend" fill="#FF8042" name="הוצאות" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Campaign List */}
          <div className="space-y-3">
            {filteredCampaigns.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  אין קמפיינים {statusFilter === 'ACTIVE' ? 'פעילים' : statusFilter === 'PAUSED' ? 'לא פעילים' : ''}
                </CardContent>
              </Card>
            ) : (
              filteredCampaigns.map((campaign) => {
                const stats = data!.campaignStats.get(campaign.id)
                const roas = stats && stats.totalSpend > 0 ? stats.totalConversionValue / stats.totalSpend : 0

                return (
                  <Card key={campaign.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{campaign.name}</h3>
                          <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'}>
                            {campaign.status === 'ACTIVE' ? 'פעיל' : campaign.status === 'PAUSED' ? 'מושהה' : campaign.status}
                          </Badge>
                        </div>
                        {campaign.objective && (
                          <span className="text-xs text-muted-foreground">{campaign.objective}</span>
                        )}
                      </div>
                      {stats && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">הוצאות</p>
                            <p className="font-medium">{formatCurrency(stats.totalSpend)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">הקלקות</p>
                            <p className="font-medium">{formatNumber(stats.totalClicks)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">חשיפות</p>
                            <p className="font-medium">{formatNumber(stats.totalImpressions)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">המרות</p>
                            <p className="font-medium">{formatNumber(stats.totalConversions)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">ROAS</p>
                            <p className={`font-bold ${roas >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                              {roas.toFixed(2)}x
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
