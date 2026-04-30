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
  assert.match(commands, /dispatchEditorAIOpen\(\{\s*source: 'command-palette',\s*intent: 'generate',\s*outputTarget: 'new-note',\s*prompt: t\('ai\.templates\.newNotePrompt'\),?\s*\}\)/)
  assert.match(commands, /id: 'ai\.summarizeSelection'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('summarize', t\)/)
  assert.match(commands, /id: 'ai\.translateSelection'/)
  assert.match(commands, /createAIQuickActionOpenDetail\('translate', t\)/)
})

test('selection bubble dispatches AI open events from quick actions without collapsing the current selection first', async () => {
  const bubble = await readFile(new URL('../src/components/AI/AISelectionBubble.tsx', import.meta.url), 'utf8')

  assert.match(bubble, /const SELECTION_PRIMARY_ACTIONS: AIQuickAction\[] = \['ask', 'rewrite', 'translate'\]/)
  assert.match(bubble, /const SELECTION_MORE_ACTIONS: AIQuickAction\[] = \['summarize', 'explain'\]/)
  assert.doesNotMatch(bubble, /CURSOR_ACTIONS/)
  assert.doesNotMatch(bubble, /mode === 'cursor'/)
  assert.match(bubble, /onMouseDown=\{\(event\) => \{\s*event\.preventDefault\(\)/)
  assert.match(bubble, /dispatchEditorAIOpen\(createAIQuickActionOpenDetail\(action, t\)\)/)
  assert.match(bubble, /data-ai-selection-more="true"/)
  assert.match(bubble, /data-ai-selection-more-menu="true"/)
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

test('AIComposer surfaces selected text context before the prompt area', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /const hasSelectedTextContext = !!composer\.context\?\.selectedText\?\.trim\(\)/)
  assert.match(composer, /const hasEnabledSelectedTextContext = hasSelectedTextContext && composer\.useSelectedTextContext/)
  assert.match(composer, /includeSelectedTextContext: hasEnabledSelectedTextContext/)
  assert.match(composer, /showSelectedTextContextToggle=\{hasSelectionRange\}/)
  assert.match(composer, /canToggleSelectedTextContext=\{hasSelectedTextContext\}/)
  assert.match(composer, /onToggleSelectedTextContext=\{setUseSelectedTextContext\}/)
  assert.match(core, /data-ai-selection-context="true"/)
  assert.match(core, /data-ai-context-state=\{useSelectedTextContext \? 'selection-context' : 'prompt-only'\}/)
  assert.match(core, /composer\.context\?\.selectedTextRole === 'reference-only'/)
  assert.match(core, /composer\.outputTarget === 'replace-selection'/)
  assert.match(core, /data-ai-action="toggle-selection-context"/)
  assert.match(core, /aria-checked=\{useSelectedTextContext\}/)
  assert.match(core, /disabled=\{composer\.requestState === 'streaming' \|\| !canToggleSelectedTextContext\}/)
  assert.match(core, /t\('ai\.context\.selectionReference'\)/)
  assert.match(core, /t\('ai\.context\.selectionTarget'\)/)
  assert.match(core, /t\('ai\.context\.selectionContext'\)/)
  assert.match(core, /t\('ai\.context\.useSelectionContext'\)/)
})

test('AIComposer cancel path both increments the local run id and attempts backend cancellation', async () => {
  const [composer, runtime] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8'),
  ])

  assert.match(runtime, /const handleCancelRequest = useCallback\(async \(\) =>/)
  assert.match(runtime, /requestRunIdRef\.current \+= 1/)
  assert.match(runtime, /activeRequestIdRef\.current = null/)
  assert.match(runtime, /await cancelAICompletion\(requestId\)/)
  assert.match(runtime, /pushInfoNotice\('notices\.aiRequestCanceledTitle', 'notices\.aiRequestCanceledMessage'\)/)
  assert.match(composer, /useAIComposerRuntime\(\{/)
})

test('AIComposer exposes explicit replace, insert, and new-note result actions while keeping keyboard apply on the preferred target', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /const defaultInsertTarget: AIInsertTarget =/)
  assert.match(composer, /const preferredResultAction: 'replace' \| 'insert' \| 'new-note' =/)
  assert.match(core, /data-ai-action="replace"/)
  assert.match(core, /data-ai-action="insert"/)
  assert.match(core, /data-ai-action="new-note"/)
  assert.match(composer, /replaceActionTarget/)
  assert.match(composer, /function getCurrentDocumentResultActionStyle\(action: AIResultPrimaryAction\)/)
  assert.match(core, /style=\{getCurrentDocumentResultActionStyle\('replace'\)\}/)
  assert.match(core, /style=\{getCurrentDocumentResultActionStyle\('insert'\)\}/)
  assert.match(core, /style=\{getCurrentDocumentResultActionStyle\('new-note'\)\}/)
  assert.match(composer, /handleApplyToTarget\(defaultInsertTarget\)/)
  assert.match(composer, /handleApplyToTarget\('new-note'\)/)
  assert.match(core, /data-ai-current-output-target="true"/)
})

test('AIComposer rebuilds effective context from the captured snapshot while keeping the suggestion row prompt-only', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /buildAIComposerContextPacket\(/)
  assert.match(composer, /includeSlashCommandContext: composer\.useSlashCommandContext/)
  assert.match(composer, /resolveAIComposerTemplateResolution\(/)
  assert.match(composer, /setScope\(resolution\.scope\)/)
  assert.match(composer, /setOutputTarget\(resolution\.outputTarget\)/)
  assert.match(composer, /hasSlashCommandContext/)
  assert.match(composer, /hasEnabledSlashCommandContext/)
  assert.match(composer, /hasSlashCommandContext: hasEnabledSlashCommandContext/)
  assert.match(composer, /canToggleSlashCommandContext=\{hasSlashCommandContext\}/)
  assert.match(core, /hasSlashCommandContext=\{hasSlashCommandContext\}/)
  assert.match(core, /data-ai-template-hint="transform-target-required"/)
  assert.match(core, /disabled=\{!resolution\.enabled\}/)
  assert.doesNotMatch(core, /data-ai-template-target=/)
  assert.doesNotMatch(core, /t\('ai\.mode\.target'\)/)
  assert.doesNotMatch(composer, /activeTab\?\.name \?\? t\('app\.untitled'\)/)
  assert.doesNotMatch(composer, /t\('ai\.context\.language'\)/)
  assert.doesNotMatch(composer, /formatAIDocumentLanguage\(/)
})

test('AIComposer template chips append a trailing newline and place the caret on the next line', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /const initialTemplatePromptRef = useRef<string \| null>\(composer\.prompt\)/)
  assert.match(composer, /const pendingPromptSelectionRef = useRef<number \| null>\(null\)/)
  assert.match(composer, /const initialPrompt = initialTemplatePromptRef\.current/)
  assert.match(composer, /const matchingTemplate = templateModels\.find\(\(template\) => template\.prompt === initialPrompt\)/)
  assert.match(composer, /function buildTemplatePromptDraft\(prompt: string\): string/)
  assert.match(composer, /return `\$\{trimmedPrompt\}\\n`/)
  assert.match(composer, /const nextPrompt = buildTemplatePromptDraft\(template\.prompt\)/)
  assert.match(composer, /pendingPromptSelectionRef\.current = nextPrompt\.length/)
  assert.match(composer, /setPrompt\(nextPrompt\)/)
  assert.match(composer, /const caret = Math\.min\(nextSelection, composer\.prompt\.length\)/)
  assert.match(composer, /focusElementWithoutScroll\(textarea\)/)
  assert.match(composer, /textarea\.setSelectionRange\(caret, caret\)/)
})

