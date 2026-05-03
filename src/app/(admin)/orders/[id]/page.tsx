'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/dates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ArrowRight, History } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

export default function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params)
  const supabase = createClient()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()
      return data
    },
  })

  const { data: items } = useQuery({
    queryKey: ['order-items', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', id)
        .order('created_at')
      return data || []
    },
  })

  const { data: profitability } = useQuery({
    queryKey: ['order-profit', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('order_profitability')
        .select('*')
        .eq('order_id', id)
        .single()
      return data
    },
  })

  const { data: historyData } = useQuery({
    queryKey: ['order-status-history', id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/history`)
      if (!res.ok) return { logs: [], items: [] }
      return res.json() as Promise<{
        logs: Array<{
          id: string
          order_item_id: string
          from_status: string | null
          to_status: string
          source: string
          created_at: string
          suppliers: { name: string } | null
        }>
        items: Array<{ id: string; title: string; variant_title: string | null; suppliers: { name: string } | null }>
      }>
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!order) {
    return <div className="text-center text-muted-foreground">הזמנה לא נמצאה</div>
  }

  const statusLabels: Record<string, string> = {
    pending: 'ממתין',
    paid: 'שולם',
    fulfilled: 'נשלח',
    partially_fulfilled: 'חלקית',
    refunded: 'הוחזר',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/orders" className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold">הזמנה {order.shopify_order_number}</h1>
        <Badge>{statusLabels[order.status] || order.status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Order Info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>פריטים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items?.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-lg border p-3">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.title}
                      width={64}
                      height={64}
                      className="rounded-md object-cover"
                    />
                  ) : (
                    <div className="size-16 rounded-md bg-muted" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    {item.variant_title && (
                      <p className="text-sm text-muted-foreground">{item.variant_title}</p>
                    )}
                    {item.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                    )}
                  </div>
                  <div className="text-end">
                    <p className="font-medium">{formatCurrency(Number(item.total_price))}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} x {formatCurrency(Number(item.unit_price))}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>סכום ביניים</span>
                <span>{formatCurrency(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between">
                <span>משלוח</span>
                <span>{formatCurrency(Number(order.shipping_cost))}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>הנחה</span>
                  <span>-{formatCurrency(Number(order.discount))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>מע"מ</span>
                <span>{formatCurrency(Number(order.tax))}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>סה"כ</span>
                <span>{formatCurrency(Number(order.total))}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle>לקוח</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{order.customer_name || '-'}</p>
              <p>{order.customer_email}</p>
              <p dir="ltr">{order.customer_phone}</p>
            </CardContent>
          </Card>

          {/* Shipping */}
          <Card>
            <CardHeader>
              <CardTitle>משלוח</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.shipping_address ? (
                <>
                  <p>{(order.shipping_address as Record<string, string>).name}</p>
                  <p>{(order.shipping_address as Record<string, string>).address1}</p>
                  <p>
                    {(order.shipping_address as Record<string, string>).city}{' '}
                    {(order.shipping_address as Record<string, string>).zip}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">אין כתובת משלוח</p>
              )}
              {order.tracking_number && (
                <div className="mt-3 rounded bg-muted p-2">
                  <p className="text-xs text-muted-foreground">מספר מעקב</p>
                  <p className="font-mono" dir="ltr">{order.tracking_number}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profitability */}
          {profitability && (
            <Card>
              <CardHeader>
                <CardTitle>רווחיות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>הכנסה</span>
                  <span>{formatCurrency(Number(profitability.revenue))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>עלות מוצר</span>
                  <span>-{formatCurrency(Number(profitability.product_cost))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>משלוח</span>
                  <span>-{formatCurrency(Number(profitability.shipping_cost))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>הוצאות נוספות</span>
                  <span>-{formatCurrency(Number(profitability.additional_expenses))}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>רווח</span>
                  <span className={Number(profitability.profit) >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(Number(profitability.profit))}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>ציר זמן</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <TimelineItem label="הזמנה נוצרה" date={order.order_date} />
              {order.shipped_at && <TimelineItem label="נשלח" date={order.shipped_at} />}
              {order.delivered_at && <TimelineItem label="נמסר" date={order.delivered_at} />}
              {order.cancelled_at && <TimelineItem label="בוטל" date={order.cancelled_at} />}
            </CardContent>
          </Card>

          {/* Internal Status Change Logs (per item, by suppliers) */}
          {historyData && historyData.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4" />
                  שינויי סטטוס ספקים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {historyData.logs.map((log) => {
                    const item = historyData.items.find((it) => it.id === log.order_item_id)
                    return (
                      <div key={log.id} className="rounded-md border bg-muted/20 p-2.5 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {log.from_status && (
                            <>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${INTERNAL_STATUS_COLORS[log.from_status]}`}>
                                {INTERNAL_STATUS_LABELS[log.from_status]}
                              </span>
                              <span className="text-muted-foreground text-xs">→</span>
                            </>
                          )}
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${INTERNAL_STATUS_COLORS[log.to_status]}`}>
                            {INTERNAL_STATUS_LABELS[log.to_status]}
                          </span>
                          <span className="text-xs text-muted-foreground ms-auto">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                        {item && (
                          <p className="text-xs text-muted-foreground mt-1.5 truncate">
                            {item.title}
                            {item.variant_title && ` · ${item.variant_title}`}
                          </p>
                        )}
                        {log.suppliers?.name && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">ע&quot;י {log.suppliers.name}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

const INTERNAL_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  packed: 'נארז',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
}

const INTERNAL_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  packed: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

function TimelineItem({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-2 rounded-full bg-primary" />
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(date)}</p>
      </div>
    </div>
  )
}
