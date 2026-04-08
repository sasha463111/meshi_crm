import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('id, name, contact_name, phone, email, access_token, is_active')
      .eq('access_token', token)
      .single()

    if (error || !supplier) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (!supplier.is_active) {
      return NextResponse.json({ error: 'Supplier inactive' }, { status: 403 })
    }

    return NextResponse.json({
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      contact_name: supplier.contact_name,
      phone: supplier.phone,
      email: supplier.email,
      access_token: supplier.access_token,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
