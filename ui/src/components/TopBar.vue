<script setup>
import { computed } from 'vue'
import { useReview } from '../stores/review.js'
import RefPicker from './RefPicker.vue'

const review = useReview()
const { state, totals, progress } = review

/**
 * Only BEHIND is worth annotating. Being ahead of your upstream is the normal
 * state of unpushed work and says nothing about the branch's fitness as a diff
 * base, so surfacing it would be noise on almost every row.
 *
 * Kept as its own field rather than baked into the label: a native `<option>`
 * could only hold flat text, but the picker renders it as a distinct muted
 * element and excludes it from filter matching.
 */
const staleNote = ({ tracking }) => {
  if (!tracking) return undefined
  if (tracking.gone) return 'upstream gone'
  return tracking.behind > 0 ? `${tracking.behind} behind` : undefined
}

const localOptions = (branches) =>
  branches.map((branch) => ({ value: branch.name, label: branch.name, note: staleNote(branch) }))

const remoteOptions = (refs) => refs.map((ref) => ({ value: ref, label: ref }))

/**
 * Remote-tracking branches are offered as a base because a local branch can be
 * behind its upstream, and diffing against a stale local base produces a
 * merge-base — and therefore a diff — that no real pull request would show.
 *
 * The group is dropped entirely when the repository has no remotes, rather
 * than rendering an empty optgroup.
 */
const baseOptions = computed(() =>
  [
    { group: 'Local', options: localOptions(state.branches) },
    { group: 'Remote (as of last fetch)', options: remoteOptions(state.remoteBranches) },
  ].filter((group) => group.options.length > 0),
)

const compareOptions = computed(() => [
  { group: 'Uncommitted', options: state.virtualRefs.map((r) => ({ value: r.id, label: r.label })) },
  { group: 'Branches', options: localOptions(state.branches) },
])

/** Tracking status of the selected base, when it is a local branch. */
const baseTracking = computed(
  () => state.branches.find((branch) => branch.name === state.baseRef)?.tracking ?? null,
)

const baseIsStale = computed(() => baseTracking.value?.behind > 0 || baseTracking.value?.gone)

const baseStaleTitle = computed(() => {
  const tracking = baseTracking.value
  if (!tracking) return ''
  if (tracking.gone) return `Upstream ${tracking.upstream} no longer exists`

  const commits = tracking.behind === 1 ? 'commit' : 'commits'
  return (
    `${state.baseRef} is ${tracking.behind} ${commits} behind ${tracking.upstream}. ` +
    `Using ${tracking.upstream} as the base gives the diff a pull request would show.`
  )
})

const allViewed = computed(
  () => progress.value.total > 0 && progress.value.viewed === progress.value.total,
)
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-name">llm-review</span>
      <span class="repo mono" :title="state.repoPath">{{ state.repoPath.split('/').pop() }}</span>
    </div>

    <div class="selectors">
      <RefPicker
        field-label="base"
        :model-value="state.baseRef"
        :groups="baseOptions"
        @update:model-value="review.setBaseRef"
      >
        <!-- Rides on the label line so it costs no extra height in an already
             tight bar, and sits directly above what it describes. -->
        <template #badge>
          <span v-if="baseIsStale" class="stale" :title="baseStaleTitle">
            {{ baseTracking.gone ? 'upstream gone' : `${baseTracking.behind} behind` }}
          </span>
        </template>
      </RefPicker>

      <span class="arrow">&larr;</span>

      <RefPicker
        field-label="compare"
        :model-value="state.compareRef"
        :groups="compareOptions"
        @update:model-value="review.setCompareRef"
      />
    </div>

    <div class="meta">
      <span class="counts mono">
        <strong class="stat-added">+{{ totals.added }}</strong>
        <strong class="stat-deleted">-{{ totals.deleted }}</strong>
      </span>
      <span class="progress" :class="{ complete: allViewed }">
        {{ progress.viewed }}/{{ progress.total }} viewed
      </span>
      <button class="finish" :class="{ ready: allViewed }" @click="review.finishReview()">
        Finish review
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px 16px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.brand-name {
  font-weight: 600;
  letter-spacing: -0.01em;
}

.repo {
  font-size: 12px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selectors {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

/* A warning, not an error: the base still works, it is just probably not the
   one you meant. Amber rather than red.

   Filled rather than a tinted-text pill. At 10px the tinted version measured
   3.6:1 against the bar, under the 4.5:1 AA floor for text this small — poor
   for the one element whose whole job is to be noticed.

   `--bg` as the foreground is what makes it work in both themes: it is white
   over the dark amber of the light palette, and near-black over the light
   amber of the dark palette. */
.stale {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--modified);
  color: var(--bg);
  font-weight: 700;
  letter-spacing: 0.03em;
  white-space: nowrap;
  cursor: help;
}

.arrow {
  padding-bottom: 4px;
  color: var(--fg-muted);
}

.meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.counts {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.progress {
  font-size: 12px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

.progress.complete {
  color: var(--added);
  font-weight: 600;
}

.finish {
  padding: 5px 14px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-weight: 500;
}

.finish.ready {
  background: var(--added);
  border-color: var(--added);
  color: #fff;
}

.finish:hover {
  border-color: var(--accent);
}
</style>
