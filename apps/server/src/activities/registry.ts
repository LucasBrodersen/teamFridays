import type { ActivityType } from '@team-fridays/shared'
import type { ActivityDefinition } from './types'
import { caption } from './caption'
import { herd } from './herd'
import { howMany } from './howMany'
import { icebreaker } from './icebreaker'
import { snowfight } from './snowfight'
import { territory } from './territory'
import { thisOrThat } from './thisOrThat'
import { twoTruths } from './twoTruths'
import { undercover } from './undercover'
import { wavelength } from './wavelength'
import { whoseFact } from './whoseFact'

// Adding a new activity: create its module and register it here. Nothing else
// in the core room logic should need to change.
export const activityRegistry: Record<ActivityType, ActivityDefinition<never>> = {
  icebreaker: icebreaker as ActivityDefinition<never>,
  'this-or-that': thisOrThat as ActivityDefinition<never>,
  'two-truths': twoTruths as ActivityDefinition<never>,
  snowfight: snowfight as ActivityDefinition<never>,
  'how-many': howMany as ActivityDefinition<never>,
  'whose-fact': whoseFact as ActivityDefinition<never>,
  herd: herd as ActivityDefinition<never>,
  caption: caption as ActivityDefinition<never>,
  undercover: undercover as ActivityDefinition<never>,
  wavelength: wavelength as ActivityDefinition<never>,
  territory: territory as ActivityDefinition<never>,
}
