'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Truck, Mail, Phone, Link2, Check, RefreshCw, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function SuppliersPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync-orders', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: (data) => {
      const msg = `סונכרנו ${data.created || 0} חדשות, ${data.updated || 0} עודכנו`
      setSyncResult(msg)
      setTimeout(() => setSyncResult(null), 5000)
      // Refresh any order-related queries
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] })
    },
    onError: () => {
      setSyncResult('שגיאה בסנכרון')
      setTimeout(() => setSyncResult(null), 5000)
    },
  })

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('*').order('name')
      return data || []
    },
  })

  const copyLink = (supplier: { id: string; access_token?: string }) => {
    if (!supplier.access_token) return
    const url = `${window.location.origin}/portal/access/${supplier.access_token}`
    navigator.clipboard.writeText(url)
    setCopiedId(supplier.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ספקים</h1>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className="text-sm text-muted-foreground">{syncResult}</span>
          )}
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant="outline"
            size="sm"
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-4 me-1.5 animate-spin" />
            ) : (
              <RefreshCw className="size-4 me-1.5" />
            )}
            סנכרן הזמנות
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : suppliers?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Truck className="mx-auto mb-4 size-12" />
            <p>עדיין לא נוספו ספקים</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {suppliers?.map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{supplier.name}</CardTitle>
                  <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
                    {supplier.is_active ? 'פעיל' : 'מושבת'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {supplier.contact_name && <p className="font-medium">{supplier.contact_name}</p>}
                {supplier.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    {supplier.email}
                  </p>
                )}
                {supplier.phone && (
                  <p className="flex items-center gap-2" dir="ltr">
                    <Phone className="size-4 text-muted-foreground" />
                    {supplier.phone}
                  </p>
                )}
                {supplier.notes && (
                  <p className="text-muted-foreground">{supplier.notes}</p>
                )}

                {/* Access Link */}
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => copyLink(supplier)}
                  >
                    {copiedId === supplier.id ? (
                      <>
                        <Check className="size-3.5 me-1 text-green-600" />
                        הלינק הועתק!
                      </>
                    ) : (
                      <>
                        <Link2 className="size-3.5 me-1" />
                        העתק לינק כניסה לספק
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
