import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET: all products flagged for removal (admin)
export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('products')
    .select('id, shopify_product_id, title, price, images, status, removal_requested_at, removal_reason, suppliers:removal_requested_by(name)')
    .eq('removal_requested', true)
    .order('removal_requested_at', { ascending: false })

  return NextResponse.json({ products: data || [] })
}
