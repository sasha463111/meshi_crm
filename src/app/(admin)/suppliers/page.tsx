'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Truck, Mail, Phone, Link2, Check, Copy } from 'lucide-react'
import { useState } from 'react'

export default function SuppliersPage() {
  const supabase = createClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
      <h1 className="text-2xl font-bold">ספקים</h1>

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
