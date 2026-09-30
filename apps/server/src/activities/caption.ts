import { CAPTION_PROMPTS, type ActivityAction, type ActivityConfig, type CaptionView } from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

export interface CaptionState {
  phase: 'collecting' | 'voting' | 'revealed' | 'results'
  prompt: string
  captions: Map<string, string>
  /** Author-id pairs, one head-to-head per round. */
  pairs: [string, string][]
  currentIndex: number
  /** With an odd caption count, this caption challenges the last winner at the end. */
  leftoverId: string | null
  lastWinnerId: string | null
  votes: Map<string, 'a' | 'b'>
  /**
   * An author's score is their best vote count in any single matchup — so a
   * caption appearing twice (title defence) can improve it but never stack it.
   */
  scores: Map<string, number>
}

function randomPrompt(): string {
  return CAPTION_PROMPTS[Math.floor(Math.random() * CAPTION_PROMPTS.length)] ?? ''
}

function currentPair(state: CaptionState): [string, string] {
  const pair = state.pairs[state.currentIndex]
  if (!pair) throw new ActivityError('No current matchup')
  return pair
}

export const caption: ActivityDefinition<CaptionState, CaptionView> = {
  type: 'caption',

  create(config: ActivityConfig): CaptionState {
    if (config.type !== 'caption') throw new ActivityError('Invalid config')
    return {
      phase: 'collecting',
      prompt: randomPrompt(),
      captions: new Map(),
      pairs: [],
      currentIndex: 0,
      leftoverId: null,
      lastWinnerId: null,
      votes: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'caption/submit':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Captions are closed — the battle has started')
        state.captions.set(actor.id, action.text)
        return
      case 'caption/start': {
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.captions.size < 2) throw new ActivityError('Need at least 2 captions to battle')
        const order = shuffle([...state.captions.keys()])
        state.pairs = []
        for (let i = 0; i + 1 < order.length; i += 2)
          state.pairs.push([order[i] as string, order[i + 1] as string])
        // Odd caption out? It challenges the reigning winner in a final
        // king-of-the-hill matchup, decided once the last fixed pair resolves.
        state.leftoverId = order.length % 2 === 1 ? (order[order.length - 1] as string) : null
        state.lastWinnerId = null
        state.currentIndex = 0
        state.votes.clear()
        state.phase = 'voting'
        return
      }
      case 'caption/vote':
        requireActive(actor, ctx)
        if (state.phase !== 'voting') throw new ActivityError('Voting is closed')
        state.votes.set(actor.id, action.choice)
        return
      case 'caption/reveal': {
        requireHost(actor)
        if (state.phase !== 'voting') throw new ActivityError('Nothing to reveal')
        if (state.votes.size === 0) throw new ActivityError('No votes yet')
        const [authorA, authorB] = currentPair(state)
        const a = [...state.votes.values()].filter((v) => v === 'a').length
        const b = state.votes.size - a
        state.scores.set(authorA, Math.max(state.scores.get(authorA) ?? 0, a))
        state.scores.set(authorB, Math.max(state.scores.get(authorB) ?? 0, b))
        state.lastWinnerId =
          a > b ? authorA : b > a ? authorB : Math.random() < 0.5 ? authorA : authorB
        state.phase = 'revealed'
        return
      }
      case 'caption/next':
        requireHost(actor)
        if (state.phase !== 'revealed') throw new ActivityError('Reveal the current round first')
        // The odd caption enters now, against whoever just won.
        if (state.leftoverId && state.currentIndex === state.pairs.length - 1 && state.lastWinnerId) {
          state.pairs.push([state.leftoverId, state.lastWinnerId])
          state.leftoverId = null
        }
        state.currentIndex += 1
        state.votes.clear()
        state.phase = state.currentIndex >= state.pairs.length ? 'results' : 'voting'
        return
      case 'caption/restart':
        // A fresh prompt and fresh captions; scores carry over across rounds.
        requireHost(actor)
        if (state.phase !== 'results') throw new ActivityError('Finish the current battle first')
        state.prompt = randomPrompt()
        state.captions.clear()
        state.pairs = []
        state.currentIndex = 0
        state.leftoverId = null
        state.lastWinnerId = null
        state.votes.clear()
        state.phase = 'collecting'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  view(state, viewerId, ctx): CaptionView {
    const inRound = state.phase === 'voting' || state.phase === 'revealed'
    const pair = inRound ? currentPair(state) : null
    const entries = [...state.votes]
    return {
      type: 'caption',
      phase: state.phase,
      prompt: state.prompt,
      submittedIds: [...state.captions.keys()],
      youSubmitted: viewerId ? state.captions.has(viewerId) : false,
      round:
        inRound && pair
          ? {
              number: state.currentIndex + 1,
              total: state.pairs.length + (state.leftoverId ? 1 : 0),
              captionA: state.captions.get(pair[0]) ?? '',
              captionB: state.captions.get(pair[1]) ?? '',
              votedIds: entries.map(([id]) => id),
              yourVote: viewerId ? (state.votes.get(viewerId) ?? null) : null,
              reveal:
                state.phase === 'revealed'
                  ? {
                      counts: {
                        a: entries.filter(([, v]) => v === 'a').length,
                        b: entries.filter(([, v]) => v === 'b').length,
                      },
                      authorAId: pair[0],
                      authorBId: pair[1],
                      winner: (() => {
                        const a = entries.filter(([, v]) => v === 'a').length
                        const b = entries.length - a
                        return a === b ? 'tie' : a > b ? 'a' : 'b'
                      })(),
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
