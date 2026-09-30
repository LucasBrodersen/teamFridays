import {
  UNDERCOVER_WORD_PAIRS,
  type ActivityAction,
  type ActivityConfig,
  type UndercoverView,
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

export interface UndercoverState {
  phase: 'clues' | 'voting' | 'revealed'
  citizenWord: string
  imposterWord: string
  imposterIds: Set<string>
  /** participantId -> their word. Only their own entry may ever reach a client. */
  words: Map<string, string>
  clues: Map<string, string>
  votes: Map<string, string>
  winner: 'citizens' | 'imposters' | null
}

function imposterCountFor(players: number): number {
  if (players >= 13) return 3
  if (players >= 7) return 2
  return 1
}

function deal(ctx: ActivityCtx): UndercoverState {
  if (ctx.activeIds.length < 4) throw new ActivityError('Need at least 4 players')
  const pair = UNDERCOVER_WORD_PAIRS[Math.floor(Math.random() * UNDERCOVER_WORD_PAIRS.length)]!
  // Either word can be the imposter word, so knowing the list gives nothing away.
  const [citizenWord, imposterWord] = Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a]
  const shuffled = shuffle(ctx.activeIds)
  const imposterIds = new Set(shuffled.slice(0, imposterCountFor(ctx.activeIds.length)))
  const words = new Map<string, string>()
  for (const id of ctx.activeIds) words.set(id, imposterIds.has(id) ? imposterWord : citizenWord)
  return {
    phase: 'clues',
    citizenWord,
    imposterWord,
    imposterIds,
    words,
    clues: new Map(),
    votes: new Map(),
    winner: null,
  }
}

export const undercover: ActivityDefinition<UndercoverState, UndercoverView> = {
  type: 'undercover',

  create(config: ActivityConfig, ctx: ActivityCtx): UndercoverState {
    if (config.type !== 'undercover') throw new ActivityError('Invalid config')
    return deal(ctx)
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'undercover/clue':
        requireActive(actor, ctx)
        if (state.phase !== 'clues') throw new ActivityError('Clues are closed')
        if (!state.words.has(actor.id)) throw new ActivityError('You are not in this round')
        state.clues.set(actor.id, action.text)
        return
      case 'undercover/to-voting':
        requireHost(actor)
        if (state.phase !== 'clues') throw new ActivityError('Already voting')
        if (state.clues.size === 0) throw new ActivityError('No clues submitted yet')
        state.phase = 'voting'
        return
      case 'undercover/vote':
        requireActive(actor, ctx)
        if (state.phase !== 'voting') throw new ActivityError('Voting is not open')
        if (!state.words.has(action.suspectId)) throw new ActivityError('Unknown suspect')
        if (action.suspectId === actor.id) throw new ActivityError('Voting for yourself? Bold.')
        state.votes.set(actor.id, action.suspectId)
        return
      case 'undercover/reveal': {
        requireHost(actor)
        if (state.phase !== 'voting') throw new ActivityError('Nothing to reveal')
        if (state.votes.size === 0) throw new ActivityError('No votes yet')
        const tally = new Map<string, number>()
        for (const suspectId of state.votes.values())
          tally.set(suspectId, (tally.get(suspectId) ?? 0) + 1)
        const top = Math.max(...tally.values())
        const topVoted = [...tally].filter(([, n]) => n === top).map(([id]) => id)
        // Citizens must agree on a single imposter; a split vote lets them slip away.
        state.winner =
          topVoted.length === 1 && state.imposterIds.has(topVoted[0] as string)
            ? 'citizens'
            : 'imposters'
        state.phase = 'revealed'
        return
      }
      case 'undercover/restart':
        requireHost(actor)
        Object.assign(state, deal(ctx))
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId): UndercoverView {
    let topVotedIds: string[] = []
    if (state.phase === 'revealed') {
      const tally = new Map<string, number>()
      for (const suspectId of state.votes.values())
        tally.set(suspectId, (tally.get(suspectId) ?? 0) + 1)
      const top = Math.max(...tally.values())
      topVotedIds = [...tally].filter(([, n]) => n === top).map(([id]) => id)
    }
    return {
      type: 'undercover',
      phase: state.phase,
      yourWord: viewerId ? (state.words.get(viewerId) ?? null) : null,
      imposterCount: state.imposterIds.size,
      cluesSubmittedIds: [...state.clues.keys()],
      clues:
        state.phase === 'clues'
          ? null
          : [...state.clues].map(([participantId, text]) => ({ participantId, text })),
      votedIds: [...state.votes.keys()],
      yourVote: viewerId ? (state.votes.get(viewerId) ?? null) : null,
      reveal:
        state.phase === 'revealed' && state.winner
          ? {
              imposterIds: [...state.imposterIds],
              citizenWord: state.citizenWord,
              imposterWord: state.imposterWord,
              votes: [...state.votes].map(([voterId, suspectId]) => ({ voterId, suspectId })),
              topVotedIds,
              winner: state.winner,
            }
          : null,
    }
  },
}
