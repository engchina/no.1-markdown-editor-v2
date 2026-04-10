import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AIComposer exposes explain view and chat-only insert actions', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /setResultView\('explain'\)/)
  assert.match(composer, /AIExplainView details=\{explainDetails\}/)
  assert.match(composer, /composer\.outputTarget === 'chat-only' && canApplyToEditor/)
  assert.match(composer, /insertTargets\.map\(\(target\) => \(/)
  assert.match(composer, /handleApplyToTarget\(target\)/)
})

test('AIComposer exposes retry, discard, cancel-request, and copy actions in the result toolbar', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /t\('ai\.retry'\)/)
  assert.match(composer, /t\('ai\.discard'\)/)
  assert.match(composer, /t\('ai\.cancelRequest'\)/)
  assert.match(composer, /t\('ai\.copy'\)/)
})

test('AIComposer separates the form scroller from the bounded result panel', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /data-ai-composer-scroll="form"/)
  assert.match(composer, /data-ai-result-panel="true"/)
  assert.match(composer, /data-ai-result-body="true"/)
})

test('AIComposer exposes explicit context mention insert controls and mention status cards', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /data-ai-mention-insert=\{kind\}/)
  assert.match(composer, /insertMentionToken\('note'\)/)
  assert.match(composer, /insertMentionToken\('heading'\)/)
  assert.match(composer, /insertMentionToken\('search'\)/)
  assert.match(composer, /data-ai-mention-card=\{resolution\.mention\.id\}/)
  assert.match(composer, /data-ai-mention-status=\{resolution\.status\}/)
})

test('AIComposer exposes a structured workspace context picker that feeds the existing note-mention pipeline', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')
  const search = await readFile(new URL('../src/lib/workspaceSearch.ts', import.meta.url), 'utf8')

  assert.match(composer, /data-ai-workspace-context="true"/)
  assert.match(composer, /data-ai-attach-current-note="true"/)
  assert.match(composer, /data-ai-attach-open-tab=\{tab\.id\}/)
  assert.match(composer, /data-ai-note-search-input="true"/)
  assert.match(composer, /data-ai-note-search-result=\{result\.path \?\? result\.name\}/)
  assert.match(composer, /removePromptMention\(resolution\.mention\.id\)/)
  assert.match(composer, /insertNoteMention\(result\.path \?\? result\.name\)/)
  assert.match(search, /export async function findWorkspaceDocumentReferences/)
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
})

test('ThemePanel exposes privacy copy and AI default preference controls', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /t\('ai\.connection\.privacyNote'\)/)
  assert.match(panel, /setAiDefaultWriteTarget\(/)
  assert.match(panel, /setAiDefaultSelectedTextRole\(/)
  assert.match(panel, /t\('ai\.preferences\.defaultWriteTarget'\)/)
  assert.match(panel, /t\('ai\.preferences\.selectedTextRole'\)/)
})
