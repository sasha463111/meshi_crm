import { shopifyGraphQL } from './client'

export interface AbandonedCheckout {
  id: string
  createdAt: string
  url: string | null
  total: string | null
  phone: string | null
  firstName: string | null
}

interface AbandonedCheckoutsResponse {
  abandonedCheckouts: {
    edges: Array<{
      node: {
        id: string
        createdAt: string
        abandonedCheckoutUrl: string | null
        totalPriceSet: { shopMoney: { amount: string } } | null
        customer: { phone: string | null; firstName: string | null; displayName: string | null } | null
        billingAddress: { phone: string | null; firstName: string | null } | null
        shippingAddress: { phone: string | null; firstName: string | null } | null
      }
    }>
  }
}

const QUERY = `
  query recentAbandoned {
    abandonedCheckouts(first: 100, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          createdAt
          abandonedCheckoutUrl
          totalPriceSet { shopMoney { amount } }
          customer { phone firstName displayName }
          billingAddress { phone firstName }
          shippingAddress { phone firstName }
        }
      }
    }
  }
`

/** Recent abandoned checkouts created within the last `sinceMinutes`, with a usable phone. */
export async function getRecentAbandonedCheckouts(sinceMinutes = 240): Promise<AbandonedCheckout[]> {
  const data = await shopifyGraphQL<AbandonedCheckoutsResponse>(QUERY, {})
  const cutoff = Date.now() - sinceMinutes * 60_000
  const out: AbandonedCheckout[] = []
  for (const edge of data.abandonedCheckouts?.edges || []) {
    const n = edge.node
    if (new Date(n.createdAt).getTime() < cutoff) continue
    const phone = n.customer?.phone || n.billingAddress?.phone || n.shippingAddress?.phone || null
    const firstName =
      n.customer?.firstName ||
      n.billingAddress?.firstName ||
      n.shippingAddress?.firstName ||
      (n.customer?.displayName ? n.customer.displayName.split(' ')[0] : null)
    out.push({
      id: n.id,
      createdAt: n.createdAt,
      url: n.abandonedCheckoutUrl,
      total: n.totalPriceSet?.shopMoney?.amount ?? null,
      phone,
      firstName,
    })
  }
  return out
}
