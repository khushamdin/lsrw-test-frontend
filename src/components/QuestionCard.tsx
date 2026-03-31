'use client'

import type { Question, AnswerResult } from '@/lib/types'
import MCQQuestion from './MCQQuestion'
import TapWrongWord from './TapWrongWord'
import FillBlank from './FillBlank'
import SentenceBuild from './SentenceBuild'
import OpenText from './OpenText'
import SpeechInput from './SpeechInput'

interface Props {
  question: Question
  sessionId: string
  questionIndex: number // 0-based
  total: number
  result: AnswerResult | null
  onResult: (result: AnswerResult) => void
  onNext: () => void
  isLast: boolean
}

const SECTION_META: Record<string, { label: string; icon: string; badgeClass: string }> = {
  listening: { label: 'Listening', icon: '🎧', badgeClass: 'badge-listening' },
  reading:   { label: 'Reading',   icon: '📖', badgeClass: 'badge-reading'   },
  writing:   { label: 'Writing',   icon: '✍️',  badgeClass: 'badge-writing'  },
  speaking:  { label: 'Speaking',  icon: '🎤', badgeClass: 'badge-speaking'  },
}

export default function QuestionCard({
  question,
  sessionId,
  questionIndex,
  total,
  result,
  onResult,
  onNext,
  isLast,
}: Props) {
  const meta = SECTION_META[question.section]
  const progress = ((questionIndex) / total) * 100

  const renderInput = () => {
    switch (question.type) {
      case 'mcq':
        return <MCQQuestion question={question} sessionId={sessionId} onResult={onResult} />
      case 'tap_wrong_word':
        return <TapWrongWord question={question} sessionId={sessionId} onResult={onResult} />
      case 'fill_blank':
        return <FillBlank question={question} sessionId={sessionId} onResult={onResult} />
      case 'sentence_build':
        return <SentenceBuild question={question} sessionId={sessionId} onResult={onResult} />
      case 'rewrite':
        return <OpenText question={question} sessionId={sessionId} onResult={onResult} placeholder="Rewrite the sentence correctly…" />
      case 'open_text':
        return <OpenText question={question} sessionId={sessionId} onResult={onResult} />
      case 'speech':
        return <SpeechInput question={question} sessionId={sessionId} onResult={onResult} />
      default:
        return <p style={{ color: 'var(--text-muted)' }}>Unknown question type.</p>
    }
  }

  const isCorrect = result?.is_correct
  const feedbackClass = result
    ? result.score >= 60 ? 'feedback-correct' : 'feedback-wrong'
    : ''

  return (
    <div>
      {/* Progress */}
      <div className="progress-meta">
        <span className="progress-label">Question {questionIndex + 1} of {total}</span>
        <span className="progress-count">{Math.round(progress)}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Section badge */}
      <span className={`section-badge ${meta.badgeClass}`}>
        {meta.icon} {meta.label}
      </span>

      {/* Audio script for listening */}
      {question.audio_script && (
        <div className="audio-script-box">
          🔊 &ldquo;{question.audio_script}&rdquo;
        </div>
      )}

      {/* Question */}
      <p className="question-text">{question.question}</p>

      {/* Hint */}
      {question.hint && (
        <p className="question-hint">💡 {question.hint}</p>
      )}

      {/* Input */}
      {renderInput()}

      {/* Feedback */}
      {result && (
        <div className={`feedback-banner ${feedbackClass}`} style={{ marginTop: 4 }}>
          <strong>{result.score >= 100 ? '🎉 ' : result.score >= 60 ? '👍 ' : '❌ '}</strong>
          {result.feedback}
          {result.score !== undefined && (
            <span className="score-pill">
              {result.score}/100
            </span>
          )}
          {/* Extra detail for speech */}
          {result.spoken && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              🗣 Heard: &ldquo;{result.spoken}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      {result && (
        <button
          id="btn-continue"
          className="btn-continue"
          onClick={onNext}
        >
          {isLast ? '🏁 See Results' : 'Continue →'}
        </button>
      )}
    </div>
  )
}
