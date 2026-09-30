<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  HOW_MANY_QUESTIONS,
  QUESTION_MAX_LENGTH,
  type HowManyView,
} from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: HowManyView }>()
const room = useRoomStore()

const draftQuestion = ref('')
const self = ref<boolean | null>(null)
const guess = ref(0)

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canAnswer = computed(() => props.view.phase === 'answering' && isActive.value)

const winners = computed(() =>
  (props.view.round?.results?.closestIds ?? []).map((id) => room.nameOf(id)).join(', '),
)
const sortedGuesses = computed(() => {
  const results = props.view.round?.results
  if (!results) return []
  return [...results.guesses].sort(
    (a, b) =>
      Math.abs(a.guess - results.actualCount) - Math.abs(b.guess - results.actualCount) ||
      a.guess - b.guess,
  )
})

function suggest(): void {
  draftQuestion.value =
    HOW_MANY_QUESTIONS[Math.floor(Math.random() * HOW_MANY_QUESTIONS.length)] ?? ''
}

function submitQuestion(): void {
  const question = draftQuestion.value.trim()
  if (!question) return
  room.sendAction({ kind: 'how-many/submit-question', question })
}

function bump(delta: number): void {
  guess.value = Math.min(Math.max(guess.value + delta, 0), activeCount.value)
}

function submitAnswer(): void {
  if (self.value === null) return
  room.sendAction({ kind: 'how-many/submit', self: self.value, guess: guess.value })
}

function next(): void {
  room.sendAction({ kind: 'how-many/next' })
}

// Fresh inputs for every participant when a new round begins (the server
// drives the round number; local form state must follow it, host or not).
watch(
  () => props.view.round?.number,
  () => {
    self.value = null
    guess.value = 0
  },
)
</script>

