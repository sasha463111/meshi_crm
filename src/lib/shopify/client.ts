const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_ACCESS_TOKEN! // Client ID (legacy env name)
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET! // Client Secret (legacy env name)
const API_VERSION = '2025-04'

// Token cache - client_credentials tokens expire after 24h
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken
  }

  // Exchange client credentials for access token
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000

  return cachedToken!
}

interface ShopifyResponse<T> {
  data: T
  errors?: { message: string }[]
}

export async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken()

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
    // If 401, token might have expired - clear cache and retry once
    if (res.status === 401) {
      cachedToken = null
      tokenExpiresAt = 0
      const newToken = await getAccessToken()
      const retryRes = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': newToken,
          },
          body: JSON.stringify({ query, variables }),
        }
      )
      if (!retryRes.ok) {
        throw new Error(`Shopify API error: ${retryRes.status} ${retryRes.statusText}`)
      }
      const retryJson: ShopifyResponse<T> = await retryRes.json()
      if (retryJson.errors?.length) {
        throw new Error(`Shopify GraphQL error: ${retryJson.errors.map(e => e.message).join(', ')}`)
      }
      return retryJson.data
    }
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
  const token = await getAccessToken()

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
