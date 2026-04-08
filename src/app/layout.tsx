import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

const heebo = Heebo({
  variable: '--font-sans',
  subsets: ['hebrew', 'latin'],
})

export const metadata: Metadata = {
  title: 'משי הום - מערכת ניהול',
  description: 'מערכת ניהול איקומרס למשי הום',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <QueryProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
