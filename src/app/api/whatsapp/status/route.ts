import { NextResponse } from 'next/server'
import { getWhatsAppConnectionState } from '@/lib/whatsapp/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const state = await getWhatsAppConnectionState()
    return NextResponse.json(state)
  } catch (error) {
    // Treat any failure as "not connected" so the UI shows the connect option
    // instead of an error screen.
    return NextResponse.json({
      state: 'error',
      connected: false,
      error: error instanceof Error ? error.message : 'status failed',
    })
  }
}
