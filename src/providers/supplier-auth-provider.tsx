'use client'

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'

const STORAGE_KEY = 'meshi-supplier-session'

export interface SupplierSession {
  supplier_id: string
  supplier_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  access_token: string
}

interface SupplierAuthContext {
  supplier: SupplierSession | null
  loading: boolean
  signOut: () => void
}

const SupplierAuthContext = createContext<SupplierAuthContext>({
  supplier: null,
  loading: true,
  signOut: () => {},
})

export function SupplierAuthProvider({ children }: { children: ReactNode }) {
  const [supplier, setSupplier] = useState<SupplierSession | null>(null)
  const [loading, setLoading] = useState(true)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const session: SupplierSession = JSON.parse(stored)
        if (session?.supplier_id && session?.access_token) {
          // Validate token is still valid
          fetch('/api/suppliers/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: session.access_token }),
          })
            .then(res => {
              if (res.ok) {
                setSupplier(session)
              } else {
                localStorage.removeItem(STORAGE_KEY)
              }
              setLoading(false)
            })
            .catch(() => {
              // If verification fails (network issue), still allow cached session
              setSupplier(session)
              setLoading(false)
            })
          return
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY)
    setSupplier(null)
    window.location.href = '/portal/login'
  }

  return (
    <SupplierAuthContext.Provider value={{ supplier, loading, signOut }}>
      {children}
    </SupplierAuthContext.Provider>
  )
}

export function setSupplierSession(session: SupplierSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export const useSupplierAuth = () => useContext(SupplierAuthContext)
