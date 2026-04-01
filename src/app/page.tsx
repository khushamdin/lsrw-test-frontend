'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import TextType from '@/components/TextType'

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionSection = 'listening' | 'reading' | 'writing' | 'speaking'
type QuestionType =
  | 'mcq' | 'tap_wrong_word' | 'fill_blank'
  | 'sentence_build' | 'rewrite' | 'open_text' | 'speech' | 'conversational_speech' | 'conversational_writing'

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
  image?: string
  image_description?: string
  initial_message?: string
}

interface AnswerResult {
  score: number
  is_correct?: boolean
  feedback: string
  correct_count?: number
  total_blanks?: number
  spoken?: string
  avg_accuracy?: number
  avg_fluency?: number
  avg_completeness?: number
  avg_pronunciation?: number
  language_score?: number
  relevance_score?: number
}

interface AnswerResponse {
  done: boolean
  result: AnswerResult
  next_question?: Question
  progress?: { current: number; total: number }
  final_score?: number
  is_turn_based?: boolean
  chat_response?: string
}

interface SectionScoreMap {
  listening: number[]
  reading: number[]
  writing: number[]
  speaking: number[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

async function apiStart(name: string, section?: string): Promise<{ session_id: string; question: Question; total: number }> {
  const url = section ? `${BASE_URL}/start?section=${section}` : `${BASE_URL}/start`
  const form = new FormData()
  form.append('name', name)
  const res = await fetch(url, { method: 'POST', body: form })
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
  listening: { label: 'Listening Quest', icon: '🎧', badgeClass: 'badge-listening' },
  reading: { label: 'Reading Explorer', icon: '📖', badgeClass: 'badge-reading' },
  writing: { label: 'Writing Master', icon: '✍️', badgeClass: 'badge-writing' },
  speaking: { label: 'Speaking Hero', icon: '🎤', badgeClass: 'badge-speaking' },
}

const OPT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const EMPTY_SCORES: SectionScoreMap = { listening: [], reading: [], writing: [], speaking: [] }

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'loading' | 'question' | 'done'

export default function Home() {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('7')
  const [formError, setFormError] = useState('')

  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionId, setSessionId] = useState('')
  const [question, setQuestion] = useState<Question | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [localResult, setLocalResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sectionScores, setSectionScores] = useState<SectionScoreMap>({ ...EMPTY_SCORES })
  const [finalScore, setFinalScore] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [userAnswer, setUserAnswer] = useState<string | null>(null)
  const [currentConversationText, setCurrentConversationText] = useState<string | null>(null)
  const [speakingResult, setSpeakingResult] = useState<AnswerResult | null>(null)
  const [writingResult, setWritingResult] = useState<AnswerResult | null>(null)

  // Conversation history for conversational_writing
  const [conversationMessages, setConversationMessages] = useState<Array<{ role: 'user' | 'ai', text: string }>>([])

  const nextQuestionRef = useRef<Question | null>(null)

  // ── Browser TTS ────────────────────────────────────────────────────────────
  const handleSpeak = useCallback((text: string) => {
    if (typeof window === 'undefined') return

    const speak = () => {
      window.speechSynthesis.cancel()
      const cleanText = text.replace(/_+/g, ' ')
      const utter = new SpeechSynthesisUtterance(cleanText)

      const voices = window.speechSynthesis.getVoices()
      // Prioritize "sweet" or "friendly" sounding voices for kids
      const sweetVoice = voices.find(v => v.name.includes('Google US English')) ||
        voices.find(v => v.name.includes('Natural')) ||
        voices.find(v => v.name.includes('Zira')) ||
        voices.find(v => v.lang === 'en-US' && v.name.includes('Female'))

      if (sweetVoice) utter.voice = sweetVoice

      utter.rate = 0.95 // Slightly slower for clarity
      utter.pitch = 1.3 // Higher pitch for a "sweet/friendly robot" vibe
      utter.volume = 1

      utter.onstart = () => setIsAudioPlaying(true)
      utter.onend = () => setIsAudioPlaying(false)
      window.speechSynthesis.speak(utter)
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = speak
    } else {
      speak()
    }
  }, [])

  // ── Start ──────────────────────────────────────────────────────────────────
  const startQuiz = async (selectedSection?: string) => {
    if (!name.trim()) { setFormError('Please enter your name.'); return }
    setFormError('')
    setPhase('loading')
    try {
      const resp = await apiStart(name, selectedSection)
      setSessionId(resp.session_id)
      setQuestion(resp.question)
      setTotal(resp.total)
      setQuestionIndex(0)
      setLocalResult(null)
      setSectionScores({ ...EMPTY_SCORES })
      setIsDone(false)
      nextQuestionRef.current = null
      setPhase('question')
      setUserAnswer(null)
      setCurrentConversationText(null)
      setConversationMessages([])
      setShowOptions(false)
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
      if (question?.type === 'conversational_speech') {
        setSpeakingResult(raw.result)
      }
      if (question?.type === 'conversational_writing') {
        setWritingResult(raw.result)
      }
      setIsDone(true)
    }
  }

  const submitText = async (answer: string) => {
    setLoading(true)

    // For conversational_writing, add to conversation UI immediately
    if (question?.type === 'conversational_writing') {
      setConversationMessages(prev => [...prev, { role: 'user', text: answer }])
    } else {
      setUserAnswer(answer)
    }

    try {
      const resp = await apiAnswerText(sessionId, answer)

      // Handle conversational writing turn-based flow
      if (resp.is_turn_based && resp.chat_response) {
        setConversationMessages(prev => [...prev, { role: 'ai', text: resp.chat_response }])
        setLocalResult(null) // Don't show final result yet
        setShowOptions(false) // Reset to allow typing animation
        setCurrentConversationText(resp.chat_response)
      } else {
        processResponse(resp)
      }
    }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  const submitList = async (answers: string[]) => {
    setLoading(true)
    const combined = answers.join(', ')
    setUserAnswer(combined)
    try { processResponse(await apiAnswerList(sessionId, answers)) }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  const submitSpeech = async (blob: Blob) => {
    setLoading(true)
    setUserAnswer('🎤 Recording...')
    try {
      const resp = await apiAnswerSpeech(sessionId, blob) as any
      if (resp.is_turn_based) {
        // It's a mid-conversation turn
        setLocalResult(null)
        setCurrentConversationText(resp.chat_response)
        setUserAnswer(resp.result.spoken)
        // Reset showOptions so the typing can finish before showing record btn again
        setShowOptions(false)
      } else {
        processResponse(resp)
        if (resp.result.spoken) setUserAnswer(resp.result.spoken)
      }
    }
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
      setShowOptions(false)
      setUserAnswer(null)
      setCurrentConversationText(null)
      setConversationMessages([])
      nextQuestionRef.current = null
    }
  }

  // ── Restart ────────────────────────────────────────────────────────────────
  const restart = () => {
    setName(''); setGrade('7'); setPhase('welcome')
    setQuestion(null); setLocalResult(null)
    setSectionScores({ ...EMPTY_SCORES }); setFinalScore(0); setIsDone(false)
    setSpeakingResult(null); setConversationMessages([])
  }

  // ── Progress pct ───────────────────────────────────────────────────────────
  const progress = (question && total > 0) ? (questionIndex / total) * 100 : 0

  return (
    <main className="page-wrapper">
      <div className="card">

        {/* Brand */}
        <div className="brand-logo" style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{
            background: 'var(--grad-main)',
            color: '#fff',
            borderRadius: '12px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            fontWeight: 900,
            boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)'
          }}>
            Q
          </div>
          <span className="brand-name" style={{ color: 'var(--accent-purple)', fontSize: '32px', fontWeight: 900, letterSpacing: '-1px' }}>Quto Quest</span>
        </div>

        {/* ── WELCOME ───────────────────────────────────────────────────────── */}
        {phase === 'welcome' && (
          <ConversationalWelcome
            name={name}
            setName={setName}
            grade={grade}
            setGrade={setGrade}
            onStart={startQuiz}
            onSpeak={handleSpeak}
            error={formError}
          />
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
          const meta = SECTION_META[question.section] || { label: question.section, icon: '❓', badgeClass: '' }
          const isConversationalWriting = question.type === 'conversational_writing'

          return (
            <div className="chat-container">
              {/* Progress bar */}
              <div>
                <div className="progress-meta">
                  <span className="progress-label">Question {questionIndex + 1} of {total}</span>
                  <span className="progress-count">{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Image for conversational writing - show at top */}
              {isConversationalWriting && question.image && (
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <img
                    src={`/${question.image}`}
                    alt="Task Sketch"
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      borderRadius: '16px',
                      border: '6px solid var(--border)',
                      boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
                    }}
                  />
                </div>
              )}

              {/* Initial Question Message (or current AI message for conversational) */}
              <div className="chat-row chat-row-left">
                <div className="mascot-sam-mini">
                  {question.section === 'listening' ? '👦' :
                    question.section === 'reading' ? '📖' :
                      question.section === 'writing' ? '✍️' : '🎤'}
                </div>
                <div className="chat-bubble chat-bubble-sam">
                  <span className={`section-badge ${meta.badgeClass}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left', marginBottom: '8px' }}>
                    {meta.icon} {meta.label}
                  </span>

                  {/* Audio Playback for Listening */}
                  {question.section === 'listening' && question.audio_script && (
                    <div className="audio-script-box" style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px' }}>🔊 Listen to Sam</span>
                        <button
                          className="btn-primary"
                          style={{ width: 'auto', padding: '6px 12px', margin: 0, fontSize: '11px', boxShadow: '0 3px 0px var(--accent-green-dark)' }}
                          onClick={() => handleSpeak(`Sam says, ${currentConversationText || question.audio_script!}`)}
                        >
                          ▶️ PLAY
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="question-text">
                    <TextType
                      text={(() => {
                        // For conversational writing, show initial or current AI message
                        if (isConversationalWriting) {
                          // The main bubble ALWAYS shows the initial setup question
                          return question.initial_message || question.question
                        }

                        if (currentConversationText) {
                          return currentConversationText;
                        }
                        if (question.type === 'tap_wrong_word' || question.type === 'sentence_build') {
                          return question.question.split(':')[0].trim();
                        }
                        if (question.type === 'fill_blank') {
                          return question.question.split(':')[0].trim();
                        }
                        if (question.sentence && question.question && question.sentence !== question.question) {
                          return `${question.sentence}\n\n${question.question}`;
                        }
                        return question.question || question.sentence || "";
                      })()}
                      key={`${question.id}${isConversationalWriting ? '-static' : ''}`}
                      shouldStart={question.section !== 'listening' || isAudioPlaying}
                      typingSpeed={30}
                      loop={false}
                      onSentenceComplete={() => setShowOptions(true)}
                    />
                  </div>

                  {question.hint && conversationMessages.length === 0 && <p className="question-hint" style={{ marginTop: '8px', marginBottom: 0 }}>💡 {question.hint}</p>}
                </div>
              </div>

              {/* Conversation messages for conversational_writing */}
              {isConversationalWriting && conversationMessages.map((msg, idx) => (
                msg.role === 'user' ? (
                  <div key={`user-${idx}`} className="chat-row chat-row-right">
                    <div className="chat-bubble chat-bubble-user" style={{ animation: 'slideRight 0.3s ease both' }}>
                      <div className="chat-bubble-user-label">Me</div>
                      <div>{msg.text}</div>
                    </div>
                  </div>
                ) : (
                  <div key={`ai-${idx}`} className="chat-row chat-row-left">
                    <div className="mascot-sam-mini">✍️</div>
                    <div className="chat-bubble chat-bubble-sam" style={{ animation: 'slideLeft 0.3s ease both' }}>
                      <div className="question-text">
                        <TextType
                          text={msg.text}
                          typingSpeed={30}
                          onSentenceComplete={() => setShowOptions(true)}
                        />
                      </div>
                    </div>
                  </div>
                )
              ))}

              {/* User Answer Area (Right) - for non-conversational or ongoing conversation */}
              {!isConversationalWriting && (
                <div className="chat-row chat-row-right">
                  <div className="chat-options-container" style={{ alignItems: 'flex-end', maxWidth: '100%' }}>
                    {!localResult && !loading && showOptions && (
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ maxWidth: '400px', width: '100%' }}>
                          <QuestionInput
                            question={question}
                            onSubmitText={submitText}
                            onSubmitList={submitList}
                            onSubmitSpeech={submitSpeech}
                          />
                        </div>
                      </div>
                    )}

                    {userAnswer && (
                      <div className="chat-bubble chat-bubble-user" style={{ animation: 'slideRight 0.3s ease both' }}>
                        <div className="chat-bubble-user-label">My Answer</div>
                        <div>{userAnswer}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Input for conversational writing */}
              {isConversationalWriting && !localResult && showOptions && (
                <div className="chat-row chat-row-right">
                  <div style={{ width: '100%', maxWidth: '500px', marginLeft: 'auto' }}>
                    <QuestionInput
                      question={question}
                      onSubmitText={submitText}
                      onSubmitList={submitList}
                      onSubmitSpeech={submitSpeech}
                    />
                  </div>
                </div>
              )}

              {/* Sam's Feedback Bubble */}
              {loading && (
                <div className="chat-row chat-row-left">
                  <div className="mascot-sam-mini">👦</div>
                  <div className="chat-bubble chat-bubble-sam">
                    <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                  </div>
                </div>
              )}

              {localResult && !loading && (
                <div className="chat-row chat-row-left">
                  <div className="mascot-sam-mini">👦</div>
                  <div className="chat-bubble chat-bubble-sam chat-bubble-feedback">
                    <div
                      className={`feedback-banner ${localResult.score >= 60 ? 'feedback-correct' : 'feedback-wrong'}`}
                      style={{ marginTop: 0, marginBottom: 12 }}
                    >
                      <strong>
                        {localResult.score >= 100 ? '🎉 ' : localResult.score >= 60 ? '👍 ' : '❌ '}
                      </strong>
                      {localResult.feedback}
                    </div>

                    <button id="btn-continue" className="btn-continue" onClick={handleNext}>
                      {isDone ? '🏁 See Results' : 'Continue →'}
                    </button>
                  </div>
                </div>
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
            speakingResult={speakingResult}
            writingResult={writingResult}
            onRestart={restart}
          />
        )}

      </div>
    </main>
  )
}

// ─── Conversational Welcome (keeping existing implementation) ─────────────────

function ConversationalWelcome({
  name, setName,
  grade, setGrade,
  onStart,
  onSpeak,
  error
}: {
  name: string; setName: (n: string) => void;
  grade: string; setGrade: (g: string) => void;
  onStart: (section?: string) => void;
  onSpeak: (text: string) => void;
  error?: string;
}) {
  const [step, setStep] = useState(1)
  const spokenRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const SECTIONS = [
    { id: 'listening', label: 'Listening', icon: '🎧' },
    { id: 'reading', label: 'Reading', icon: '📖' },
    { id: 'writing', label: 'Writing', icon: '✍️' },
    { id: 'speaking', label: 'Speaking', icon: '🎤' },
  ]

  const nextStep = () => {
    if (step === 1 && !name.trim()) return
    if (step < 3) setStep(prev => prev + 1)
  }

  useEffect(() => {
    if (spokenRef.current === step) return
    let text = ""
    if (step === 1) text = "Hi! I'm Quto! What's your name?"
    if (step === 2) text = `Nice to meet you, ${name}! What class are you in?`
    if (step === 3) text = "Great! What do you want to practice today?"

    if (text) {
      onSpeak(text)
      spokenRef.current = step
    }
  }, [step, onSpeak, name])

  return (
    <div className="conversational-container">
      <div className="mascot-wrapper">
        <img src="/freepik__background__42262 2.webp" alt="Mascot" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
      </div>

      <div className="speech-bubble">
        {step === 1 ? (
          <>Hi! I&apos;m Quto! <br /> What&apos;s your name?</>
        ) : step === 2 ? (
          <>Nice to meet you, {name}! <br /> What class are you in?</>
        ) : (
          <>Great! What do you want to <br /> practice today?</>
        )}
      </div>

      <div className="input-container">
        {step === 1 ? (
          <div className="form-group">
            <input
              ref={inputRef}
              className="form-input"
              type="text"
              placeholder="Type your name here..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && nextStep()}
              autoFocus
            />
          </div>
        ) : step === 2 ? (
          <div className="class-grid" style={{ marginBottom: 16 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8'].map(c => (
              <button
                key={c}
                className={`class-btn ${grade === c ? 'selected' : ''}`}
                onClick={() => { setGrade(c); nextStep(); }}
              >
                Class {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="class-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className="class-btn"
                style={{ height: 'auto', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                onClick={() => onStart(s.id)}
              >
                <span style={{ fontSize: '24px' }}>{s.icon}</span>
                <span style={{ fontSize: '14px' }}>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="feedback-banner feedback-wrong" style={{ width: '100%', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <button
          className="btn-primary"
          onClick={nextStep}
          disabled={!name.trim()}
        >
          Next →
        </button>
      )}
    </div>
  )
}

// ─── Question Input Router (keeping existing + conversational_writing) ────────

interface InputProps {
  question: Question
  onSubmitText: (a: string) => Promise<void>
  onSubmitList: (a: string[]) => Promise<void>
  onSubmitSpeech: (b: Blob) => Promise<void>
}

function QuestionInput({ question, onSubmitText, onSubmitList, onSubmitSpeech }: InputProps) {
  switch (question.type) {
    case 'mcq': return <MCQInput q={question} onSubmit={onSubmitText} />
    case 'tap_wrong_word': return <TapWordInput q={question} onSubmit={onSubmitText} />
    case 'fill_blank': return <FillBlankInput q={question} onSubmit={onSubmitList} />
    case 'sentence_build': return <SentenceBuildInput q={question} onSubmit={onSubmitText} />
    case 'rewrite': return <OpenTextInput q={question} onSubmit={onSubmitText} placeholder="Rewrite the sentence correctly…" />
    case 'open_text': return <OpenTextInput q={question} onSubmit={onSubmitText} />
    case 'conversational_writing': return <OpenTextInput q={question} onSubmit={onSubmitText} placeholder="Type your response here..." />
    case 'speech':
    case 'conversational_speech': return <SpeechInput q={question} onSubmit={onSubmitSpeech} />
    default: return <p style={{ color: 'var(--text-muted)' }}>Unknown question type.</p>
  }
}

// ─── (Keeping all existing input components: MCQ, TapWord, FillBlank, SentenceBuild, OpenText, Speech) ───

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

function FillBlankInput({ q, onSubmit }: { q: Question; onSubmit: (a: string[]) => Promise<void> }) {
  const blanks = q.blanks ?? 1
  const [slots, setSlots] = useState<(string | null)[]>(Array(blanks).fill(null))
  const [used, setUsed] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const sentence = q.question.includes('"') ? q.question.split('"')[1] : (q.sentence || q.question);
  const parts = sentence.split(/_+/)

  const selectOpt = (opt: string) => {
    if (submitted) return
    const idx = slots.findIndex(s => s === null)
    if (idx === -1) return
    const ns = [...slots]
    ns[idx] = opt
    setSlots(ns)
    setUsed(p => [...p, opt])
  }

  const clearSlot = (idx: number) => {
    if (submitted) return
    const word = slots[idx]
    if (!word) return
    const ns = [...slots]
    ns[idx] = null
    setSlots(ns)
    setUsed(p => {
      const c = [...p]
      const findIdx = c.indexOf(word)
      if (findIdx > -1) c.splice(findIdx, 1)
      return c
    })
  }

  const allFilled = slots.every(s => s !== null)

  const doSubmit = () => {
    if (!allFilled || submitted) return
    setSubmitted(true)
    onSubmit(slots as string[])
  }

  return (
    <div className="fill-interactive-container">
      <div className="fill-sentence-area" style={{ marginBottom: 24, fontSize: '18px', fontWeight: 600, lineHeight: 1.8 }}>
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <span
                className={`blank-slot-inline ${slots[i] ? 'filled' : 'empty'}`}
                onClick={() => slots[i] && clearSlot(i)}
                style={{ cursor: slots[i] ? 'pointer' : 'default' }}
                id={`slot-${q.id}-${i}`}
              >
                {slots[i] ?? '____'}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="fill-options" style={{ justifyContent: 'center', marginBottom: 24 }}>
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

      <button
        id={`fb-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!allFilled || submitted}
        style={{ width: '100%' }}
      >
        SUBMIT
      </button>
    </div>
  )
}

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

function OpenTextInput({
  q, onSubmit, placeholder,
}: { q: Question; onSubmit: (a: string) => Promise<void>; placeholder?: string }) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const doSubmit = () => {
    if (!text.trim() || submitted) return
    setSubmitted(true)
    onSubmit(text.trim())
    // For conversational types, reset for next turn
    if (q.type === 'conversational_writing') {
      setText('')
      setSubmitted(false)
    }
  }

