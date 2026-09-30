import type { ActivityAction, ActivityConfig, HerdView } from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

export interface HerdState {
  phase: 'collecting' | 'answering' | 'revealed' | 'results'
  prompts: Map<string, string>
  order: string[]
  currentIndex: number
  answers: Map<string, string>
  scores: Map<string, number>
}

/** "Cold  Pizza!" and "cold pizza" should land in the same herd. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function currentAuthorId(state: HerdState): string {
  const id = state.order[state.currentIndex]
  if (!id) throw new ActivityError('No current prompt')
  return id
}

function buildGroups(state: HerdState): { answer: string; participantIds: string[] }[] {
  const groups = new Map<string, { answer: string; participantIds: string[] }>()
  for (const [pid, text] of state.answers) {
    const key = normalizeAnswer(text)
    const group = groups.get(key)
    if (group) group.participantIds.push(pid)
    else groups.set(key, { answer: text, participantIds: [pid] })
  }
  return [...groups.values()].sort((a, b) => b.participantIds.length - a.participantIds.length)
}

export const herd: ActivityDefinition<HerdState, HerdView> = {
  type: 'herd',

  create(config: ActivityConfig): HerdState {
    if (config.type !== 'herd') throw new ActivityError('Invalid config')
    return {
      phase: 'collecting',
      prompts: new Map(),
      order: [],
      currentIndex: 0,
      answers: new Map(),
      scores: new Map(),
    }
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'herd/submit-prompt':
        requireActive(actor, ctx)
        if (state.phase !== 'collecting')
          throw new ActivityError('Prompts are closed — the game has started')
        state.prompts.set(actor.id, action.prompt)
        return
      case 'herd/start':
        requireHost(actor)
        if (state.phase !== 'collecting') throw new ActivityError('Already started')
        if (state.prompts.size === 0) throw new ActivityError('No prompts submitted yet')
        state.order = shuffle([...state.prompts.keys()])
        state.currentIndex = 0
        state.answers.clear()
        state.phase = 'answering'
        return
      case 'herd/answer':
        requireActive(actor, ctx)
        if (state.phase !== 'answering') throw new ActivityError('Answers are closed right now')
        state.answers.set(actor.id, action.text)
        return
      case 'herd/reveal': {
        requireHost(actor)
        if (state.phase !== 'answering') throw new ActivityError('Nothing to reveal')
        if (state.answers.size === 0) throw new ActivityError('No answers to reveal yet')
        const groups = buildGroups(state)
        const biggest = groups[0]?.participantIds.length ?? 0
        // Everyone in a group of the winning size scores; a lone answer never does.
        if (biggest >= 2)
          for (const group of groups)
            if (group.participantIds.length === biggest)
              for (const pid of group.participantIds)
                state.scores.set(pid, (state.scores.get(pid) ?? 0) + 1)
        state.phase = 'revealed'
        return
      }
      case 'herd/next':
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

  view(state, viewerId, ctx): HerdView {
    const inRound = state.phase === 'answering' || state.phase === 'revealed'
    let winnerIds: string[] = []
    let groups: { answer: string; participantIds: string[] }[] = []
    if (state.phase === 'revealed') {
      groups = buildGroups(state)
      const biggest = groups[0]?.participantIds.length ?? 0
      if (biggest >= 2)
        winnerIds = groups
          .filter((g) => g.participantIds.length === biggest)
          .flatMap((g) => g.participantIds)
    }
    return {
      type: 'herd',
      phase: state.phase,
      submittedPromptIds: [...state.prompts.keys()],
      yourPrompt: viewerId ? (state.prompts.get(viewerId) ?? null) : null,
      round: inRound
        ? {
            number: state.currentIndex + 1,
            total: state.order.length,
            authorId: currentAuthorId(state),
            prompt: state.prompts.get(currentAuthorId(state)) ?? '',
            submittedIds: [...state.answers.keys()],
            yourAnswer: viewerId ? (state.answers.get(viewerId) ?? null) : null,
            reveal: state.phase === 'revealed' ? { groups, winnerIds } : null,
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
