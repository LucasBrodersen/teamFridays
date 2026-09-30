<script setup lang="ts">
import { computed, ref } from 'vue'
import { ACTIVITY_PLAYER_GUIDE, type ActivityType } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'

const room = useRoomStore()

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)

function fitNote(type: ActivityType): string | null {
  const guide = ACTIVITY_PLAYER_GUIDE[type]
  const count = activeCount.value
  const [bestMin, bestMax] = guide.best
  if (bestMax !== null && count > bestMax)
    return guide.tooManyNote ?? `Best with up to ${bestMax} — you are ${count}.`
  if (count < bestMin) return `Works now, more fun with ${bestMin}+ (you are ${count}).`
  return null
}

const revealWho = ref(true)
</script>

<template>
  <div class="picker">
    <h2 class="title">Pick an activity</h2>
    <div class="grid">
      <UiCard class="option">
        <h3 class="name">Icebreaker Question</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['icebreaker'].label }}</UiBadge>
          <span v-if="fitNote('icebreaker')" class="fit-note">{{ fitNote('icebreaker') }}</span>
        </div>
        <p class="desc">
          Everyone writes a question, then the game rotates through them: answer privately,
          reveal together.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'icebreaker' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">This or That</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['this-or-that'].label }}</UiBadge>
          <span v-if="fitNote('this-or-that')" class="fit-note">{{ fitNote('this-or-that') }}</span>
        </div>
        <p class="desc">
          Everyone writes a "this or that", then fast poll rounds with live results.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'this-or-that' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Two Truths and a Lie</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['two-truths'].label }}</UiBadge>
          <span v-if="fitNote('two-truths')" class="fit-note">{{ fitNote('two-truths') }}</span>
        </div>
        <p class="desc">Everyone submits 3 statements; the team hunts the lie.</p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'two-truths' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">How Many of Us?</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['how-many'].label }}</UiBadge>
          <span v-if="fitNote('how-many')" class="fit-note">{{ fitNote('how-many') }}</span>
        </div>
        <p class="desc">
          Everyone writes a "How many of us…?" question, then the game rotates through them:
          answer privately, guess the total, closest guess scores. Great with big groups.
        </p>
        <label class="check">
          <input v-model="revealWho" type="checkbox" />
          <span>Reveal who said yes</span>
        </label>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'how-many', revealWho })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Whose Fact Is This?</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['whose-fact'].label }}</UiBadge>
          <span v-if="fitNote('whose-fact')" class="fit-note">{{ fitNote('whose-fact') }}</span>
        </div>
        <p class="desc">
          Everyone submits a surprising fact about themselves; the team guesses who wrote each
          one. Great for learning names.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'whose-fact' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Herd Mentality</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['herd'].label }}</UiBadge>
          <span v-if="fitNote('herd')" class="fit-note">{{ fitNote('herd') }}</span>
        </div>
        <p class="desc">
          "Name a breakfast food" — match the majority to score. Everyone writes a prompt, then
          the herd decides.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'herd' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Caption Battle</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['caption'].label }}</UiBadge>
          <span v-if="fitNote('caption')" class="fit-note">{{ fitNote('caption') }}</span>
        </div>
        <p class="desc">
          One prompt, anonymous captions, head-to-head votes. Funniest caption wins.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'caption' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Undercover 🎭</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['undercover'].label }}</UiBadge>
          <span v-if="fitNote('undercover')" class="fit-note">{{ fitNote('undercover') }}</span>
        </div>
        <p class="desc">
          Almost everyone gets the same secret word — a few get a different one. Clues, debate,
          and one dramatic vote.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'undercover' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Wavelength</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['wavelength'].label }}</UiBadge>
          <span v-if="fitNote('wavelength')" class="fit-note">{{ fitNote('wavelength') }}</span>
        </div>
        <p class="desc">
          One player sees a secret spot on a spectrum and gives a clue; everyone else guesses
          where it lands.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'wavelength' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Territory Paint 🎨</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['territory'].label }}</UiBadge>
          <span v-if="fitNote('territory')" class="fit-note">{{ fitNote('territory') }}</span>
        </div>
        <p class="desc">
          Two teams, 90 seconds, every step paints the floor. Most territory wins — handles a big
          crowd well.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'territory' })">Start</UiButton>
        </div>
      </UiCard>

      <UiCard class="option">
        <h3 class="name">Snowball Fight ❄️</h3>
        <div class="fit">
          <UiBadge>👥 {{ ACTIVITY_PLAYER_GUIDE['snowfight'].label }}</UiBadge>
          <span v-if="fitNote('snowfight')" class="fit-note">{{ fitNote('snowfight') }}</span>
        </div>
        <p class="desc">
          Two teams, one player each. Dodge, throw, freeze the other side. Needs at least 2
          players.
        </p>
        <div class="actions single">
          <UiButton @click="room.startActivity({ type: 'snowfight' })">Start</UiButton>
        </div>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-4);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}
.option {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}
.desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.pair {
  display: flex;
  gap: var(--space-3);
}
.check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  cursor: pointer;
}
.fit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.fit-note {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}
.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}
.actions.single {
  justify-content: flex-end;
}
</style>
