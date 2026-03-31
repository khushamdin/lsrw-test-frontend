'use client'

import { useState } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerList } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
}

export default function FillBlank({ question, sessionId, onResult }: Props) {
  const blanks = question.blanks ?? 1
  const [slots, setSlots] = useState<(string | null)[]>(Array(blanks).fill(null))
  const [usedOptions, setUsedOptions] = useState<string[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const selectOption = (opt: string) => {
    if (result) return
    const firstEmpty = slots.findIndex(s => s === null)
    if (firstEmpty === -1) return
    const newSlots = [...slots]
    newSlots[firstEmpty] = opt
    setSlots(newSlots)
    setUsedOptions(prev => [...prev, opt])
  }

  const clearSlot = (idx: number) => {
    if (result) return
    const word = slots[idx]
    if (!word) return
    const newSlots = [...slots]
    newSlots[idx] = null
    setSlots(newSlots)
    setUsedOptions(prev => {
      const copy = [...prev]
      const i = copy.indexOf(word)
      if (i !== -1) copy.splice(i, 1)
      return copy
    })
  }

  const canSubmit = slots.every(s => s !== null) && !result && !loading

  const submit = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      const resp = await apiAnswerList(sessionId, slots as string[])
      setResult(resp.result)
      onResult(resp.result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Option chips to pick from */}
      <div className="fill-options">
        {question.options?.map((opt, i) => (
          <button
            key={`${opt}-${i}`}
            id={`fill-opt-${question.id}-${i}`}
            className={`fill-chip ${usedOptions.includes(opt) ? 'used' : ''}`}
            onClick={() => selectOption(opt)}
            disabled={!!result || usedOptions.includes(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Blank slots */}
      <div className="blank-slots" style={{ marginBottom: 20 }}>
        {slots.map((val, i) => (
          <button
            key={i}
            id={`blank-slot-${question.id}-${i}`}
            className={`blank-slot ${val === null ? 'empty' : ''}`}
            onClick={() => clearSlot(i)}
            disabled={!!result}
            title={val ? 'Click to remove' : `Blank ${i + 1}`}
          >
            {val ?? `Blank ${i + 1}`}
          </button>
        ))}
      </div>

      <button
        id={`fill-submit-${question.id}`}
        className="btn-primary"
        onClick={submit}
        disabled={!canSubmit}
      >
        {loading ? 'Checking…' : 'Submit'}
      </button>
    </div>
  )
}
