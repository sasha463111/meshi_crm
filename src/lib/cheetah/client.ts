/**
 * Cheetah / Run ERP API client.
 *
 * Run ERP is a shipping-company ERP from V. Run Ltd (issuer of our JWT).
 * Cheetah (chita-il.com) hosts it. All calls are GET requests with a strange
 * comma-separated `-N<num>` / `-A<text>` ARGUMENTS encoding.
 *
 * Docs: see /Users/sashadibka/Downloads/RUN API Documentation (3).pdf
 *
 * We only USE one endpoint here: `ship_status_xml` — fetch the live status of
 * a shipment by its 8-digit ship_no. Authentication is `Authorization: Bearer
 * <JWT>`. The JWT carries the customer number (24383) as a claim.
 */

const HOST = process.env.CHEETAH_HOST || 'https://chita-il.com'
const JWT = process.env.CHEETAH_JWT || ''

export interface CheetahStatusEvent {
  code: number
  desc: string
  date: string // DD/MM/YYYY
  time: string // HH:MM:SS
  closed: boolean
}

export interface CheetahShipmentStatus {
  shipNo: string
  randomId: string | null
  customerId: string
  ref1: string | null
  ref2: string | null
  ref2WithPrefix: string | null
  receiverName: string | null
  receiverPhone: string | null
  city: string | null
  street: string | null
  building: string | null
  delivered: boolean
  deliveredBack: boolean
  canceled: boolean
  driverId: number
  driverName: string | null
  currentStageCode: number
  currentStageDesc: string | null
  events: CheetahStatusEvent[]
  source: string | null
  rawXml: string
}

function pick(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return null
  const v = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
  return v || null
}

function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

export function parseShipStatusXml(xml: string): CheetahShipmentStatus | null {
  const result = pick(xml, 'result')
  if (result !== 'ok') return null

  const events: CheetahStatusEvent[] = pickAll(xml, 'status').map((block) => ({
    code: Number(pick(`<x>${block}</x>`, 'status_code')) || 0,
    desc: pick(`<x>${block}</x>`, 'status_desc') || '',
    date: pick(`<x>${block}</x>`, 'status_date') || '',
    time: pick(`<x>${block}</x>`, 'status_time') || '',
    closed: pick(`<x>${block}</x>`, 'status_closed_yn') === 'y',
  }))

  return {
    shipNo: pick(xml, 'ship_no') || '',
    randomId: pick(xml, 'random_id'),
    customerId: pick(xml, 'customer_id') || '',
    ref1: pick(xml, 'ref1'),
    ref2: pick(xml, 'ref2'),
    ref2WithPrefix: pick(xml, 'ref2_with_prefix'),
    receiverName: pick(xml, 'shem_nimaan'),
    receiverPhone: pick(xml, 'phone_nimaan'),
    city: pick(xml, 'shmishuv'),
    street: pick(xml, 'shmrechov'),
    building: pick(xml, 'bit'),
    delivered: pick(xml, 'ship_delivered_yn') === 'y',
    deliveredBack: pick(xml, 'ship_delivered_back_yn') === 'y',
    canceled: pick(xml, 'ship_canceled_yn') === 'y',
    driverId: Number(pick(xml, 'driver_id')) || 0,
    driverName: pick(xml, 'driver_name'),
    currentStageCode: Number(pick(xml, 'current_stage_code')) || 0,
    currentStageDesc: pick(xml, 'current_stage_desc'),
    events,
    source: pick(xml, 'source'),
    rawXml: xml,
  }
}

/**
 * Fetch shipment status from Cheetah by 8-digit ship_no.
 * Returns null when the response is not "ok" (shipment not found, expired, etc).
 */
export async function getShipmentStatus(shipNo: string): Promise<CheetahShipmentStatus | null> {
  if (!JWT) throw new Error('CHEETAH_JWT env var not set')
  if (!shipNo || !/^\d+$/.test(shipNo)) return null

  const url = `${HOST}/RunCom.Server/Request.aspx?APPNAME=run&PRGNAME=ship_status_xml&ARGUMENTS=-N${shipNo}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${JWT}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const xml = await res.text()
  return parseShipStatusXml(xml)
}

/**
 * Heuristic: is the shipment in transit / on its way to the receiver?
 * Used to decide if it's the right moment to send the "tracking" WhatsApp.
 *
 * From observed status codes: 3 = entered in system, 5 = waiting for loading.
 * Anything ≥ 7 (on the way to warehouse / dispatched / etc) means the package
 * actually moved. A driver_id > 0 is also a strong signal.
 */
export function isInTransit(s: CheetahShipmentStatus): boolean {
  if (s.delivered || s.canceled) return false
  if (s.driverId > 0) return true
  if (s.currentStageCode >= 7) return true
  // Any event with code >= 7 means it has been picked up at some point
  return s.events.some((e) => e.code >= 7)
}
