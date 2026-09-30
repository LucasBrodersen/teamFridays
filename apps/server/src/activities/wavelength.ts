import {
  WAVELENGTH_SPECTRUMS,
  type ActivityAction,
  type ActivityConfig,
  type WavelengthView,
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

interface Round {
  giverId: string
  spectrum: { left: string; right: string }
  target: number
}

export interface WavelengthState {
  phase: 'cluing' | 'guessing' | 'revealed' | 'results'
  rounds: Round[]
  currentIndex: number
  clue: string | null
  guesses: Map<string, number>
  scores: Map<string, number>
}

const GIVER_BONUS_DISTANCE = 10

function currentRound(state: WavelengthState): Round {
  const round = state.rounds[state.currentIndex]
  if (!round) throw new ActivityError('No current round')
  return round
}

export const wavelength: ActivityDefinition<WavelengthState, WavelengthView> = {
  type: 'wavelength',

  create(config: ActivityConfig, ctx: ActivityCtx): WavelengthState {
    if (config.type !== 'wavelength') throw new ActivityError('Invalid config')
    if (ctx.activeIds.length < 3) throw new ActivityError('Need at least 3 players')
    const spectrums = shuffle(WAVELENGTH_SPECTRUMS)
    return {
      phase: 'cluing',
      rounds: shuffle(ctx.activeIds).map((giverId, i) => ({
        giverId,
        spectrum: spectrums[i % spectrums.length] as { left: string; right: string },
        target: Math.floor(Math.random() * 101),
      })),
      currentIndex: 0,
      clue: null,
      guesses: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'wavelength/clue':
        requireActive(actor, ctx)
        if (state.phase !== 'cluing') throw new ActivityError('The clue is already in')
        if (actor.id !== currentRound(state).giverId)
          throw new ActivityError('Only the clue-giver can do that')
        state.clue = action.text
        state.phase = 'guessing'
        return
      case 'wavelength/guess':
        requireActive(actor, ctx)
        if (state.phase !== 'guessing') throw new ActivityError('Guessing is not open')
        if (actor.id === currentRound(state).giverId)
          throw new ActivityError('You know the answer — no guessing')
        state.guesses.set(actor.id, action.value)
        return
      case 'wavelength/reveal': {
        requireHost(actor)
        if (state.phase !== 'guessing') throw new ActivityError('Nothing to reveal')
        if (state.guesses.size === 0) throw new ActivityError('No guesses yet')
        const round = currentRound(state)
        const closest = Math.min(
          ...[...state.guesses.values()].map((v) => Math.abs(v - round.target)),
        )
        for (const [pid, value] of state.guesses)
          if (Math.abs(value - round.target) === closest)
            state.scores.set(pid, (state.scores.get(pid) ?? 0) + 1)
        // The giver scores when their clue put someone right on the wavelength.
        if (closest <= GIVER_BONUS_DISTANCE)
          state.scores.set(round.giverId, (state.scores.get(round.giverId) ?? 0) + 1)
        state.phase = 'revealed'
        return
      }
      case 'wavelength/next':
        requireHost(actor)
        if (state.phase !== 'revealed') throw new ActivityError('Reveal the current round first')
        state.currentIndex += 1
        state.clue = null
        state.guesses.clear()
        state.phase = state.currentIndex >= state.rounds.length ? 'results' : 'cluing'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId, ctx): WavelengthView {
    const inRound = state.phase !== 'results'
    const round = inRound ? currentRound(state) : null
    const revealed = state.phase === 'revealed'
    return {
      type: 'wavelength',
      phase: state.phase,
      round: round
        ? {
            number: state.currentIndex + 1,
            total: state.rounds.length,
            giverId: round.giverId,
            youAreGiver: viewerId === round.giverId,
            spectrum: round.spectrum,
            clue: state.clue,
            target: revealed || viewerId === round.giverId ? round.target : null,
            guessedIds: [...state.guesses.keys()],
            yourGuess: viewerId ? (state.guesses.get(viewerId) ?? null) : null,
            reveal: revealed
              ? {
                  target: round.target,
                  guesses: [...state.guesses].map(([participantId, value]) => ({
                    participantId,
                    value,
                  })),
                  closestIds: (() => {
                    const closest = Math.min(
                      ...[...state.guesses.values()].map((v) => Math.abs(v - round.target)),
                    )
                    return [...state.guesses]
                      .filter(([, v]) => Math.abs(v - round.target) === closest)
                      .map(([id]) => id)
                  })(),
                  giverScored:
                    Math.min(
                      ...[...state.guesses.values()].map((v) => Math.abs(v - round.target)),
                    ) <= GIVER_BONUS_DISTANCE,
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
