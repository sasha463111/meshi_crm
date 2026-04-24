import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

interface GeneratedListing {
  title: string
  description: string
  price: number | null
  compare_at_price: number | null
  tags: string[]
  product_type: string
  category: string
  vendor: string
  variants: Array<{ title: string; inventory: number; sku: string | null; price: number | null }>
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Get submission
  const { data: submission } = await supabase
    .from('product_submissions')
    .select('*, suppliers:supplier_id(name)')
    .eq('id', id)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Pull existing products for style reference (names, types, tags, price ranges)
  const { data: existingProducts } = await supabase
    .from('products')
    .select('title, product_type, category, tags, price')
    .not('shopify_product_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)

  const examples = (existingProducts || [])
    .map(
      (p) =>
        `- ${p.title} | type: ${p.product_type || '-'} | category: ${p.category || '-'} | tags: ${(p.tags || []).join(', ')} | price: ₪${p.price || '-'}`
    )
    .join('\n')

  const systemPrompt = `אתה עוזר יצירת listings למוצרי חנות מקוונת של מצעים וטקסטיל (משי הום).
המטרה: ליצור listing מוכן לפרסום ב-Shopify.

דוגמאות למוצרים קיימים בחנות (סגנון השמות והמחירים):
${examples}

כללים:
1. שם המוצר בעברית, בסגנון הדוגמאות (למשל "קונטרסט לילה – סט מצעים פרמיום", "צל העלים – סט מצעים פרמיום").
2. תיאור שיווקי קצר בעברית (2-4 משפטים), יוקרתי אבל טבעי.
3. מחיר בטווח של הדוגמאות (לרוב 250-800 ש"ח לסטים).
4. compare_at_price (אופציונלי) — רק אם יש היגיון להצגת הנחה.
5. תגיות (tags) — מילות מפתח שיעזרו לחיפוש (למשל "מצעים", "סט פרימיום", "קיץ", צבעים מהתמונה וכו').
6. product_type + category בדיוק כמו בדוגמאות (למשל "Bed Sheets").
7. vendor: תמיד "משי טקסטיל".
8. variants: זהה גדלים מהערות הספק (למשל 1.80, 1.60, 1.40). אם לא צוין — ברירת מחדל [{title:"1.80", inventory:0}, {title:"1.60", inventory:0}].

החזר JSON בלבד בפורמט הזה (ללא markdown, ללא הסברים):
{
  "title": "string",
  "description": "string",
  "price": number,
  "compare_at_price": number | null,
  "tags": ["string"],
  "product_type": "string",
  "category": "string",
  "vendor": "משי טקסטיל",
  "variants": [{"title": "string", "inventory": number, "sku": null, "price": null}]
}`

  const userText = `הערות מהספק: ${submission.notes || '(אין הערות)'}

נתח את התמונות המצורפות וצור listing מלא בפורמט JSON הנדרש.`

  // Build content with images
  const content: Array<Record<string, unknown>> = []
  for (const url of (submission.image_urls || []).slice(0, 5)) {
    content.push({ type: 'image', source: { type: 'url', url } })
  }
  content.push({ type: 'text', text: userText })

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
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Claude generate error:', err)
      return NextResponse.json({ error: 'AI failed', details: err }, { status: 500 })
    }

    const data = await res.json()
    const text = (data.content?.[0]?.text || '').trim()

    // Extract JSON (strip markdown fences if any)
    let jsonText = text
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (match) jsonText = match[1]

    let listing: GeneratedListing
    try {
      listing = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw: text }, { status: 500 })
    }

    return NextResponse.json({ listing })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generate failed' },
      { status: 500 }
    )
  }
}
