'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/dates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRight, Truck, Download, ZoomIn, Package, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

const internalStatusLabels: Record<string, string> = {
  pending: 'ממתין',
  packed: 'נארז',
  shipped: 'נשלח',
  delivered: 'נמסר',
}

const internalStatusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  packed: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
}

const statusFlow = ['pending', 'packed', 'shipped', 'delivered']

export default function SupplierOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params)
  const { supplier } = useSupplierAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [shipDialogOpen, setShipDialogOpen] = useState(false)

  const { data: order } = useQuery({
    queryKey: ['supplier-order', id],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').eq('id', id).single()
      return data
    },
  })

  const { data: items } = useQuery({
    queryKey: ['supplier-order-items', id, supplier?.supplier_id],
    enabled: !!supplier?.supplier_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', id)
        .eq('supplier_id', supplier!.supplier_id)
      return data || []
    },
  })

  // Update internal status for a single item
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const { error } = await supabase
        .from('order_items')
        .update({ internal_status: status })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-order-items', id] })
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] })
    },
  })

  // Update all items status at once
  const updateAllStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!items?.length) return
      const itemIds = items.map(i => i.id)
      const { error } = await supabase
        .from('order_items')
        .update({ internal_status: status })
        .in('id', itemIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-order-items', id] })
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] })
    },
  })

  const shipMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/suppliers/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: id,
          trackingNumber,
          carrier,
          supplierId: supplier?.supplier_id,
        }),
      })
      if (!res.ok) throw new Error('Failed to ship')
      return res.json()
    },
    onSuccess: () => {
      setShipDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['supplier-order', id] })
      queryClient.invalidateQueries({ queryKey: ['supplier-order-items', id] })
    },
  })

  if (!order) return null

  // Get the overall status for this order's items
  const getOverallStatus = () => {
    if (!items?.length) return 'pending'
    const priority = ['pending', 'packed', 'shipped', 'delivered']
    let worst = 3
    for (const item of items) {
      const idx = priority.indexOf(item.internal_status || 'pending')
      if (idx < worst) worst = idx
    }
    return priority[worst]
  }

  const overallStatus = getOverallStatus()
  const nextStatus = statusFlow[statusFlow.indexOf(overallStatus) + 1] || null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/portal" className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-5" />
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold">הזמנה {order.shopify_order_number}</h1>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${internalStatusColors[overallStatus]}`}>
          {internalStatusLabels[overallStatus]}
        </span>
      </div>

      {/* Quick Status Update */}
      <Card className="border-2">
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">סטטוס הזמנה</p>
              <p className="text-xs text-muted-foreground mt-0.5">עדכן את הסטטוס של כל הפריטים בהזמנה</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusFlow.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={overallStatus === status ? 'default' : 'outline'}
                  className={`text-xs h-8 ${overallStatus === status ? '' : 'opacity-70'}`}
                  onClick={() => updateAllStatusMutation.mutate(status)}
                  disabled={updateAllStatusMutation.isPending}
                >
                  {status === 'pending' && <Clock className="size-3 me-1" />}
                  {status === 'packed' && <Package className="size-3 me-1" />}
                  {status === 'shipped' && <Truck className="size-3 me-1" />}
                  {status === 'delivered' && <CheckCircle2 className="size-3 me-1" />}
                  {internalStatusLabels[status]}
                </Button>
              ))}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 flex items-center gap-1">
            {statusFlow.map((status, i) => {
              const currentIdx = statusFlow.indexOf(overallStatus)
              const isCompleted = i <= currentIdx
              return (
                <div key={status} className={`h-1.5 flex-1 rounded-full transition-colors ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Customer & Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">לקוח</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{order.customer_name}</p>
            {order.shipping_address && (
              <>
                <p>{(order.shipping_address as Record<string, string>).address1}</p>
                <p>{(order.shipping_address as Record<string, string>).city} {(order.shipping_address as Record<string, string>).zip}</p>
                <p dir="ltr">{(order.shipping_address as Record<string, string>).phone}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">פעולות</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
              <DialogTrigger
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                disabled={order.fulfillment_status === 'FULFILLED'}
              >
                <Truck className="size-4" />
                סמן כנשלח (Shopify)
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>סימון הזמנה כנשלחה</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>מספר מעקב</Label>
                    <Input
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="הכנס מספר מעקב"
                      dir="ltr"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>חברת שילוח</Label>
                    <Select value={carrier} onValueChange={(v) => setCarrier(v ?? '')}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="בחר חברת שילוח" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="israel-post">דואר ישראל</SelectItem>
                        <SelectItem value="ups">UPS</SelectItem>
                        <SelectItem value="fedex">FedEx</SelectItem>
                        <SelectItem value="dhl">DHL</SelectItem>
                        <SelectItem value="cheetah">צ'יטה</SelectItem>
                        <SelectItem value="other">אחר</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => shipMutation.mutate()}
                    disabled={!trackingNumber || !carrier || shipMutation.isPending}
                  >
                    {shipMutation.isPending ? 'שולח...' : 'אשר משלוח'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <a
              href={`/api/suppliers/manifest?orderId=${id}`}
              target="_blank"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Download className="size-4" />
              הורד תעודת משלוח PDF
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Items with Images and Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">פריטים</CardTitle>
            {items && items.length > 1 && nextStatus && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                onClick={() => updateAllStatusMutation.mutate(nextStatus)}
                disabled={updateAllStatusMutation.isPending}
              >
                העבר הכל ל{internalStatusLabels[nextStatus]}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items?.map((item) => {
              const itemStatus = item.internal_status || 'pending'
              const itemNextStatus = statusFlow[statusFlow.indexOf(itemStatus) + 1] || null

              return (
                <div key={item.id} className="rounded-lg border overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {item.image_url ? (
                      <div className="relative group cursor-pointer shrink-0" onClick={() => setZoomedImage(item.image_url)}>
                        <Image
                          src={item.image_url}
                          alt={item.title}
                          width={100}
                          height={100}
                          className="rounded-lg object-cover size-24"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <ZoomIn className="size-6 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="size-24 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">
                        אין תמונה
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{item.title}</p>
                      {item.variant_title && <p className="text-sm text-muted-foreground">{item.variant_title}</p>}
                      {item.sku && <p className="text-xs text-muted-foreground" dir="ltr">SKU: {item.sku}</p>}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">כמות: {item.quantity}</Badge>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${internalStatusColors[itemStatus]}`}>
                          {internalStatusLabels[itemStatus]}
                        </span>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="font-bold">{formatCurrency(Number(item.total_price))}</p>
                      <p className="text-sm text-muted-foreground">{item.quantity} x {formatCurrency(Number(item.unit_price))}</p>
                    </div>
                  </div>
                  {/* Per-item status update */}
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/50 border-t">
                    <span className="text-xs text-muted-foreground me-1">סטטוס:</span>
                    {statusFlow.map((status) => (
                      <button
                        key={status}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          itemStatus === status
                            ? internalStatusColors[status]
                            : 'bg-transparent text-muted-foreground border-transparent hover:border-border'
                        }`}
                        onClick={() => updateItemStatusMutation.mutate({ itemId: item.id, status })}
                        disabled={updateItemStatusMutation.isPending}
                      >
                        {internalStatusLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Image Zoom Modal */}
      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomedImage && (
            <Image
              src={zoomedImage}
              alt="Product zoom"
              width={800}
              height={800}
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
