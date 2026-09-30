import type { ActivityAction, ActivityConfig, TwoTruthsView } from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

interface Submission {
  /** Statements pre-shuffled at submission time so display order never hints at the lie. */
  statements: string[]
  lieIndex: number
}

export interface TwoTruthsState {
  phase: 'collecting' | 'presenting' | 'results'
  submissions: Map<string, Submission>
  order: string[]
  currentIndex: number
  subPhase: 'voting' | 'revealed'
  /** Votes for the current target only; cleared on 'next'. */
  votes: Map<string, number>
  scores: Map<string, number>
}

function currentTargetId(state: TwoTruthsState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current turn')
  return id
}

export const twoTruths: ActivityDefinition<TwoTruthsState, TwoTruthsView> = {
  type: 'two-truths',

  create(config: ActivityConfig): TwoTruthsState {
    if (config.type !== 'two-truths') throw new ActivityError('Invalid config')
    return {
      phase: 'collecting',
      submissions: new Map(),
      order: [],
      currentIndex: 0,
      subPhase: 'voting',
      votes: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'two-truths/submit': {
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Submissions are closed — the game has started')
        const indices = shuffle([0, 1, 2])
        state.submissions.set(actor.id, {
          statements: indices.map((i) => action.statements[i] as string),
          lieIndex: indices.indexOf(action.lieIndex),
        })
        return
      }
      case 'two-truths/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.submissions.size < 2)
          throw new ActivityError('Need at least 2 submissions to start')
        state.order = shuffle([...state.submissions.keys()])
        state.phase = 'presenting'
        state.currentIndex = 0
        state.subPhase = 'voting'
        state.votes.clear()
        return
      case 'two-truths/vote': {
        requireActive(actor, ctx)
        if (state.phase !== 'presenting' || state.subPhase !== 'voting')
          throw new ActivityError('Voting is not open')
        if (actor.id === currentTargetId(state))
          throw new ActivityError('You cannot vote on your own statements')
        state.votes.set(actor.id, action.statementIndex)
        return
      }
      case 'two-truths/reveal': {
        requireHost(actor)
        if (state.phase !== 'presenting' || state.subPhase !== 'voting')
          throw new ActivityError('Nothing to reveal')
        const submission = state.submissions.get(currentTargetId(state))
        if (!submission) throw new ActivityError('Missing submission')
        for (const [voterId, statementIndex] of state.votes) {
          if (statementIndex === submission.lieIndex)
            state.scores.set(voterId, (state.scores.get(voterId) ?? 0) + 1)
        }
        state.subPhase = 'revealed'
        return
      }
      case 'two-truths/next':
        requireHost(actor)
        if (state.phase !== 'presenting' || state.subPhase !== 'revealed')
          throw new ActivityError('Reveal the current turn first')
        state.currentIndex += 1
        state.votes.clear()
        state.subPhase = 'voting'
        if (state.currentIndex >= state.order.length) state.phase = 'results'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId): TwoTruthsView {
    const presenting = state.phase === 'presenting'
    const targetId = presenting ? state.order[state.currentIndex] : undefined
    const submission = targetId ? state.submissions.get(targetId) : undefined
    const revealed = state.subPhase === 'revealed'
    return {
      type: 'two-truths',
      phase: state.phase,
      submittedIds: [...state.submissions.keys()],
      youSubmitted: viewerId ? state.submissions.has(viewerId) : false,
      current:
        presenting && targetId && submission
          ? {
              targetId,
              statements: submission.statements,
              subPhase: state.subPhase,
              yourVote: viewerId ? (state.votes.get(viewerId) ?? null) : null,
              votedIds: [...state.votes.keys()],
              lieIndex: revealed ? submission.lieIndex : null,
              votes: revealed
                ? [...state.votes].map(([participantId, statementIndex]) => ({
                    participantId,
                    statementIndex,
                  }))
                : null,
            }
          : null,
      remainingTargetIds: presenting ? state.order.slice(state.currentIndex + 1) : [],
      scores: [...state.scores]
        .map(([participantId, score]) => ({ participantId, score }))
        .sort((x, y) => y.score - x.score),
    }
  },
}
