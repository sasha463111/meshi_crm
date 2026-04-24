'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatDateTime } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  ZoomIn,
  Loader2,
  ExternalLink,
  Sparkles,
  Send,
  Wand2,
  Eraser,
  Image as ImageIcon,
  Plus,
  X,
} from 'lucide-react'
import Image from 'next/image'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

interface Submission {
  id: string
  supplier_id: string
  title: string
  description: string | null
  price: number | null
  cost_price: number | null
  sku: string | null
  variants: Array<{ title: string; inventory: number; price: number | null }>
  image_urls: string[]
  notes: string | null
  status: string
  rejection_reason: string | null
  shopify_product_id: string | null
  created_at: string
  reviewed_at: string | null
  suppliers: { id: string; name: string; contact_name: string | null } | null
}

interface GeneratedListing {
  title: string
  description: string
  price: number | null
  compare_at_price: number | null
  tags: string[]
  product_type: string
  category: string
  vendor: string
  variants: Array<{ title: string; inventory: number; sku: string | null; price: number | null }>
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  rejected: 'נדחה',
}

const statusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

export default function AdminSubmissionsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // AI chat state
  const [chatOpenId, setChatOpenId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Review dialog state
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null)
  const [listing, setListing] = useState<GeneratedListing | null>(null)
  const [generating, setGenerating] = useState(false)
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [publishActive, setPublishActive] = useState(true)
  const [editingImageAction, setEditingImageAction] = useState<{ url: string; action: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-submissions', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' ? '/api/submissions' : `/api/submissions?status=${statusFilter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ submissions: Submission[] }>
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/submissions/${payload.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.data),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approve failed')
      return data
    },
    onSuccess: () => {
      setActionError(null)
      setReviewSubmission(null)
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
    },
    onError: (error) => {
      setActionError((error as Error).message)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/submissions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error('Reject failed')
      return res.json()
    },
    onSuccess: () => {
      setRejectingId(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
    },
  })

  const editImageMutation = useMutation({
    mutationFn: async (payload: { submissionId: string; imageUrl: string; action: string }) => {
      const res = await fetch(`/api/submissions/${payload.submissionId}/edit-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: payload.imageUrl, action: payload.action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Edit failed')
      return data as { editedUrl: string }
    },
    onSuccess: (data) => {
      setEditingImageAction(null)
      if (reviewSubmission) {
        // Refresh submission's images
        queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
        // Add the new URL to selected + local state
        setReviewSubmission({
          ...reviewSubmission,
          image_urls: [...reviewSubmission.image_urls, data.editedUrl],
        })
        setSelectedImages((prev) => new Set([...prev, data.editedUrl]))
      }
    },
    onError: (error) => {
      setActionError(`עריכת תמונה נכשלה: ${(error as Error).message}`)
      setEditingImageAction(null)
    },
  })

  const openReview = async (s: Submission) => {
    setReviewSubmission(s)
    setSelectedImages(new Set(s.image_urls))
    setListing(null)
    setActionError(null)
    setPublishActive(true)
    // Auto-generate listing
    setGenerating(true)
    try {
      const res = await fetch(`/api/submissions/${s.id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.listing) {
        setListing(data.listing)
      } else {
        setActionError(`ייצור ה-listing נכשל: ${data.error || 'unknown'}`)
      }
    } catch (err) {
      setActionError(`שגיאה: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  const regenerate = async () => {
    if (!reviewSubmission) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/submissions/${reviewSubmission.id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.listing) setListing(data.listing)
    } finally {
      setGenerating(false)
    }
  }

  const confirmCreate = () => {
    if (!reviewSubmission || !listing) return
    approveMutation.mutate({
      id: reviewSubmission.id,
      data: {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        compare_at_price: listing.compare_at_price,
        tags: listing.tags,
        product_type: listing.product_type,
        category: listing.category,
        vendor: listing.vendor,
        variants: listing.variants,
        image_urls: Array.from(selectedImages),
        status: publishActive ? 'ACTIVE' : 'DRAFT',
      },
    })
  }

  const updateListing = <K extends keyof GeneratedListing>(key: K, value: GeneratedListing[K]) => {
    if (!listing) return
    setListing({ ...listing, [key]: value })
  }

  const updateVariant = (idx: number, field: string, value: string) => {
    if (!listing) return
    const newVariants = [...listing.variants]
    newVariants[idx] = {
      ...newVariants[idx],
      [field]: field === 'title' || field === 'sku' ? value : value === '' ? null : Number(value),
    }
    setListing({ ...listing, variants: newVariants })
  }

  const addVariant = () => {
    if (!listing) return
    setListing({
      ...listing,
      variants: [...listing.variants, { title: '', inventory: 0, sku: null, price: null }],
    })
  }

  const removeVariant = (idx: number) => {
    if (!listing) return
    setListing({ ...listing, variants: listing.variants.filter((_, i) => i !== idx) })
  }

  const toggleImageSelection = (url: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const openChat = (submissionId: string) => {
    setChatOpenId(submissionId)
    setChatMessages([])
    setChatInput('')
  }

  const sendChat = async () => {
    if (!chatInput.trim() || !chatOpenId || chatLoading) return
    const newMessages: ChatMsg[] = [...chatMessages, { role: 'user', content: chatInput }]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch(`/api/submissions/${chatOpenId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: `שגיאה: ${data.error || 'AI לא זמין'}` }])
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `שגיאה: ${(err as Error).message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  const submissions = data?.submissions || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הצעות מוצרים מספקים</h1>
      </div>

      <div className="flex items-center gap-1 rounded-lg border p-1 self-start w-fit flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'ghost'}
            onClick={() => setStatusFilter(s)}
            className="text-xs h-7 px-3"
          >
            {s === 'all' ? 'הכל' : statusLabels[s]}
          </Button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
          שגיאה: {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-4 size-12" />
            <p>אין הצעות {statusFilter !== 'all' && `בסטטוס "${statusLabels[statusFilter]}"`}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {submissions.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.suppliers?.name} · {formatDateTime(s.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[s.status]}`}>
                    {s.status === 'pending' && <Clock className="size-3 me-1" />}
                    {s.status === 'approved' && <CheckCircle2 className="size-3 me-1" />}
                    {s.status === 'rejected' && <XCircle className="size-3 me-1" />}
                    {statusLabels[s.status]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {s.image_urls.slice(0, 8).map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-md overflow-hidden border cursor-pointer group" onClick={() => setZoomedImage(url)}>
                      <Image src={url} alt="" fill className="object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="size-4 text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {s.notes && (
                  <p className="text-xs italic text-muted-foreground border-t pt-2">
                    הערת ספק: {s.notes}
                  </p>
                )}
                {s.rejection_reason && (
                  <p className="text-xs text-red-600 border-t pt-2">
                    סיבת דחייה: {s.rejection_reason}
                  </p>
                )}
                {s.shopify_product_id && (
                  <a
                    href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || '75snke-n1.myshopify.com'}/admin/products/${s.shopify_product_id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    פתח ב-Shopify
                  </a>
                )}

                {s.status === 'pending' && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => openReview(s)}
                      >
                        <Wand2 className="size-4 me-1" />
                        צור listing עם AI ובדוק
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openChat(s.id)}
                        title="שאל את ה-AI שאלות"
                      >
                        <Sparkles className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => setRejectingId(s.id)}
                      >
                        <XCircle className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* REVIEW DIALOG — full listing editor */}
      <Dialog open={!!reviewSubmission} onOpenChange={(v) => !v && setReviewSubmission(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-5 text-purple-600" />
              יצירת מוצר חדש ב-Shopify
            </DialogTitle>
          </DialogHeader>

          {generating && !listing && (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-purple-600" />
              <p className="text-sm text-muted-foreground">ה-AI מנתח את התמונות ויוצר listing...</p>
            </div>
          )}

          {listing && reviewSubmission && (
            <div className="space-y-5">
              {/* Images selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>תמונות ({selectedImages.size} נבחרו)</Label>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {reviewSubmission.image_urls.map((url) => {
                    const isSelected = selectedImages.has(url)
                    const isProcessing = editImageMutation.isPending && editingImageAction?.url === url
                    return (
                      <div key={url} className="relative group">
                        <div
                          className={`relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer ${isSelected ? 'border-primary' : 'border-transparent opacity-50'}`}
                          onClick={() => toggleImageSelection(url)}
                        >
                          <Image src={url} alt="" fill className="object-cover" />
                          {isSelected && (
                            <div className="absolute top-1 end-1 bg-primary text-primary-foreground rounded-full p-0.5">
                              <CheckCircle2 className="size-3" />
                            </div>
                          )}
                          {isProcessing && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Loader2 className="size-5 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        {!isProcessing && (
                          <div className="absolute bottom-1 inset-x-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              title="נקה טקסטים"
                              onClick={() => {
                                setEditingImageAction({ url, action: 'clean_text' })
                                editImageMutation.mutate({ submissionId: reviewSubmission.id, imageUrl: url, action: 'clean_text' })
                              }}
                              className="flex-1 bg-white/90 hover:bg-white rounded px-1 py-0.5 text-[10px] font-medium text-gray-800"
                            >
                              <Eraser className="size-3 inline" />
                            </button>
                            <button
                              title="רקע מקצועי"
                              onClick={() => {
                                setEditingImageAction({ url, action: 'clean_background' })
                                editImageMutation.mutate({ submissionId: reviewSubmission.id, imageUrl: url, action: 'clean_background' })
                              }}
                              className="flex-1 bg-white/90 hover:bg-white rounded px-1 py-0.5 text-[10px] font-medium text-gray-800"
                            >
                              <ImageIcon className="size-3 inline" />
                            </button>
                            <button
                              title="שיפור"
                              onClick={() => {
                                setEditingImageAction({ url, action: 'enhance' })
                                editImageMutation.mutate({ submissionId: reviewSubmission.id, imageUrl: url, action: 'enhance' })
                              }}
                              className="flex-1 bg-white/90 hover:bg-white rounded px-1 py-0.5 text-[10px] font-medium text-gray-800"
                            >
                              <Sparkles className="size-3 inline" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  לחץ תמונה לבחירה/ביטול · רחף מעל לעריכה עם AI (נקה טקסטים / רקע / שיפור)
                </p>
              </div>

              {/* Title */}
              <div>
                <Label htmlFor="rv-title">שם המוצר</Label>
                <Input
                  id="rv-title"
                  value={listing.title}
                  onChange={(e) => updateListing('title', e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="rv-desc">תיאור</Label>
                <Textarea
                  id="rv-desc"
                  value={listing.description}
                  onChange={(e) => updateListing('description', e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>

              {/* Price row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rv-price">מחיר (₪)</Label>
                  <Input
                    id="rv-price"
                    type="number"
                    value={listing.price ?? ''}
                    onChange={(e) => updateListing('price', e.target.value === '' ? null : Number(e.target.value))}
                    className="mt-1"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label htmlFor="rv-compare">מחיר לפני הנחה (אופציונלי)</Label>
                  <Input
                    id="rv-compare"
                    type="number"
                    value={listing.compare_at_price ?? ''}
                    onChange={(e) => updateListing('compare_at_price', e.target.value === '' ? null : Number(e.target.value))}
                    className="mt-1"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Type + Category + Vendor */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="rv-type">Product Type</Label>
                  <Input
                    id="rv-type"
                    value={listing.product_type}
                    onChange={(e) => updateListing('product_type', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="rv-cat">Category</Label>
                  <Input
                    id="rv-cat"
                    value={listing.category}
                    onChange={(e) => updateListing('category', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="rv-vendor">Vendor</Label>
                  <Input
                    id="rv-vendor"
                    value={listing.vendor}
                    onChange={(e) => updateListing('vendor', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="rv-tags">תגיות (מופרדות בפסיקים)</Label>
                <Input
                  id="rv-tags"
                  value={listing.tags.join(', ')}
                  onChange={(e) => updateListing('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                  className="mt-1"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {listing.tags.map((t, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>

              {/* Variants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>גדלים / וריאנטים</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                    <Plus className="size-3 me-1" />
                    הוסף
                  </Button>
                </div>
                <div className="space-y-2">
                  {listing.variants.map((v, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_80px_auto] gap-2">
                      <Input
                        placeholder="גודל (1.80)"
                        value={v.title}
                        onChange={(e) => updateVariant(idx, 'title', e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="מלאי"
                        value={v.inventory}
                        onChange={(e) => updateVariant(idx, 'inventory', e.target.value)}
                        dir="ltr"
                      />
                      <Input
                        type="number"
                        placeholder="מחיר"
                        value={v.price ?? ''}
                        onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                        dir="ltr"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(idx)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="rv-pub" className="text-base">פרסם מיד בחנות</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    אם כבוי, המוצר ייווצר כ-Draft ולא יוצג בחנות
                  </p>
                </div>
                <Switch id="rv-pub" checked={publishActive} onCheckedChange={setPublishActive} />
              </div>

              {approveMutation.isError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
                  {(approveMutation.error as Error).message}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={regenerate} disabled={generating}>
                  {generating ? <Loader2 className="size-4 me-1 animate-spin" /> : <Wand2 className="size-4 me-1" />}
                  צור מחדש
                </Button>
                <div className="flex-1" />
                <Button variant="outline" onClick={() => setReviewSubmission(null)}>
                  ביטול
                </Button>
                <Button onClick={confirmCreate} disabled={approveMutation.isPending || selectedImages.size === 0}>
                  {approveMutation.isPending ? (
                    <><Loader2 className="size-4 me-1 animate-spin" /> יוצר ב-Shopify...</>
                  ) : (
                    <><CheckCircle2 className="size-4 me-1" /> צור ופרסם</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image zoom */}
      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomedImage && (
            <Image src={zoomedImage} alt="" width={1200} height={1200} className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* AI chat */}
      <Dialog open={!!chatOpenId} onOpenChange={(v) => !v && setChatOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-purple-600" />
              AI - שאלות על המוצר
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[50vh] pr-2">
            {chatMessages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Sparkles className="size-8 mx-auto mb-2 text-purple-400" />
                <p>שאל את ה-AI שאלות על המוצר.</p>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" />
                  חושב...
                </div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 border-t pt-3">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="שאלה..."
              rows={2}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendChat()
                }
              }}
            />
            <Button size="icon" onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>
              <Send className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={() => setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>דחיית הצעת מוצר</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="סיבת הדחייה"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejectingId(null)}>ביטול</Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={rejectMutation.isPending}
                onClick={() => rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
              >
                {rejectMutation.isPending && <Loader2 className="size-4 me-1 animate-spin" />}
                דחה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
