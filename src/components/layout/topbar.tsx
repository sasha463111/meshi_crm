'use client'

import { useRouter } from 'next/navigation'
import { LogOut, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/providers/auth-provider'

export function Topbar() {
  const { profile, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex-1" />
      <Button variant="ghost" size="icon">
        <Bell className="size-4" />
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
      <Button variant="ghost" size="icon" onClick={handleSignOut}>
        <LogOut className="size-4" />
      </Button>
    </header>
  )
}
