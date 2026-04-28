import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AIComposer exposes draft and diff result views plus explicit replace, insert, and new-note result actions', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /<AIComposerCoreView/)
  assert.match(core, /data-ai-result-view=\{view\}/)
  assert.match(core, /view: 'draft', label: t\('ai\.result\.draft'\)/)
  assert.match(core, /view: 'diff', label: t\('ai\.result\.diff'\)/)
  assert.doesNotMatch(core, /view: 'explain', label: t\('ai\.result\.explain'\)/)
  assert.match(core, /onClick=\{\(\) => !disabled && setResultView\(view\)\}/)
  assert.doesNotMatch(core, /AIExplainView/)
  assert.match(core, /data-ai-action="replace"/)
  assert.match(core, /data-ai-action="insert"/)
  assert.match(core, /data-ai-action="new-note"/)
  assert.match(composer, /replaceActionTarget/)
  assert.match(composer, /currentDocumentPrimaryResultActionStyle/)
  assert.match(composer, /currentDocumentSecondaryResultActionStyle/)
  assert.match(composer, /preferredResultAction === action/)
  assert.match(composer, /handleApplyToTarget\(defaultInsertTarget\)/)
  assert.match(composer, /handleApplyToTarget\('new-note'\)/)
  assert.match(core, /data-ai-current-output-target="true"/)
  assert.match(composer, /replace-current-block/)
  assert.doesNotMatch(composer, /handleSetMode\(/)
})

test('AIComposer exposes retry, discard, stop, and copy actions in the toolbar', async () => {
  const core = await readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8')

  assert.match(core, /t\('ai\.retry'\)/)
  assert.match(core, /t\('ai\.discard'\)/)
  assert.match(core, /t\('ai\.stop'\)/)
  assert.match(core, /t\('ai\.copy'\)/)
})

test('AI Playwright smoke scripts track current composer fallback and manual QA result state', async () => {
  const [smoke, i18nSmoke, manualCapture] = await Promise.all([
    readFile(new URL('../scripts/run-ai-smoke.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/run-ai-i18n-smoke.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/run-ai-manual-qa-capture.mjs', import.meta.url), 'utf8'),
  ])

  assert.match(smoke, /Desktop app required/)
  assert.match(smoke, /AI provider settings and requests are only available in the desktop app right now\./)
  assert.match(smoke, /assertAIComposerMobileResultLayout\(page\)/)
  assert.match(smoke, /MOBILE_VIEWPORT = \{ width: 375, height: 812 \}/)
  assert.match(smoke, /waitForNoHorizontalOverflow\(page, '\[data-ai-result-actions="true"\]'\)/)
  assert.match(smoke, /waitForAIComposerWithinSourceEditor\(page\)/)
  assert.match(smoke, /assertAIComposerTabFocusContained\(page\)/)
  assert.match(smoke, /async function isEditorFocused\(page\)/)
  assert.match(smoke, /if \(!\(await isEditorFocused\(page\)\)\)/)
  assert.match(i18nSmoke, /composerFallbackLabel/)
  assert.match(i18nSmoke, /openSetupLabel/)
  assert.match(i18nSmoke, /await expectLocatorText\(composer, locale\.composerFallbackLabel\)/)
  assert.match(i18nSmoke, /data-ai-action="open-ai-setup"/)
  assert.match(manualCapture, /const applyVisible = hasResultTargets/)
  assert.match(manualCapture, /applyVisible,/)
  assert.match(manualCapture, /composerWithinSourceBounds/)
})

test('AIComposer bounds its modal frame to the source editor surface with vertical edge gaps', async () => {
  const [composer, core, editor] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(editor, /data-source-editor-surface="true"/)
  assert.match(composer, /AI_COMPOSER_SOURCE_SURFACE_SELECTOR = '\[data-source-editor-surface="true"\], \.cm-editor'/)
  assert.match(composer, /resolveAIComposerSourceFrameBounds\(\)/)
  assert.match(composer, /composerFrameBounds=\{composerFrameBounds\}/)
  assert.match(core, /const AI_COMPOSER_SOURCE_EDGE_GAP_PX = 16/)
  assert.match(core, /data-ai-composer-frame="source-editor"/)
  assert.match(core, /className="pointer-events-none fixed inset-x-0 flex items-center justify-center px-2 sm:px-6"/)
  assert.match(core, /top: `\$\{composerFrameBounds\.top\}px`/)
  assert.match(core, /bottom: `\$\{composerFrameBounds\.bottom\}px`/)
  assert.match(core, /paddingTop: `\$\{AI_COMPOSER_SOURCE_EDGE_GAP_PX\}px`/)
  assert.match(core, /paddingBottom: `\$\{AI_COMPOSER_SOURCE_EDGE_GAP_PX\}px`/)
  assert.match(core, /maxWidth: 'min\(960px, calc\(100vw - 1rem\)\)'/)
  assert.match(core, /minHeight: 'min\(540px, 100%\)'/)
  assert.match(core, /maxHeight: '100%'/)
})

