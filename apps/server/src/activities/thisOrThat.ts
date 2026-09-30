import type {
  ActivityAction,
  ActivityConfig,
  ThisOrThatPair,
  ThisOrThatView,
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

export interface ThisOrThatState {
  phase: 'collecting' | 'voting' | 'closed' | 'done'
  /** One prompt+options pair per author, collected before the rotation starts. */
  pairs: Map<string, ThisOrThatPair>
  order: string[]
  currentIndex: number
  /** Votes for the current round only; cleared on 'next'. */
  votes: Map<string, 'a' | 'b'>
}

function currentAuthorId(state: ThisOrThatState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current round')
  return id
}

export const thisOrThat: ActivityDefinition<ThisOrThatState, ThisOrThatView> = {
  type: 'this-or-that',

  create(config: ActivityConfig): ThisOrThatState {
    if (config.type !== 'this-or-that') throw new ActivityError('Invalid config')
    return { phase: 'collecting', pairs: new Map(), order: [], currentIndex: 0, votes: new Map() }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'this-or-that/submit-pair':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Prompts are closed — the game has started')
        state.pairs.set(actor.id, {
          prompt: action.prompt,
          optionA: action.optionA,
          optionB: action.optionB,
        })
        return
      case 'this-or-that/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.pairs.size === 0) throw new ActivityError('No prompts submitted yet')
        state.order = shuffle([...state.pairs.keys()])
        state.currentIndex = 0
        state.votes.clear()
        state.phase = 'voting'
        return
      case 'this-or-that/vote':
        requireActive(actor, ctx)
        if (state.phase !== 'voting') throw new ActivityError('Voting is closed')
        state.votes.set(actor.id, action.choice)
        return
      case 'this-or-that/close':
        requireHost(actor)
        if (state.phase !== 'voting') throw new ActivityError('Nothing to close')
        state.phase = 'closed'
        return
      case 'this-or-that/next':
        requireHost(actor)
        if (state.phase !== 'closed') throw new ActivityError('Close the current round first')
        state.currentIndex += 1
        state.votes.clear()
        state.phase = state.currentIndex >= state.order.length ? 'done' : 'voting'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId): ThisOrThatView {
    const inRound = state.phase === 'voting' || state.phase === 'closed'
    const pair = inRound ? state.pairs.get(currentAuthorId(state)) : undefined
    const entries = [...state.votes]
    return {
      type: 'this-or-that',
      phase: state.phase,
      submittedPairIds: [...state.pairs.keys()],
      yourPair: viewerId ? (state.pairs.get(viewerId) ?? null) : null,
      round:
        inRound && pair
          ? {
              number: state.currentIndex + 1,
              total: state.order.length,
              authorId: currentAuthorId(state),
              prompt: pair.prompt,
              optionA: pair.optionA,
              optionB: pair.optionB,
              counts: {
                a: entries.filter(([, v]) => v === 'a').length,
                b: entries.filter(([, v]) => v === 'b').length,
              },
              yourVote: viewerId ? (state.votes.get(viewerId) ?? null) : null,
              votersByOption:
                state.phase === 'closed'
                  ? {
                      a: entries.filter(([, v]) => v === 'a').map(([id]) => id),
                      b: entries.filter(([, v]) => v === 'b').map(([id]) => id),
                    }
                  : null,
            }
          : null,
    }
  },
}
