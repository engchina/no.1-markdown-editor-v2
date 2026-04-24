import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AIComposer exposes draft and diff result views plus explicit replace, insert, and new-note result actions', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /data-ai-result-view=\{view\}/)
  assert.match(composer, /view: 'draft', label: t\('ai\.result\.draft'\)/)
  assert.match(composer, /view: 'diff', label: t\('ai\.result\.diff'\)/)
  assert.doesNotMatch(composer, /view: 'explain', label: t\('ai\.result\.explain'\)/)
  assert.match(composer, /onClick=\{\(\) => !disabled && setResultView\(view\)\}/)
  assert.doesNotMatch(composer, /AIExplainView/)
  assert.match(composer, /data-ai-action="replace"/)
  assert.match(composer, /data-ai-action="insert"/)
  assert.match(composer, /data-ai-action="new-note"/)
  assert.match(composer, /replaceActionTarget/)
  assert.match(composer, /handleApplyToTarget\(defaultInsertTarget\)/)
  assert.match(composer, /handleApplyToTarget\('new-note'\)/)
  assert.match(composer, /data-ai-current-output-target="true"/)
  assert.match(composer, /replace-current-block/)
  assert.doesNotMatch(composer, /handleSetMode\(/)
})

test('AIComposer exposes retry, discard, stop, and copy actions in the toolbar', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /t\('ai\.retry'\)/)
  assert.match(composer, /t\('ai\.discard'\)/)
  assert.match(composer, /t\('ai\.stop'\)/)
  assert.match(composer, /t\('ai\.copy'\)/)
})

test('AIComposer separates the form scroller from the bounded result panel', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /data-ai-composer-scroll="form"/)
  assert.match(composer, /data-ai-retrieval-panel="true"/)
  assert.match(composer, /data-ai-retrieval-toggle="true"/)
  assert.match(composer, /data-ai-retrieval-body="true"/)
  assert.match(composer, /data-ai-retrieval-query="true"/)
  assert.match(composer, /data-ai-retrieval-result=\{index\}/)
  assert.match(composer, /aria-expanded=\{expanded\}/)
  assert.match(composer, /<AppIcon name="search" size=\{18\} \/>/)
  assert.match(composer, /<AppIcon name="chevronRight" size=\{16\} \/>/)
  assert.match(composer, /data-ai-result-panel="true"/)
  assert.match(composer, /data-ai-result-body="true"/)
  assert.match(composer, /showResultPanel && hasRetrievalDetails && !composer\.errorMessage && !workspaceExecution/)
  assert.match(composer, /const promptRows = showResultPanel \? 3 : 4/)
  assert.match(composer, /const promptMinHeight = showResultPanel \? '96px' : '124px'/)
  assert.match(composer, /const resultPanelMinHeight = hasWorkspaceExecutionTasks \? '260px' : '220px'/)
  assert.match(composer, /rows=\{promptRows\}/)
  assert.match(composer, /minHeight: promptMinHeight/)
  assert.match(composer, /className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border"/)
  assert.match(composer, /className="min-h-0 flex-1 overflow-y-auto px-4 py-3"/)
})

test('AIComposer keeps AI connection setup in a dedicated AI setup panel and removes inline provider editing controls', async () => {
  const [composer, toolbar] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /data-ai-setup-hint="true"/)
  assert.doesNotMatch(composer, /setConnectionOpen\(/)
  assert.doesNotMatch(composer, /t\('ai\.connection\.toggle'\)/)
  assert.doesNotMatch(composer, /t\('ai\.connection\.save'\)/)
  assert.doesNotMatch(composer, /t\('ai\.connection\.clearKey'\)/)
  assert.doesNotMatch(composer, /saveAIProviderConfig\(/)
  assert.doesNotMatch(composer, /storeAIProviderApiKey\(/)
  assert.doesNotMatch(composer, /clearAIProviderApiKey\(/)
  assert.match(toolbar, /data-toolbar-action="ai-setup"/)
})

test('AIComposer strips legacy inline retrieval query prefixes from the final answer and stores retrieval metadata separately', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /extractLegacyAIRetrievalMetadata\(response\.text\)/)
  assert.match(composer, /setRetrievalExecuted\(response\.retrievalExecuted \|\| legacyRetrieval\.query !== null\)/)
  assert.match(composer, /setRetrievalQuery\(response\.retrievalQuery \?\? legacyRetrieval\.query\)/)
  assert.match(composer, /setRetrievalResults\(response\.retrievalResults\)/)
  assert.match(composer, /setRetrievalResultCount\(response\.retrievalResultCount\)/)
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
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /getAIKnowledgeType\(composer\.knowledgeSelection, composer\.executionTargetKind\)/)
  assert.match(composer, /{ value: 'agent', label: t\('ai\.knowledge\.type\.agent'\) }/)
  assert.match(composer, /data-ai-agent-profile-select="true"/)
  assert.doesNotMatch(composer, /data-ai-structured-mode=/)
  assert.doesNotMatch(composer, /data-ai-hosted-agent-select=/)
})

