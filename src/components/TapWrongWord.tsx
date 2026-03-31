'use client'

import { useState } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerText } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
}

export default function TapWrongWord({ question, sessionId, onResult }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)

  // Split sentence into words (preserve punctuation attached to words)
  const sentence = question.sentence ?? question.question
  const words = sentence.replace(/["""]/g, '').split(/\s+/).filter(Boolean)

  const submit = async (word: string) => {
    if (result || loading) return
    // Strip trailing punctuation for comparison
    const clean = word.replace(/[^a-zA-Z0-9']/g, '')
    setSelected(clean)
    setLoading(true)
    try {
      const resp = await apiAnswerText(sessionId, clean)
      setResult(resp.result)
      onResult(resp.result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="word-chips">
      {words.map((word, i) => {
        const clean = word.replace(/[^a-zA-Z0-9']/g, '')
        let cls = 'word-chip'
        if (result) {
          if (clean === selected) cls += result.is_correct ? ' correct' : ' wrong'
        } else if (clean === selected) {
          cls += ' selected'
        }
        return (
          <button
            key={`${word}-${i}`}
            id={`word-${question.id}-${i}`}
            className={cls}
            onClick={() => submit(clean)}
            disabled={!!result || loading}
          >
            {word}
          </button>
        )
      })}
    </div>
  )
}
