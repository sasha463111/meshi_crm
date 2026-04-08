'use client'

import { useSupplierAuth } from '@/providers/supplier-auth-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SupplierProfilePage() {
  const { supplier } = useSupplierAuth()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">פרופיל</h1>

      <Card>
        <CardHeader>
          <CardTitle>פרטי ספק</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">שם הספק</label>
            <p className="font-medium">{supplier?.supplier_name}</p>
          </div>
          {supplier?.contact_name && (
            <div>
              <label className="text-sm text-muted-foreground">איש קשר</label>
              <p className="font-medium">{supplier.contact_name}</p>
            </div>
          )}
          {supplier?.email && (
            <div>
              <label className="text-sm text-muted-foreground">אימייל</label>
              <p className="font-medium">{supplier.email}</p>
            </div>
          )}
          {supplier?.phone && (
            <div>
              <label className="text-sm text-muted-foreground">טלפון</label>
              <p className="font-medium" dir="ltr">{supplier.phone}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
