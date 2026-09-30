import { describe, expect, it } from 'vitest'
import { thisOrThat, type ThisOrThatState } from '../src/activities/thisOrThat'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }
const late: Actor = { id: 'x', isHost: false, spectator: true }

function fresh(): ThisOrThatState {
  return thisOrThat.create({ type: 'this-or-that' }, ctx)
}

const submitPair = (state: ThisOrThatState, actor: Actor, prompt: string) =>
  thisOrThat.action(
    state,
    { kind: 'this-or-that/submit-pair', prompt, optionA: 'A', optionB: 'B' },
    actor,
    ctx,
  )
const vote = (state: ThisOrThatState, actor: Actor, choice: 'a' | 'b') =>
  thisOrThat.action(state, { kind: 'this-or-that/vote', choice }, actor, ctx)
const act = (
  state: ThisOrThatState,
  kind: 'this-or-that/start' | 'this-or-that/close' | 'this-or-that/next',
) => thisOrThat.action(state, { kind }, host, ctx)

function started(): ThisOrThatState {
  const state = fresh()
  submitPair(state, host, 'Tabs or spaces')
  submitPair(state, ana, 'Coffee or tea')
  act(state, 'this-or-that/start')
  return state
}

describe('this or that collecting', () => {
  it('takes one pair per participant, hidden from others until the game starts', () => {
    const state = fresh()
    submitPair(state, ana, 'Coffee or tea')
    expect(() => submitPair(state, late, 'Nope')).toThrow(ActivityError)
    const benView = thisOrThat.view(state, 'b', ctx)
    expect(benView.phase).toBe('collecting')
    expect(benView.submittedPairIds).toEqual(['a'])
    expect(benView.yourPair).toBeNull()
    expect(JSON.stringify(benView)).not.toContain('Coffee')
  })

  it('start is host-only, needs a pair, closes submissions', () => {
    const state = fresh()
    expect(() => act(state, 'this-or-that/start')).toThrow(ActivityError)
    submitPair(state, ana, 'Coffee or tea')
    expect(() =>
      thisOrThat.action(state, { kind: 'this-or-that/start' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'this-or-that/start')
    expect(state.phase).toBe('voting')
    expect(() => submitPair(state, ben, 'Too late')).toThrow(ActivityError)
  })
})

describe('this or that rounds', () => {
  it('shows live counts but hides who voted for what until closed', () => {
    const state = started()
    vote(state, ana, 'a')
    vote(state, ben, 'b')
    const view = thisOrThat.view(state, 'h', ctx)
    expect(view.round?.counts).toEqual({ a: 1, b: 1 })
    expect(view.round?.votersByOption).toBeNull()
  })

  it('allows changing your vote while open, then exposes voters after close', () => {
    const state = started()
    vote(state, ana, 'a')
    vote(state, ana, 'b')
    expect(() =>
      thisOrThat.action(state, { kind: 'this-or-that/close' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'this-or-that/close')
    const view = thisOrThat.view(state, 'a', ctx)
    expect(view.round?.votersByOption).toEqual({ a: [], b: ['a'] })
    expect(view.round?.yourVote).toBe('b')
    expect(() => vote(state, ben, 'a')).toThrow(ActivityError)
  })

  it('never leaks another author’s upcoming prompt', () => {
    const state = started()
    const currentAuthor = state.order[0]!
    const upcomingAuthor = state.order[1]!
    const view = thisOrThat.view(state, currentAuthor, ctx)
    if (currentAuthor !== upcomingAuthor) {
      expect(JSON.stringify(view)).not.toContain(state.pairs.get(upcomingAuthor)?.prompt)
    }
  })

  it('rotates through every pair with fresh votes, then finishes', () => {
    const state = started()
    const seen: string[] = []
    for (let i = 0; i < 2; i++) {
      const view = thisOrThat.view(state, 'b', ctx)
      expect(view.round?.number).toBe(i + 1)
      expect(view.round?.counts).toEqual({ a: 0, b: 0 }) // votes reset each round
      seen.push(view.round!.authorId)
      vote(state, ben, 'a')
      act(state, 'this-or-that/close')
      act(state, 'this-or-that/next')
    }
    expect(seen.sort()).toEqual(['a', 'h'])
    expect(state.phase).toBe('done')
    expect(thisOrThat.view(state, 'h', ctx).round).toBeNull()
  })
})
