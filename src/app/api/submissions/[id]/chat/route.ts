import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `אתה עוזר AI לחנות מצעים מקוונת (משי הום). ספק העלה תמונות של מוצר חדש והערות.
אתה עוזר למנהל להחליט מה לעשות עם המוצר — לנתח את התמונות, להציע שם מוצר, תיאור שיווקי בעברית,
תגיות (tags), קטגוריה, ומחיר מומלץ על סמך התמונות וההערות מהספק.

כשאתה מציע תיאור או שם — תעשה את זה בעברית, שיווקי אבל לא מוגזם.
אם המנהל שואל שאלות לגבי המוצר, תענה על סמך מה שאתה רואה בתמונות ובהערות.
אם צריך פרטים נוספים מהספק — תציע למנהל מה לשאול אותו.`

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { messages } = (await request.json()) as { messages: ChatMessage[] }

  const supabase = createAdminClient()
  const { data: submission } = await supabase
    .from('product_submissions')
    .select('*, suppliers:supplier_id(name)')
    .eq('id', id)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Build context block with submission details
  const context = `### פרטי ההצעה:
- ספק: ${submission.suppliers?.name || 'לא ידוע'}
- שם מוצר (אם הזין): ${submission.title || 'לא הוזן'}
- הערות מהספק: ${submission.notes || 'אין'}
- מספר תמונות: ${submission.image_urls?.length || 0}`

  // Build messages array — inject images in the first user message
  const anthropicMessages: Array<{
    role: 'user' | 'assistant'
    content: string | Array<Record<string, unknown>>
  }> = []

  if (messages.length === 0) return NextResponse.json({ error: 'No messages' }, { status: 400 })

  // First user message includes the images and context
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (i === 0 && msg.role === 'user' && submission.image_urls?.length) {
      const content: Array<Record<string, unknown>> = []
      // Add images (up to 5 to keep API call fast/cheap)
      for (const url of submission.image_urls.slice(0, 5)) {
        content.push({ type: 'image', source: { type: 'url', url } })
      }
      content.push({ type: 'text', text: `${context}\n\n${msg.content}` })
      anthropicMessages.push({ role: 'user', content })
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content })
    }
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Claude error:', errText)
      return NextResponse.json({ error: 'AI request failed', details: errText }, { status: 500 })
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text || ''
    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    )
  }
}
