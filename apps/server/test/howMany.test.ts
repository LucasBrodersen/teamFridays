import { describe, expect, it } from 'vitest'
import { howMany, type HowManyState } from '../src/activities/howMany'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }
const late: Actor = { id: 'x', isHost: false, spectator: true }

function fresh(revealWho = true): HowManyState {
  return howMany.create({ type: 'how-many', revealWho }, ctx)
}

const submitQuestion = (state: HowManyState, actor: Actor, question: string) =>
  howMany.action(state, { kind: 'how-many/submit-question', question }, actor, ctx)
const submit = (state: HowManyState, actor: Actor, self: boolean, guess: number) =>
  howMany.action(state, { kind: 'how-many/submit', self, guess }, actor, ctx)
const act = (state: HowManyState, kind: 'how-many/start' | 'how-many/reveal' | 'how-many/next') =>
  howMany.action(state, { kind }, host, ctx)

/** Everyone hands in a question and the host starts the rotation. */
function started(): HowManyState {
  const state = fresh()
  submitQuestion(state, host, 'How many of us have broken a bone?')
  submitQuestion(state, ana, 'How many of us can juggle?')
  submitQuestion(state, ben, 'How many of us have met a celebrity?')
  act(state, 'how-many/start')
  return state
}

describe('collecting questions', () => {
  it('takes one question per participant, resubmittable, spectators excluded', () => {
    const state = fresh()
    submitQuestion(state, ana, 'How many of us can juggle?')
    submitQuestion(state, ana, 'How many of us can whistle?')
    expect(state.questions.get('a')).toBe('How many of us can whistle?')
    expect(state.questions.size).toBe(1)
    expect(() => submitQuestion(state, late, 'How many of us…?')).toThrow(ActivityError)
  })

  it('hides other people’s questions before the game starts', () => {
    const state = fresh()
    submitQuestion(state, ana, 'How many of us can juggle?')
    const benView = howMany.view(state, 'b', ctx)
    expect(benView.phase).toBe('collecting')
    expect(benView.submittedQuestionIds).toEqual(['a'])
    expect(benView.yourQuestion).toBeNull()
    expect(benView.round).toBeNull()
    expect(JSON.stringify(benView)).not.toContain('juggle')
  })

  it('start is host-only, needs at least one question, and can force-advance', () => {
    const state = fresh()
    expect(() => act(state, 'how-many/start')).toThrow(ActivityError)
    submitQuestion(state, ana, 'How many of us can juggle?')
    expect(() =>
      howMany.action(state, { kind: 'how-many/start' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'how-many/start') // 1 of 3 submitted — host forces the start
    expect(state.phase).toBe('answering')
    expect(state.order).toEqual(['a'])
    expect(() => submitQuestion(state, ben, 'Too late?')).toThrow(ActivityError)
  })
})

describe('rotating rounds', () => {
  it('plays every submitted question exactly once, in the shuffled order', () => {
    const state = started()
    const seenAuthors: string[] = []
    for (let i = 0; i < 3; i++) {
      const view = howMany.view(state, 'h', ctx)
      expect(view.round?.number).toBe(i + 1)
      expect(view.round?.total).toBe(3)
      expect(view.round?.question).toBe(state.questions.get(view.round!.authorId))
      seenAuthors.push(view.round!.authorId)
      submit(state, ana, true, 1)
      act(state, 'how-many/reveal')
      act(state, 'how-many/next')
    }
    expect(seenAuthors.sort()).toEqual(['a', 'b', 'h'])
    expect(state.phase).toBe('results')
  })

  it('keeps answers private until the reveal and never leaks upcoming questions', () => {
    const state = started()
    submit(state, ana, true, 2)
    const benView = howMany.view(state, 'b', ctx)
    expect(benView.round?.results).toBeNull()
    expect(benView.round?.submittedIds).toEqual(['a'])
    const serialized = JSON.stringify(benView)
    // Upcoming questions by OTHER authors must be invisible; your own is echoed back.
    const upcoming = state.order
      .slice(1)
      .filter((id) => id !== 'b')
      .map((id) => state.questions.get(id) as string)
    for (const question of upcoming) expect(serialized).not.toContain(question)
    expect(benView.yourQuestion).toBe(state.questions.get('b'))
  })

  it('scores the closest guesser each round, ties included, and ranks everyone at the end', () => {
    const state = started()
    // Round 1: actual 1 — host guesses 1 (hit), ana 2, ben 0 (both off by one... ana distance 1, ben distance 1)
    submit(state, host, true, 1)
    submit(state, ana, false, 1)
    submit(state, ben, false, 3)
    act(state, 'how-many/reveal')
    let results = howMany.view(state, 'h', ctx).round!.results!
    expect(results.actualCount).toBe(1)
    expect(results.closestIds.sort()).toEqual(['a', 'h'])
    act(state, 'how-many/next')

    // Round 2: only ben answers and nails it.
    submit(state, ben, false, 0)
    act(state, 'how-many/reveal')
    results = howMany.view(state, 'h', ctx).round!.results!
    expect(results.closestIds).toEqual(['b'])
    act(state, 'how-many/next')

    // Round 3: nobody answers — reveal refuses, host skips via next? No: reveal needs answers.
    expect(() => act(state, 'how-many/reveal')).toThrow(ActivityError)
    submit(state, host, false, 0)
    act(state, 'how-many/reveal')
    act(state, 'how-many/next')

    expect(state.phase).toBe('results')
    const scores = howMany.view(state, null, ctx).scores
    expect(scores).toHaveLength(ctx.activeIds.length)
    const byId = Object.fromEntries(scores.map((s) => [s.participantId, s.score]))
    expect(byId['h']).toBe(2) // round 1 tie + round 3
    expect(byId['a']).toBe(1)
    expect(byId['b']).toBe(1)
    expect(scores[0]?.participantId).toBe('h')
  })

  it('respects revealWho=false across every round', () => {
    const state = fresh(false)
    submitQuestion(state, ana, 'How many of us can juggle?')
    act(state, 'how-many/start')
    submit(state, ana, true, 1)
    submit(state, ben, false, 0)
    act(state, 'how-many/reveal')
    const view = howMany.view(state, 'h', ctx)
    expect(view.round?.results?.actualCount).toBe(1)
    expect(view.round?.results?.yesIds).toBeNull()
    expect(JSON.stringify(view)).not.toContain('self')
  })

  it('enforces host-only reveal/next and the phase order', () => {
    const state = started()
    expect(() => act(state, 'how-many/next')).toThrow(ActivityError) // nothing revealed yet
    submit(state, ana, true, 1)
    expect(() =>
      howMany.action(state, { kind: 'how-many/reveal' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'how-many/reveal')
    expect(() => submit(state, ben, true, 1)).toThrow(ActivityError) // answers closed
    expect(() =>
      howMany.action(state, { kind: 'how-many/next' }, ana, ctx),
    ).toThrow(ActivityError)
  })
})
