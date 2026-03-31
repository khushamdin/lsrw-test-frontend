'use client'

import { useState, useRef } from 'react'
import type { Question, AnswerResult } from '@/lib/types'
import { apiAnswerSpeech } from '@/lib/api'

interface Props {
  question: Question
  sessionId: string
  onResult: (result: AnswerResult) => void
}

export default function SpeechInput({ question, sessionId, onResult }: Props) {
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)
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
      mr.start()
      mediaRef.current = mr
      setRecording(true)
    } catch {
      setError('Could not access microphone. Please allow mic access.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    setRecording(false)
  }

  const submit = async () => {
    if (!audioBlob || result || loading) return
    setLoading(true)
    try {
      const resp = await apiAnswerSpeech(sessionId, audioBlob)
      setResult(resp.result)
      onResult(resp.result)
    } catch {
      setError('Failed to evaluate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {question.forbidden_words && (
        <div className="audio-script-box" style={{ marginBottom: 16, borderColor: 'rgba(255,179,71,0.3)', background: 'rgba(255,179,71,0.07)', color: 'var(--accent-amber)' }}>
          🚫 Don&apos;t use: <strong>{question.forbidden_words.join(', ')}</strong>
        </div>
      )}

      <div className="voice-area">
        <button
          id={`record-btn-${question.id}`}
          className={`record-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          disabled={!!result || loading}
        >
          {recording ? '⏹' : '🎤'}
        </button>
        <span className={`record-label ${recording ? 'active' : ''}`}>
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
        id={`speech-submit-${question.id}`}
        className="btn-primary"
        onClick={submit}
        disabled={!audioBlob || !!result || loading || recording}
      >
        {loading ? 'Evaluating with AI…' : 'Submit Recording'}
      </button>
    </div>
  )
}
