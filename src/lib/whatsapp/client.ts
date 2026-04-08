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