  return (
    <div>
      {q.image && q.type !== 'conversational_writing' && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img
            src={`/${q.image}`}
            alt="Task Sketch"
            style={{
              width: '100%',
              maxWidth: '400px',
              borderRadius: '16px',
              border: '6px solid var(--border)',
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      )}
      <textarea
        id={`ot-${q.id}`}
        className="text-area"
        placeholder={placeholder ?? 'Write your answer here…'}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={submitted && q.type !== 'conversational_writing'}
        rows={q.type === 'conversational_writing' ? 2 : 4}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && q.type === 'conversational_writing') {
            e.preventDefault()
            doSubmit()
          }
        }}
      />
      <button
        id={`ot-submit-${q.id}`}
        className="btn-primary"
        onClick={doSubmit}
        disabled={!text.trim() || (submitted && q.type !== 'conversational_writing')}
      >
        {q.type === 'conversational_writing' ? 'Send →' : 'Submit'}
      </button>
    </div>
  )
}

function SpeechInput({ q, onSubmit }: { q: Question; onSubmit: (b: Blob) => Promise<void> }) {
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
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

// ─── Results Screen (keeping existing) ────────────────────────────────────────

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0
}

function gradeLabel(score: number) {
  if (score >= 90) return 'Superstar! 🌟 You are amazing!'
  if (score >= 75) return 'Great Job! 🎈 Keep it up!'
  if (score >= 60) return 'Well Done! 👍 You passed!'
  if (score >= 40) return 'Nice Effort! 💪 Practice makes perfect!'
  return "Keep Trying! 🌱 You can do it!"
}

