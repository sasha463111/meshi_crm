'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  TrendingUp,
  Megaphone,
  MousePointerClick,
  MessageCircle,
  Brain,
  Truck,
  Users,
  Settings,
  Lightbulb,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { useAuth } from '@/providers/auth-provider'

const navItems = [
  { title: 'דשבורד', href: '/dashboard', icon: LayoutDashboard },
  { title: 'הזמנות', href: '/orders', icon: ShoppingCart },
  { title: 'מוצרים', href: '/products', icon: Package },
  { title: 'רווחיות', href: '/profitability', icon: TrendingUp },
  { title: 'קמפיינים', href: '/campaigns', icon: Megaphone },
  { title: 'Clarity', href: '/clarity', icon: MousePointerClick },
  { title: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { title: 'AI Hub', href: '/ai', icon: Brain },
  { title: 'Insights', href: '/insights', icon: Lightbulb },
]

const managementItems = [
  { title: 'ספקים', href: '/suppliers', icon: Truck },
  { title: 'משתמשים', href: '/users', icon: Users },
  { title: 'הגדרות', href: '/settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { profile } = useAuth()

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-bold">משי הום</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ניהול</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {profile?.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>מערכת</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.href)}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <p className="text-xs text-muted-foreground truncate">
          {profile?.full_name}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
