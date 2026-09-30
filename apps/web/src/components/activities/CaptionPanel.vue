<script setup lang="ts">
import { computed, ref } from 'vue'
import { ANSWER_MAX_LENGTH, type CaptionView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'
import UiTextarea from '../ui/UiTextarea.vue'

const props = defineProps<{ view: CaptionView }>()
const room = useRoomStore()

const draft = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canVote = computed(() => props.view.phase === 'voting' && isActive.value)

function submitCaption(): void {
  const text = draft.value.trim()
  if (text) room.sendAction({ kind: 'caption/submit', text })
}

function vote(choice: 'a' | 'b'): void {
  if (canVote.value) room.sendAction({ kind: 'caption/vote', choice })
}
</script>

<template>
  <div class="panel">
    <p class="kicker">Caption Battle</p>
    <h2 class="title">{{ view.prompt }}</h2>

    <template v-if="view.phase === 'collecting'">
      <UiProgressBar :value="view.submittedIds.length" :max="activeCount" label="Captions in" />
      <UiCard v-if="canWrite" class="form">
        <UiTextarea
          v-model="draft"
          label="Your caption (anonymous until the reveal)"
          placeholder="Make it funny…"
          :maxlength="ANSWER_MAX_LENGTH"
          :rows="2"
        />
        <div class="row-end">
          <UiButton :disabled="!draft.trim()" @click="submitCaption">
            {{ view.youSubmitted ? 'Update caption' : 'Submit caption' }}
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
          @click="room.sendAction({ kind: 'caption/start' })"
        >
          Start the battle ({{ view.submittedIds.length }}/{{ activeCount }})
        </UiButton>
      </div>
    </template>

    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">
          Matchup {{ view.round.number }} / {{ view.round.total }}
        </UiBadge>
      </div>

      <div class="duel">
        <button
          class="entry"
          :class="{
            chosen: view.round.yourVote === 'a',
            winner: view.round.reveal && view.round.reveal.winner !== 'b',
          }"
          :disabled="!canVote"
          @click="vote('a')"
        >
          <p class="entry-text">“{{ view.round.captionA }}”</p>
          <div v-if="view.round.reveal" class="entry-meta">
            <UiAvatar :name="room.nameOf(view.round.reveal.authorAId)" size="sm" />
            <span>{{ room.nameOf(view.round.reveal.authorAId) }}</span>
            <UiBadge variant="neutral">{{ view.round.reveal.counts.a }}</UiBadge>
          </div>
        </button>
        <span class="vs">vs</span>
        <button
          class="entry"
          :class="{
            chosen: view.round.yourVote === 'b',
            winner: view.round.reveal && view.round.reveal.winner !== 'a',
          }"
          :disabled="!canVote"
          @click="vote('b')"
        >
          <p class="entry-text">“{{ view.round.captionB }}”</p>
          <div v-if="view.round.reveal" class="entry-meta">
            <UiAvatar :name="room.nameOf(view.round.reveal.authorBId)" size="sm" />
            <span>{{ room.nameOf(view.round.reveal.authorBId) }}</span>
            <UiBadge variant="neutral">{{ view.round.reveal.counts.b }}</UiBadge>
          </div>
        </button>
      </div>

      <template v-if="view.phase === 'voting'">
        <UiProgressBar :value="view.round.votedIds.length" :max="activeCount" label="Votes in" />
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.votedIds.length === 0"
            @click="room.sendAction({ kind: 'caption/reveal' })"
          >
            Reveal ({{ view.round.votedIds.length }}/{{ activeCount }})
          </UiButton>
        </div>
      </template>
      <div v-else-if="room.isHost" class="host-row">
        <UiButton @click="room.sendAction({ kind: 'caption/next' })">
          {{ view.round.number < view.round.total ? 'Next matchup' : 'Show final scores' }}
        </UiButton>
      </div>
    </template>

    <template v-else-if="view.phase === 'results'">
      <h2 class="title">Scores so far 🏆</h2>
      <UiCard>
        <ol class="scores" aria-live="polite">
          <li v-for="(s, i) in view.scores" :key="s.participantId" class="score-row">
            <span class="rank">{{ i + 1 }}</span>
            <UiAvatar :name="room.nameOf(s.participantId)" size="sm" />
            <span>{{ room.nameOf(s.participantId) }}</span>
            <UiBadge :variant="s.score > 0 && i === 0 ? 'success' : 'neutral'">
              best: {{ s.score }} {{ s.score === 1 ? 'vote' : 'votes' }}
            </UiBadge>
          </li>
        </ol>
      </UiCard>
      <div v-if="room.isHost" class="host-row">
        <UiButton @click="room.sendAction({ kind: 'caption/restart' })">
          Another round — new prompt
        </UiButton>
      </div>
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
.round-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.form {
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
.duel {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
}
.vs {
  align-self: center;
  color: var(--color-text-faint);
  font-size: var(--font-size-sm);
}
.entry {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
}
.entry:hover:not(:disabled) {
  border-color: var(--color-border-strong);
}
.entry:disabled {
  cursor: default;
}
.entry.chosen {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.entry.winner {
  border-color: var(--color-success);
}
.entry-text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
}
.entry-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
