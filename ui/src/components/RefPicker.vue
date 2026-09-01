<script setup>
import { computed, ref } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
  useFilter,
} from 'reka-ui'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** [{ group: 'Local', options: [{ value, label, note? }] }] */
  groups: { type: Array, required: true },
  fieldLabel: { type: String, required: true },
})

defineEmits(['update:modelValue'])

// reka-ui resets the search term on blur and on select by default, so the
// panel always reopens showing every ref — no clearing logic needed here.
const searchTerm = ref('')

/**
 * `sensitivity: 'base'` makes matching ignore case AND accents, so `ORIGIN`
 * finds `origin/main` and `ae` finds `feature/áé`.
 */
const { contains } = useFilter({ sensitivity: 'base' })

/**
 * Filtering happens here rather than inside ComboboxRoot (hence
 * `ignore-filter`) so that a group whose options all drop out disappears with
 * its header instead of leaving an empty label behind.
 *
 * Only the label is matched. The note ("37 behind") is status, not identity —
 * typing "behind" to find branches would be a strange thing to support.
 */
const visibleGroups = computed(() => {
  const needle = searchTerm.value.trim()
  if (!needle) return props.groups

  return props.groups
    .map((group) => ({ ...group, options: group.options.filter((o) => contains(o.label, needle)) }))
    .filter((group) => group.options.length > 0)
})

const totalMatches = computed(() =>
  visibleGroups.value.reduce((count, group) => count + group.options.length, 0),
)

const selectedLabel = computed(() => {
  for (const group of props.groups) {
    const hit = group.options.find((option) => option.value === props.modelValue)
    if (hit) return hit
  }
  return null
})
</script>

<template>
  <div class="picker">
    <span class="field-label">
      {{ fieldLabel }}
      <slot name="badge" />
    </span>

    <ComboboxRoot
      :model-value="modelValue"
      :ignore-filter="true"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <ComboboxAnchor as-child>
        <ComboboxTrigger class="trigger" :title="modelValue">
          <span class="trigger-label">{{ selectedLabel?.label ?? modelValue }}</span>
          <span v-if="selectedLabel?.note" class="trigger-note">{{ selectedLabel.note }}</span>
          <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 4.5 L6 8 L9.5 4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </ComboboxTrigger>
      </ComboboxAnchor>

      <ComboboxPortal>
        <ComboboxContent class="panel" position="popper" :side-offset="4">
          <div class="search">
            <!-- `display-value` defaults to echoing the selected item, which
                 opens the panel with the current ref already typed in and the
                 list filtered down to it. This is a search box, not a text
                 field bound to the value, so it starts empty. -->
            <ComboboxInput
              v-model="searchTerm"
              :display-value="() => ''"
              class="search-input"
              placeholder="Filter refs"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <!-- Announced politely so the filtered count reaches screen readers,
               which otherwise get no signal that the list shrank. -->
          <span class="sr-only" role="status" aria-live="polite">
            {{ totalMatches }} {{ totalMatches === 1 ? 'match' : 'matches' }}
          </span>

          <ComboboxViewport class="viewport">
            <ComboboxEmpty class="empty">No ref matches that filter.</ComboboxEmpty>

            <ComboboxGroup v-for="group in visibleGroups" :key="group.group">
              <ComboboxLabel class="group-label">{{ group.group }}</ComboboxLabel>

              <ComboboxItem
                v-for="option in group.options"
                :key="option.value"
                :value="option.value"
                class="item"
              >
                <span class="check">
                  <ComboboxItemIndicator>
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="M2.5 6.5 L4.75 8.75 L9.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </ComboboxItemIndicator>
                </span>

                <span class="item-label">{{ option.label }}</span>
                <span v-if="option.note" class="item-note">{{ option.note }}</span>
              </ComboboxItem>
            </ComboboxGroup>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-muted);
}

.trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 240px;
  padding: 4px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: inherit;
  font: inherit;
  text-align: left;
}

.trigger:hover {
  border-color: var(--accent);
}

.trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-note {
  flex: none;
  font-size: 11px;
  color: var(--modified);
  font-weight: 600;
}

.chevron {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--fg-muted);
}
</style>

<!-- The panel is portalled to <body>, so scoped styles cannot reach it. -->
<style>
.panel {
  z-index: 50;
  display: flex;
  flex-direction: column;
  /* Wider than its trigger on purpose: deep branch names are the reason this
     control exists, and a native select can never do this. */
  width: max(var(--reka-combobox-trigger-width), 320px);
  max-width: 460px;
  max-height: min(420px, 60vh);
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow), 0 8px 24px rgba(0, 0, 0, 0.18);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: var(--fg);
}

.panel .search {
  flex: none;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.panel .search-input {
  width: 100%;
  padding: 5px 9px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: inherit;
  font: inherit;
}

.panel .search-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
  border-color: transparent;
}

.panel .viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.panel .empty {
  padding: 18px 10px;
  color: var(--fg-muted);
  text-align: center;
  font-size: 12.5px;
}

.panel .group-label {
  display: block;
  padding: 6px 8px 3px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-muted);
}

.panel .item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

/* reka-ui drives this from keyboard AND pointer, so arrow keys and the mouse
   share one highlight instead of fighting over two. */
.panel .item[data-highlighted] {
  background: var(--accent);
  color: #fff;
  outline: none;
}

.panel .item[data-highlighted] .item-note {
  color: #fff;
}

.panel .check {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--accent);
}

.panel .item[data-highlighted] .check {
  color: #fff;
}

.panel .check svg {
  width: 12px;
  height: 12px;
}

.panel .item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel .item-note {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--modified);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
