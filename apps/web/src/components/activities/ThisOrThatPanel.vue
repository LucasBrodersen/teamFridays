<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  OPTION_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
  THIS_OR_THAT_PAIRS,
  type ThisOrThatView,
} from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: ThisOrThatView }>()
const room = useRoomStore()

const draftPrompt = ref('')
const draftA = ref('')
const draftB = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canVote = computed(() => props.view.phase === 'voting' && isActive.value)
const draftComplete = computed(
  () => draftPrompt.value.trim() && draftA.value.trim() && draftB.value.trim(),
)

const total = computed(() => {
  const counts = props.view.round?.counts
  return counts ? counts.a + counts.b : 0
})
const percentA = computed(() => {
  const counts = props.view.round?.counts
  if (!counts || total.value === 0) return 50
  return Math.round((counts.a / total.value) * 100)
})

function suggest(): void {
  const pair = THIS_OR_THAT_PAIRS[Math.floor(Math.random() * THIS_OR_THAT_PAIRS.length)]
  if (!pair) return
  draftPrompt.value = pair.prompt
  draftA.value = pair.optionA
  draftB.value = pair.optionB
}

function submitPair(): void {
  if (!draftComplete.value) return
  room.sendAction({
    kind: 'this-or-that/submit-pair',
    prompt: draftPrompt.value.trim(),
    optionA: draftA.value.trim(),
    optionB: draftB.value.trim(),
  })
}

function vote(choice: 'a' | 'b'): void {
  if (canVote.value) room.sendAction({ kind: 'this-or-that/vote', choice })
}
</script>

<template>
  <div class="panel">
    <p class="kicker">This or That</p>

    <!-- Phase 1: everyone writes a prompt -->
    <template v-if="view.phase === 'collecting'">
      <h2 class="prompt">Write your own "this or that" for the team</h2>
      <UiProgressBar
        :value="view.submittedPairIds.length"
        :max="activeCount"
        label="Prompts in"
      />

      <UiCard v-if="canWrite" class="form">
        <UiInput
          v-model="draftPrompt"
          label="Prompt"
          placeholder="e.g. The eternal debate"
          :maxlength="QUESTION_MAX_LENGTH"
        />
        <div class="pair">
          <UiInput v-model="draftA" label="Option A" :maxlength="OPTION_MAX_LENGTH" />
          <UiInput v-model="draftB" label="Option B" :maxlength="OPTION_MAX_LENGTH" />
        </div>
        <div class="actions-row">
          <UiButton variant="ghost" size="sm" @click="suggest">Need inspiration?</UiButton>
          <UiButton :disabled="!draftComplete" @click="submitPair">
            {{ view.yourPair ? 'Update prompt' : 'Submit prompt' }}
          </UiButton>
        </div>
        <p v-if="view.yourPair" class="submitted-note">
          Submitted ✓ — “{{ view.yourPair.prompt }}: {{ view.yourPair.optionA }} vs
          {{ view.yourPair.optionB }}”
        </p>
      </UiCard>
      <p v-else-if="room.you?.spectator" class="muted">
        You joined mid-activity — you can play from the next one.
      </p>

      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedPairIds.length === 0"
          @click="room.sendAction({ kind: 'this-or-that/start' })"
        >
          Start ({{ view.submittedPairIds.length }}/{{ activeCount }} prompts)
        </UiButton>
      </div>
    </template>

    <!-- Phase 2 + 3: rotating rounds -->
    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Round {{ view.round.number }} / {{ view.round.total }}</UiBadge>
        <span class="author">
          <UiAvatar :name="room.nameOf(view.round.authorId)" size="sm" />
          by {{ room.nameOf(view.round.authorId) }}
        </span>
      </div>
      <h2 class="prompt">{{ view.round.prompt }}</h2>

      <div class="options">
        <button
          class="option"
          :class="{ chosen: view.round.yourVote === 'a' }"
          :disabled="!canVote"
          @click="vote('a')"
        >
          <span class="option-label">{{ view.round.optionA }}</span>
          <span class="count">{{ view.round.counts.a }}</span>
        </button>
        <span class="vs">vs</span>
        <button
          class="option"
          :class="{ chosen: view.round.yourVote === 'b' }"
          :disabled="!canVote"
          @click="vote('b')"
        >
          <span class="option-label">{{ view.round.optionB }}</span>
          <span class="count">{{ view.round.counts.b }}</span>
        </button>
      </div>

      <div class="bar" role="img" :aria-label="`${view.round.counts.a} vs ${view.round.counts.b}`">
        <div class="fill-a" :style="{ width: `${percentA}%` }" />
        <div class="fill-b" :style="{ width: `${100 - percentA}%` }" />
      </div>

      <div v-if="view.round.votersByOption" class="voters" aria-live="polite">
        <div class="voter-col">
          <span v-for="id in view.round.votersByOption.a" :key="id" class="voter">
            {{ room.nameOf(id) }}
          </span>
        </div>
        <div class="voter-col right">
          <span v-for="id in view.round.votersByOption.b" :key="id" class="voter">
            {{ room.nameOf(id) }}
          </span>
        </div>
      </div>

      <div v-if="room.isHost" class="host-row">
        <UiButton
          v-if="view.phase === 'voting'"
          variant="secondary"
          @click="room.sendAction({ kind: 'this-or-that/close' })"
        >
          Close voting ({{ total }})
        </UiButton>
        <UiButton v-else @click="room.sendAction({ kind: 'this-or-that/next' })">
          {{ view.round.number < view.round.total ? 'Next round' : 'Finish' }}
        </UiButton>
      </div>
    </template>

    <!-- Phase 4: wrap -->
    <template v-else-if="view.phase === 'done'">
      <UiCard class="done">
        <h2 class="prompt">That's a wrap 🎉</h2>
        <p class="muted">All prompts played. The host can end the activity.</p>
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
.prompt {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
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
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.pair {
  display: flex;
  gap: var(--space-3);
}
.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
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
.options {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
}
.vs {
  align-self: center;
  color: var(--color-text-faint);
  font-size: var(--font-size-sm);
}
.option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}
.option:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}
.option:disabled {
  cursor: default;
}
.option.chosen {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.option-label {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}
.count {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}
.bar {
  display: flex;
  height: 14px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-surface-sunken);
}
.fill-a {
  background: var(--color-accent);
  transition: width var(--motion-slow) var(--motion-ease);
}
.fill-b {
  background: var(--color-warning);
  transition: width var(--motion-slow) var(--motion-ease);
}
.voters {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
}
.voter-col {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  flex: 1;
}
.voter-col.right {
  justify-content: flex-end;
}
.voter {
  font-size: var(--font-size-xs);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-muted);
}
.done {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
