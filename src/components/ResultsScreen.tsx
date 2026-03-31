'use client'

import type { SectionScoreMap } from '@/lib/types'

interface Props {
  name: string
  grade: string
  finalScore: number
  sectionScores: SectionScoreMap
  onRestart: () => void
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length)
}

function ScoreRing({ score }: { score: number }) {
  const r = 56
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  const color =
    score >= 80 ? 'var(--accent-teal)' :
    score >= 50 ? 'var(--accent-purple)' :
    '#e05463'

  return (
    <div className="score-ring-wrapper">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="score-center-text">
        <span className="score-big">{score}</span>
        <span className="score-label-sm">/ 100</span>
      </div>
    </div>
  )
}

const SECTIONS = [
  { key: 'listening', label: 'Listening', icon: '🎧', cls: 's-listening' },
  { key: 'reading',   label: 'Reading',   icon: '📖', cls: 's-reading'   },
  { key: 'writing',   label: 'Writing',   icon: '✍️',  cls: 's-writing'  },
  { key: 'speaking',  label: 'Speaking',  icon: '🎤', cls: 's-speaking'  },
] as const

function grade(score: number): string {
  if (score >= 90) return 'Outstanding! 🌟'
  if (score >= 75) return 'Great job! 🎉'
  if (score >= 60) return 'Good effort! 👍'
  if (score >= 40) return 'Keep practising! 💪'
  return 'Don\'t give up! 🌱'
}

export default function ResultsScreen({ name, grade: gradeStr, finalScore, sectionScores, onRestart }: Props) {
  const rounded = Math.round(finalScore)

  return (
    <div>
      {/* Hero */}
      <div className="results-hero">
        <div className="stars">⭐⭐⭐</div>
        <ScoreRing score={rounded} />
        <p className="results-name">{name}</p>
        <p className="results-class">Class {gradeStr} · Mystery Island Assessment</p>
        <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {grade(rounded)}
        </p>
      </div>

      <div className="divider" />

      {/* Section scores */}
      <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
        Section Breakdown
      </p>
      <div className="section-scores">
        {SECTIONS.map(s => (
          <div key={s.key} className="section-score-card">
            <div className="section-score-icon">{s.icon}</div>
            <div className="section-score-name">{s.label}</div>
            <div className={`section-score-value ${s.cls}`}>
              {avg(sectionScores[s.key])}
            </div>
          </div>
        ))}
      </div>

      <div className="divider" />

      <button id="btn-restart" className="btn-restart" onClick={onRestart}>
        🔄 Try Again
      </button>
    </div>
  )
}
