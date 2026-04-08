import { shopifyGraphQL, extractIdFromGid } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const ORDERS_QUERY = `
  query getOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          displayFulfillmentStatus
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          note
          tags
          channelInformation { channelDefinition { handle } }
          customer { displayName email phone }
          shippingAddress {
            address1 address2 city province zip country phone name
          }
          fulfillments(first: 5) {
            trackingInfo { number url company }
            createdAt
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                name
                variantTitle
                sku
                quantity
                originalUnitPriceSet { shopMoney { amount } }
                originalTotalSet { shopMoney { amount } }
                image { url altText }
                product { id }
                variant { id }
              }
            }
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`

export async function syncOrders(sinceDate?: string) {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('sync_logs')
    .insert({ source: 'shopify_orders', status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  let processed = 0
  let created = 0
  let updated = 0
  let after: string | null = null
  let hasNext = true

  try {
    const query = sinceDate ? `updated_at:>'${sinceDate}'` : undefined

    interface ShopifyOrdersResponse {
      orders: {
        edges: { node: Record<string, unknown>; cursor: string }[]
        pageInfo: { hasNextPage: boolean }
      }
    }

    while (hasNext) {
      const data: ShopifyOrdersResponse = await shopifyGraphQL(ORDERS_QUERY, { first: 50, after, query })

      for (const { node: order, cursor } of data.orders.edges) {
        after = cursor
        processed++

        const shopifyOrderId = extractIdFromGid(order.id as string)
        const totalPrice = (order.totalPriceSet as Record<string, Record<string, string>>).shopMoney
        const subtotal = (order.subtotalPriceSet as Record<string, Record<string, string>>).shopMoney
        const shipping = (order.totalShippingPriceSet as Record<string, Record<string, string>>).shopMoney
        const tax = (order.totalTaxSet as Record<string, Record<string, string>>).shopMoney
        const discount = (order.totalDiscountsSet as Record<string, Record<string, string>>).shopMoney
        const customer = order.customer as Record<string, string> | null
        const fulfillments = (order.fulfillments as Record<string, unknown>[]) || []
        const tracking = fulfillments.length > 0
          ? (fulfillments[0] as Record<string, unknown>).trackingInfo as Record<string, string>[]
          : []

        const orderData = {
          shopify_order_id: shopifyOrderId,
          shopify_order_number: order.name as string,
          order_date: order.createdAt as string,
          status: mapStatus(order.displayFulfillmentStatus as string, order.displayFinancialStatus as string),
          fulfillment_status: order.displayFulfillmentStatus as string,
          payment_status: order.displayFinancialStatus as string,
          customer_name: customer?.displayName || null,
          customer_email: customer?.email || null,
          customer_phone: customer?.phone || null,
          shipping_address: order.shippingAddress || null,
          subtotal: parseFloat(subtotal.amount),
          shipping_cost: parseFloat(shipping.amount),
          tax: parseFloat(tax.amount),
          discount: parseFloat(discount.amount),
          total: parseFloat(totalPrice.amount),
          currency: totalPrice.currencyCode,
          notes: order.note as string || null,
          tags: order.tags as string[],
          source: (order.channelInformation as Record<string, Record<string, string>>)?.channelDefinition?.handle || null,
          tracking_number: tracking[0]?.number || null,
          tracking_url: tracking[0]?.url || null,
          carrier: tracking[0]?.company || null,
          shipped_at: fulfillments.length > 0 ? (fulfillments[0] as Record<string, string>).createdAt : null,
          shopify_data: order,
          last_synced_at: new Date().toISOString(),
        }

        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('shopify_order_id', shopifyOrderId)
          .single()

        let orderId: string

        if (existing) {
          await supabase.from('orders').update(orderData).eq('id', existing.id)
          orderId = existing.id
          updated++
        } else {
          const { data: newOrder } = await supabase
            .from('orders')
            .insert(orderData)
            .select('id')
            .single()
          orderId = newOrder!.id
          created++
        }

        // Sync line items
        const lineItems = (order.lineItems as Record<string, { node: Record<string, unknown> }[]>).edges || []
        await supabase.from('order_items').delete().eq('order_id', orderId)

        const items = lineItems.map((li: { node: Record<string, unknown> }) => {
          const item = li.node
          const unitPrice = (item.originalUnitPriceSet as Record<string, Record<string, string>>).shopMoney
          const totalItemPrice = (item.originalTotalSet as Record<string, Record<string, string>>).shopMoney
          const image = item.image as Record<string, string> | null

          return {
            order_id: orderId,
            shopify_line_item_id: extractIdFromGid(item.id as string),
            title: item.name as string,
            variant_title: item.variantTitle as string | null,
            sku: item.sku as string | null,
            quantity: item.quantity as number,
            unit_price: parseFloat(unitPrice.amount),
            total_price: parseFloat(totalItemPrice.amount),
            image_url: image?.url || null,
          }
        })

        if (items.length > 0) {
          await supabase.from('order_items').insert(items)
        }
      }

      hasNext = data.orders.pageInfo.hasNextPage
    }

    await supabase.from('sync_logs').update({
      status: 'completed',
      records_processed: processed,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    return { processed, created, updated }
  } catch (error) {
    await supabase.from('sync_logs').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      records_processed: processed,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    throw error
  }
}

function mapStatus(fulfillment: string, financial: string): string {
  if (financial === 'REFUNDED') return 'refunded'
  if (fulfillment === 'FULFILLED') return 'fulfilled'
  if (fulfillment === 'PARTIALLY_FULFILLED') return 'partially_fulfilled'
  if (financial === 'PAID') return 'paid'
  return 'pending'
}
