import { NextResponse } from 'next/server'
import { syncProducts } from '@/lib/shopify/sync-products'

// POST: manual product sync from Shopify (admin or supplier-triggered)
export async function POST() {
  try {
    const result = await syncProducts()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Manual product sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
