import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySupplier(request: NextRequest) {
  const token = request.headers.get('x-supplier-token')
  if (!token) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id')
    .eq('access_token', token)
    .eq('is_active', true)
    .single()
  return data?.id || null
}

// POST: toggle removal request for a product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { requested, reason } = (await request.json().catch(() => ({}))) as {
    requested?: boolean
    reason?: string
  }

  const supabase = createAdminClient()

  const update = requested
    ? {
        removal_requested: true,
        removal_requested_at: new Date().toISOString(),
        removal_requested_by: supplierId,
        removal_reason: reason || null,
      }
    : {
        removal_requested: false,
        removal_requested_at: null,
        removal_requested_by: null,
        removal_reason: null,
      }

  const { error } = await supabase.from('products').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
