export interface PublicParticipant {
  id: string
  name: string
  isHost: boolean
  connected: boolean
  spectator: boolean
}

export interface RoomSnapshot {
  code: string
  you: {
    participantId: string
    isHost: boolean
    spectator: boolean
  }
  participants: PublicParticipant[]
  activity: ActivityView | null
}

import type { SnowfightTeam } from './snowfight'

export type ActivityType =
  | 'icebreaker'
  | 'this-or-that'
  | 'two-truths'
  | 'snowfight'
  | 'how-many'
  | 'whose-fact'
  | 'herd'
  | 'caption'
  | 'undercover'
  | 'wavelength'
  | 'territory'

// ---------- Activity configs (sent by the host on activity:start) ----------

export interface IcebreakerConfig {
  type: 'icebreaker'
}

export interface ThisOrThatConfig {
  type: 'this-or-that'
}

export interface TwoTruthsConfig {
  type: 'two-truths'
}

export interface SnowfightConfig {
  type: 'snowfight'
}

export interface HowManyConfig {
  type: 'how-many'
  /** When false, reveals only show counts, never who said yes. */
  revealWho: boolean
}

export interface WhoseFactConfig {
  type: 'whose-fact'
}
export interface HerdConfig {
  type: 'herd'
}
export interface CaptionConfig {
  type: 'caption'
}
export interface UndercoverConfig {
  type: 'undercover'
}
export interface WavelengthConfig {
  type: 'wavelength'
}
export interface TerritoryConfig {
  type: 'territory'
}

export type ActivityConfig =
  | IcebreakerConfig
  | ThisOrThatConfig
  | TwoTruthsConfig
  | SnowfightConfig
  | HowManyConfig
  | WhoseFactConfig
  | HerdConfig
  | CaptionConfig
  | UndercoverConfig
  | WavelengthConfig
  | TerritoryConfig

// ---------- Activity actions (participant/host interactions) ----------

