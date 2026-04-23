'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Package, LogOut, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SupplierAuthProvider, useSupplierAuth } from '@/providers/supplier-auth-provider'

function SupplierLayoutInner({ children }: { children: React.ReactNode }) {
  const { supplier, loading, signOut } = useSupplierAuth()
  const pathname = usePathname()
  const router = useRouter()

  // Allow /portal/access/[token] page without auth
  const isAccessPage = pathname.startsWith('/portal/access/')

  useEffect(() => {
    if (!loading && !supplier && !isAccessPage) {
      router.replace('/portal/access/invalid')
    }
  }, [loading, supplier, isAccessPage, router])

  // Access page — render without chrome
  if (isAccessPage) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        {children}
      </div>
    )
  }

  if (loading || !supplier) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-lg font-bold">משי הום - פורטל ספקים</span>
          <nav className="flex items-center gap-2">
            <Button
              variant={pathname === '/portal' ? 'secondary' : 'ghost'}
              size="sm"
              render={<Link href="/portal" />}
            >
              <Package className="size-4 me-1" />
              הזמנות
            </Button>
            <Button
              variant={pathname.startsWith('/portal/submit') ? 'secondary' : 'ghost'}
              size="sm"
              render={<Link href="/portal/submit" />}
            >
              <Upload className="size-4 me-1" />
              העלה מוצר
            </Button>
            <span className="text-sm text-muted-foreground mx-2">{supplier.supplier_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 md:p-6">{children}</main>
    </div>
  )
}

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SupplierAuthProvider>
      <SupplierLayoutInner>{children}</SupplierLayoutInner>
    </SupplierAuthProvider>
  )
}
