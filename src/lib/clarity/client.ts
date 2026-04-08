const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN!
const CLARITY_BASE_URL = 'https://www.clarity.ms/export-data/api/v1'

export async function clarityApiRequest<T>(endpoint: string): Promise<T> {
  const res = await fetch(
    `${CLARITY_BASE_URL}/${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${CLARITY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Clarity API error: ${res.status} ${res.statusText} - ${text}`)
  }

  return res.json()
}

type ClarityDimension =
  | 'Browser'
  | 'Device'
  | 'Country/Region'
  | 'OS'
  | 'Source'
  | 'Medium'
  | 'Campaign'
  | 'Channel'
  | 'URL'

interface LiveInsightsOptions {
  numOfDays: 1 | 2 | 3
  dimension1?: ClarityDimension
  dimension2?: ClarityDimension
  dimension3?: ClarityDimension
}

// Get live insights for the project (identified by the API token)
export async function getClarityLiveInsights(options: LiveInsightsOptions) {
  const params = new URLSearchParams()
  params.set('numOfDays', String(options.numOfDays))
  if (options.dimension1) params.set('dimension1', options.dimension1)
  if (options.dimension2) params.set('dimension2', options.dimension2)
  if (options.dimension3) params.set('dimension3', options.dimension3)

  return clarityApiRequest(`project-live-insights?${params.toString()}`)
}
