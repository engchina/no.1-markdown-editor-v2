import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AI command palette entries route through shared quick-action presets where appropriate', async () => {
  const commands = await readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8')

  assert.match(commands, /id: 'ai\.ask'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('ask', t\)/)
  assert.match(commands, /id: 'ai\.continueWriting'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('continueWriting', t\)/)
  assert.match(commands, /id: 'ai\.ghostTextContinuation'/)
  assert.match(commands, /dispatchEditorAIGhostText\(\{ source: 'command-palette' \}\)/)
  assert.match(commands, /id: 'ai\.newNote'/)
  assert.match(commands, /createAITemplateOpenDetail\('newNote', t, 'command-palette'\)/)
  assert.match(commands, /id: 'ai\.summarizeSelection'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('summarize', t\)/)
  assert.match(commands, /id: 'ai\.translateSelection'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('translate', t\)/)
})

test('selection bubble dispatches AI open events from quick actions without collapsing the current selection first', async () => {
  const bubble = await readFile(new URL('../src/components/AI/AISelectionBubble.tsx', import.meta.url), 'utf8')

  assert.match(bubble, /const ACTIONS: AIQuickAction\[] = \['ask', 'translate', 'summarize', 'explain', 'rewrite'\]/)
  assert.match(bubble, /onMouseDown=\{\(event\) => \{\s*event\.preventDefault\(\)/)
  assert.match(bubble, /dispatchEditorAIOpen\(createAIQuickActionOpenDetail\(action, t\)\)/)
  assert.match(bubble, /new ResizeObserver\(reportSize\)/)
  assert.match(bubble, /onSizeChange\?: \(size: SelectionBubbleSize\) => void/)
})

test('CodeMirrorEditor resolves AI open defaults from persisted write-target and selection-role preferences', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /const aiDefaultWriteTarget = useEditorStore\(\(state\) => state\.aiDefaultWriteTarget\)/)
  assert.match(editor, /const aiDefaultSelectedTextRole = useEditorStore\(\(state\) => state\.aiDefaultSelectedTextRole\)/)
  assert.match(editor, /resolveAIOpenOutputTarget\(\s*intent,\s*requestedOutputTarget,\s*hasSelection,\s*aiDefaultWriteTarget\s*\)/)
  assert.match(editor, /resolveAISelectedTextRole\(detail\.selectedTextRole, aiDefaultSelectedTextRole\)/)
})

test('AIComposer cancel path both increments the local run id and attempts backend cancellation', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /async function handleCancelRequest\(\)/)
  assert.match(composer, /requestRunIdRef\.current \+= 1/)
  assert.match(composer, /activeRequestIdRef\.current = null/)
  assert.match(composer, /await cancelAICompletion\(requestId\)/)
  assert.match(composer, /pushInfoNotice\('notices\.aiRequestCanceledTitle', 'notices\.aiRequestCanceledMessage'\)/)
})

test('AIComposer routes chat-only outputs through explicit insert targets and non-chat outputs through apply', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /composer\.outputTarget === 'chat-only' && canApplyToEditor/)
  assert.match(composer, /insertTargets\.map\(\(target\) => \(/)
  assert.match(composer, /'new-note'/)
  assert.match(composer, /handleApplyToTarget\(target\)/)
  assert.match(composer, /composer\.outputTarget !== 'chat-only' && canApplyToEditor/)
  assert.match(composer, /onClick=\{handleApply\}/)
})

test('AIComposer exposes keyboard shortcuts for run and apply, and the editor regains focus when the composer closes', async () => {
  const [composer, editor] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /matchesPrimaryShortcut\(event, \{ key: 'enter', shift: true \}\) && canApplyDraft/)
  assert.match(composer, /matchesPrimaryShortcut\(event, \{ key: 'enter' \}\) && canSubmit/)
  assert.match(composer, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/)
  assert.match(composer, /aria-keyshortcuts="Control\+Shift\+Enter Meta\+Shift\+Enter"/)
  assert.match(editor, /const wasComposerOpen = previousAIComposerOpenRef\.current/)
  assert.match(editor, /interface AIComposerRestoreSnapshot \{/)
  assert.match(editor, /const aiComposerRestoreSnapshotRef = useRef<AIComposerRestoreSnapshot \| null>\(null\)/)
  assert.match(editor, /aiComposerRestoreSnapshotRef\.current = \{/)
  assert.match(editor, /selection: view\.state\.selection/)
  assert.match(editor, /scrollTop: view\.scrollDOM\.scrollTop/)
  assert.match(editor, /if \(!view\) return/)
  assert.match(editor, /const detail = \(event as CustomEvent<EditorAIOpenDetail>\)\.detail/)
  assert.match(editor, /view\.dispatch\(\{ selection: snapshot\.selection \}\)/)
  assert.match(editor, /view\.scrollDOM\.scrollTop = snapshot\.scrollTop/)
  assert.match(editor, /requestAnimationFrame\(\(\) => requestAnimationFrame\(applyRestore\)\)/)
  assert.match(editor, /view\.focus\(\)/)
  assert.match(editor, /reconfigure\(autocompleteCompartmentRef\.current, \[\]\)/)
  assert.match(editor, /reconfigure\(autocompleteCompartmentRef\.current, autocompleteExtensions\)/)
  assert.match(editor, /if \(!update\.docChanged\) return/)
  assert.match(editor, /matchAISlashCommandQuery\(before\)/)
  assert.match(editor, /const currentView = viewRef\.current/)
  assert.match(editor, /autocomplete\.startCompletion\(currentView\)/)
  assert.match(editor, /isolateHistory\.of\('full'\)/)
  assert.match(editor, /userEvent: 'input\.ai'/)
})

test('Dialog overlays restore focus without forcing the editor viewport back to the top', async () => {
  const [composer, palette, focusHook] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useDialogFocusRestore.ts', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /focusElementWithoutScroll\(textareaRef\.current\)/)
  assert.match(palette, /useDialogFocusRestore\(inputRef\)/)
  assert.match(focusHook, /editorScrollTop/)
  assert.match(focusHook, /element\.focus\(\{ preventScroll: true \}\)/)
  assert.match(focusHook, /scroller\.scrollTop = snapshot\.editorScrollTop/)
})
