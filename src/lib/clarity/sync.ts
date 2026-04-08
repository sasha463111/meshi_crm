import { getClarityLiveInsights } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

interface ClarityMetric {
  metricName: string
  information: Record<string, unknown>[]
}

function findMetric(metrics: ClarityMetric[], name: string): Record<string, unknown> | null {
  const metric = metrics.find(m => m.metricName === name)
  if (!metric || !metric.information?.length) return null
  return metric.information[0]
}

function extractTopPages(metrics: ClarityMetric[]): Record<string, number> {
  const metric = metrics.find(m => m.metricName === 'PopularPages')
  if (!metric?.information?.length) return {}
  const result: Record<string, number> = {}
  for (const item of metric.information) {
    const url = item.url as string
    const count = Number(item.visitsCount) || 0
    if (url) result[url] = count
  }
  return result
}

function extractBreakdown(metrics: ClarityMetric[], metricName: string): Record<string, number> {
  const metric = metrics.find(m => m.metricName === metricName)
  if (!metric?.information?.length) return {}
  const result: Record<string, number> = {}
  for (const item of metric.information) {
    const name = item.name as string
    const count = Number(item.sessionsCount) || 0
    if (name) result[name] = count
  }
  return result
}

export async function syncClarity() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('sync_logs')
    .insert({ source: 'clarity', status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  try {
    const insights = await getClarityLiveInsights({ numOfDays: 1 }) as ClarityMetric[]
    const today = new Date().toISOString().split('T')[0]

    // Extract Traffic data
    const traffic = findMetric(insights, 'Traffic')
    const totalSessions = Number(traffic?.totalSessionCount) || 0
    const totalUsers = Number(traffic?.distinctUserCount) || 0
    const pagesPerSession = Number(traffic?.pagesPerSessionPercentage) || 0

    // Extract ScrollDepth
    const scroll = findMetric(insights, 'ScrollDepth')
    const scrollDepth = Number(scroll?.averageScrollDepth) || 0

    // Extract behavior metrics
    const deadClick = findMetric(insights, 'DeadClickCount')
    const rageClick = findMetric(insights, 'RageClickCount')
    const quickBack = findMetric(insights, 'QuickbackClick')
    const excessiveScroll = findMetric(insights, 'ExcessiveScroll')

    // Bounce rate is not directly available - use quickback percentage as proxy
    const bounceRate = Number(quickBack?.sessionsWithMetricPercentage) || 0

    await supabase.from('clarity_snapshots').upsert({
      date: today,
      total_sessions: totalSessions,
      total_users: totalUsers,
      pages_per_session: pagesPerSession,
      scroll_depth: scrollDepth,
      bounce_rate: bounceRate,
      rage_clicks: Number(rageClick?.subTotal) || 0,
      dead_clicks: Number(deadClick?.subTotal) || 0,
      quick_backs: Number(quickBack?.subTotal) || 0,
      excessive_scrolling: Number(excessiveScroll?.subTotal) || 0,
      top_pages: extractTopPages(insights),
      device_breakdown: extractBreakdown(insights, 'Device'),
      referrer_breakdown: extractBreakdown(insights, 'ReferrerUrl'),
      raw_data: insights,
    }, { onConflict: 'date' })

    await supabase.from('sync_logs').update({
      status: 'completed',
      records_processed: 1,
      records_created: 1,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    return { success: true }
  } catch (error) {
    await supabase.from('sync_logs').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)
    throw error
  }
}
