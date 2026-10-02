import type { ActivityAction, ActivityConfig, WhoseFactView } from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

export interface WhoseFactState {
  phase: 'collecting' | 'guessing' | 'revealed' | 'results'
  facts: Map<string, string>
  order: string[]
  currentIndex: number
  /** Suspect choices for the current round: the author + sampled decoys. */
  options: string[]
  /** voterId -> suspected authorId, for the current round only. */
  votes: Map<string, string>
  scores: Map<string, number>
}

function currentAuthorId(state: WhoseFactState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current fact')
  return id
}

function rollOptions(state: WhoseFactState, ctx: ActivityCtx): void {
  // Everyone is a suspect, in a fresh shuffled order each round.
  state.options = state.order[state.currentIndex] ? shuffle([...ctx.activeIds]) : []
}

export const whoseFact: ActivityDefinition<WhoseFactState, WhoseFactView> = {
  type: 'whose-fact',

  create(config: ActivityConfig): WhoseFactState {
    if (config.type !== 'whose-fact') throw new ActivityError('Invalid config')
    return {
      phase: 'collecting',
      facts: new Map(),
      order: [],
      currentIndex: 0,
      options: [],
      votes: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'whose-fact/submit-fact':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Facts are closed — the game has started')
        state.facts.set(actor.id, action.text)
        return
      case 'whose-fact/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.facts.size < 2) throw new ActivityError('Need at least 2 facts to play')
        state.order = shuffle([...state.facts.keys()])
        state.currentIndex = 0
        state.votes.clear()
        state.phase = 'guessing'
        rollOptions(state, ctx)
        return
      case 'whose-fact/vote':
        requireActive(actor, ctx)
        if (state.phase !== 'guessing') throw new ActivityError('Voting is not open')
        if (actor.id === currentAuthorId(state))
          throw new ActivityError('That one is yours — sit tight and look innocent')
        if (!state.options.includes(action.suspectId))
          throw new ActivityError('Pick one of the listed names')
        state.votes.set(actor.id, action.suspectId)
        return
      case 'whose-fact/reveal': {
        requireHost(actor)
        if (state.phase !== 'guessing') throw new ActivityError('Nothing to reveal')
        if (state.votes.size === 0) throw new ActivityError('No guesses yet')
        const author = currentAuthorId(state)
        for (const [voterId, suspectId] of state.votes)
          if (suspectId === author) state.scores.set(voterId, (state.scores.get(voterId) ?? 0) + 1)
        state.phase = 'revealed'
        return
      }
      case 'whose-fact/next':
        requireHost(actor)
        if (state.phase !== 'revealed') throw new ActivityError('Reveal the current round first')
        state.currentIndex += 1
        state.votes.clear()
        state.phase = state.currentIndex >= state.order.length ? 'results' : 'guessing'
        if (state.phase === 'guessing') rollOptions(state, ctx)
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId, ctx): WhoseFactView {
    const inRound = state.phase === 'guessing' || state.phase === 'revealed'
    const author = inRound ? currentAuthorId(state) : null
    return {
      type: 'whose-fact',
      phase: state.phase,
      submittedIds: [...state.facts.keys()],
      youSubmitted: viewerId ? state.facts.has(viewerId) : false,
      round:
        inRound && author
          ? {
              number: state.currentIndex + 1,
              total: state.order.length,
              fact: state.facts.get(author) ?? '',
              options: [...state.options],
              youAreAuthor: viewerId === author,
              votedIds: [...state.votes.keys()],
              yourVote: viewerId ? (state.votes.get(viewerId) ?? null) : null,
              reveal:
                state.phase === 'revealed'
                  ? {
                      authorId: author,
                      votes: [...state.votes].map(([voterId, suspectId]) => ({
                        voterId,
                        suspectId,
                      })),
                      correctIds: [...state.votes]
                        .filter(([, suspectId]) => suspectId === author)
                        .map(([voterId]) => voterId),
                    }
                  : null,
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
