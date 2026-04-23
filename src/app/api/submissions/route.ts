import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET: list all submissions with supplier info (admin)
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = url.searchParams.get('status') // pending | approved | rejected | null (all)

  let query = supabase
    .from('product_submissions')
    .select('*, suppliers:supplier_id(id, name, contact_name)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ submissions: data || [] })
}
