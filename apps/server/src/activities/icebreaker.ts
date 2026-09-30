import type { ActivityAction, ActivityConfig, IcebreakerView } from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

export interface IcebreakerState {
  phase: 'collecting' | 'answering' | 'revealed' | 'done'
  /** One question per author, collected from everyone before the rotation starts. */
  questions: Map<string, string>
  order: string[]
  currentIndex: number
  /** Answers for the current round only; cleared on 'next'. */
  answers: Map<string, string>
}

function currentAuthorId(state: IcebreakerState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current question')
  return id
}

export const icebreaker: ActivityDefinition<IcebreakerState, IcebreakerView> = {
  type: 'icebreaker',

  create(config: ActivityConfig): IcebreakerState {
    if (config.type !== 'icebreaker') throw new ActivityError('Invalid config')
    return {
      phase: 'collecting',
      questions: new Map(),
      order: [],
      currentIndex: 0,
      answers: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'icebreaker/submit-question':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Questions are closed — the game has started')
        state.questions.set(actor.id, action.question)
        return
      case 'icebreaker/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.questions.size === 0) throw new ActivityError('No questions submitted yet')
        state.order = shuffle([...state.questions.keys()])
        state.currentIndex = 0
        state.answers.clear()
        state.phase = 'answering'
        return
      case 'icebreaker/submit':
        requireActive(actor, ctx)
        if (state.phase !== 'answering') throw new ActivityError('Answers are closed right now')
        state.answers.set(actor.id, action.text)
        return
      case 'icebreaker/reveal':
        requireHost(actor)
        if (state.phase !== 'answering') throw new ActivityError('Nothing to reveal')
        if (state.answers.size === 0) throw new ActivityError('No answers to reveal yet')
        state.phase = 'revealed'
        return
      case 'icebreaker/next':
        requireHost(actor)
        if (state.phase !== 'revealed') throw new ActivityError('Reveal the current round first')
        state.currentIndex += 1
        state.answers.clear()
        state.phase = state.currentIndex >= state.order.length ? 'done' : 'answering'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId): IcebreakerView {
    const inRound = state.phase === 'answering' || state.phase === 'revealed'
    return {
      type: 'icebreaker',
      phase: state.phase,
      submittedQuestionIds: [...state.questions.keys()],
      yourQuestion: viewerId ? (state.questions.get(viewerId) ?? null) : null,
      round: inRound
        ? {
            number: state.currentIndex + 1,
            total: state.order.length,
            authorId: currentAuthorId(state),
            question: state.questions.get(currentAuthorId(state)) ?? '',
            submittedIds: [...state.answers.keys()],
            yourAnswer: viewerId ? (state.answers.get(viewerId) ?? null) : null,
            answers:
              state.phase === 'revealed'
                ? [...state.answers].map(([participantId, text]) => ({ participantId, text }))
                : null,
          }
        : null,
    }
  },
}
