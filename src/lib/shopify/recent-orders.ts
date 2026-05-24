import { shopifyGraphQL } from './client'

export interface RecentOrder {
  id: string
  number: string // e.g. "#1090"
  createdAt: string
  statusUrl: string | null
  phone: string | null
  firstName: string | null
  fulfilledAt: string | null
  trackingNumber: string | null
}

interface OrdersResponse {
  orders: {
    edges: Array<{
      node: {
        id: string
        name: string
        createdAt: string
        statusPageUrl: string | null
        phone: string | null
        customer: { phone: string | null; firstName: string | null; displayName: string | null } | null
        shippingAddress: { phone: string | null; firstName: string | null } | null
        fulfillments: Array<{ createdAt: string; trackingInfo: Array<{ number: string | null }> }>
      }
    }>
  }
}

const QUERY = `
  query recentOrders {
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          statusPageUrl
          phone
          customer { phone firstName displayName }
          shippingAddress { phone firstName }
          fulfillments(first: 3) { createdAt trackingInfo { number } }
        }
      }
    }
  }
`

/** Recent orders (newest first), with phone + fulfillment info for WhatsApp updates. */
export async function getRecentOrders(lookbackMinutes = 20): Promise<RecentOrder[]> {
  const data = await shopifyGraphQL<OrdersResponse>(QUERY, {})
  const cutoff = Date.now() - lookbackMinutes * 60_000
  const out: RecentOrder[] = []

  for (const edge of data.orders?.edges || []) {
    const n = edge.node
    const createdMs = new Date(n.createdAt).getTime()
    // latest fulfillment
    const ful = (n.fulfillments || []).slice().sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0]
    const fulfilledAt = ful?.createdAt ?? null
    const fulfilledMs = fulfilledAt ? new Date(fulfilledAt).getTime() : 0

    // keep if created recently OR fulfilled recently
    if (createdMs < cutoff && fulfilledMs < cutoff) continue

    out.push({
      id: n.id,
      number: n.name,
      createdAt: n.createdAt,
      statusUrl: n.statusPageUrl,
      phone: n.phone || n.customer?.phone || n.shippingAddress?.phone || null,
      firstName:
        n.customer?.firstName ||
        n.shippingAddress?.firstName ||
        (n.customer?.displayName ? n.customer.displayName.split(' ')[0] : null),
      fulfilledAt,
      trackingNumber: ful?.trackingInfo?.[0]?.number ?? null,
    })
  }
  return out
}