test('AIComposer keeps the answer first while placing retrieval details below the result panel', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(core, /data-ai-composer-scroll="form"/)
  assert.match(core, /const formScrollerRef = useRef<HTMLDivElement>\(null\)/)
  assert.match(core, /const resultPanelRef = useRef<HTMLDivElement>\(null\)/)
  assert.match(core, /const retrievalPanelRef = useRef<HTMLDivElement>\(null\)/)
  assert.match(core, /ref=\{formScrollerRef\}/)
  assert.match(core, /ref=\{resultPanelRef\}/)
  assert.match(core, /const panel = resultPanelRef\.current/)
  assert.match(core, /const alreadyAnswerAnchored = Math\.abs\(panelRect\.top - scrollerRect\.top\) <= 16/)
  assert.match(core, /scroller\.scrollTo\(\{ top: Math\.max\(0, targetScrollTop\), behavior: 'auto' \}\)/)
  assert.match(core, /const showRetrievalPanel = showResultPanel && hasRetrievalDetails && !composer\.errorMessage && !workspaceExecutionPanel/)
  assert.match(core, /data-ai-result-source-summary="true"/)
  assert.match(core, /onClick=\{handleViewRetrievalSources\}/)
  assert.match(core, /retrievalPanelRef\.current\?\.scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/)
  assert.match(core, /window\.requestAnimationFrame\(scrollToRetrievalPanel\)/)
  assert.match(core, /panelRef=\{retrievalPanelRef\}/)
  assert.doesNotMatch(core, /panel\.querySelector<HTMLElement>\('\[data-ai-retrieval-result="0"\]'\) \?\? panel/)
  assert.match(core, /data-ai-retrieval-panel="true"/)
  assert.match(core, /className="min-w-0 shrink-0 overflow-hidden rounded-2xl border"/)
  assert.match(core, /data-ai-retrieval-toggle="true"/)
  assert.match(core, /data-ai-retrieval-peek="true"/)
  assert.match(core, /data-ai-retrieval-body="true"/)
  assert.match(core, /data-ai-retrieval-query="true"/)
  assert.match(core, /data-ai-retrieval-results="true"/)
  assert.match(core, /data-ai-retrieval-result=\{index\}/)
  assert.match(core, /data-ai-retrieval-result-mode=\{compact \? 'preview' : 'detail'\}/)
  assert.match(core, /data-ai-retrieval-more-count="true"/)
  assert.match(core, /aria-expanded=\{expanded\}/)
  assert.match(core, /aria-controls=\{bodyId\}/)
  assert.match(core, /className="truncate text-sm font-semibold"/)
  assert.match(core, /className="mt-1 truncate text-xs"/)
  assert.match(core, /className="hidden rounded-full border px-2\.5 py-1 text-\[10px\] font-semibold uppercase tracking-\[0\.12em\] sm:inline-flex"/)
  assert.match(core, /maxHeight: 'min\(42vh, 380px\)'/)
  assert.match(core, /<AppIcon name="search" size=\{18\} \/>/)
  assert.match(core, /<AppIcon name="chevronRight" size=\{16\} \/>/)
  assert.match(core, /data-ai-result-panel="true"/)
  const resultPanelIndex = core.indexOf('data-ai-result-panel="true"')
  const retrievalDisclosureCallIndex = core.indexOf('<AIRetrievalDisclosure')
  assert.ok(resultPanelIndex >= 0)
  assert.ok(retrievalDisclosureCallIndex > resultPanelIndex)
  assert.match(core, /data-ai-result-body="true"/)
  assert.match(core, /data-ai-result-actions="true"/)
  assert.match(core, /className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-1\.5 sm:flex-none sm:basis-auto sm:justify-end"/)
  assert.match(core, /className="max-w-full shrink-0 truncate rounded-lg/)
  assert.match(core, /\{showRetrievalPanel && \(/)
  assert.match(composer, /const promptRows = showResultPanel \? 3 : 4/)
  assert.match(composer, /const promptMinHeight = showResultPanel \? '96px' : '124px'/)
  assert.match(composer, /const resultPanelMinHeight = hasWorkspaceExecutionTasks \? '260px' : '220px'/)
  assert.match(core, /rows=\{promptRows\}/)
  assert.match(core, /minHeight: promptMinHeight/)
  assert.match(core, /showRetrievalPanel \? 'shrink-0' : 'flex-1'/)
  assert.match(core, /maxHeight: showRetrievalPanel \? 'min\(52vh, 460px\)' : undefined/)
  assert.match(core, /flex: showRetrievalPanel \? '0 0 auto' : undefined/)
  assert.match(core, /className="min-h-0 flex-1 overflow-y-auto px-4 py-3"/)
  assert.match(core, /style=\{\{ maxHeight: showRetrievalPanel \? 'min\(34vh, 320px\)' : undefined \}\}/)
})

test('AIComposer keeps AI connection setup in a dedicated AI setup panel and removes inline provider editing controls', async () => {
  const [composer, core, toolbar] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(core, /data-ai-setup-hint="true"/)
  assert.match(core, /data-ai-action="open-ai-setup"/)
  assert.match(core, /t\('ai\.setup\.open'\)/)
  assert.match(composer, /dispatchEditorAISetupOpen/)
  assert.match(composer, /async function handleOpenAISetup\(\)/)
  assert.doesNotMatch(core, /setConnectionOpen\(/)
  assert.doesNotMatch(core, /t\('ai\.connection\.toggle'\)/)
  assert.doesNotMatch(core, /t\('ai\.connection\.save'\)/)
  assert.doesNotMatch(core, /t\('ai\.connection\.clearKey'\)/)
  assert.doesNotMatch(composer, /saveAIProviderConfig\(/)
  assert.doesNotMatch(composer, /storeAIProviderApiKey\(/)
  assert.doesNotMatch(composer, /clearAIProviderApiKey\(/)
  assert.match(toolbar, /data-toolbar-action="ai-setup"/)
})

test('AIComposer strips legacy inline retrieval query prefixes from the final answer and stores retrieval metadata separately', async () => {
  const [composer, runtime] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8'),
  ])

  assert.match(runtime, /extractLegacyAIRetrievalMetadata\(response\.text\)/)
  assert.match(runtime, /setRetrievalExecuted\(response\.retrievalExecuted \|\| legacyRetrieval\.query !== null\)/)
  assert.match(runtime, /setRetrievalQuery\(response\.retrievalQuery \?\? legacyRetrieval\.query\)/)
  assert.match(runtime, /setRetrievalResults\(response\.retrievalResults\)/)
  assert.match(runtime, /setRetrievalResultCount\(response\.retrievalResultCount\)/)
  assert.match(composer, /useAIComposerRuntime\(\{/)
})

test('AIComposer no longer exposes explicit context mention helper UI or status cards', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(composer, /data-ai-mention-insert=\{kind\}/)
  assert.doesNotMatch(composer, /insertMentionToken\('note'\)/)
  assert.doesNotMatch(composer, /insertMentionToken\('heading'\)/)
  assert.doesNotMatch(composer, /insertMentionToken\('search'\)/)
  assert.doesNotMatch(composer, /data-ai-mention-card=\{resolution\.mention\.id\}/)
  assert.doesNotMatch(composer, /data-ai-mention-status=\{resolution\.status\}/)
})

test('AIComposer no longer renders the structured workspace context picker', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(composer, /data-ai-workspace-context="true"/)
  assert.doesNotMatch(composer, /data-ai-attach-current-note="true"/)
  assert.doesNotMatch(composer, /data-ai-attach-open-tab=\{tab\.id\}/)
  assert.doesNotMatch(composer, /data-ai-note-search-input="true"/)
  assert.doesNotMatch(composer, /data-ai-note-search-result=\{result\.path \?\? result\.name\}/)
  assert.doesNotMatch(composer, /removePromptMention\(resolution\.mention\.id\)/)
  assert.doesNotMatch(composer, /insertNoteMention\(result\.path \?\? result\.name\)/)
})

test('AIComposer promotes Hosted Agent to a top-level knowledge tab instead of nesting it under Data', async () => {
  const [composer, core, runtime] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8'),
  ])

  assert.match(runtime, /getAIKnowledgeType\(composer\.knowledgeSelection, composer\.executionTargetKind\)/)
  assert.match(core, /{ value: 'agent', label: t\('ai\.knowledge\.type\.agent'\) }/)
  assert.match(core, /data-ai-agent-profile-select="true"/)
  assert.doesNotMatch(core, /data-ai-structured-mode=/)
  assert.doesNotMatch(core, /data-ai-hosted-agent-select=/)
  assert.match(composer, /useAIComposerRuntime\(\{/)
})

test('AIComposer exposes workspace execution task cards and autonomous workspace agent session controls', async () => {
  const [composer, core, panel, hook, shared, plan] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIWorkspaceExecutionPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/useAIWorkspaceExecution.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIWorkspaceExecutionShared.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/workspaceExecution.ts', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /<AIWorkspaceExecutionPanel/)
  assert.match(composer, /useAIWorkspaceExecution\(\{/)
  assert.doesNotMatch(composer, /parseAIWorkspaceExecutionPlan\(/)
  assert.doesNotMatch(composer, /from '\.\.\/\.\.\/lib\/ai\/workspaceExecution\.ts'/)
  assert.match(panel, /data-ai-workspace-phase=\{phaseGroup\.id\}/)
  assert.match(panel, /data-ai-workspace-phase-summary=\{phaseGroup\.id\}/)
  assert.match(panel, /data-ai-workspace-task=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-preflight="true"/)
  assert.match(panel, /data-ai-workspace-task-preflight=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-dependencies=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-unresolved-dependencies=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-target-resolution=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-target-option=\{candidateKey\}/)
  assert.match(panel, /data-ai-workspace-task-target-clear=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-execute=\{task\.id\}/)
  assert.match(panel, /data-ai-workspace-task-open=\{task\.id\}/)
  assert.match(core, /data-ai-action="run-workspace-agent"/)
  assert.match(core, /data-ai-action="stop-workspace-agent"/)
  assert.match(panel, /data-ai-workspace-agent-session="true"/)
  assert.match(panel, /data-ai-workspace-agent-log=\{entry\.id\}/)
  assert.match(hook, /groupAIWorkspaceExecutionTasksByPhase\(/)
  assert.match(hook, /buildAIWorkspaceExecutionAgentResumeState\(/)
  assert.match(hook, /const clearWorkspaceHistoryBinding = useCallback\(\(\) =>/)
  assert.match(hook, /const bindWorkspaceHistoryForDraft = useCallback\(\(binding: WorkspaceHistoryBinding, draftText: string\) =>/)
  assert.match(hook, /workspaceProducedDraftsRef\.current/)
  assert.match(hook, /buildAIWorkspaceExecutionPreflight\(/)
  assert.match(hook, /producedDrafts: workspaceProducedDrafts/)
  assert.match(hook, /producedDrafts: workspaceProducedDraftsRef\.current/)
  assert.match(hook, /const runWorkspaceAgent = useCallback\(async \(\) =>/)
  assert.match(hook, /cancelWorkspaceAgentRun/)
  assert.match(hook, /status: 'canceled'/)
  assert.match(hook, /status: 'waiting'/)
  assert.match(panel, /t\('ai\.workspaceExecution\.statusCanceled'\)/)
  assert.match(shared, /t\('ai\.workspaceExecution\.statusWaiting'\)/)
  assert.match(panel, /t\('ai\.workspaceExecution\.preflightWaiting'\)/)
  assert.match(panel, /completionSource\.\$\{entry\.completionSource\}/)
  assert.match(panel, /completionSource\.\$\{taskState\.completionSource\}/)
  assert.match(hook, /manual-open-draft/)
  assert.match(hook, /manual-apply/)
  assert.match(hook, /completionAt/)
  assert.match(hook, /originRunId/)
  assert.match(shared, /agentLogResumedAgentRun/)
  assert.match(shared, /agentLogResumedManualApply/)
  assert.match(shared, /agentLogResumedManualOpenDraft/)
  assert.match(shared, /t\('ai\.workspaceExecution\.preflightTaskDependencyCycle'/)
  assert.match(shared, /t\('ai\.workspaceExecution\.preflightTaskDependencyPhaseOrder'/)
  assert.match(shared, /phaseStalledDependencies/)
  assert.match(panel, /t\('ai\.workspaceExecution\.agentCurrentPhase'/)
  assert.match(hook, /t\('ai\.workspaceExecution\.phaseBlockedByEarlierPhase'/)
  assert.match(panel, /onExecuteTask\(task\)/)
  assert.match(panel, /disabled=\{agentRunning\}/)
  assert.match(hook, /setWorkspaceProducedDraft\(task\.id, \{/)
  assert.match(plan, /ai-workspace-task\\s\+/)
  assert.match(plan, /AIWorkspaceExecutionProducedDraft/)
  assert.match(plan, /'dependency-cycle'/)
  assert.match(plan, /'dependency-phase-order'/)
  assert.match(plan, /attributes\.phase \?\? attributes\.stage/)
  assert.match(plan, /export function groupAIWorkspaceExecutionTasksByPhase/)
  assert.match(hook, /updateTabContent\(targetTab\.id, task\.content\)/)
  assert.match(hook, /openDesktopDocumentPath\(reference\.path\)/)
})

test('AIComposerCoreView stays independent from workspace execution implementation details', async () => {
  const core = await readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8')

  assert.match(core, /workspaceExecutionPanel: ReactNode \| null/)
  assert.doesNotMatch(core, /AIWorkspaceExecutionPanel/)
  assert.doesNotMatch(core, /useAIWorkspaceExecution/)
  assert.doesNotMatch(core, /workspaceExecution\.ts/)
})

test('CodeMirrorEditor blocks stale apply and clears the selection bubble when AI opens', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /if \(isAIApplySnapshotStale\(detail\.snapshot, currentDoc\)\)/)
  assert.match(editor, /pushErrorNotice\('notices\.aiApplyConflictTitle', 'notices\.aiApplyConflictMessage'\)/)
  assert.match(editor, /setSelectionBubble\(null\)/)
})

test('CodeMirrorEditor turns AI new-note applies into a new dirty draft tab instead of mutating the current document', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /if \(detail\.outputTarget === 'new-note'\)/)
  assert.match(editor, /useEditorStore\.getState\(\)\.addTab\(\{/)
  assert.match(editor, /savedContent: ''/)
  assert.match(editor, /isDirty: true/)
})

test('CodeMirrorEditor wires inline AI ghost text continuation through the editor event model', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')
  const ghost = await readFile(new URL('../src/lib/ai/ghostText.ts', import.meta.url), 'utf8')

  assert.match(editor, /EDITOR_AI_GHOST_TEXT_EVENT/)
  assert.match(editor, /createAIGhostTextExtensions\(\)/)
  assert.match(editor, /runAICompletion\(/)
  assert.match(editor, /showAIGhostText\(/)
  assert.match(editor, /shouldKeepAIGhostText\(/)
  assert.match(ghost, /dataset\.aiGhostText = this\.value\.status/)
  assert.match(ghost, /key: 'Tab'/)
  assert.match(ghost, /key: 'Escape'/)
  assert.match(ghost, /userEvent: 'input\.ai'/)
})

test('CodeMirrorEditor and AIComposer wire provenance markers into AI apply and ghost-text acceptance paths', async () => {
  const [editor, composer, provenance, extensions] = await Promise.all([
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/provenance.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /t\('ai\.provenance\.badge'\)/)
  assert.match(composer, /t\('ai\.provenance\.applyDetail'\)/)
  assert.match(editor, /createAIProvenanceExtensions\(\)/)
  assert.match(editor, /createAIProvenanceAddEffect\(/)
  assert.match(editor, /readAIProvenanceMarks\(view\)/)
  assert.match(editor, /setAIProvenanceMarks\(view, marks\)/)
  assert.match(provenance, /data-ai-provenance-mark/)
  assert.match(extensions, /\.cm-ai-provenance-range/)
  assert.match(extensions, /\.cm-ai-provenance-range': \{[\s\S]*background: 'transparent'/)
  assert.match(extensions, /\.cm-ai-provenance-range': \{[\s\S]*textDecoration: 'none'/)
  assert.doesNotMatch(extensions, /\.cm-ai-provenance-range': \{[\s\S]*textDecorationStyle:/)
  assert.doesNotMatch(extensions, /\.cm-ai-provenance-range': \{[\s\S]*borderRadius: '6px'/)
})

test('ThemePanel removes privacy copy and editable AI default preference controls from the settings panel', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(panel, /AISettingsSection/)
  assert.doesNotMatch(panel, /t\('ai\.connection\.privacyNote'\)/)
  assert.doesNotMatch(panel, /setAiDefaultWriteTarget\(/)
  assert.doesNotMatch(panel, /setAiDefaultSelectedTextRole\(/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.defaultWriteTarget'\)/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.selectedTextRole'\)/)
})
