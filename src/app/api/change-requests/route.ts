import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET: list change requests (admin). ?status=pending|approved|rejected
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = url.searchParams.get('status')

  let query = supabase
    .from('product_change_requests')
    .select('*, suppliers:supplier_id(name)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data || [] })
}
