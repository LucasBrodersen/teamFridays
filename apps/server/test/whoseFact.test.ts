import { describe, expect, it } from 'vitest'
import { whoseFact, type WhoseFactState } from '../src/activities/whoseFact'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }

const actorById = (id: string): Actor =>
  [host, ana, ben].find((x) => x.id === id) as Actor

function started(): WhoseFactState {
  const state = whoseFact.create({ type: 'whose-fact' }, ctx)
  whoseFact.action(state, { kind: 'whose-fact/submit-fact', text: 'I once met a president' }, host, ctx)
  whoseFact.action(state, { kind: 'whose-fact/submit-fact', text: 'I can ride a unicycle' }, ana, ctx)
  whoseFact.action(state, { kind: 'whose-fact/submit-fact', text: 'I have 11 toes' }, ben, ctx)
  whoseFact.action(state, { kind: 'whose-fact/start' }, host, ctx)
  return state
}

describe('whose fact is this', () => {
  it('needs 2+ facts, host-only start', () => {
    const state = whoseFact.create({ type: 'whose-fact' }, ctx)
    whoseFact.action(state, { kind: 'whose-fact/submit-fact', text: 'Solo fact' }, ana, ctx)
    expect(() => whoseFact.action(state, { kind: 'whose-fact/start' }, host, ctx)).toThrow(
      ActivityError,
    )
    expect(() => whoseFact.action(state, { kind: 'whose-fact/start' }, ana, ctx)).toThrow(
      ActivityError,
    )
  })

  it('shows the fact but NEVER its author before the reveal', () => {
    const state = started()
    const author = state.order[0]!
    const guesser = ctx.activeIds.find((id) => id !== author)!
    const view = whoseFact.view(state, guesser, ctx)
    expect(view.round?.fact).toBe(state.facts.get(author))
    const serialized = JSON.stringify(view)
    // No author linkage anywhere: the reveal object is the only place it may appear.
    expect(view.round?.reveal).toBeNull()
    expect(serialized).not.toContain('authorId')
    // The author themselves knows it is theirs.
    expect(whoseFact.view(state, author, ctx).round?.youAreAuthor).toBe(true)
  })

  it('blocks the author from voting and scores correct guessers', () => {
    const state = started()
    const author = state.order[0]!
    const guessers = ctx.activeIds.filter((id) => id !== author)
    expect(() =>
      whoseFact.action(
        state,
        { kind: 'whose-fact/vote', suspectId: guessers[0]! },
        actorById(author),
        ctx,
      ),
    ).toThrow(ActivityError)
    // First guesser is right, second is wrong.
    whoseFact.action(
      state,
      { kind: 'whose-fact/vote', suspectId: author },
      actorById(guessers[0]!),
      ctx,
    )
    whoseFact.action(
      state,
      { kind: 'whose-fact/vote', suspectId: guessers[0]! },
      actorById(guessers[1]!),
      ctx,
    )
    whoseFact.action(state, { kind: 'whose-fact/reveal' }, host, ctx)
    const reveal = whoseFact.view(state, null, ctx).round!.reveal!
    expect(reveal.authorId).toBe(author)
    expect(reveal.correctIds).toEqual([guessers[0]])
    expect(state.scores.get(guessers[0]!)).toBe(1)
    expect(state.scores.get(guessers[1]!)).toBeUndefined()
  })

  it('rotates through all facts and ends with a full leaderboard', () => {
    const state = started()
    for (let i = 0; i < 3; i++) {
      const author = state.order[i]!
      const guesser = ctx.activeIds.find((id) => id !== author)!
      whoseFact.action(
        state,
        { kind: 'whose-fact/vote', suspectId: author },
        actorById(guesser),
        ctx,
      )
      whoseFact.action(state, { kind: 'whose-fact/reveal' }, host, ctx)
      whoseFact.action(state, { kind: 'whose-fact/next' }, host, ctx)
    }
    expect(state.phase).toBe('results')
    expect(whoseFact.view(state, null, ctx).scores).toHaveLength(3)
  })
})