test('slash-command AI entry can use slash-prefix text as context and exposes a composer toggle', async () => {
  const [composer, core, editor, optionalFeatures, app, prompt] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/prompt.ts', import.meta.url), 'utf8'),
  ])

  assert.match(optionalFeatures, /buildAISlashCommandContext\(view\.state\.sliceDoc\(0, from\)\)/)
  assert.match(optionalFeatures, /slashCommandContext/)
  assert.match(editor, /buildAISlashCommandContext\(detail\.slashCommandContext \?\? ''\)/)
  assert.match(app, /buildAISlashCommandContext\(detail\.slashCommandContext \?\? ''\)/)
  assert.match(editor, /useSlashCommandContext: !!slashCommandContext/)
  assert.match(app, /useSlashCommandContext: !!slashCommandContext/)
  assert.match(composer, /showSlashCommandContextToggle=\{composer\.source === 'slash-command'\}/)
  assert.match(composer, /canToggleSlashCommandContext=\{hasSlashCommandContext\}/)
  assert.match(composer, /hasSlashCommandContext=\{hasEnabledSlashCommandContext\}/)
  assert.match(composer, /useSlashCommandContext=\{hasEnabledSlashCommandContext\}/)
  assert.match(composer, /onToggleSlashCommandContext=\{setUseSlashCommandContext\}/)
  assert.match(core, /data-ai-context-state=\{useSlashCommandContext \? 'slash-context' : 'prompt-only'\}/)
  assert.match(core, /data-ai-slash-context="true"/)
  assert.match(core, /data-ai-action="toggle-slash-context"/)
  assert.match(core, /aria-checked=\{useSlashCommandContext\}/)
  assert.match(core, /disabled=\{composer\.requestState === 'streaming' \|\| !canToggleSlashCommandContext\}/)
  assert.doesNotMatch(composer, /buildAIContextChipModels\(/)
  assert.match(core, /t\('ai\.context\.promptOnly'\)/)
  assert.ok((core.match(/t\('ai\.context\.promptOnly'\)/g) ?? []).length >= 2)
  assert.match(core, /t\('ai\.context\.slashBefore'\)/)
  assert.match(core, /t\('ai\.context\.useSlashBefore'\)/)
  assert.match(prompt, /Input source: slash-prefix/)
  assert.match(prompt, /Input role: context-before-cursor/)
  assert.doesNotMatch(prompt, /Slash command context \(hidden from the composer UI, content before the "\/" trigger\):/)
})

test('AIComposer exposes keyboard shortcuts for run and apply, and the editor regains focus when the composer closes', async () => {
  const [composer, core, editor] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /matchesPrimaryShortcut\(event, \{ key: 'enter', shift: true \}\) && canApplyDraft/)
  assert.match(composer, /matchesPrimaryShortcut\(event, \{ key: 'enter' \}\) && canSubmit/)
  assert.match(composer, /const dialogRef = useRef<HTMLDivElement>\(null\)/)
  assert.match(composer, /trapAIComposerTabFocus\(event, dialogRef\.current\)/)
  assert.match(composer, /document\.addEventListener\('focusin', onFocusIn\)/)
  assert.match(composer, /function getAIComposerFocusableElements\(dialog: HTMLElement\): HTMLElement\[]/)
  assert.match(composer, /function trapAIComposerTabFocus\(event: KeyboardEvent, dialog: HTMLElement \| null\): boolean/)
  assert.match(composer, /dialogRef=\{dialogRef\}/)
  assert.match(composer, /onOpenAISetup=\{handleOpenAISetup\}/)
  assert.match(core, /tabIndex=\{-1\}/)
  assert.match(core, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/)
  assert.match(core, /Control\+Shift\+Enter Meta\+Shift\+Enter/)
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
