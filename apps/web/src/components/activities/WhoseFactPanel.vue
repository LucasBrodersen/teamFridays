<script setup lang="ts">
import { computed, ref } from 'vue'
import { ANSWER_MAX_LENGTH, type WhoseFactView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: WhoseFactView }>()
const room = useRoomStore()

const draftFact = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canVote = computed(
  () => props.view.phase === 'guessing' && isActive.value && !props.view.round?.youAreAuthor,
)
const suspects = computed(() => room.participants.filter((p) => !p.spectator))

function submitFact(): void {
  const text = draftFact.value.trim()
  if (text) room.sendAction({ kind: 'whose-fact/submit-fact', text })
}
</script>

<template>
  <div class="panel">
    <p class="kicker">Whose Fact Is This?</p>

    <template v-if="view.phase === 'collecting'">
      <h2 class="title">Write one surprising fact about yourself</h2>
      <UiProgressBar :value="view.submittedIds.length" :max="activeCount" label="Facts in" />
      <UiCard v-if="canWrite" class="form">
        <UiInput
          v-model="draftFact"
          label="Your fact (the team will guess it's you)"
          placeholder="I once…"
          :maxlength="ANSWER_MAX_LENGTH"
        />
        <div class="row-end">
          <UiButton :disabled="!draftFact.trim()" @click="submitFact">
            {{ view.youSubmitted ? 'Update fact' : 'Submit fact' }}
          </UiButton>
        </div>
      </UiCard>
      <p v-else-if="room.you?.spectator" class="muted">
        You joined mid-activity — you can play from the next one.
      </p>
      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedIds.length < 2"
          @click="room.sendAction({ kind: 'whose-fact/start' })"
        >
          Start ({{ view.submittedIds.length }}/{{ activeCount }} facts)
        </UiButton>
      </div>
    </template>

    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Fact {{ view.round.number }} / {{ view.round.total }}</UiBadge>
      </div>
      <h2 class="title">“{{ view.round.fact }}”</h2>

      <template v-if="view.phase === 'guessing'">
        <p v-if="view.round.youAreAuthor" class="muted">
          This one's yours — sit tight and look innocent 😇
        </p>
        <template v-else>
          <p class="muted">Who wrote this?</p>
          <div class="suspects">
            <button
              v-for="p in suspects"
              :key="p.id"
              class="suspect"
              :class="{ chosen: view.round.yourVote === p.id }"
              :disabled="!canVote || p.id === room.you?.participantId"
              @click="room.sendAction({ kind: 'whose-fact/vote', suspectId: p.id })"
            >
              <UiAvatar :name="p.name" size="sm" />
              <span>{{ p.name }}</span>
            </button>
          </div>
        </template>
        <UiProgressBar
          :value="view.round.votedIds.length"
          :max="Math.max(activeCount - 1, 0)"
          label="Guesses in"
        />
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.votedIds.length === 0"
            @click="room.sendAction({ kind: 'whose-fact/reveal' })"
          >
            Reveal ({{ view.round.votedIds.length }}/{{ Math.max(activeCount - 1, 0) }})
          </UiButton>
        </div>
      </template>

      <template v-else-if="view.round.reveal">
        <UiCard class="stack" aria-live="polite">
          <div class="author-line">
            <UiAvatar :name="room.nameOf(view.round.reveal.authorId)" />
            <span class="strong">It was {{ room.nameOf(view.round.reveal.authorId) }}!</span>
          </div>
          <p class="muted">
            <template v-if="view.round.reveal.correctIds.length">
              Guessed right: {{ view.round.reveal.correctIds.map(room.nameOf).join(', ') }} (+1)
            </template>
            <template v-else>Nobody guessed it — very mysterious.</template>
          </p>
          <ul class="votes">
            <li v-for="v in view.round.reveal.votes" :key="v.voterId">
              {{ room.nameOf(v.voterId) }} suspected {{ room.nameOf(v.suspectId) }}
            </li>
          </ul>
        </UiCard>
        <div v-if="room.isHost" class="host-row">
          <UiButton @click="room.sendAction({ kind: 'whose-fact/next' })">
            {{ view.round.number < view.round.total ? 'Next fact' : 'Show final scores' }}
          </UiButton>
        </div>
      </template>
    </template>

    <template v-else-if="view.phase === 'results'">
      <h2 class="title">Final scores 🏆</h2>
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
.title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}
.round-meta {
  display: flex;
  gap: var(--space-3);
}
.form,
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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
.suspects {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}
.suspect {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  font-size: var(--font-size-sm);
}
.suspect:hover:not(:disabled) {
  border-color: var(--color-border-strong);
}
.suspect:disabled {
  opacity: 0.5;
  cursor: default;
}
.suspect.chosen {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.author-line {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.strong {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-lg);
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
