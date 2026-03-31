// ── Question types mirroring the backend ──────────────────────────────────

export type QuestionSection = 'listening' | 'reading' | 'writing' | 'speaking'

export type QuestionType =
  | 'mcq'
  | 'tap_wrong_word'
  | 'fill_blank'
  | 'sentence_build'
  | 'rewrite'
  | 'open_text'
  | 'speech'

export interface Question {
  id: number
  section: QuestionSection
  type: QuestionType
  question: string
  // optional fields per type
  audio_script?: string
  options?: string[]
  blanks?: number
  words?: string[]
  hint?: string
  sentence?: string
  forbidden_words?: string[]
}

export interface AnswerResult {
  score: number
  is_correct?: boolean
  feedback: string
  correct_count?: number
  total_blanks?: number
  spoken?: string
  pronunciation_accuracy?: number
  fluency?: number
  language_score?: number
  relevance_score?: number
}

export interface StartResponse {
  session_id: string
  question: Question
  total: number
}

export interface AnswerResponse {
  done: boolean
  result: AnswerResult
  next_question?: Question
  progress?: { current: number; total: number }
  final_score?: number
}

export interface SectionScoreMap {
  listening: number[]
  reading: number[]
  writing: number[]
  speaking: number[]
}