<template>
  <div class="panel">
    <p class="kicker">How Many of Us?</p>
    <p v-if="!view.revealWho" class="privacy">
      Anonymous mode — only totals are revealed, never who said yes.
    </p>

    <!-- Phase 1: everyone writes a question -->
    <template v-if="view.phase === 'collecting'">
      <h2 class="question">Write your own "How many of us…?" question</h2>
      <UiProgressBar
        :value="view.submittedQuestionIds.length"
        :max="activeCount"
        label="Questions in"
      />

      <UiCard v-if="canWrite" class="form">
        <UiInput
          v-model="draftQuestion"
          label="Your question"
          placeholder="How many of us…?"
          :maxlength="QUESTION_MAX_LENGTH"
        />
        <div class="actions-row">
          <UiButton variant="ghost" size="sm" @click="suggest">Need inspiration?</UiButton>
          <UiButton :disabled="!draftQuestion.trim()" @click="submitQuestion">
            {{ view.yourQuestion ? 'Update question' : 'Submit question' }}
          </UiButton>
        </div>
        <p v-if="view.yourQuestion" class="submitted-note">
          Submitted ✓ — “{{ view.yourQuestion }}”
        </p>
      </UiCard>
      <p v-else-if="room.you?.spectator" class="muted">
        You joined mid-activity — you can play from the next one.
      </p>

      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedQuestionIds.length === 0"
          @click="room.sendAction({ kind: 'how-many/start' })"
        >
          Start ({{ view.submittedQuestionIds.length }}/{{ activeCount }} questions)
        </UiButton>
      </div>
    </template>

    <!-- Phase 2 + 3: rotating rounds -->
    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Question {{ view.round.number }} / {{ view.round.total }}</UiBadge>
        <span class="author">
          <UiAvatar :name="room.nameOf(view.round.authorId)" size="sm" />
          asked by {{ room.nameOf(view.round.authorId) }}
        </span>
      </div>
      <h2 class="question">{{ view.round.question }}</h2>

      <template v-if="view.phase === 'answering'">
        <UiProgressBar
          :value="view.round.submittedIds.length"
          :max="activeCount"
          label="Answers in"
        />

        <UiCard v-if="canAnswer" class="form">
          <div class="field-block">
            <span class="field-label">Does it apply to you?</span>
            <div class="actions-row start">
              <UiButton :variant="self === true ? 'primary' : 'secondary'" @click="self = true">
                Yes, me
              </UiButton>
              <UiButton :variant="self === false ? 'primary' : 'secondary'" @click="self = false">
                Not me
              </UiButton>
            </div>
          </div>
          <div class="field-block">
            <span class="field-label">Your guess — how many of the {{ activeCount }} of us?</span>
            <div class="stepper">
              <UiButton variant="secondary" aria-label="Lower guess" @click="bump(-1)">−</UiButton>
              <span class="guess-value" aria-live="polite">{{ guess }}</span>
              <UiButton variant="secondary" aria-label="Raise guess" @click="bump(1)">+</UiButton>
            </div>
          </div>
          <div class="row-end">
            <UiButton :disabled="self === null" @click="submitAnswer">
              {{ view.round.yours ? 'Update answer' : 'Lock it in' }}
            </UiButton>
          </div>
        </UiCard>

        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.submittedIds.length === 0"
            @click="room.sendAction({ kind: 'how-many/reveal' })"
          >
            Reveal ({{ view.round.submittedIds.length }}/{{ activeCount }})
          </UiButton>
        </div>
      </template>

      <template v-else-if="view.round.results">
        <div class="hero" aria-live="polite">
          <span class="hero-count">{{ view.round.results.actualCount }}</span>
          <span class="hero-of">of {{ view.round.results.totalAnswered }} said yes</span>
        </div>

        <UiCard v-if="view.round.results.yesIds?.length" class="stack">
          <span class="field-label">It applies to:</span>
          <div class="chips">
            <span v-for="id in view.round.results.yesIds" :key="id" class="chip">
              <UiAvatar :name="room.nameOf(id)" size="sm" /> {{ room.nameOf(id) }}
            </span>
          </div>
        </UiCard>

        <UiCard class="stack">
          <span class="field-label">
            Closest guess: <strong>{{ winners }}</strong> 🎯
          </span>
          <ol class="guess-list">
            <li v-for="g in sortedGuesses" :key="g.participantId" class="guess-row">
              <UiAvatar :name="room.nameOf(g.participantId)" size="sm" />
              <span class="guess-name">{{ room.nameOf(g.participantId) }}</span>
              <UiBadge
                :variant="
                  view.round.results.closestIds.includes(g.participantId) ? 'success' : 'neutral'
                "
              >
                guessed {{ g.guess }}
              </UiBadge>
            </li>
          </ol>
        </UiCard>

        <div v-if="room.isHost" class="host-row">
          <UiButton @click="next">
            {{ view.round.number < view.round.total ? 'Next question' : 'Show final scores' }}
          </UiButton>
        </div>
      </template>
    </template>

    <!-- Phase 4: leaderboard -->
    <template v-else-if="view.phase === 'results'">
      <h2 class="question">Final scores 🏆</h2>
      <UiCard>
        <ol class="guess-list" aria-live="polite">
          <li v-for="(s, i) in view.scores" :key="s.participantId" class="guess-row">
            <span class="rank">{{ i + 1 }}</span>
            <UiAvatar :name="room.nameOf(s.participantId)" size="sm" />
            <span class="guess-name">{{ room.nameOf(s.participantId) }}</span>
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
.question {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}
.privacy {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
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
.form,
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
}
.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.actions-row.start {
  justify-content: flex-start;
}
.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.guess-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: center;
}
.row-end {
  display: flex;
  justify-content: flex-end;
}
.submitted-note {
  font-size: var(--font-size-sm);
  color: var(--color-success);
}
.host-row {
  display: flex;
}
.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.hero {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}
.hero-count {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
}
.hero-of {
  font-size: var(--font-size-lg);
  color: var(--color-text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1);
}
.guess-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.guess-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.guess-name {
  font-size: var(--font-size-sm);
}
.guess-row :last-child {
  margin-left: auto;
}
.rank {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-faint);
  width: 1.5em;
}
</style>
