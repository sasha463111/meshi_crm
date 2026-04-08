import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')

  if (!hmac || !topic) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
  }

  // Verify HMAC
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')

  if (hash !== hmac) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = JSON.parse(body)
  const supabase = createAdminClient()

  switch (topic) {
    case 'orders/create':
    case 'orders/updated': {
      // Trigger order sync for this specific order
      // For now, log it - the cron will pick it up
      await supabase.from('sync_logs').insert({
        source: `shopify_webhook_${topic}`,
        status: 'completed',
        records_processed: 1,
        triggered_by: 'webhook',
      })
      break
    }
    case 'products/update': {
      await supabase.from('sync_logs').insert({
        source: `shopify_webhook_${topic}`,
        status: 'completed',
        records_processed: 1,
        triggered_by: 'webhook',
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
