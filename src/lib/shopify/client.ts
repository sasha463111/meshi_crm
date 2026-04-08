const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!
const API_VERSION = '2025-04'

function getAccessToken(): string {
  return SHOPIFY_ACCESS_TOKEN
}

interface ShopifyResponse<T> {
  data: T
  errors?: { message: string }[]
}

export async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = getAccessToken()

  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  )

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`)
  }

  const json: ShopifyResponse<T> = await res.json()

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${json.errors.map(e => e.message).join(', ')}`)
  }

  return json.data
}

// REST API helper for endpoints not available in GraphQL
export async function shopifyREST<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const token = getAccessToken()

  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/${endpoint}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  )

  if (!res.ok) {
    throw new Error(`Shopify REST error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export function extractIdFromGid(gid: string): string {
  return gid.split('/').pop() || gid
}
