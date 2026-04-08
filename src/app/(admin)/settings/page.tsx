'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/dates'

export default function SettingsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)
      return data || []
    },
  })

  const syncMutation = useMutation({
    mutationFn: async (source: string) => {
      const res = await fetch(`/api/cron/sync-${source}`, { method: 'GET' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  const integrations = [
    { key: 'orders', name: 'Shopify הזמנות', description: 'סנכרון הזמנות מ-Shopify' },
    { key: 'products', name: 'Shopify מוצרים', description: 'סנכרון מוצרים מ-Shopify' },
    { key: 'campaigns', name: 'Meta Ads', description: 'סנכרון קמפיינים מ-Meta' },
    { key: 'clarity', name: 'Clarity', description: 'סנכרון נתוני התנהגות מ-Clarity' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">אינטגרציות</TabsTrigger>
          <TabsTrigger value="logs">לוגי סנכרון</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4">
          {integrations.map((integration) => (
            <Card key={integration.key}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => syncMutation.mutate(integration.key)}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="size-4 me-2 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4 me-2" />
                    )}
                    סנכרן עכשיו
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>לוגי סנכרון אחרונים</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {syncLogs?.map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div className="flex items-center gap-3">
                      {log.status === 'completed' ? (
                        <CheckCircle className="size-4 text-green-500" />
                      ) : log.status === 'failed' ? (
                        <XCircle className="size-4 text-red-500" />
                      ) : (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      <span className="font-medium">{log.source}</span>
                      <Badge variant="outline">{log.triggered_by}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{log.records_processed} processed</span>
                      <span>{log.records_created} created</span>
                      <span>{log.records_updated} updated</span>
                      <span>{formatDateTime(log.started_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
