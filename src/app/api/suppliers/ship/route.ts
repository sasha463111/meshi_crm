import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shopifyGraphQL } from '@/lib/shopify/client'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { fillTemplate, DEFAULT_TEMPLATES } from '@/lib/whatsapp/templates'

const FULFILLMENT_MUTATION = `
  mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`

export async function POST(request: NextRequest) {
  try {
    const { orderId, trackingNumber, carrier, supplierId } = await request.json()
    const supabase = createAdminClient()

    // Get order details
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Update order items for this supplier
    await supabase
      .from('order_items')
      .update({ fulfillment_status: 'fulfilled' })
      .eq('order_id', orderId)
      .eq('supplier_id', supplierId)

    // Update order
    await supabase.from('orders').update({
      tracking_number: trackingNumber,
      carrier,
      shipped_at: new Date().toISOString(),
      fulfillment_status: 'FULFILLED',
      status: 'fulfilled',
    }).eq('id', orderId)

    // Update Shopify fulfillment
    try {
      await shopifyGraphQL(FULFILLMENT_MUTATION, {
        fulfillment: {
          orderId: `gid://shopify/Order/${order.shopify_order_id}`,
          trackingInfo: {
            number: trackingNumber,
            company: carrier,
          },
          notifyCustomer: true,
        },
      })
    } catch (e) {
      console.error('Shopify fulfillment error:', e)
    }

    // Send WhatsApp notification
    if (order.customer_phone) {
      try {
        const message = fillTemplate(DEFAULT_TEMPLATES.shipping_update.content, {
          customer_name: order.customer_name || 'לקוח/ה',
          order_number: order.shopify_order_number || orderId,
          tracking_number: trackingNumber,
          carrier,
          tracking_url: order.tracking_url || '#',
        })
        await sendWhatsAppMessage(order.customer_phone, message)
      } catch (e) {
        console.error('WhatsApp send error:', e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ship failed' },
      { status: 500 }
    )
  }
}
