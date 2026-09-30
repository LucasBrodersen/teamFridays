import { describe, expect, it } from 'vitest'
import { icebreaker, type IcebreakerState } from '../src/activities/icebreaker'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }
const late: Actor = { id: 'x', isHost: false, spectator: true }

function fresh(): IcebreakerState {
  return icebreaker.create({ type: 'icebreaker' }, ctx)
}

const submitQuestion = (state: IcebreakerState, actor: Actor, question: string) =>
  icebreaker.action(state, { kind: 'icebreaker/submit-question', question }, actor, ctx)
const submit = (state: IcebreakerState, actor: Actor, text: string) =>
  icebreaker.action(state, { kind: 'icebreaker/submit', text }, actor, ctx)
const act = (
  state: IcebreakerState,
  kind: 'icebreaker/start' | 'icebreaker/reveal' | 'icebreaker/next',
) => icebreaker.action(state, { kind }, host, ctx)

function started(): IcebreakerState {
  const state = fresh()
  submitQuestion(state, host, 'First job?')
  submitQuestion(state, ana, 'Favourite food?')
  act(state, 'icebreaker/start')
  return state
}

describe('icebreaker collecting', () => {
  it('takes one question per participant, hidden from others until the game starts', () => {
    const state = fresh()
    submitQuestion(state, ana, 'Favourite food?')
    submitQuestion(state, ana, 'Favourite movie?') // resubmit overwrites
    expect(state.questions.size).toBe(1)
    expect(() => submitQuestion(state, late, 'Hi?')).toThrow(ActivityError)
    const benView = icebreaker.view(state, 'b', ctx)
    expect(benView.phase).toBe('collecting')
    expect(benView.submittedQuestionIds).toEqual(['a'])
    expect(benView.yourQuestion).toBeNull()
    expect(JSON.stringify(benView)).not.toContain('movie')
  })

  it('start is host-only, needs a question, closes submissions', () => {
    const state = fresh()
    expect(() => act(state, 'icebreaker/start')).toThrow(ActivityError)
    submitQuestion(state, ana, 'Favourite food?')
    expect(() =>
      icebreaker.action(state, { kind: 'icebreaker/start' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'icebreaker/start')
    expect(state.phase).toBe('answering')
    expect(() => submitQuestion(state, ben, 'Too late?')).toThrow(ActivityError)
  })
})

describe('icebreaker rounds', () => {
  it('hides answers (even from the host) until reveal, echoing only your own', () => {
    const state = started()
    submit(state, ana, 'Paperboy')
    const hostView = icebreaker.view(state, 'h', ctx)
    expect(hostView.round?.answers).toBeNull()
    expect(hostView.round?.submittedIds).toEqual(['a'])
    expect(JSON.stringify(hostView)).not.toContain('Paperboy')
    const anaView = icebreaker.view(state, 'a', ctx)
    expect(anaView.round?.yourAnswer).toBe('Paperboy')
  })

  it('never leaks another author’s upcoming question', () => {
    const state = started()
    const currentAuthor = state.order[0]!
    const upcomingAuthor = state.order[1]!
    const view = icebreaker.view(state, currentAuthor, ctx)
    if (currentAuthor !== upcomingAuthor) {
      expect(JSON.stringify(view)).not.toContain(state.questions.get(upcomingAuthor))
    }
    expect(view.round?.question).toBe(state.questions.get(currentAuthor))
  })

  it('rotates through every question with the author credited, then finishes', () => {
    const state = started()
    const seen: string[] = []
    for (let i = 0; i < 2; i++) {
      const view = icebreaker.view(state, 'b', ctx)
      expect(view.round?.number).toBe(i + 1)
      expect(view.round?.total).toBe(2)
      seen.push(view.round!.authorId)
      submit(state, ben, 'An answer')
      act(state, 'icebreaker/reveal')
      expect(icebreaker.view(state, 'a', ctx).round?.answers).toEqual([
        { participantId: 'b', text: 'An answer' },
      ])
      act(state, 'icebreaker/next')
    }
    expect(seen.sort()).toEqual(['a', 'h'])
    expect(state.phase).toBe('done')
    expect(icebreaker.view(state, 'h', ctx).round).toBeNull()
  })

  it('guards the phase machine: host-only reveal/next, no late answers', () => {
    const state = started()
    expect(() => act(state, 'icebreaker/reveal')).toThrow(ActivityError) // no answers yet
    submit(state, ana, 'Paperboy')
    expect(() =>
      icebreaker.action(state, { kind: 'icebreaker/reveal' }, ana, ctx),
    ).toThrow(ActivityError)
    act(state, 'icebreaker/reveal')
    expect(() => submit(state, ben, 'Late')).toThrow(ActivityError)
    expect(() =>
      icebreaker.action(state, { kind: 'icebreaker/next' }, ana, ctx),
    ).toThrow(ActivityError)
  })
})
