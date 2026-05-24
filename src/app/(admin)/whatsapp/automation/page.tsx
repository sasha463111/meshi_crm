'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Play, ArrowRight, AlertTriangle, FlaskConical, MessageSquareText, Save } from 'lucide-react'
import Link from 'next/link'

interface SettingsResponse {
  enabled: boolean
  testPhone: string
  counts: Record<string, number>
  recent: Array<{
    flow: string
    step: number
    phone: string
    status: string
    scheduled_at: string
    sent_at: string | null
    content: string
  }>
}

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-700',
}

export default function WhatsAppAutomationPage() {
  const qc = useQueryClient()
  const [testPhone, setTestPhone] = useState('')
  const [runResult, setRunResult] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['wflow-settings'],
    queryFn: async () => (await fetch('/api/whatsapp/flow/settings')).json() as Promise<SettingsResponse>,
    refetchInterval: 15000,
  })

  useEffect(() => {
    if (data?.testPhone !== undefined) setTestPhone(data.testPhone)
  }, [data?.testPhone])

  const save = useMutation({
    mutationFn: async (payload: { enabled?: boolean; testPhone?: string }) => {
      const res = await fetch('/api/whatsapp/flow/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('save failed')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wflow-settings'] }),
  })

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/flow/run', { method: 'POST' })
      return res.json()
    },
    onSuccess: (r) => {
      setRunResult(
        `נסרקו ${r?.scan?.scanned ?? '-'} עגלות, נכנסו ${r?.scan?.enqueued ?? '-'} לתור · נשלחו עכשיו ${r?.process?.sent ?? 0} (מתוך ${r?.process?.due ?? 0})`
      )
      qc.invalidateQueries({ queryKey: ['wflow-settings'] })
    },
  })

  // Message templates (editable copy)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const templatesQ = useQuery({
    queryKey: ['wflow-templates'],
    queryFn: async () =>
      (await fetch('/api/whatsapp/flow/templates')).json() as Promise<{
        templates: Array<{ id: string; flow: string; step: number; label: string; content: string }>
      }>,
  })
  useEffect(() => {
    if (templatesQ.data?.templates) {
      const init: Record<string, string> = {}
      templatesQ.data.templates.forEach((t) => (init[t.id] = t.content))
      setDrafts(init)
    }
  }, [templatesQ.data])

  const saveTemplates = useMutation({
    mutationFn: async () => {
      const templates = Object.entries(drafts).map(([id, content]) => ({ id, content }))
      const res = await fetch('/api/whatsapp/flow/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      })
      if (!res.ok) throw new Error('save failed')
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wflow-templates'] }),
  })

  const enabled = !!data?.enabled
  const inTestMode = !!data?.testPhone

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">אוטומציית וואטסאפ</h1>
        <Link href="/whatsapp">
          <Button variant="ghost" size="sm">
            <ArrowRight className="size-4 me-1" />
            חזרה
          </Button>
        </Link>
      </div>

      {/* Master switch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">מצב הפעלה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-base">הפעלת שליחה אוטומטית</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                כשכבוי — הודעות נכנסות לתור אך לא נשלחות.
              </p>
            </div>
            {isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Switch checked={enabled} onCheckedChange={(v) => save.mutate({ enabled: v })} />
            )}
          </div>

          {enabled && !inTestMode && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              שליחה לכל הלקוחות האמיתיים פעילה. ודא שאתה רוצה בזה.
            </div>
          )}
          {enabled && inTestMode && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <FlaskConical className="size-4 shrink-0" />
              מצב בדיקה: כל ההודעות נשלחות רק למספר הבדיקה למטה (לא ללקוחות).
            </div>
          )}

          <div>
            <Label htmlFor="testphone">מספר בדיקה (מצב בטוח)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              אם מוזן — כל ההודעות ילכו רק לכאן. רוקן כדי לשלוח ללקוחות אמיתיים.
            </p>
            <div className="flex gap-2">
              <Input
                id="testphone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="0526059554"
                dir="ltr"
              />
              <Button onClick={() => save.mutate({ testPhone })} disabled={save.isPending}>
                שמור
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue + run */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">תור ההודעות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            {(['pending', 'sent', 'cancelled', 'failed'] as const).map((s) => (
              <div key={s} className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{data?.counts?.[s] ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  {s === 'pending' ? 'ממתין' : s === 'sent' ? 'נשלח' : s === 'cancelled' ? 'בוטל' : 'נכשל'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="size-4 me-1 animate-spin" /> : <Play className="size-4 me-1" />}
              הרץ עכשיו (סריקה + שליחת מה שהגיע זמנו)
            </Button>
          </div>
          {runResult && <p className="text-sm text-muted-foreground">{runResult}</p>}
        </CardContent>
      </Card>

      {/* Message templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquareText className="size-4" />
            נוסחי ההודעות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            ניתן לערוך את הטקסטים. השתמש ב-<code className="bg-muted px-1 rounded">{'{name}'}</code> לשם הלקוח/ה
            וב-<code className="bg-muted px-1 rounded">{'{link}'}</code> לקישור השחזור.
          </p>
          {templatesQ.isLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            (templatesQ.data?.templates || []).map((t) => (
              <div key={t.id} className="space-y-1.5">
                <Label className="text-sm">{t.label}</Label>
                <Textarea
                  dir="rtl"
                  rows={4}
                  value={drafts[t.id] ?? t.content}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                />
              </div>
            ))
          )}
          <Button onClick={() => saveTemplates.mutate()} disabled={saveTemplates.isPending}>
            {saveTemplates.isPending ? (
              <Loader2 className="size-4 me-1 animate-spin" />
            ) : (
              <Save className="size-4 me-1" />
            )}
            שמור נוסחים
          </Button>
          {saveTemplates.isSuccess && (
            <span className="text-xs text-green-600 ms-2">נשמר ✓</span>
          )}
        </CardContent>
      </Card>

      {/* Recent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">הודעות אחרונות בתור</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.recent?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">אין הודעות עדיין.</p>
          ) : (
            <div className="space-y-2">
              {data.recent.map((j, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="font-medium">{j.phone}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {j.flow} · שלב {j.step}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{j.content}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${statusColor[j.status] || ''}`}>
                    {j.status === 'pending' ? 'ממתין' : j.status === 'sent' ? 'נשלח' : j.status === 'cancelled' ? 'בוטל' : 'נכשל'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
