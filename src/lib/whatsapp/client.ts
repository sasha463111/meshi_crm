const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

export async function sendWhatsAppMessage(phone: string, text: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      number: normalizePhone(phone),
      text,
      delay: 1200,
      linkPreview: false,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Evolution API error: ${error}`)
  }

  return res.json()
}

export async function sendWhatsAppImage(phone: string, imageUrl: string, caption?: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      number: normalizePhone(phone),
      mediatype: 'image',
      media: imageUrl,
      caption: caption || '',
    }),
  })

  if (!res.ok) {
    throw new Error(`Evolution API error: ${res.status}`)
  }

  return res.json()
}

export interface WhatsAppConnectionState {
  state: string // 'open' (connected) | 'connecting' | 'close'
  connected: boolean
}

/** Check whether the WhatsApp instance is online (state === 'open'). */
export async function getWhatsAppConnectionState(): Promise<WhatsAppConnectionState> {
  const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE}`, {
    headers: { apikey: EVOLUTION_KEY },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Evolution connectionState error: ${res.status}`)
  }
  const data = await res.json()
  const state: string = data?.instance?.state || data?.state || 'close'
  return { state, connected: state === 'open' }
}

export interface WhatsAppQr {
  base64: string | null // data:image/png;base64,... (ready for <img src>)
  code: string | null // raw QR string
  pairingCode: string | null // numeric pairing code (alternative to QR)
}

/** Ask Evolution for a fresh QR code to pair the WhatsApp number. */
export async function getWhatsAppConnectQr(): Promise<WhatsAppQr> {
  const res = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE}`, {
    headers: { apikey: EVOLUTION_KEY },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Evolution connect error: ${res.status}`)
  }
  const data = await res.json()
  const qr = data?.qrcode || data
  let base64: string | null = qr?.base64 || null
  if (base64 && !base64.startsWith('data:image')) {
    base64 = `data:image/png;base64,${base64}`
  }
  return { base64, code: qr?.code || null, pairingCode: qr?.pairingCode || null }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1)
  }
  if (!cleaned.startsWith('+')) {
    cleaned = cleaned
  }
  return cleaned
}
