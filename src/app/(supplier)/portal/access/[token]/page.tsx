'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSupplierSession } from '@/providers/supplier-auth-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SupplierAccessPage(props: { params: Promise<{ token: string }> }) {
  const { token } = use(props.params)
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const verify = async () => {
      try {
        const res = await fetch('/api/suppliers/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        if (!res.ok) {
          setError('הלינק לא תקין או שפג תוקפו')
          return
        }

        const data = await res.json()
        setSupplierSession({
          supplier_id: data.supplier_id,
          supplier_name: data.supplier_name,
          contact_name: data.contact_name,
          phone: data.phone,
          email: data.email,
          access_token: data.access_token,
        })

        // Redirect to portal
        window.location.href = '/portal'
      } catch {
        setError('שגיאת חיבור')
      }
    }

    verify()
  }, [token, router])

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card>
          <CardContent className="py-12 px-8 text-center">
            <p className="text-xl font-bold text-destructive mb-2">שגיאה</p>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card>
        <CardContent className="py-12 px-8 text-center space-y-3">
          <Skeleton className="h-6 w-32 mx-auto" />
          <p className="text-muted-foreground">מתחבר לפורטל ספקים...</p>
        </CardContent>
      </Card>
    </div>
  )
}
