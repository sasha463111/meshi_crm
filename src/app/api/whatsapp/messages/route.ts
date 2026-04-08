import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

interface EvolutionMessage {
  id: string
  key: {
    id: string
    fromMe: boolean
    remoteJid: string
  }
  pushName: string
  messageType: string
  message: {
    conversation?: string
    extendedTextMessage?: { text?: string }
    imageMessage?: { caption?: string }
    videoMessage?: { caption?: string }
    audioMessage?: unknown
    documentMessage?: { fileName?: string }
    stickerMessage?: unknown
  }
  messageTimestamp: number
  source: string
}

export async function POST(request: NextRequest) {
  try {
    const { remoteJid, page = 1 } = await request.json()

    if (!remoteJid) {
      return NextResponse.json({ error: 'remoteJid required' }, { status: 400 })
    }

    const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid,
          },
        },
        limit: 100,
        page,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Evolution API error: ${res.status} - ${text}` }, { status: 500 })
    }

    const data = await res.json()

    // Response format: { messages: { total, pages, currentPage, records: [...] } }
    const records: EvolutionMessage[] = data?.messages?.records || []

    const parsed = records
      .map((msg) => {
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          (msg.message?.imageMessage ? `[תמונה]${msg.message.imageMessage.caption ? ' ' + msg.message.imageMessage.caption : ''}` : '') ||
          (msg.message?.videoMessage ? `[וידאו]${msg.message.videoMessage.caption ? ' ' + msg.message.videoMessage.caption : ''}` : '') ||
          (msg.message?.audioMessage ? '[הודעה קולית]' : '') ||
          (msg.message?.documentMessage ? `[מסמך] ${msg.message.documentMessage.fileName || ''}` : '') ||
          (msg.message?.stickerMessage ? '[מדבקה]' : '') ||
          ''

        return {
          id: msg.key?.id || msg.id || '',
          fromMe: msg.key?.fromMe || false,
          text,
          timestamp: msg.messageTimestamp || 0,
          pushName: msg.pushName || '',
        }
      })
      .filter((m) => m.text)
      .sort((a, b) => a.timestamp - b.timestamp)

    return NextResponse.json(parsed)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
