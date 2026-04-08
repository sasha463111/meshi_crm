import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

interface EvolutionChat {
  id: string | null
  remoteJid: string
  pushName: string | null
  profilePicUrl: string | null
  updatedAt: string | null
  unreadCount: number | null
  lastMessage?: {
    pushName?: string
    message?: {
      conversation?: string
    }
    messageTimestamp?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({}),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Evolution API error: ${res.status} - ${text}` }, { status: 500 })
    }

    const chats: EvolutionChat[] = await res.json()

    // Filter individual chats (not groups or LID), normalize for frontend
    const individualChats = (Array.isArray(chats) ? chats : [])
      .filter((chat) => chat.remoteJid?.endsWith('@s.whatsapp.net'))
      .sort((a, b) => {
        const aTime = a.lastMessage?.messageTimestamp || 0
        const bTime = b.lastMessage?.messageTimestamp || 0
        return bTime - aTime
      })
      .slice(0, 50)
      .map((chat) => ({
        id: chat.remoteJid,
        name: chat.lastMessage?.pushName || chat.pushName || null,
        lastMessage: chat.lastMessage?.message?.conversation || null,
        unreadCount: chat.unreadCount || 0,
        updatedAt: chat.updatedAt,
        timestamp: chat.lastMessage?.messageTimestamp || 0,
      }))

    return NextResponse.json(individualChats)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
