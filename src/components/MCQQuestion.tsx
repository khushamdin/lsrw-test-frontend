'use client'

import { useState } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerText } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function MCQQuestion({ question, sessionId, onResult }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (option: string) => {
    if (result || loading) return
    setSelected(option)
    setLoading(true)
    try {
      const resp = await apiAnswerText(sessionId, option)
      setResult(resp.result)
      onResult(resp.result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="options-grid">
      {question.options?.map((opt, i) => {
        let cls = 'option-btn'
        if (result) {
          if (opt === selected) cls += result.is_correct ? ' correct' : ' wrong'
        } else if (opt === selected) {
          cls += ' selected'
        }
        return (
          <button
            key={opt}
            id={`option-${question.id}-${i}`}
            className={cls}
            onClick={() => submit(opt)}
            disabled={!!result || loading}
          >
            <span className="option-index">{LABELS[i]}</span>
            {opt}
          </button>
        )
      })}
    </div>
  )
}
