'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Brain, Sparkles, Target, Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function AIPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="size-7" />
        <h1 className="text-2xl font-bold">AI Hub</h1>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">
            <Sparkles className="size-4 me-1" />
            אופטימיזציית מוצרים
          </TabsTrigger>
          <TabsTrigger value="ads">
            <Target className="size-4 me-1" />
            יועץ מודעות
          </TabsTrigger>
          <TabsTrigger value="behavior">
            <Eye className="size-4 me-1" />
            ניתוח התנהגות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products"><ProductOptimizer /></TabsContent>
        <TabsContent value="ads"><AdsAdvisor /></TabsContent>
        <TabsContent value="behavior"><BehaviorAnalyzer /></TabsContent>
      </Tabs>
    </div>
  )
}

function ProductOptimizer() {
  const [selectedProduct, setSelectedProduct] = useState('')
  const supabase = createClient()

  const { data: products } = useQuery({
    queryKey: ['products-for-ai'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, title, description, category, price').order('title')
      return data || []
    },
  })

  const optimizeMutation = useMutation({
    mutationFn: async (product: { title: string; description: string | null; category: string | null; price: number }) => {
      const res = await fetch('/api/ai/product-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      })
      return res.json()
    },
  })

  const selected = products?.find(p => p.id === selectedProduct)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>שיפור תיאורי מוצרים</CardTitle>
          <CardDescription>בחר מוצר וה-AI ייצר תיאור משופר עם SEO</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedProduct} onValueChange={(v) => setSelectedProduct(v ?? '')}>
            <SelectTrigger>
              <SelectValue placeholder="בחר מוצר" />
            </SelectTrigger>
            <SelectContent>
              {products?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selected && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <h4 className="font-medium mb-2">תיאור נוכחי:</h4>
              <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: selected.description || 'אין תיאור' }} />
            </div>
          )}

          <Button
            onClick={() => selected && optimizeMutation.mutate(selected)}
            disabled={!selected || optimizeMutation.isPending}
          >
            {optimizeMutation.isPending ? (
              <><Loader2 className="size-4 me-2 animate-spin" />מייצר...</>
            ) : (
              <><Sparkles className="size-4 me-2" />צור תיאור משופר</>
            )}
          </Button>
        </CardContent>
      </Card>

      {optimizeMutation.data && (
        <Card>
          <CardHeader><CardTitle>תוצאה</CardTitle></CardHeader>
          <CardContent>
            {optimizeMutation.data.raw ? (
              <p className="whitespace-pre-wrap text-sm">{optimizeMutation.data.raw}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">כותרת חדשה:</h4>
                  <p className="text-lg font-semibold mt-1">{optimizeMutation.data.title}</p>
                </div>
                <div>
                  <h4 className="font-medium">תיאור:</h4>
                  <p className="mt-1 text-sm">{optimizeMutation.data.description}</p>
                </div>
                {optimizeMutation.data.bulletPoints && (
                  <div>
                    <h4 className="font-medium">נקודות מפתח:</h4>
                    <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                      {optimizeMutation.data.bulletPoints.map((bp: string, i: number) => (
                        <li key={i}>{bp}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {optimizeMutation.data.tags && (
                  <div className="flex gap-2 flex-wrap">
                    {optimizeMutation.data.tags.map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AdsAdvisor() {
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const supabase = createClient()

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns-for-ai'],
    queryFn: async () => {
      const { data: camps } = await supabase.from('campaigns').select('id, name, objective')
      const { data: insights } = await supabase.from('campaign_insights').select('campaign_id, spend, clicks, impressions, conversions, conversion_value, ctr')

      return (camps || []).map(c => {
        const ci = (insights || []).filter(i => i.campaign_id === c.id)
        const totalSpend = ci.reduce((s, i) => s + Number(i.spend), 0)
        const totalConvValue = ci.reduce((s, i) => s + Number(i.conversion_value), 0)
        const totalConversions = ci.reduce((s, i) => s + Number(i.conversions), 0)
        const avgCtr = ci.length > 0 ? ci.reduce((s, i) => s + Number(i.ctr || 0), 0) / ci.length : 0
        return {
          ...c,
          spend: totalSpend,
          roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
          ctr: avgCtr,
          conversions: totalConversions,
        }
      })
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: async (campaign: { name: string; spend: number; roas: number; ctr: number; conversions: number; objective: string | null }) => {
      const res = await fetch('/api/ai/ads-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignName: campaign.name, ...campaign }),
      })
      return res.json()
    },
  })

  const selected = campaigns?.find(c => c.id === selectedCampaign)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>יועץ קמפיינים AI</CardTitle>
          <CardDescription>בחר קמפיין וקבל המלצות אופטימיזציה</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedCampaign} onValueChange={(v) => setSelectedCampaign(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="בחר קמפיין" /></SelectTrigger>
            <SelectContent>
              {campaigns?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => selected && analyzeMutation.mutate(selected)}
            disabled={!selected || analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? <><Loader2 className="size-4 me-2 animate-spin" />מנתח...</> : <><Target className="size-4 me-2" />נתח קמפיין</>}
          </Button>
        </CardContent>
      </Card>

      {analyzeMutation.data && (
        <Card>
          <CardHeader><CardTitle>המלצות AI</CardTitle></CardHeader>
          <CardContent>
            {analyzeMutation.data.raw ? (
              <p className="whitespace-pre-wrap text-sm">{analyzeMutation.data.raw}</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">{analyzeMutation.data.analysis}</p>
                {analyzeMutation.data.suggestions?.map((s: { title: string; description: string }, i: number) => (
                  <div key={i} className="rounded border p-3">
                    <h4 className="font-medium">{s.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BehaviorAnalyzer() {
  const supabase = createClient()

  const { data: latestClarity } = useQuery({
    queryKey: ['clarity-for-ai'],
    queryFn: async () => {
      const { data } = await supabase.from('clarity_snapshots').select('*').order('date', { ascending: false }).limit(7)
      return data || []
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/behavior-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clarityData: latestClarity }),
      })
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ניתוח התנהגות גולשים</CardTitle>
          <CardDescription>ניתוח AI של נתוני Clarity האחרונים</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={!latestClarity?.length || analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? <><Loader2 className="size-4 me-2 animate-spin" />מנתח...</> : <><Eye className="size-4 me-2" />נתח התנהגות</>}
          </Button>
          {!latestClarity?.length && (
            <p className="mt-2 text-sm text-muted-foreground">אין נתוני Clarity זמינים לניתוח</p>
          )}
        </CardContent>
      </Card>

      {analyzeMutation.data && (
        <Card>
          <CardHeader><CardTitle>תובנות AI</CardTitle></CardHeader>
          <CardContent>
            {analyzeMutation.data.raw ? (
              <p className="whitespace-pre-wrap text-sm">{analyzeMutation.data.raw}</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">{analyzeMutation.data.summary}</p>
                {analyzeMutation.data.issues?.map((issue: { severity: string; [key: string]: unknown }, i: number) => (
                  <div key={i} className="flex items-start gap-3 rounded border p-3">
                    <Badge variant={issue.severity === 'high' ? 'destructive' : issue.severity === 'medium' ? 'secondary' : 'outline'}>
                      {issue.severity}
                    </Badge>
                    <p className="text-sm">{JSON.stringify(issue)}</p>
                  </div>
                ))}
                {analyzeMutation.data.quickWins && (
                  <div>
                    <h4 className="font-medium mb-2">שיפורים מהירים:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {(Array.isArray(analyzeMutation.data.quickWins) ? analyzeMutation.data.quickWins : [analyzeMutation.data.quickWins]).map((qw: string, i: number) => (
                        <li key={i}>{qw}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