export type ActivityAction =
  | { kind: 'icebreaker/submit-question'; question: string }
  | { kind: 'icebreaker/start' }
  | { kind: 'icebreaker/submit'; text: string }
  | { kind: 'icebreaker/reveal' }
  | { kind: 'icebreaker/next' }
  | { kind: 'this-or-that/submit-pair'; prompt: string; optionA: string; optionB: string }
  | { kind: 'this-or-that/start' }
  | { kind: 'this-or-that/vote'; choice: 'a' | 'b' }
  | { kind: 'this-or-that/close' }
  | { kind: 'this-or-that/next' }
  | { kind: 'two-truths/submit'; statements: [string, string, string]; lieIndex: 0 | 1 | 2 }
  | { kind: 'two-truths/start' }
  | { kind: 'two-truths/vote'; statementIndex: number }
  | { kind: 'two-truths/reveal' }
  | { kind: 'two-truths/next' }
  | { kind: 'snowfight/start' }
  | { kind: 'snowfight/move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { kind: 'snowfight/throw'; x: number; y: number }
  | { kind: 'snowfight/build' }
  | { kind: 'snowfight/restart' }
  | { kind: 'how-many/submit-question'; question: string }
  | { kind: 'how-many/start' }
  | { kind: 'how-many/submit'; self: boolean; guess: number }
  | { kind: 'how-many/reveal' }
  | { kind: 'how-many/next' }
  | { kind: 'whose-fact/submit-fact'; text: string }
  | { kind: 'whose-fact/start' }
  | { kind: 'whose-fact/vote'; suspectId: string }
  | { kind: 'whose-fact/reveal' }
  | { kind: 'whose-fact/next' }
  | { kind: 'herd/submit-prompt'; prompt: string }
  | { kind: 'herd/start' }
  | { kind: 'herd/answer'; text: string }
  | { kind: 'herd/reveal' }
  | { kind: 'herd/next' }
  | { kind: 'caption/submit'; text: string }
  | { kind: 'caption/start' }
  | { kind: 'caption/vote'; choice: 'a' | 'b' }
  | { kind: 'caption/reveal' }
  | { kind: 'caption/next' }
  | { kind: 'caption/restart' }
  | { kind: 'undercover/clue'; text: string }
  | { kind: 'undercover/to-voting' }
  | { kind: 'undercover/vote'; suspectId: string }
  | { kind: 'undercover/reveal' }
  | { kind: 'undercover/restart' }
  | { kind: 'wavelength/clue'; text: string }
  | { kind: 'wavelength/guess'; value: number }
  | { kind: 'wavelength/reveal' }
  | { kind: 'wavelength/next' }
  | { kind: 'territory/start' }
  | { kind: 'territory/move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { kind: 'territory/restart' }

// ---------- Per-participant activity views ----------
// These are computed on the server per viewer. Hidden information (unrevealed
// answers, the lie, other people's votes) must never appear here early.

export interface IcebreakerView {
  type: 'icebreaker'
  phase: 'collecting' | 'answering' | 'revealed' | 'done'
  submittedQuestionIds: string[]
  yourQuestion: string | null
  round: {
    number: number
    total: number
    authorId: string
    question: string
    submittedIds: string[]
    yourAnswer: string | null
    answers: { participantId: string; text: string }[] | null
  } | null
}

export interface ThisOrThatPair {
  prompt: string
  optionA: string
  optionB: string
}

export interface ThisOrThatView {
  type: 'this-or-that'
  phase: 'collecting' | 'voting' | 'closed' | 'done'
  submittedPairIds: string[]
  yourPair: ThisOrThatPair | null
  round: {
    number: number
    total: number
    authorId: string
    prompt: string
    optionA: string
    optionB: string
    counts: { a: number; b: number }
    yourVote: 'a' | 'b' | null
    votersByOption: { a: string[]; b: string[] } | null
  } | null
}

export interface TwoTruthsView {
  type: 'two-truths'
  phase: 'collecting' | 'presenting' | 'results'
  submittedIds: string[]
  youSubmitted: boolean
  current: {
    targetId: string
    statements: string[]
    subPhase: 'voting' | 'revealed'
    yourVote: number | null
    votedIds: string[]
    lieIndex: number | null
    votes: { participantId: string; statementIndex: number }[] | null
  } | null
  remainingTargetIds: string[]
  scores: { participantId: string; score: number }[]
}

export interface SnowfightView {
  type: 'snowfight'
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  /** Whole seconds left in the 3-2-1 countdown; 0 outside the countdown phase. */
  countdownSeconds: number
  secondsRemaining: number
  winner: SnowfightTeam | 'draw' | null
  players: {
    id: string
    team: SnowfightTeam
    x: number
    y: number
    hp: number
    frozen: boolean
    hits: number
    /** Set while the player is rooted, building a barrier. */
    building: { progress: number; x: number; y: number } | null
  }[]
  snowballs: { id: number; x: number; y: number; team: SnowfightTeam }[]
  barriers: { id: number; team: SnowfightTeam; x: number; y: number; hp: number }[]
}

export interface HowManyRoundResults {
  actualCount: number
  totalAnswered: number
  guesses: { participantId: string; guess: number }[]
  closestIds: string[]
  /** Null when the host disabled revealing who said yes. */
  yesIds: string[] | null
}

export interface HowManyView {
  type: 'how-many'
  phase: 'collecting' | 'answering' | 'revealed' | 'results'
  revealWho: boolean
  /** Collecting phase: who has handed in a question; your own is echoed back. */
  submittedQuestionIds: string[]
  yourQuestion: string | null
  /** The current rotation round; null while collecting and on the final results. */
  round: {
    number: number
    total: number
    authorId: string
    question: string
    submittedIds: string[]
    yours: { self: boolean; guess: number } | null
    results: HowManyRoundResults | null
  } | null
  /** Closest-guess points; one per round, ties all score. */
  scores: { participantId: string; score: number }[]
}

export interface WhoseFactView {
  type: 'whose-fact'
  phase: 'collecting' | 'guessing' | 'revealed' | 'results'
  submittedIds: string[]
  youSubmitted: boolean
  round: {
    number: number
    total: number
    /** The fact on display — its author stays hidden until the reveal. */
    fact: string
    /** Who to suspect: the author plus sampled decoys, shuffled. */
    options: string[]
    youAreAuthor: boolean
    votedIds: string[]
    yourVote: string | null
    reveal: {
      authorId: string
      votes: { voterId: string; suspectId: string }[]
      correctIds: string[]
    } | null
  } | null
  scores: { participantId: string; score: number }[]
}

export interface HerdView {
  type: 'herd'
  phase: 'collecting' | 'answering' | 'revealed' | 'results'
  submittedPromptIds: string[]
  yourPrompt: string | null
  round: {
    number: number
    total: number
    authorId: string
    prompt: string
    submittedIds: string[]
    yourAnswer: string | null
    reveal: {
      groups: { answer: string; participantIds: string[] }[]
      winnerIds: string[]
    } | null
  } | null
  scores: { participantId: string; score: number }[]
}

export interface CaptionView {
  type: 'caption'
  phase: 'collecting' | 'voting' | 'revealed' | 'results'
  prompt: string
  submittedIds: string[]
  youSubmitted: boolean
  round: {
    number: number
    total: number
    captionA: string
    captionB: string
    votedIds: string[]
    yourVote: 'a' | 'b' | null
    reveal: {
      counts: { a: number; b: number }
      authorAId: string
      authorBId: string
      winner: 'a' | 'b' | 'tie'
    } | null
  } | null
  scores: { participantId: string; score: number }[]
}

export interface UndercoverView {
  type: 'undercover'
  phase: 'clues' | 'voting' | 'revealed'
  /** Your secret word; null for spectators. Nobody is told which side they are on. */
  yourWord: string | null
  imposterCount: number
  cluesSubmittedIds: string[]
  /** All clues, only shown once the host opens the vote. */
  clues: { participantId: string; text: string }[] | null
  votedIds: string[]
  yourVote: string | null
  reveal: {
    imposterIds: string[]
    citizenWord: string
    imposterWord: string
    votes: { voterId: string; suspectId: string }[]
    topVotedIds: string[]
    winner: 'citizens' | 'imposters'
  } | null
}

export interface WavelengthView {
  type: 'wavelength'
  phase: 'cluing' | 'guessing' | 'revealed' | 'results'
  round: {
    number: number
    total: number
    giverId: string
    youAreGiver: boolean
    spectrum: { left: string; right: string }
    clue: string | null
    /** 0-100; only the clue-giver sees it before the reveal. */
    target: number | null
    guessedIds: string[]
    yourGuess: number | null
    reveal: {
      target: number
      guesses: { participantId: string; value: number }[]
      closestIds: string[]
      giverScored: boolean
    } | null
  } | null
  scores: { participantId: string; score: number }[]
}

export interface TerritoryView {
  type: 'territory'
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  countdownSeconds: number
  secondsRemaining: number
  players: { id: string; team: SnowfightTeam; x: number; y: number }[]
  /** One char per cell, row-major: '0' unpainted, '1' red, '2' blue. */
  grid: string
  counts: { red: number; blue: number }
  winner: SnowfightTeam | 'draw' | null
}

export type ActivityView =
  | IcebreakerView
  | ThisOrThatView
  | TwoTruthsView
  | SnowfightView
  | HowManyView
  | WhoseFactView
  | HerdView
  | CaptionView
  | UndercoverView
  | WavelengthView
  | TerritoryView
