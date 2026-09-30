import type { Component } from 'vue'
import type { ActivityType } from '@team-fridays/shared'
import CaptionPanel from './CaptionPanel.vue'
import HerdPanel from './HerdPanel.vue'
import HowManyPanel from './HowManyPanel.vue'
import IcebreakerPanel from './IcebreakerPanel.vue'
import SnowfightPanel from './SnowfightPanel.vue'
import TerritoryPanel from './TerritoryPanel.vue'
import ThisOrThatPanel from './ThisOrThatPanel.vue'
import TwoTruthsPanel from './TwoTruthsPanel.vue'
import UndercoverPanel from './UndercoverPanel.vue'
import WavelengthPanel from './WavelengthPanel.vue'
import WhoseFactPanel from './WhoseFactPanel.vue'

// Client half of the activity plugin contract: one panel per activity type.
// Register new activities here; the room view resolves panels dynamically.
export const activityPanels: Record<ActivityType, Component> = {
  icebreaker: IcebreakerPanel,
  'this-or-that': ThisOrThatPanel,
  'two-truths': TwoTruthsPanel,
  snowfight: SnowfightPanel,
  'how-many': HowManyPanel,
  'whose-fact': WhoseFactPanel,
  herd: HerdPanel,
  caption: CaptionPanel,
  undercover: UndercoverPanel,
  wavelength: WavelengthPanel,
  territory: TerritoryPanel,
}
