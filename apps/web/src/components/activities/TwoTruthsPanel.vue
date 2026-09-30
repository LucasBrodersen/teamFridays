<script setup lang="ts">
import { computed, ref } from 'vue'
import { STATEMENT_MAX_LENGTH, type TwoTruthsView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: TwoTruthsView }>()
const room = useRoomStore()

const statements = ref(['', '', ''])
const lieIndex = ref<number | null>(null)

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const canSubmit = computed(
  () =>
    statements.value.every((s) => s.trim().length > 0) &&
    lieIndex.value !== null &&
    !room.you?.spectator,
)
const isTarget = computed(() => props.view.current?.targetId === room.you?.participantId)
const canVote = computed(
  () =>
    props.view.current?.subPhase === 'voting' &&
    !isTarget.value &&
    !room.you?.spectator,
)
const voterCount = computed(() =>
  Math.max(activeCount.value - 1, 0),
)

function submit(): void {
  if (!canSubmit.value || lieIndex.value === null) return
  room.sendAction({
    kind: 'two-truths/submit',
    statements: [
      statements.value[0]!.trim(),
      statements.value[1]!.trim(),
      statements.value[2]!.trim(),
    ],
    lieIndex: lieIndex.value as 0 | 1 | 2,
  })
}

function vote(index: number): void {
  if (canVote.value) room.sendAction({ kind: 'two-truths/vote', statementIndex: index })
}

function votesFor(index: number): string[] {
  return (props.view.current?.votes ?? [])
    .filter((v) => v.statementIndex === index)
    .map((v) => room.nameOf(v.participantId))
}
</script>

<template>
  <div class="panel">
    <p class="kicker">Two Truths and a Lie</p>

    <!-- Phase 1: everyone writes their statements -->
    <template v-if="view.phase === 'collecting'">
      <h2 class="title">Write two truths and one lie about yourself</h2>
      <UiProgressBar :value="view.submittedIds.length" :max="activeCount" label="Submissions in" />

      <UiCard v-if="!room.you?.spectator" class="form">
        <p v-if="view.youSubmitted" class="submitted-note">
          Submitted ✓ — you can still edit and resubmit until the game starts.
        </p>
        <div v-for="i in 3" :key="i" class="statement-row">
          <UiInput
            v-model="statements[i - 1]!"
            :label="`Statement ${i}`"
            :maxlength="STATEMENT_MAX_LENGTH"
            placeholder="Something about you…"
          />
          <label class="lie-pick">
            <input v-model.number="lieIndex" type="radio" :value="i - 1" name="lie" />
            <span>the lie</span>
          </label>
        </div>
        <div class="row-end">
          <UiButton :disabled="!canSubmit" @click="submit">
            {{ view.youSubmitted ? 'Update submission' : 'Submit' }}
          </UiButton>
        </div>
      </UiCard>
      <p v-else class="muted">You joined mid-activity — you can play from the next one.</p>

      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedIds.length < 2"
          @click="room.sendAction({ kind: 'two-truths/start' })"
        >
          Start guessing ({{ view.submittedIds.length }}/{{ activeCount }})
        </UiButton>
      </div>
    </template>

    <!-- Phase 2: one person at a time -->
    <template v-else-if="view.phase === 'presenting' && view.current">
      <div class="target">
        <UiAvatar :name="room.nameOf(view.current.targetId)" size="lg" />
        <h2 class="title">
          <template v-if="isTarget">Your turn — the team hunts your lie</template>
          <template v-else>Which one is {{ room.nameOf(view.current.targetId) }}'s lie?</template>
        </h2>
      </div>

      <div class="statements">
        <button
          v-for="(statement, i) in view.current.statements"
          :key="i"
          class="statement"
          :class="{
            chosen: view.current.yourVote === i,
            lie: view.current.lieIndex === i,
            truth: view.current.lieIndex !== null && view.current.lieIndex !== i,
          }"
          :disabled="!canVote"
          @click="vote(i)"
        >
          <span class="statement-text">{{ statement }}</span>
          <span v-if="view.current.lieIndex === i" class="verdict">
            <UiBadge variant="danger">The lie</UiBadge>
          </span>
          <span v-if="view.current.votes" class="statement-voters">
            <span v-for="name in votesFor(i)" :key="name" class="voter">{{ name }}</span>
          </span>
        </button>
      </div>

      <template v-if="view.current.subPhase === 'voting'">
        <UiProgressBar
          :value="view.current.votedIds.length"
          :max="voterCount"
          label="Votes in"
        />
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.current.votedIds.length === 0"
            @click="room.sendAction({ kind: 'two-truths/reveal' })"
          >
            Reveal ({{ view.current.votedIds.length }}/{{ voterCount }})
          </UiButton>
        </div>
      </template>
      <div v-else-if="room.isHost" class="host-row">
        <UiButton @click="room.sendAction({ kind: 'two-truths/next' })">
          {{ view.remainingTargetIds.length > 0 ? 'Next person' : 'Show results' }}
        </UiButton>
      </div>
    </template>

    <!-- Phase 3: results -->
    <template v-else-if="view.phase === 'results'">
      <h2 class="title">Results</h2>
      <UiCard>
        <ol class="scores" aria-live="polite">
          <li v-for="(s, i) in view.scores" :key="s.participantId" class="score-row">
            <span class="rank">{{ i + 1 }}</span>
            <UiAvatar :name="room.nameOf(s.participantId)" size="sm" />
            <span class="score-name">{{ room.nameOf(s.participantId) }}</span>
            <span class="score-value">{{ s.score }} {{ s.score === 1 ? 'lie' : 'lies' }} caught</span>
          </li>
          <li v-if="view.scores.length === 0" class="muted">Nobody caught a lie this time.</li>
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
.title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.submitted-note {
  font-size: var(--font-size-sm);
  color: var(--color-success);
}
.statement-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}
.lie-pick {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  padding-bottom: var(--space-2);
  white-space: nowrap;
  cursor: pointer;
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
.target {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.statements {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.statement {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  text-align: left;
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease);
}
.statement:disabled {
  cursor: default;
}
.statement:hover:not(:disabled) {
  border-color: var(--color-border-strong);
}
.statement.chosen {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.statement.lie {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
.statement.truth {
  opacity: 0.75;
}
.statement-text {
  font-size: var(--font-size-lg);
}
.statement-voters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.voter {
  font-size: var(--font-size-xs);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-full);
  padding: 0 var(--space-2);
  color: var(--color-text-muted);
}
.scores {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.score-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.rank {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-faint);
  width: 1.5em;
}
.score-name {
  font-weight: var(--font-weight-semibold);
}
.score-value {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
