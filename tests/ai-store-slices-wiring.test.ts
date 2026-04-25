import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AI store composes dedicated composer, history, and provenance slices', async () => {
  const [store, composerSlice, historySlice, provenanceSlice] = await Promise.all([
    readFile(new URL('../src/store/ai.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/aiComposerSlice.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/aiHistorySlice.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/aiProvenanceSlice.ts', import.meta.url), 'utf8'),
  ])

  assert.match(store, /import \{\s*createAIComposerSlice,\s*type AIComposerSliceState,\s*\} from '\.\/aiComposerSlice\.ts'/)
  assert.match(
    store,
    /import \{\s*createAIHistorySlice,\s*mergePersistedAIHistoryState,\s*partializeAIHistoryState,\s*type AIHistorySliceState,\s*\} from '\.\/aiHistorySlice\.ts'/
  )
  assert.match(store, /import \{\s*createAIProvenanceSlice,\s*type AIProvenanceSliceState,\s*\} from '\.\/aiProvenanceSlice\.ts'/)
  assert.match(
    store,
    /interface AIStoreState extends AIComposerSliceState, AIHistorySliceState, AIProvenanceSliceState/
  )
  assert.match(store, /\.\.\.createAIComposerSlice<AIStoreState>\(set, \{/)
  assert.match(store, /maxDraftTextLength: MAX_AI_DRAFT_TEXT_LENGTH/)
  assert.match(store, /\.\.\.createAIHistorySlice<AIStoreState>\(set, get\)/)
  assert.match(store, /\.\.\.createAIProvenanceSlice<AIStoreState>\(set, get\)/)
  assert.match(store, /partialize: \(state\) => partializeAIHistoryState\(state\)/)
  assert.match(store, /mergePersistedAIHistoryState\(persisted as Partial<AIStoreState> \| undefined, current\)/)
  assert.match(store, /export \{ createInitialAIComposerState \} from '\.\/aiComposerSlice\.ts'/)

  assert.match(composerSlice, /export interface AIComposerSliceState/)
  assert.match(composerSlice, /export function createInitialAIComposerState\(\)/)
  assert.match(composerSlice, /export function createAIComposerSlice/)

  assert.match(historySlice, /export interface AIHistorySliceState/)
  assert.match(historySlice, /export function createInitialAIHistoryState\(\)/)
  assert.match(historySlice, /export function partializeAIHistoryState/)
  assert.match(historySlice, /export function mergePersistedAIHistoryState/)
  assert.match(historySlice, /export function createAIHistorySlice/)

  assert.match(provenanceSlice, /export interface AIProvenanceSliceState/)
  assert.match(provenanceSlice, /export function createAIProvenanceSlice/)
})
