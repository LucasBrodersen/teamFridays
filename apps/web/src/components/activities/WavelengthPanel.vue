<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WavelengthView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: WavelengthView }>()
const room = useRoomStore()

const draftClue = ref('')
const guess = ref(50)

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canGuess = computed(
  () => props.view.phase === 'guessing' && isActive.value && !props.view.round?.youAreGiver,
)

function submitClue(): void {
  const text = draftClue.value.trim()
  if (text) room.sendAction({ kind: 'wavelength/clue', text })
}

function submitGuess(): void {
  room.sendAction({ kind: 'wavelength/guess', value: guess.value })
}

watch(
  () => props.view.round?.number,
  () => {
    draftClue.value = ''
    guess.value = 50
  },
)
</script>

<template>
  <div class="panel">
    <p class="kicker">Wavelength</p>

    <template v-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Round {{ view.round.number }} / {{ view.round.total }}</UiBadge>
        <span class="author">
          <UiAvatar :name="room.nameOf(view.round.giverId)" size="sm" />
          {{ room.nameOf(view.round.giverId) }} gives the clue
        </span>
      </div>

      <!-- The spectrum -->
      <div class="spectrum">
        <span class="pole">{{ view.round.spectrum.left }}</span>
        <div class="track">
          <div
            v-if="view.round.target !== null"
            class="marker target"
            :style="{ left: `${view.round.target}%` }"
            title="Target"
          />
          <template v-if="view.round.reveal">
            <div
              v-for="g in view.round.reveal.guesses"
              :key="g.participantId"
              class="marker guess"
              :style="{ left: `${g.value}%` }"
              :title="`${room.nameOf(g.participantId)}: ${g.value}`"
            />
          </template>
          <div
            v-else-if="canGuess"
            class="marker yours"
            :style="{ left: `${guess}%` }"
          />
        </div>
        <span class="pole">{{ view.round.spectrum.right }}</span>
      </div>

      <h2 v-if="view.round.clue" class="clue">“{{ view.round.clue }}”</h2>

      <template v-if="view.phase === 'cluing'">
        <UiCard v-if="view.round.youAreGiver" class="form">
          <p class="muted">
            Only you can see the target ({{ view.round.target }}). Give a clue that sits right
            there on the spectrum.
          </p>
          <UiInput
            v-model="draftClue"
            label="Your clue"
            placeholder="e.g. lukewarm office coffee"
            :maxlength="80"
          />
          <div class="row-end">
            <UiButton :disabled="!draftClue.trim()" @click="submitClue">Give clue</UiButton>
          </div>
        </UiCard>
        <p v-else class="muted">
          Waiting for {{ room.nameOf(view.round.giverId) }} to think of a clue…
        </p>
      </template>

      <template v-else-if="view.phase === 'guessing'">
        <UiCard v-if="canGuess" class="form">
          <label class="slider-label">
            Where on the spectrum? <strong>{{ guess }}</strong>
            <input v-model.number="guess" type="range" min="0" max="100" class="slider" />
          </label>
          <div class="row-end">
            <UiButton @click="submitGuess">
              {{ view.round.yourGuess !== null ? 'Update guess' : 'Lock it in' }}
            </UiButton>
          </div>
        </UiCard>
        <p v-else-if="view.round.youAreGiver" class="muted">
          You know the answer — watch them squirm 😌
        </p>
        <UiProgressBar
          :value="view.round.guessedIds.length"
          :max="Math.max(activeCount - 1, 0)"
          label="Guesses in"
        />
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.guessedIds.length === 0"
            @click="room.sendAction({ kind: 'wavelength/reveal' })"
          >
            Reveal ({{ view.round.guessedIds.length }}/{{ Math.max(activeCount - 1, 0) }})
          </UiButton>
        </div>
      </template>

      <template v-else-if="view.round.reveal">
        <UiCard class="stack" aria-live="polite">
          <p>
            The target was <strong>{{ view.round.reveal.target }}</strong> — closest:
            <strong>{{ view.round.reveal.closestIds.map(room.nameOf).join(', ') }}</strong> 🎯 (+1)
          </p>
          <p v-if="view.round.reveal.giverScored" class="muted">
            Great clue — {{ room.nameOf(view.round.giverId) }} scores too (+1).
          </p>
          <ul class="votes">
            <li v-for="g in view.round.reveal.guesses" :key="g.participantId">
              {{ room.nameOf(g.participantId) }}: {{ g.value }}
            </li>
          </ul>
        </UiCard>
        <div v-if="room.isHost" class="host-row">
          <UiButton @click="room.sendAction({ kind: 'wavelength/next' })">
            {{ view.round.number < view.round.total ? 'Next round' : 'Show final scores' }}
          </UiButton>
        </div>
      </template>
    </template>

    <template v-else-if="view.phase === 'results'">
      <h2 class="clue">Final scores 🏆</h2>
      <UiCard>
        <ol class="scores" aria-live="polite">
          <li v-for="(s, i) in view.scores" :key="s.participantId" class="score-row">
            <span class="rank">{{ i + 1 }}</span>
            <UiAvatar :name="room.nameOf(s.participantId)" size="sm" />
            <span>{{ room.nameOf(s.participantId) }}</span>
            <UiBadge :variant="s.score > 0 && i === 0 ? 'success' : 'neutral'">
              {{ s.score }} {{ s.score === 1 ? 'point' : 'points' }}
            </UiBadge>
          </li>
        </ol>
      </UiCard>
    </template>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.kicker {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-accent);
}
.round-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.author {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.spectrum {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.pole {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}
.track {
  position: relative;
  flex: 1;
  height: 14px;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-accent-soft), var(--color-accent));
}
.marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: var(--radius-full);
}
.marker.target {
  width: 8px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--color-danger);
}
.marker.guess {
  width: 12px;
  height: 12px;
  background: var(--color-text);
  opacity: 0.75;
}
.marker.yours {
  width: 14px;
  height: 14px;
  background: var(--color-surface);
  border: 3px solid var(--color-accent-hover);
}
.clue {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
}
.form,
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.slider-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.slider {
  width: 100%;
  accent-color: var(--color-accent);
}
.row-end {
  display: flex;
  justify-content: flex-end;
}
.host-row {
  display: flex;
}
.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.votes {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.scores {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.score-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.score-row :last-child {
  margin-left: auto;
}
.rank {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-faint);
  width: 1.5em;
}
</style>
