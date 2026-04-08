import { NextRequest, NextResponse } from 'next/server'
import { askClaude } from '@/lib/ai/client'

export async function POST(request: NextRequest) {
  try {
    const { title, description, category, price } = await request.json()

    const systemPrompt = `אתה מומחה SEO ואיקומרס לחנות טקסטיל ביתי ישראלית בשם "משי הום".
תפקידך לשפר תיאורי מוצרים כדי להגדיל מכירות.
כתוב תמיד בעברית.
התוצר שלך צריך לכלול:
1. כותרת משופרת (SEO optimized)
2. תיאור מוצר משכנע (150-300 מילים)
3. 5 נקודות מפתח (bullet points)
4. meta description (עד 160 תווים)
5. תגיות מומלצות

החזר את התשובה בפורמט JSON עם השדות: title, description, bulletPoints, metaDescription, tags`

    const userMessage = `שפר את המוצר הבא:
כותרת: ${title}
תיאור נוכחי: ${description || 'אין'}
קטגוריה: ${category || 'לא מוגדר'}
מחיר: ₪${price}`

    const result = await askClaude(systemPrompt, userMessage)

    // Try to parse as JSON
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result }
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ raw: result })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI error' },
      { status: 500 }
    )
  }
}
