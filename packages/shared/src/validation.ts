import { z } from 'zod'
import {
  ANSWER_MAX_LENGTH,
  NAME_MAX_LENGTH,
  OPTION_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
  REACTION_EMOJIS,
  ROOM_CODE_REGEX,
  STATEMENT_MAX_LENGTH,
} from './constants'
import { SNOWFIGHT } from './snowfight'

export const nameSchema = z.string().trim().min(1, 'Name is required').max(NAME_MAX_LENGTH)

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_REGEX, 'Invalid room code')

export const createRoomSchema = z.object({ name: nameSchema })

export const joinRoomSchema = z.object({ roomCode: roomCodeSchema, name: nameSchema })

export const rejoinRoomSchema = z.object({
  roomCode: roomCodeSchema,
  sessionId: z.string().min(8).max(80),
})

export const transferHostSchema = z.object({ toParticipantId: z.string().min(1).max(80) })

export const reactionSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) })

const questionText = z.string().trim().min(1).max(QUESTION_MAX_LENGTH)
const optionText = z.string().trim().min(1).max(OPTION_MAX_LENGTH)

export const activityConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('icebreaker') }),
  z.object({ type: z.literal('this-or-that') }),
  z.object({ type: z.literal('two-truths') }),
  z.object({ type: z.literal('snowfight') }),
  z.object({ type: z.literal('how-many'), revealWho: z.boolean() }),
  z.object({ type: z.literal('whose-fact') }),
  z.object({ type: z.literal('herd') }),
  z.object({ type: z.literal('caption') }),
  z.object({ type: z.literal('undercover') }),
  z.object({ type: z.literal('wavelength') }),
  z.object({ type: z.literal('territory') }),
])

const participantIdSchema = z.string().min(1).max(80)
const shortText = z.string().trim().min(1).max(ANSWER_MAX_LENGTH)

const inputAxis = z.union([z.literal(-1), z.literal(0), z.literal(1)])

export const activityActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('icebreaker/submit-question'), question: questionText }),
  z.object({ kind: z.literal('icebreaker/start') }),
  z.object({
    kind: z.literal('icebreaker/submit'),
    text: z.string().trim().min(1).max(ANSWER_MAX_LENGTH),
  }),
  z.object({ kind: z.literal('icebreaker/reveal') }),
  z.object({ kind: z.literal('icebreaker/next') }),
  z.object({
    kind: z.literal('this-or-that/submit-pair'),
    prompt: questionText,
    optionA: optionText,
    optionB: optionText,
  }),
  z.object({ kind: z.literal('this-or-that/start') }),
  z.object({ kind: z.literal('this-or-that/vote'), choice: z.enum(['a', 'b']) }),
  z.object({ kind: z.literal('this-or-that/close') }),
  z.object({ kind: z.literal('this-or-that/next') }),
  z.object({
    kind: z.literal('two-truths/submit'),
    statements: z.tuple([
      z.string().trim().min(1).max(STATEMENT_MAX_LENGTH),
      z.string().trim().min(1).max(STATEMENT_MAX_LENGTH),
      z.string().trim().min(1).max(STATEMENT_MAX_LENGTH),
    ]),
    lieIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({ kind: z.literal('two-truths/start') }),
  z.object({
    kind: z.literal('two-truths/vote'),
    statementIndex: z.number().int().min(0).max(2),
  }),
  z.object({ kind: z.literal('two-truths/reveal') }),
  z.object({ kind: z.literal('two-truths/next') }),
  z.object({ kind: z.literal('snowfight/start') }),
  z.object({ kind: z.literal('snowfight/move'), dx: inputAxis, dy: inputAxis }),
  z.object({
    kind: z.literal('snowfight/throw'),
    x: z.number().min(0).max(SNOWFIGHT.ARENA_WIDTH),
    y: z.number().min(0).max(SNOWFIGHT.ARENA_HEIGHT),
  }),
  z.object({ kind: z.literal('snowfight/build') }),
  z.object({ kind: z.literal('snowfight/restart') }),
  z.object({ kind: z.literal('how-many/submit-question'), question: questionText }),
  z.object({ kind: z.literal('how-many/start') }),
  z.object({
    kind: z.literal('how-many/submit'),
    self: z.boolean(),
    guess: z.number().int().min(0).max(99),
  }),
  z.object({ kind: z.literal('how-many/reveal') }),
  z.object({ kind: z.literal('how-many/next') }),
  z.object({ kind: z.literal('whose-fact/submit-fact'), text: shortText }),
  z.object({ kind: z.literal('whose-fact/start') }),
  z.object({ kind: z.literal('whose-fact/vote'), suspectId: participantIdSchema }),
  z.object({ kind: z.literal('whose-fact/reveal') }),
  z.object({ kind: z.literal('whose-fact/next') }),
  z.object({ kind: z.literal('herd/submit-prompt'), prompt: questionText }),
  z.object({ kind: z.literal('herd/start') }),
  z.object({ kind: z.literal('herd/answer'), text: z.string().trim().min(1).max(60) }),
  z.object({ kind: z.literal('herd/reveal') }),
  z.object({ kind: z.literal('herd/next') }),
  z.object({ kind: z.literal('caption/submit'), text: shortText }),
  z.object({ kind: z.literal('caption/start') }),
  z.object({ kind: z.literal('caption/vote'), choice: z.enum(['a', 'b']) }),
  z.object({ kind: z.literal('caption/reveal') }),
  z.object({ kind: z.literal('caption/next') }),
  z.object({ kind: z.literal('caption/restart') }),
  z.object({ kind: z.literal('undercover/clue'), text: z.string().trim().min(1).max(30) }),
  z.object({ kind: z.literal('undercover/to-voting') }),
  z.object({ kind: z.literal('undercover/vote'), suspectId: participantIdSchema }),
  z.object({ kind: z.literal('undercover/reveal') }),
  z.object({ kind: z.literal('undercover/restart') }),
  z.object({ kind: z.literal('wavelength/clue'), text: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal('wavelength/guess'), value: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal('wavelength/reveal') }),
  z.object({ kind: z.literal('wavelength/next') }),
  z.object({ kind: z.literal('territory/start') }),
  z.object({ kind: z.literal('territory/move'), dx: inputAxis, dy: inputAxis }),
  z.object({ kind: z.literal('territory/restart') }),
])
