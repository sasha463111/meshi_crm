'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Upload, X, Loader2, Plus, Image as ImageIcon, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { formatDateTime } from '@/lib/utils/dates'

interface Variant {
  title: string
  inventory: number | ''
}

interface Submission {
  id: string
  title: string
  description: string | null
  price: number | null
  status: string
  image_urls: string[]
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
  shopify_product_id: string | null
}

const statusLabels: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר ועלה ל-Shopify',
  rejected: 'נדחה',
}

const statusColors: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

export default function SubmitProductPage() {
  const { supplier } = useSupplierAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [sku, setSku] = useState('')
  const [notes, setNotes] = useState('')
  const [variants, setVariants] = useState<Variant[]>([{ title: '1.80', inventory: '' }])
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  const { data: submissionsData } = useQuery({
    queryKey: ['supplier-submissions', supplier?.supplier_id],
    enabled: !!supplier?.access_token,
    queryFn: async () => {
      const res = await fetch('/api/suppliers/submissions', {
        headers: { 'x-supplier-token': supplier!.access_token },
      })
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ submissions: Submission[] }>
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('title', title)
      if (sku) fd.append('sku', sku)
      if (notes) fd.append('notes', notes)
      const cleanVariants = variants
        .filter((v) => v.title.trim())
        .map((v) => ({
          title: v.title,
          inventory: v.inventory === '' ? 0 : Number(v.inventory),
        }))
      fd.append('variants', JSON.stringify(cleanVariants))
      images.forEach((img) => fd.append('images', img))

      const res = await fetch('/api/suppliers/submissions', {
        method: 'POST',
        headers: { 'x-supplier-token': supplier!.access_token },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-submissions'] })
      // Reset form
      setTitle('')
      setSku('')
      setNotes('')
      setVariants([{ title: '1.80', inventory: '' }])
      setImages([])
      setPreviews([])
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setImages((prev) => [...prev, ...files])
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => setPreviews((prev) => [...prev, reader.result as string])
      reader.readAsDataURL(f)
    })
    // Reset input to allow re-selecting the same file
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateVariant = (idx: number, field: keyof Variant, value: string) => {
    setVariants((prev) =>
      prev.map((v, i) =>
        i === idx
          ? { ...v, [field]: field === 'title' ? value : value === '' ? '' : Number(value) }
          : v
      )
    )
  }

  const addVariant = () => setVariants((prev) => [...prev, { title: '', inventory: '' }])
  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx))

  const submissions = submissionsData?.submissions || []
  const canSubmit = title.trim() && images.length > 0 && !submitMutation.isPending

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowRight className="size-5" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">העלאת מוצר חדש</h1>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטי המוצר</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">שם המוצר *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: Butterfly Dreams - מצעים שחורים"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="sku">קוד מוצר (SKU) — אופציונלי</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="BD-001"
              className="mt-1"
              dir="ltr"
            />
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
              {variants.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="גודל (1.80)"
                    value={v.title}
                    onChange={(e) => updateVariant(idx, 'title', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="מלאי"
                    value={v.inventory}
                    onChange={(e) => updateVariant(idx, 'inventory', e.target.value)}
                    className="w-28"
                    dir="ltr"
                  />
                  {variants.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(idx)}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Images */}
          <div>
            <Label>תמונות *</Label>
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {previews.map((preview, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                  <Image src={preview} alt="" fill className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 start-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="size-6" />
                <span className="text-xs">הוסף תמונות</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            {images.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">נדרשת לפחות תמונה אחת</p>
            )}
          </div>

          <div>
            <Label htmlFor="notes">הערות (לאדמין)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערות נוספות שתרצה שהאדמין יראה"
              className="mt-1"
              rows={2}
            />
          </div>

          {submitMutation.isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
              {(submitMutation.error as Error).message}
            </div>
          )}

          {submitMutation.isSuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 p-3 text-sm">
              ✓ המוצר נשלח בהצלחה לאישור האדמין
            </div>
          )}

          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 me-2 animate-spin" />
                שולח...
              </>
            ) : (
              <>
                <Upload className="size-4 me-2" />
                שלח לאישור
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Submissions history */}
      {submissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">הצעות קודמות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.id} className="flex items-start gap-3 rounded-lg border p-3">
                  {s.image_urls[0] ? (
                    <Image
                      src={s.image_urls[0]}
                      alt={s.title}
                      width={60}
                      height={60}
                      className="size-14 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div className="size-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{s.title}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[s.status]}`}>
                        {s.status === 'pending' && <Clock className="size-3 me-1" />}
                        {s.status === 'approved' && <CheckCircle2 className="size-3 me-1" />}
                        {s.status === 'rejected' && <XCircle className="size-3 me-1" />}
                        {statusLabels[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(s.created_at)}</p>
                    {s.rejection_reason && (
                      <p className="text-xs text-red-600 mt-1">סיבת דחייה: {s.rejection_reason}</p>
                    )}
                  </div>
                  {s.image_urls.length > 1 && (
                    <Badge variant="outline" className="shrink-0">
                      +{s.image_urls.length - 1} תמונות
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <Link href="/portal" className="text-sm text-muted-foreground hover:text-foreground underline">
          חזרה להזמנות
        </Link>
      </div>
    </div>
  )
}
