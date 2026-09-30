import type {
  ActivityAction,
  ActivityConfig,
  HowManyRoundResults,
  HowManyView,
} from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

interface Answer {
  self: boolean
  guess: number
}

export interface HowManyState {
  revealWho: boolean
  phase: 'collecting' | 'answering' | 'revealed' | 'results'
  /** One question per author, collected from everyone before the rotation starts. */
  questions: Map<string, string>
  /** Author ids in play order, fixed (shuffled) when the host starts. */
  order: string[]
  currentIndex: number
  /** Answers for the current round only; cleared on 'next'. */
  answers: Map<string, Answer>
  scores: Map<string, number>
}

function currentAuthorId(state: HowManyState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current question')
  return id
}

function roundResults(state: HowManyState): HowManyRoundResults {
  const entries = [...state.answers]
  const actualCount = entries.filter(([, a]) => a.self).length
  const closestDistance = Math.min(...entries.map(([, a]) => Math.abs(a.guess - actualCount)))
  return {
    actualCount,
    totalAnswered: entries.length,
    guesses: entries.map(([participantId, a]) => ({ participantId, guess: a.guess })),
    closestIds: entries
      .filter(([, a]) => Math.abs(a.guess - actualCount) === closestDistance)
      .map(([id]) => id),
    yesIds: state.revealWho ? entries.filter(([, a]) => a.self).map(([id]) => id) : null,
  }
}

export const howMany: ActivityDefinition<HowManyState, HowManyView> = {
  type: 'how-many',

  create(config: ActivityConfig): HowManyState {
    if (config.type !== 'how-many') throw new ActivityError('Invalid config')
    return {
      revealWho: config.revealWho,
      phase: 'collecting',
      questions: new Map(),
      order: [],
      currentIndex: 0,
      answers: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'how-many/submit-question':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Questions are closed — the game has started')
        state.questions.set(actor.id, action.question)
        return
      case 'how-many/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.questions.size === 0) throw new ActivityError('No questions submitted yet')
        state.order = shuffle([...state.questions.keys()])
        state.currentIndex = 0
        state.answers.clear()
        state.phase = 'answering'
        return
      case 'how-many/submit':
        requireActive(actor, ctx)
        if (state.phase !== 'answering') throw new ActivityError('Answers are closed right now')
        state.answers.set(actor.id, {
          self: action.self,
          guess: Math.min(Math.max(action.guess, 0), ctx.activeIds.length),
        })
        return
      case 'how-many/reveal': {
        requireHost(actor)
        if (state.phase !== 'answering') throw new ActivityError('Nothing to reveal')
        if (state.answers.size === 0) throw new ActivityError('No answers to reveal yet')
        for (const id of roundResults(state).closestIds)
          state.scores.set(id, (state.scores.get(id) ?? 0) + 1)
        state.phase = 'revealed'
        return
      }
      case 'how-many/next':
        requireHost(actor)
        if (state.phase !== 'revealed') throw new ActivityError('Reveal the current round first')
        state.currentIndex += 1
        state.answers.clear()
        state.phase = state.currentIndex >= state.order.length ? 'results' : 'answering'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId, ctx): HowManyView {
    const inRound = state.phase === 'answering' || state.phase === 'revealed'
    const own = viewerId ? state.answers.get(viewerId) : undefined
    return {
      type: 'how-many',
      phase: state.phase,
      revealWho: state.revealWho,
      submittedQuestionIds: [...state.questions.keys()],
      yourQuestion: viewerId ? (state.questions.get(viewerId) ?? null) : null,
      round: inRound
        ? {
            number: state.currentIndex + 1,
            total: state.order.length,
            authorId: currentAuthorId(state),
            question: state.questions.get(currentAuthorId(state)) ?? '',
            submittedIds: [...state.answers.keys()],
            yours: own ? { self: own.self, guess: own.guess } : null,
            results: state.phase === 'revealed' ? roundResults(state) : null,
          }
        : null,
      scores:
        state.phase === 'results'
          ? ctx.activeIds
              .map((participantId) => ({
                participantId,
                score: state.scores.get(participantId) ?? 0,
              }))
              .sort((a, b) => b.score - a.score)
          : [...state.scores]
              .map(([participantId, score]) => ({ participantId, score }))
              .sort((a, b) => b.score - a.score),
    }
  },
}
