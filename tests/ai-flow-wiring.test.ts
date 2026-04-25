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

test('AIComposer separates the form scroller from the bounded result panel', async () => {
  const [composer, core] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(core, /data-ai-composer-scroll="form"/)
  assert.match(core, /data-ai-retrieval-panel="true"/)
  assert.match(core, /data-ai-retrieval-toggle="true"/)
  assert.match(core, /data-ai-retrieval-body="true"/)
  assert.match(core, /data-ai-retrieval-query="true"/)
  assert.match(core, /data-ai-retrieval-result=\{index\}/)
  assert.match(core, /aria-expanded=\{expanded\}/)
  assert.match(core, /<AppIcon name="search" size=\{18\} \/>/)
  assert.match(core, /<AppIcon name="chevronRight" size=\{16\} \/>/)
  assert.match(core, /data-ai-result-panel="true"/)
  assert.match(core, /data-ai-result-body="true"/)
  assert.match(core, /showResultPanel && hasRetrievalDetails && !composer\.errorMessage && !workspaceExecutionPanel/)
  assert.match(composer, /const promptRows = showResultPanel \? 3 : 4/)
  assert.match(composer, /const promptMinHeight = showResultPanel \? '96px' : '124px'/)
  assert.match(composer, /const resultPanelMinHeight = hasWorkspaceExecutionTasks \? '260px' : '220px'/)
  assert.match(core, /rows=\{promptRows\}/)
  assert.match(core, /minHeight: promptMinHeight/)
  assert.match(core, /className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border"/)
  assert.match(core, /className="min-h-0 flex-1 overflow-y-auto px-4 py-3"/)
})

test('AIComposer keeps AI connection setup in a dedicated AI setup panel and removes inline provider editing controls', async () => {
  const [composer, core, toolbar] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(core, /data-ai-setup-hint="true"/)
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
