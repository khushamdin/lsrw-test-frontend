'use client'

import { useState } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerText } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
  placeholder?: string
}

export default function OpenText({ question, sessionId, onResult, placeholder }: Props) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!text.trim() || result || loading) return
    setLoading(true)
    try {
      const resp = await apiAnswerText(sessionId, text.trim())
      setResult(resp.result)
      onResult(resp.result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <textarea
        id={`open-text-${question.id}`}
        className="text-area"
        placeholder={placeholder ?? 'Write your answer here…'}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={!!result || loading}
        rows={4}
      />
      <button
        id={`open-submit-${question.id}`}
        className="btn-primary"
        onClick={submit}
        disabled={!text.trim() || !!result || loading}
      >
        {loading ? 'Evaluating with AI…' : 'Submit'}
      </button>
    </div>
  )
}
