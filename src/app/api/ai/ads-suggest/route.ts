import { NextRequest, NextResponse } from 'next/server'
import { askClaude } from '@/lib/ai/client'

export async function POST(request: NextRequest) {
  try {
    const { campaignName, spend, roas, ctr, conversions, objective } = await request.json()

    const systemPrompt = `אתה מומחה פרסום דיגיטלי ב-Meta Ads לחנות טקסטיל ביתי ישראלית "משי הום".
תפקידך לנתח ביצועי קמפיינים ולהמליץ על שיפורים.
כתוב תמיד בעברית.
תן המלצות קונקרטיות ומעשיות.

החזר JSON עם השדות:
- analysis: ניתוח קצר של המצב
- suggestions: מערך של המלצות (כל אחת עם title ו-description)
- budgetRecommendation: המלצת תקציב
- targetingTips: טיפים לטרגוט
- creativeTips: טיפים לקריאייטיב`

    const userMessage = `נתח את הקמפיין:
שם: ${campaignName}
הוצאות: ₪${spend}
ROAS: ${roas}x
CTR: ${ctr}%
המרות: ${conversions}
מטרה: ${objective || 'לא מוגדר'}`

    const result = await askClaude(systemPrompt, userMessage)

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
