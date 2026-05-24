import { NextResponse } from 'next/server'
import { getWhatsAppConnectQr } from '@/lib/whatsapp/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const qr = await getWhatsAppConnectQr()
    return NextResponse.json(qr)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'connect failed' },
      { status: 500 }
    )
  }
}
