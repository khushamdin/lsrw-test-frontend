'use client'

import { useState } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerText } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
}

export default function SentenceBuild({ question, sessionId, onResult }: Props) {
  // Shuffle once on mount
  const [bank, setBank] = useState<{ word: string; id: string }[]>(() => {
    const arr = (question.words ?? []).map((w, i) => ({ word: w, id: `${w}-${i}` }))
    return [...arr].sort(() => Math.random() - 0.5)
  })
  const [assembled, setAssembled] = useState<{ word: string; id: string }[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const addWord = (item: { word: string; id: string }) => {
    if (result) return
    setBank(prev => prev.filter(w => w.id !== item.id))
    setAssembled(prev => [...prev, item])
  }

  const removeWord = (item: { word: string; id: string }) => {
    if (result) return
    setAssembled(prev => prev.filter(w => w.id !== item.id))
    setBank(prev => [...prev, item])
  }

  const canSubmit = assembled.length === (question.words?.length ?? 0) && !result && !loading

  const submit = async () => {
    if (!canSubmit) return
    const sentence = assembled.map(w => w.word).join(' ')
    setLoading(true)
    try {
      const resp = await apiAnswerText(sessionId, sentence)
      setResult(resp.result)
      onResult(resp.result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Assembled area */}
      <div className="sentence-build-area" style={{ marginBottom: 14 }}>
        {assembled.length === 0 ? (
          <span className="sentence-area-placeholder">Tap words below to build the sentence…</span>
        ) : (
          assembled.map(item => (
            <button
              key={item.id}
              id={`assembled-${item.id}`}
              className="word-chip selected"
              onClick={() => removeWord(item)}
              disabled={!!result}
            >
              {item.word}
            </button>
          ))
        )}
      </div>

      {/* Word bank */}
      <div className="word-chips" style={{ marginBottom: 20 }}>
        {bank.map(item => (
          <button
            key={item.id}
            id={`bank-${item.id}`}
            className="word-chip"
            onClick={() => addWord(item)}
            disabled={!!result}
          >
            {item.word}
          </button>
        ))}
      </div>

      <button
        id={`build-submit-${question.id}`}
        className="btn-primary"
        onClick={submit}
        disabled={!canSubmit}
      >
        {loading ? 'Checking…' : 'Submit'}
      </button>
    </div>
  )
}