test('AIComposer exposes workspace execution task cards and autonomous workspace agent session controls', async () => {
  const [composer, plan] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/workspaceExecution.ts', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /data-ai-workspace-phase=\{phaseGroup\.id\}/)
  assert.match(composer, /data-ai-workspace-phase-summary=\{phaseGroup\.id\}/)
  assert.match(composer, /data-ai-workspace-task=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-preflight="true"/)
  assert.match(composer, /data-ai-workspace-task-preflight=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-dependencies=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-unresolved-dependencies=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-target-resolution=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-target-option=\{candidateKey\}/)
  assert.match(composer, /data-ai-workspace-task-target-clear=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-execute=\{task\.id\}/)
  assert.match(composer, /data-ai-workspace-task-open=\{task\.id\}/)
  assert.match(composer, /data-ai-action="run-workspace-agent"/)
  assert.match(composer, /data-ai-action="stop-workspace-agent"/)
  assert.match(composer, /data-ai-workspace-agent-session="true"/)
  assert.match(composer, /data-ai-workspace-agent-log=\{entry\.id\}/)
  assert.match(composer, /groupAIWorkspaceExecutionTasksByPhase\(/)
  assert.match(composer, /buildAIWorkspaceExecutionAgentResumeState\(/)
  assert.match(composer, /workspaceProducedDraftsRef\.current/)
  assert.match(composer, /buildAIWorkspaceExecutionPreflight\(/)
  assert.match(composer, /producedDrafts: workspaceProducedDrafts/)
  assert.match(composer, /producedDrafts: workspaceProducedDraftsRef\.current/)
  assert.match(composer, /runWorkspaceAgent\(\)/)
  assert.match(composer, /cancelWorkspaceAgentRun/)
  assert.match(composer, /status: 'canceled'/)
  assert.match(composer, /status: 'waiting'/)
  assert.match(composer, /t\('ai\.workspaceExecution\.statusCanceled'\)/)
  assert.match(composer, /t\('ai\.workspaceExecution\.statusWaiting'\)/)
  assert.match(composer, /t\('ai\.workspaceExecution\.preflightWaiting'\)/)
  assert.match(composer, /completionSource\.\$\{entry\.completionSource\}/)
  assert.match(composer, /completionSource\.\$\{taskState\.completionSource\}/)
  assert.match(composer, /manual-open-draft/)
  assert.match(composer, /manual-apply/)
  assert.match(composer, /completionAt/)
  assert.match(composer, /originRunId/)
  assert.match(composer, /agentLogResumedAgentRun/)
  assert.match(composer, /agentLogResumedManualApply/)
  assert.match(composer, /agentLogResumedManualOpenDraft/)
  assert.match(composer, /t\('ai\.workspaceExecution\.preflightTaskDependencyCycle'/)
  assert.match(composer, /t\('ai\.workspaceExecution\.preflightTaskDependencyPhaseOrder'/)
  assert.match(composer, /phaseStalledDependencies/)
  assert.match(composer, /t\('ai\.workspaceExecution\.agentCurrentPhase'/)
  assert.match(composer, /t\('ai\.workspaceExecution\.phaseBlockedByEarlierPhase'/)
  assert.match(composer, /onExecuteTask\(task\)/)
  assert.match(composer, /disabled=\{agentRunning\}/)
  assert.match(composer, /setWorkspaceProducedDraft\(task\.id, \{/)
  assert.match(plan, /ai-workspace-task\\s\+/)
  assert.match(plan, /AIWorkspaceExecutionProducedDraft/)
  assert.match(plan, /'dependency-cycle'/)
  assert.match(plan, /'dependency-phase-order'/)
  assert.match(plan, /attributes\.phase \?\? attributes\.stage/)
  assert.match(plan, /export function groupAIWorkspaceExecutionTasksByPhase/)
  assert.match(composer, /updateTabContent\(targetTab\.id, task\.content\)/)
  assert.match(composer, /openDesktopDocumentPath\(reference\.path\)/)
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
