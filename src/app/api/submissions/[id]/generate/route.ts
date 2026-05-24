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
  appeal_score: number | null
  appeal_reason: string | null
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

  // Pull existing products for naming-style reference
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

  // Pull REAL best-sellers (by units actually sold) — the benchmark for the
  // "appeal" rating: how much a new design looks like what already sells.
  const { data: soldItems } = await supabase
    .from('order_items')
    .select('title, quantity')
    .limit(5000)

  const salesByTitle = new Map<string, number>()
  for (const it of soldItems || []) {
    if (!it.title) continue
    salesByTitle.set(it.title, (salesByTitle.get(it.title) || 0) + (it.quantity || 0))
  }
  const topSellers = [...salesByTitle.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([title, qty]) => `- ${title} — נמכרו ${qty} יח'`)
    .join('\n')

  const systemPrompt = `אתה עוזר יצירת listings למוצרי חנות מקוונת של מצעים וטקסטיל (משי הום).
המטרה: ליצור listing מוכן לפרסום ב-Shopify.

דוגמאות למוצרים קיימים בחנות (סגנון השמות):
${examples}

רבי-המכר בפועל (לפי כמות שנמכרה — זה מדד ה"אטרקטיביות"):
${topSellers || '(אין עדיין נתוני מכירות)'}

כללים:
1. שם המוצר בעברית, בסגנון הדוגמאות (למשל "קונטרסט לילה – סט מצעים פרמיום", "צל העלים – סט מצעים פרמיום").
2. תיאור שיווקי קצר בעברית (2-4 משפטים), יוקרתי אבל טבעי.
3. מחיר: כל סטי המצעים באותה איכות (סאטן אל-קמט). לכן המחיר תמיד 79 ש"ח (נכנס למבצע "4 ב-219"). אל תשתמש ב-129 — תמחור פרימיום נעשה ידנית ע"י המנהל בלבד. price = 79 לסט מצעים.
4. compare_at_price (אופציונלי) — רק אם יש היגיון להצגת הנחה.
5. תגיות (tags) — מילות מפתח שיעזרו לחיפוש (למשל "מצעים", "סט פרימיום", "קיץ", צבעים מהתמונה וכו').
6. product_type + category בדיוק כמו בדוגמאות (למשל "Bed Sheets").
7. vendor: תמיד "משי טקסטיל".
8. variants: זהה גדלים מהערות הספק (למשל 1.80, 1.60, 1.40). אם לא צוין — ברירת מחדל [{title:"1.80", inventory:0}, {title:"1.60", inventory:0}].
9. appeal_score (1-10): כמה הדגם בתמונה נראה מבוקש/מסחרי בהשוואה לרבי-המכר למעלה. 10 = נראה בדיוק כמו הדגמים הכי נמכרים (הדפס בולט/נועז/מודרני שמושך עין). 1 = נראה חלש/דהוי/לא מסחרי. תשתמש בשיקול ויזואלי אמיתי לפי התמונה.
10. appeal_reason: משפט קצר אחד בעברית שמסביר את הציון (למשל "הדפס פרחוני עשיר ובולט בסגנון המנצחים" או "צבעוניות חיוורת ושטוחה, פחות בולט").

החזר JSON בלבד בפורמט הזה (ללא markdown, ללא הסברים):
{
  "title": "string",
  "description": "string",
  "price": 79,
  "compare_at_price": number | null,
  "tags": ["string"],
  "product_type": "string",
  "category": "string",
  "vendor": "משי טקסטיל",
  "variants": [{"title": "string", "inventory": number, "sku": null, "price": null}],
  "appeal_score": number,
  "appeal_reason": "string"
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

    // Override with what the SUPPLIER actually entered (sizes + category) so the
    // product uploads exactly as submitted. AI only fills title/description/price/tags.
    const supplierVariants = (submission.variants as Array<{ title: string; inventory?: number }>) || []
    if (supplierVariants.length > 0) {
      listing.variants = supplierVariants.map((v) => ({
        title: v.title,
        inventory: v.inventory ?? 0,
        sku: null,
        price: null,
      }))
    }
    if (submission.category) {
      listing.product_type = submission.category
      listing.category = submission.category
    }

    // Strategy: all bed-sheet sets are the same quality (satin) → always ₪79.
    // ₪129 premium is a manual admin decision only.
    if ((listing.category || '').toLowerCase().includes('bed sheet')) {
      listing.price = 79
    }

    // Clamp appeal score to 1..10 (or null if the model omitted it)
    if (typeof listing.appeal_score === 'number') {
      listing.appeal_score = Math.max(1, Math.min(10, Math.round(listing.appeal_score)))
    } else {
      listing.appeal_score = null
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
