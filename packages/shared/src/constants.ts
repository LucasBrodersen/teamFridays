export const NAME_MAX_LENGTH = 10
export const QUESTION_MAX_LENGTH = 200
export const ANSWER_MAX_LENGTH = 240
export const STATEMENT_MAX_LENGTH = 160
export const OPTION_MAX_LENGTH = 40

export const ROOM_CODE_REGEX = /^FRI-[A-Z2-9]{4}$/

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '👏'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]
