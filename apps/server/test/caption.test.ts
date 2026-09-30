import { describe, expect, it } from 'vitest'
import { caption, type CaptionState } from '../src/activities/caption'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b', 'c', 'd'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const actors: Actor[] = [
  host,
  { id: 'a', isHost: false, spectator: false },
  { id: 'b', isHost: false, spectator: false },
  { id: 'c', isHost: false, spectator: false },
  { id: 'd', isHost: false, spectator: false },
]

function withCaptions(n: number): CaptionState {
  const state = caption.create({ type: 'caption' }, ctx)
  for (let i = 0; i < n; i++)
    caption.action(state, { kind: 'caption/submit', text: `Caption ${i}` }, actors[i]!, ctx)
  return state
}

describe('caption battle', () => {
  it('picks a prompt at creation and needs 2+ captions to start', () => {
    const state = withCaptions(1)
    expect(state.prompt.length).toBeGreaterThan(0)
    expect(() => caption.action(state, { kind: 'caption/start' }, host, ctx)).toThrow(
      ActivityError,
    )
  })

  it('with an odd count, the leftover caption challenges the previous winner', () => {
    const even = withCaptions(4)
    caption.action(even, { kind: 'caption/start' }, host, ctx)
    expect(even.pairs).toHaveLength(2)
    expect(even.leftoverId).toBeNull()

    const odd = withCaptions(3)
    caption.action(odd, { kind: 'caption/start' }, host, ctx)
    expect(odd.pairs).toHaveLength(1)
    expect(odd.leftoverId).not.toBeNull()
    expect(caption.view(odd, null, ctx).round?.total).toBe(2) // total counts the pending duel

    // Matchup 1: everyone votes 'a' — its author becomes the reigning winner.
    const [authorA] = odd.pairs[0]!
    caption.action(odd, { kind: 'caption/vote', choice: 'a' }, actors[3]!, ctx)
    caption.action(odd, { kind: 'caption/reveal' }, host, ctx)
    caption.action(odd, { kind: 'caption/next' }, host, ctx)
    expect(odd.pairs).toHaveLength(2)
    expect(odd.pairs[1]).toEqual([odd.pairs[1]![0], authorA]) // challenger vs winner
    expect(new Set(odd.pairs.flat()).size).toBe(3) // every caption competes
    expect(odd.phase).toBe('voting')
    caption.action(odd, { kind: 'caption/vote', choice: 'b' }, actors[3]!, ctx)
    caption.action(odd, { kind: 'caption/reveal' }, host, ctx)
    caption.action(odd, { kind: 'caption/next' }, host, ctx)
    expect(odd.phase).toBe('results')
  })

  it('offers another round from results: new prompt, fresh captions, scores kept', () => {
    const state = withCaptions(2)
    caption.action(state, { kind: 'caption/start' }, host, ctx)
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[2]!, ctx)
    caption.action(state, { kind: 'caption/reveal' }, host, ctx)
    const winner = state.pairs[0]![0]
    caption.action(state, { kind: 'caption/next' }, host, ctx)
    expect(state.phase).toBe('results')
    expect(() => caption.action(state, { kind: 'caption/restart' }, actors[1]!, ctx)).toThrow(
      ActivityError,
    )
    caption.action(state, { kind: 'caption/restart' }, host, ctx)
    expect(state.phase).toBe('collecting')
    expect(state.captions.size).toBe(0)
    expect(state.scores.get(winner)).toBe(1) // best-so-far carries over
  })

  it('keeps captions anonymous until the reveal', () => {
    const state = withCaptions(4)
    caption.action(state, { kind: 'caption/start' }, host, ctx)
    const view = caption.view(state, 'a', ctx)
    expect(view.round?.captionA).toBeTruthy()
    expect(view.round?.reveal).toBeNull()
    expect(JSON.stringify(view.round)).not.toContain('authorAId')
  })

  it('a title defence updates your best score but never stacks it', () => {
    const state = withCaptions(3)
    caption.action(state, { kind: 'caption/start' }, host, ctx)
    const [authorA] = state.pairs[0]!
    // Matchup 1: the winner takes 2 votes.
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[3]!, ctx)
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[4]!, ctx)
    caption.action(state, { kind: 'caption/reveal' }, host, ctx)
    expect(state.scores.get(authorA)).toBe(2)
    caption.action(state, { kind: 'caption/next' }, host, ctx)
    // Title defence: the champion gets 1 vote — best stays 2, not 3.
    caption.action(state, { kind: 'caption/vote', choice: 'b' }, actors[3]!, ctx)
    caption.action(state, { kind: 'caption/reveal' }, host, ctx)
    expect(state.pairs[1]![1]).toBe(authorA)
    expect(state.scores.get(authorA)).toBe(2)
  })

  it('scores by votes received, so close losers still score', () => {
    const state = withCaptions(4)
    caption.action(state, { kind: 'caption/start' }, host, ctx)
    const [authorA, authorB] = state.pairs[0]!
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[2]!, ctx)
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[3]!, ctx)
    caption.action(state, { kind: 'caption/vote', choice: 'b' }, actors[4]!, ctx)
    caption.action(state, { kind: 'caption/reveal' }, host, ctx)
    const reveal = caption.view(state, null, ctx).round!.reveal!
    expect(reveal.winner).toBe('a')
    expect(state.scores.get(authorA)).toBe(2) // 2 votes
    expect(state.scores.get(authorB)).toBe(1) // close loser keeps their vote
    expect(state.lastWinnerId).toBe(authorA)

    caption.action(state, { kind: 'caption/next' }, host, ctx)
    const [a2, b2] = state.pairs[1]!
    caption.action(state, { kind: 'caption/vote', choice: 'a' }, actors[0]!, ctx)
    caption.action(state, { kind: 'caption/vote', choice: 'b' }, actors[1]!, ctx)
    caption.action(state, { kind: 'caption/reveal' }, host, ctx)
    expect(state.scores.get(a2)).toBe(1) // tie: one vote each
    expect(state.scores.get(b2)).toBe(1)
    expect([a2, b2]).toContain(state.lastWinnerId) // tie-break picks one of the two
    caption.action(state, { kind: 'caption/next' }, host, ctx)
    expect(state.phase).toBe('results')
  })
})
