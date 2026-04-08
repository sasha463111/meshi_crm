import { NextRequest, NextResponse } from 'next/server'
import { askClaude } from '@/lib/ai/client'

export async function POST(request: NextRequest) {
  try {
    const { clarityData } = await request.json()

    const systemPrompt = `אתה מומחה UX ו-CRO (Conversion Rate Optimization) לחנות איקומרס טקסטיל ביתי.
תפקידך לנתח נתוני התנהגות גולשים מ-Microsoft Clarity ולהמליץ על שיפורים.
כתוב תמיד בעברית.

החזר JSON עם השדות:
- summary: סיכום קצר של המצב
- issues: מערך של בעיות שנמצאו (עם severity: high/medium/low)
- recommendations: מערך של המלצות פעולה (עם priority: 1-5 ו-impact: high/medium/low)
- quickWins: דברים שאפשר לשפר מיד`

    const userMessage = `נתח את נתוני Clarity:
${JSON.stringify(clarityData, null, 2)}`

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