const SECTION_LIST = [
  { key: 'listening' as const, label: 'Listening', icon: '🎧', cls: 's-listening' },
  { key: 'reading' as const, label: 'Reading', icon: '📖', cls: 's-reading' },
  { key: 'writing' as const, label: 'Writing', icon: '✍️', cls: 's-writing' },
  { key: 'speaking' as const, label: 'Speaking', icon: '🎤', cls: 's-speaking' },
]

function ScoreRing({ score }: { score: number }) {
  const r = 56
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color =
    score >= 80 ? 'var(--accent-green)' :
      score >= 50 ? 'var(--accent-yellow)' :
        'var(--accent-red)'

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
  speakingResult: AnswerResult | null
  writingResult: AnswerResult | null
  onRestart: () => void
}

function ResultsScreen({ name, grade, finalScore, sectionScores, speakingResult, writingResult, onRestart }: ResultsProps) {
  const rounded = Math.round(finalScore)

  const attempted = SECTION_LIST.filter(s => sectionScores[s.key].length > 0);
  const isSingleSection = attempted.length === 1;
  const singleSection = isSingleSection ? attempted[0] : null;

  return (
    <div>
      <div className="results-hero">
        <div className="stars">✨✨✨</div>
        <ScoreRing score={rounded} />
        <p className="results-name">{name}</p>
        <p className="results-class">Class {grade} · Quto Quest Adventure</p>
        <p style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: 'var(--accent-green)', padding: '0 20px', lineHeight: 1.5 }}>
          {isSingleSection && (singleSection?.key === 'speaking' ? speakingResult?.feedback : writingResult?.feedback)
            ? `Quto's Report: "${singleSection?.key === 'speaking' ? speakingResult?.feedback : writingResult?.feedback}"`
            : gradeLabel(rounded)}
        </p>
      </div>

      <div className="divider" />

      {/* If it's a single section (like Speaking only or Writing only) */}
      {isSingleSection && singleSection ? (
        <div className={`${singleSection.key}-detailed-result`} style={{ animation: 'slideUp 0.6s ease both' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 20 }}>
            {singleSection.label} Performance
          </p>

          {/* Detailed metrics box (Specific to Speaking) */}
          {singleSection.key === 'speaking' && speakingResult && (
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: 24 }}>
              <div className="metric-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🎯</div>
                <div className="metric-label">Accuracy</div>
                <div className="metric-value blue">{speakingResult.avg_accuracy}%</div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🌊</div>
                <div className="metric-label">Fluency</div>
                <div className="metric-value purple">{speakingResult.avg_fluency}%</div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>✅</div>
                <div className="metric-label">Completeness</div>
                <div className="metric-value green">{speakingResult.avg_completeness}%</div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🗣️</div>
                <div className="metric-label">Pronunciation</div>
                <div className="metric-value amber">{speakingResult.avg_pronunciation}%</div>
              </div>
            </div>
          )}

          {/* Simple score box (Only show if NOT single section to avoid duplication with the big ring) */}
          {!isSingleSection && (
            <div className="section-scores" style={{ marginBottom: 24 }}>
              <div className="section-score-card" style={{ width: '100%', maxWidth: 'none' }}>
                <div className="section-score-icon">{singleSection.icon}</div>
                <div className="section-score-name">{singleSection.label} Score</div>
                <div className={`section-score-value ${singleSection.cls}`}>
                  {avg(sectionScores[singleSection.key])}
                </div>
              </div>
            </div>
          )}

          {/* AI Feedback (if available) */}
          {(singleSection.key === 'speaking' ? speakingResult?.feedback : writingResult?.feedback) && (
            <div className="ai-feedback-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>{singleSection.key === 'speaking' ? '🤖' : '🪶'}</span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--accent-purple)' }}>
                  {singleSection.key === 'speaking' ? "Sam's Improvement Guide" : "Quto's Writing Tips"}
                </h3>
              </div>
              <p style={{ fontSize: '15px', color: 'var(--text-main)', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>
                &quot;{singleSection.key === 'speaking' ? speakingResult?.feedback : writingResult?.feedback}&quot;
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
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

          {/* Show combined feedback if multi-section has them */}
          {writingResult?.feedback && (
            <div className="ai-feedback-box" style={{ marginTop: 24 }}>
              <p style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Writing Insight</p>
              <p style={{ fontSize: '15px', fontStyle: 'italic' }}>&quot;{writingResult.feedback}&quot;</p>
            </div>
          )}
        </>
      )}

      <div className="divider" />

      <button id="btn-restart" className="btn-primary" onClick={onRestart}>
        🔄 Play Again!
      </button>
    </div>
  )
}