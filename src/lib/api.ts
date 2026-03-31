import type { StartResponse, AnswerResponse } from './types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function apiStart(): Promise<StartResponse> {
  const res = await fetch(`${BASE_URL}/start`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start session')
  return res.json()
}

export async function apiAnswerText(
  sessionId: string,
  answer: string,
): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('answer', answer)
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to submit answer')
  return res.json()
}

export async function apiAnswerList(
  sessionId: string,
  answers: string[],
): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('answer_list', answers.join(','))
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to submit answer')
  return res.json()
}

export async function apiAnswerSpeech(
  sessionId: string,
  audioBlob: Blob,
): Promise<AnswerResponse> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('file', audioBlob, 'recording.webm')
  const res = await fetch(`${BASE_URL}/answer`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to submit answer')
  return res.json()
}
