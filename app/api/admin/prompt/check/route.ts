import { NextResponse } from 'next/server'
import { reviewMasterPrompt } from '@/services/prompt/safety'

export async function POST(req: Request) {
  const { prompt } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ pass: false, issues: ['Prompt cannot be empty'] })
  }

  try {
    const result = await reviewMasterPrompt(prompt)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[prompt/check] error:', error)
    return NextResponse.json({ error: 'Safety check failed' }, { status: 500 })
  }
}
