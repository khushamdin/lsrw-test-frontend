'use client'

import { useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionSection = 'listening' | 'reading' | 'writing' | 'speaking'
type QuestionType =
  | 'mcq' | 'tap_wrong_word' | 'fill_blank'
  | 'sentence_build' | 'rewrite' | 'open_text' | 'speech'

interface Question {
  id: number
  section: QuestionSection
  type: QuestionType
  question: string
  audio_script?: string
  options?: string[]
  blanks?: number
  words?: string[]
  hint?: string
  sentence?: string
  forbidden_words?: string[]
}

interface AnswerResult {
  score: number
  is_correct?: boolean
  feedback: string
  correct_count?: number
  total_blanks?: number
  spoken?: string
}

interface AnswerResponse {
  done: boolean
  result: AnswerResult
  next_question?: Question
  progress?: { current: number; total: number }
  final_score?: number
}

interface SectionScoreMap {
  listening: number[]
  reading: number[]
  writing: number[]
  speaking: number[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

async function apiStart(): Promise<{ session_id: string; question: Question; total: number }> {
  const res = await fetch(`${BASE_URL}/start`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start session')
  return res.json()
}

async function apiAnswerText(sessionId: string, answer: string): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('answer', answer)
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return res.json()
}

async function apiAnswerList(sessionId: string, answers: string[]): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('answer_list', answers.join(','))
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return res.json()
}

async function apiAnswerSpeech(sessionId: string, blob: Blob): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('file', blob, 'recording.webm')
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return res.json()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; icon: string; badgeClass: string }> = {
  listening: { label: 'Listening', icon: '🎧', badgeClass: 'badge-listening' },
  reading:   { label: 'Reading',   icon: '📖', badgeClass: 'badge-reading'   },
  writing:   { label: 'Writing',   icon: '✍️',  badgeClass: 'badge-writing'  },
  speaking:  { label: 'Speaking',  icon: '🎤', badgeClass: 'badge-speaking'  },
}

const OPT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const EMPTY_SCORES: SectionScoreMap = { listening: [], reading: [], writing: [], speaking: [] }

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'loading' | 'question' | 'done'

export default function Home() {
  const [name, setName]         = useState('')
  const [grade, setGrade]       = useState('7')
  const [formError, setFormError] = useState('')

  const [phase, setPhase]               = useState<Phase>('welcome')
  const [sessionId, setSessionId]       = useState('')
  const [question, setQuestion]         = useState<Question | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [total, setTotal]               = useState(0)
  const [localResult, setLocalResult]   = useState<AnswerResult | null>(null)
  const [loading, setLoading]           = useState(false)
  const [sectionScores, setSectionScores] = useState<SectionScoreMap>({ ...EMPTY_SCORES })
  const [finalScore, setFinalScore]     = useState(0)
  const [isDone, setIsDone]             = useState(false)
  const nextQuestionRef = useRef<Question | null>(null)

  // ── Browser TTS ────────────────────────────────────────────────────────────
  const handleSpeak = (text: string) => {
    if (typeof window === 'undefined') return
    window.speechSynthesis.cancel() // Stop any current speech
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.9 // Slightly slower for clarity
    utter.pitch = 1
    window.speechSynthesis.speak(utter)
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  const startQuiz = async () => {
    if (!name.trim()) { setFormError('Please enter your name.'); return }
    setFormError('')
    setPhase('loading')
    try {
      const resp = await apiStart()
      setSessionId(resp.session_id)
      setQuestion(resp.question)
      setTotal(resp.total)
      setQuestionIndex(0)
      setLocalResult(null)
      setSectionScores({ ...EMPTY_SCORES })
      setIsDone(false)
      nextQuestionRef.current = null
      setPhase('question')
    } catch (err: any) {
      setFormError(`Connection Error: ${err.message}. Check if backend is running at ${BASE_URL}`)
      setPhase('welcome')
    }
  }

  // ── Submit answer (dispatched per type) ────────────────────────────────────
  const processResponse = (raw: AnswerResponse) => {
    setLocalResult(raw.result)
    nextQuestionRef.current = raw.next_question ?? null
    if (question) {
      setSectionScores(prev => ({
        ...prev,
        [question.section]: [...prev[question.section], raw.result.score],
      }))
    }
    if (raw.done) {
      setFinalScore(raw.final_score ?? raw.result.score)
      setIsDone(true)
    }
  }

  const submitText = async (answer: string) => {
    setLoading(true)
    try { processResponse(await apiAnswerText(sessionId, answer)) }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  const submitList = async (answers: string[]) => {
    setLoading(true)
    try { processResponse(await apiAnswerList(sessionId, answers)) }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  const submitSpeech = async (blob: Blob) => {
    setLoading(true)
    try { processResponse(await apiAnswerSpeech(sessionId, blob)) }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  // ── Next question ──────────────────────────────────────────────────────────
  const handleNext = () => {
    if (isDone) { setPhase('done'); return }
    const next = nextQuestionRef.current
    if (next) {
      setQuestion(next)
      setQuestionIndex(prev => prev + 1)
      setLocalResult(null)
      nextQuestionRef.current = null
    }
  }

  // ── Restart ────────────────────────────────────────────────────────────────
  const restart = () => {
    setName(''); setGrade('7'); setPhase('welcome')
    setQuestion(null); setLocalResult(null)
    setSectionScores({ ...EMPTY_SCORES }); setFinalScore(0); setIsDone(false)
  }

  // ── Progress pct ───────────────────────────────────────────────────────────
  const progress = question ? (questionIndex / total) * 100 : 0

  return (
    <main className="page-wrapper">
      <div className="card">

        {/* Brand */}
        <div className="brand-logo">
          <div className="brand-icon">🏝️</div>
          <span className="brand-name">LSRW Quest</span>
        </div>

        {/* ── WELCOME ───────────────────────────────────────────────────────── */}
        {phase === 'welcome' && (
          <div>
            <h1 className="welcome-title">Mystery Island Assessment</h1>
            <p className="welcome-subtitle">
              Test your Listening, Speaking, Reading &amp; Writing skills through an epic adventure!
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="input-name">Your Name</label>
              <input
                id="input-name"
                className="form-input"
                type="text"
                placeholder="e.g. Meera"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startQuiz()}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="select-class">Class</label>
              <div className="select-wrapper">
                <select
                  id="select-class"
                  className="form-select"
                  value={grade}
                  onChange={e => setGrade(e.target.value)}
                >
                  <option value="7">Class 7</option>
                </select>
              </div>
            </div>

            {formError && (
              <div className="feedback-banner feedback-wrong" style={{ marginBottom: 12 }}>
                {formError}
              </div>
            )}

            <button id="btn-start" className="btn-primary" onClick={startQuiz}>
              🚀 Start Assessment
            </button>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="spinner-wrapper">
            <div className="spinner" />
            <p className="spinner-text">Setting up your adventure…</p>
          </div>
        )}

        {/* ── QUESTION ──────────────────────────────────────────────────────── */}
        {phase === 'question' && question && (() => {
          const meta = SECTION_META[question.section]
          return (
            <div>
              {/* Progress bar */}
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

              {/* Audio Playback for Listening */}
              {question.section === 'listening' && question.audio_script && (
                <div className="audio-script-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🔊 Listen carefully to the audio script.</span>
                  <button 
                    className="btn-primary" 
                    style={{ width: 'auto', padding: '8px 16px', margin: 0, fontSize: 13 }}
                    onClick={() => handleSpeak(question.audio_script!)}
                  >
                    ▶️ Play Audio
                  </button>
                </div>
              )}

              {/* Question text */}
              <p className="question-text">{question.question}</p>

              {/* Hint */}
              {question.hint && <p className="question-hint">💡 {question.hint}</p>}

              {/* ── Input (hidden once answered) ── */}
              {!localResult && !loading && (
                <QuestionInput
                  question={question}
                  onSubmitText={submitText}
                  onSubmitList={submitList}
                  onSubmitSpeech={submitSpeech}
                />
              )}

              {/* Loading spinner */}
              {loading && (
                <div className="spinner-wrapper" style={{ padding: '16px 0' }}>
                  <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                  <p className="spinner-text">Evaluating…</p>
                </div>
              )}

              {/* Feedback */}
              {localResult && (
                <>
                  <div
                    className={`feedback-banner ${localResult.score >= 60 ? 'feedback-correct' : 'feedback-wrong'}`}
                    style={{ marginTop: 8 }}
                  >
                    <strong>
                      {localResult.score >= 100 ? '🎉 ' : localResult.score >= 60 ? '👍 ' : '❌ '}
                    </strong>
                    {localResult.feedback}
                    <span className="score-pill">{localResult.score}/100</span>
                    {localResult.spoken && (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                        🗣 Heard: &ldquo;{localResult.spoken}&rdquo;
                      </div>
                    )}
                  </div>

                  <button id="btn-continue" className="btn-continue" onClick={handleNext}>
                    {isDone ? '🏁 See Results' : 'Continue →'}
                  </button>
                </>
              )}
            </div>
          )
        })()}

        {/* ── RESULTS ───────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <ResultsScreen
            name={name}
            grade={grade}
            finalScore={finalScore}
            sectionScores={sectionScores}
            onRestart={restart}
          />
        )}

      </div>
    </main>
  )
}

// ─── Question Input Router ────────────────────────────────────────────────────

interface InputProps {
  question: Question
  onSubmitText: (a: string) => Promise<void>
  onSubmitList: (a: string[]) => Promise<void>
  onSubmitSpeech: (b: Blob) => Promise<void>
}

function QuestionInput({ question, onSubmitText, onSubmitList, onSubmitSpeech }: InputProps) {
  switch (question.type) {
    case 'mcq':           return <MCQInput q={question} onSubmit={onSubmitText} />
    case 'tap_wrong_word': return <TapWordInput q={question} onSubmit={onSubmitText} />
    case 'fill_blank':    return <FillBlankInput q={question} onSubmit={onSubmitList} />
    case 'sentence_build': return <SentenceBuildInput q={question} onSubmit={onSubmitText} />
    case 'rewrite':       return <OpenTextInput q={question} onSubmit={onSubmitText} placeholder="Rewrite the sentence correctly…" />
    case 'open_text':     return <OpenTextInput q={question} onSubmit={onSubmitText} />
    case 'speech':        return <SpeechInput q={question} onSubmit={onSubmitSpeech} />
    default:              return <p style={{ color: 'var(--text-muted)' }}>Unknown question type.</p>
  }
}

// ─── MCQ ──────────────────────────────────────────────────────────────────────

function MCQInput({ q, onSubmit }: { q: Question; onSubmit: (a: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null)
  const pick = (opt: string) => {
    if (selected) return
    setSelected(opt)
    onSubmit(opt)
  }
  return (
    <div className="options-grid">
      {q.options?.map((opt, i) => (
        <button
          key={opt}
          id={`mcq-${q.id}-${i}`}
          className={`option-btn${selected === opt ? ' selected' : ''}`}
          onClick={() => pick(opt)}
          disabled={selected !== null}
        >
          <span className="option-index">{OPT_LABELS[i]}</span>
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Tap Wrong Word ───────────────────────────────────────────────────────────

function TapWordInput({ q, onSubmit }: { q: Question; onSubmit: (a: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null)
  const raw = q.sentence ?? q.question
  const words = raw.replace(/["""]/g, '').split(/\s+/).filter(Boolean)

  const pick = (word: string) => {
    if (selected) return
    const clean = word.replace(/[^a-zA-Z0-9']/g, '')
    setSelected(clean)
    onSubmit(clean)
  }

  return (
    <div className="word-chips">
      {words.map((word, i) => {
        const clean = word.replace(/[^a-zA-Z0-9']/g, '')
        return (
          <button
            key={`${word}-${i}`}
            id={`tap-${q.id}-${i}`}
            className={`word-chip${selected === clean ? ' selected' : ''}`}
            onClick={() => pick(word)}
            disabled={selected !== null}
          >
            {word}
          </button>
        )
      })}
    </div>
  )
}

// ─── Fill Blank ───────────────────────────────────────────────────────────────

function FillBlankInput({ q, onSubmit }: { q: Question; onSubmit: (a: string[]) => Promise<void> }) {
  const blanks = q.blanks ?? 1
  const [slots, setSlots]   = useState<(string | null)[]>(Array(blanks).fill(null))
  const [used, setUsed]     = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const selectOpt = (opt: string) => {
    if (submitted) return
    const idx = slots.findIndex(s => s === null)
    if (idx === -1) return
    const ns = [...slots]; ns[idx] = opt
    setSlots(ns); setUsed(p => [...p, opt])
  }

  const clearSlot = (idx: number) => {
    if (submitted) return
    const word = slots[idx]; if (!word) return
    const ns = [...slots]; ns[idx] = null; setSlots(ns)
    setUsed(p => { const c = [...p]; c.splice(c.indexOf(word), 1); return c })
  }

  const allFilled = slots.every(s => s !== null)

  const doSubmit = () => {
    if (!allFilled || submitted) return
    setSubmitted(true)
    onSubmit(slots as string[])
  }

  return (
    <div>
      <div className="fill-options">
        {q.options?.map((opt, i) => (
          <button
            key={`${opt}-${i}`}
            id={`fopt-${q.id}-${i}`}
            className={`fill-chip${used.includes(opt) ? ' used' : ''}`}
            onClick={() => selectOpt(opt)}
            disabled={submitted || used.includes(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="blank-slots" style={{ marginBottom: 16 }}>
        {slots.map((val, i) => (
          <button
            key={i}
            id={`slot-${q.id}-${i}`}
            className={`blank-slot${val === null ? ' empty' : ''}`}
            onClick={() => clearSlot(i)}
            disabled={submitted}
          >
            {val ?? `Blank ${i + 1}`}
          </button>
        ))}
      </div>
      <button
        id={`fb-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!allFilled || submitted}
      >
        Submit
      </button>
    </div>
  )
}

// ─── Sentence Build ───────────────────────────────────────────────────────────

function SentenceBuildInput({ q, onSubmit }: { q: Question; onSubmit: (a: string) => Promise<void> }) {
  const [bank, setBank] = useState<{ word: string; id: string }[]>(() =>
    (q.words ?? []).map((w, i) => ({ word: w, id: `${w}-${i}` })).sort(() => Math.random() - 0.5)
  )
  const [assembled, setAssembled] = useState<{ word: string; id: string }[]>([])
  const [submitted, setSubmitted] = useState(false)

  const addWord = (item: { word: string; id: string }) => {
    if (submitted) return
    setBank(p => p.filter(w => w.id !== item.id))
    setAssembled(p => [...p, item])
  }
  const removeWord = (item: { word: string; id: string }) => {
    if (submitted) return
    setAssembled(p => p.filter(w => w.id !== item.id))
    setBank(p => [...p, item])
  }
  const allUsed = assembled.length === (q.words?.length ?? 0)

  const doSubmit = () => {
    if (!allUsed || submitted) return
    setSubmitted(true)
    onSubmit(assembled.map(w => w.word).join(' '))
  }

  return (
    <div>
      <div className="sentence-build-area" style={{ marginBottom: 12 }}>
        {assembled.length === 0
          ? <span className="sentence-area-placeholder">Tap words below to build the sentence…</span>
          : assembled.map(item => (
              <button
                key={item.id}
                id={`asm-${item.id}`}
                className="word-chip selected"
                onClick={() => removeWord(item)}
                disabled={submitted}
              >
                {item.word}
              </button>
            ))
        }
      </div>
      <div className="word-chips" style={{ marginBottom: 16 }}>
        {bank.map(item => (
          <button
            key={item.id}
            id={`bnk-${item.id}`}
            className="word-chip"
            onClick={() => addWord(item)}
            disabled={submitted}
          >
            {item.word}
          </button>
        ))}
      </div>
      <button
        id={`sb-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!allUsed || submitted}
      >
        Submit
      </button>
    </div>
  )
}

// ─── Open Text / Rewrite ──────────────────────────────────────────────────────

function OpenTextInput({
  q, onSubmit, placeholder,
}: { q: Question; onSubmit: (a: string) => Promise<void>; placeholder?: string }) {
  const [text, setText]       = useState('')
  const [submitted, setSubmitted] = useState(false)

  const doSubmit = () => {
    if (!text.trim() || submitted) return
    setSubmitted(true)
    onSubmit(text.trim())
  }

  return (
    <div>
      <textarea
        id={`ot-${q.id}`}
        className="text-area"
        placeholder={placeholder ?? 'Write your answer here…'}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={submitted}
        rows={4}
      />
      <button
        id={`ot-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!text.trim() || submitted}
      >
        Submit
      </button>
    </div>
  )
}

// ─── Speech ───────────────────────────────────────────────────────────────────

function SpeechInput({ q, onSubmit }: { q: Question; onSubmit: (b: Blob) => Promise<void> }) {
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl]   = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const mediaRef  = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start(); mediaRef.current = mr; setRecording(true)
    } catch {
      setError('Microphone access denied. Please allow microphone access.')
    }
  }

  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false) }

  const doSubmit = () => {
    if (!audioBlob || submitted) return
    setSubmitted(true)
    onSubmit(audioBlob)
  }

  return (
    <div>
      {q.forbidden_words && (
        <div
          className="audio-script-box"
          style={{ borderColor: 'rgba(255,179,71,0.3)', background: 'rgba(255,179,71,0.07)', color: 'var(--accent-amber)' }}
        >
          🚫 Don&apos;t use: <strong>{q.forbidden_words.join(', ')}</strong>
        </div>
      )}

      <div className="voice-area">
        <button
          id={`rec-${q.id}`}
          className={`record-btn${recording ? ' recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          disabled={submitted}
        >
          {recording ? '⏹' : '🎤'}
        </button>
        <span className={`record-label${recording ? ' active' : ''}`}>
          {recording ? 'Recording… tap to stop' : audioUrl ? 'Re-record' : 'Tap to record'}
        </span>
      </div>

      {audioUrl && !recording && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <audio controls src={audioUrl} style={{ width: '100%', borderRadius: 8 }} />
        </div>
      )}

      {error && <div className="feedback-banner feedback-wrong" style={{ marginBottom: 12 }}>{error}</div>}

      <button
        id={`speech-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!audioBlob || submitted || recording}
      >
        Submit Recording
      </button>
    </div>
  )
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0
}

function gradeLabel(score: number) {
  if (score >= 90) return 'Outstanding! 🌟'
  if (score >= 75) return 'Great job! 🎉'
  if (score >= 60) return 'Good effort! 👍'
  if (score >= 40) return 'Keep practising! 💪'
  return "Don't give up! 🌱"
}

const SECTION_LIST = [
  { key: 'listening' as const, label: 'Listening', icon: '🎧', cls: 's-listening' },
  { key: 'reading'   as const, label: 'Reading',   icon: '📖', cls: 's-reading'   },
  { key: 'writing'   as const, label: 'Writing',   icon: '✍️',  cls: 's-writing'  },
  { key: 'speaking'  as const, label: 'Speaking',  icon: '🎤', cls: 's-speaking'  },
]

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
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="score-center-text">
        <span className="score-big">{score}</span>
        <span className="score-label-sm">/ 100</span>
      </div>
    </div>
  )
}

interface ResultsProps {
  name: string
  grade: string
  finalScore: number
  sectionScores: SectionScoreMap
  onRestart: () => void
}

function ResultsScreen({ name, grade, finalScore, sectionScores, onRestart }: ResultsProps) {
  const rounded = Math.round(finalScore)
  return (
    <div>
      <div className="results-hero">
        <div className="stars">⭐⭐⭐</div>
        <ScoreRing score={rounded} />
        <p className="results-name">{name}</p>
        <p className="results-class">Class {grade} · Mystery Island Assessment</p>
        <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {gradeLabel(rounded)}
        </p>
      </div>

      <div className="divider" />

      <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
        Section Breakdown
      </p>

      <div className="section-scores">
        {SECTION_LIST.map(s => (
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
