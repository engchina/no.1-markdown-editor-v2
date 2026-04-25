import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStore } from '../../store/ai'
import { useActiveTab, useEditorStore } from '../../store/editor'
import { dispatchEditorAIApply } from '../../lib/ai/events.ts'
import { diffTextByLine } from '../../lib/lineDiff.ts'
import { buildAIComposerContextPacket } from '../../lib/ai/context.ts'
import { normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import {
  hasAIDiffPreview,
  hasAIInsertPreview,
  type AIInsertTarget,
  type AIResultView,
} from '../../lib/ai/resultViews.ts'
import {
  buildAIComposerPromptPlaceholder,
  getAITemplateModels,
  resolveAIComposerTemplateResolution,
  type AITemplateModel,
} from '../../lib/ai/templateLibrary.ts'
import { formatPrimaryShortcut, matchesPrimaryShortcut } from '../../lib/platform.ts'
import { focusElementWithoutScroll } from '../../hooks/useDialogFocusRestore'
import AIWorkspaceExecutionPanel from './AIWorkspaceExecutionPanel'
import { useAIWorkspaceExecution } from './useAIWorkspaceExecution'
import { useAIComposerRuntime } from './useAIComposerRuntime'
import AIComposerCoreView, { type AIComposerContentTypography } from './AIComposerCoreView'

function resolveAIComposerContentLineHeight(fontSize: number): number {
  if (fontSize <= 12) return 1.55
  if (fontSize >= 20) return 1.72
  return 1.64
}

function buildAIComposerContentTypography(fontSize: number): AIComposerContentTypography {
  const lineHeight = resolveAIComposerContentLineHeight(fontSize)

  return {
    text: {
      fontSize: `${fontSize}px`,
      lineHeight,
    },
    meta: {
      fontSize: `${Math.max(11, Math.round(fontSize * 0.82))}px`,
      lineHeight: 1.5,
    },
    code: {
      fontSize: `${Math.max(11, Math.round(fontSize * 0.92))}px`,
      lineHeight,
    },
  }
}

export default function AIComposer() {
  const { t } = useTranslation()
  const activeTab = useActiveTab()
  const viewMode = useEditorStore((state) => state.viewMode)
  const fontSize = useEditorStore((state) => state.fontSize)
  const aiDefaultWriteTarget = useEditorStore((state) => state.aiDefaultWriteTarget)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingPromptSelectionRef = useRef<number | null>(null)
  const {
    composer,
    closeComposer,
    setIntent,
    setScope,
    setOutputTarget,
    setPrompt,
    resetDraftState,
  } = useAIStore()
  const initialTemplatePromptRef = useRef<string | null>(composer.prompt)
  const [resultView, setResultView] = useState<AIResultView>('draft')
  const [retrievalPanelOpen, setRetrievalPanelOpen] = useState(false)

  const effectivePrompt = composer.prompt.trim()
  const hasSelection = !!composer.context?.selectedText
  const hasCurrentBlock = !!composer.context?.currentBlock
  const effectiveContext = useMemo(
    () =>
      buildAIComposerContextPacket({
        baseContext: composer.context,
        sourceSnapshot: composer.sourceSnapshot,
        intent: composer.intent,
        scope: composer.scope,
        outputTarget: composer.outputTarget,
      }),
    [composer.context, composer.intent, composer.outputTarget, composer.scope, composer.sourceSnapshot]
  )
  const replaceActionTarget: Extract<AIInsertTarget, 'replace-selection' | 'replace-current-block'> | null =
    hasSelection ? 'replace-selection' : hasCurrentBlock ? 'replace-current-block' : null
  const canReplaceCurrentTarget = replaceActionTarget !== null && composer.draftFormat !== 'sql'
  const slashCommandContext = effectiveContext?.slashCommandContext ?? null
  const hasSlashCommandContext = slashCommandContext !== null && !slashCommandContext.isEmpty
  const showSlashCommandHint = composer.source === 'slash-command' && slashCommandContext !== null
  const normalizedDraft =
    composer.draftFormat === 'sql'
      ? composer.draftText.trim()
      : normalizeAIDraftText(composer.draftText, composer.outputTarget)
  const {
    workspaceExecution,
    workspaceExecutionPhaseGroups,
    hasWorkspaceExecutionTasks,
    workspaceExecutionStates,
    workspaceTaskTargetOverrides,
    workspacePreflight,
    workspaceAgentSession,
    canRunWorkspaceAgent,
    clearWorkspaceHistoryBinding,
    bindWorkspaceHistoryForDraft,
    handleOpenWorkspaceTaskDraft,
    openAllWorkspaceTaskDrafts,
    setWorkspaceTaskTargetOverride,
    executeWorkspaceTask,
    cancelWorkspaceAgentRun,
    runWorkspaceAgent,
  } = useAIWorkspaceExecution({
    normalizedDraft,
    t,
  })
  const {
    oracleProviderConfig,
    knowledgeType,
    hasConnection,
    showConnectionHint,
    connectionHintTitle,
    connectionHintMessage,
    handleSelectKnowledgeType,
    handleSelectDocsStore,
    handleSelectDataStore,
    handleSelectHostedAgentProfile,
    handleSubmit,
    handleCancelRequest,
    handleCopy,
  } = useAIComposerRuntime({
    composer,
    activeTab,
    effectiveContext,
    effectivePrompt,
    normalizedDraft,
    clearWorkspaceHistoryBinding,
    bindWorkspaceHistoryForDraft,
    t,
  })
  const canSubmit =
    composer.requestState !== 'streaming' &&
    !!effectivePrompt.trim() &&
    !!effectiveContext &&
    hasConnection
  const canApplyToEditor = viewMode !== 'preview'
  const canApplyDraft =
    composer.requestState !== 'streaming' &&
    !!normalizedDraft &&
    composer.draftFormat !== 'sql' &&
    composer.outputTarget !== 'chat-only' &&
    !!composer.sourceSnapshot &&
    !!activeTab &&
    canApplyToEditor
  const canApplyToAnyTarget =
    composer.requestState !== 'streaming' &&
    !!normalizedDraft &&
    !!composer.sourceSnapshot &&
    !!activeTab &&
    canApplyToEditor
  const hasRetrievalDetails =
    composer.retrievalExecuted ||
    !!composer.retrievalQuery ||
    composer.retrievalResults.length > 0 ||
    composer.retrievalResultCount !== null
  const showResultPanel =
    composer.requestState !== 'idle' || normalizedDraft.trim().length > 0 || composer.errorMessage !== null
  const promptRows = showResultPanel ? 3 : 4
  const promptMinHeight = showResultPanel ? '96px' : '124px'
  const promptMaxHeight = showResultPanel ? '20vh' : '24vh'
  const resultPanelMinHeight = hasWorkspaceExecutionTasks ? '260px' : '220px'
  const hasDiffPreview =
    composer.draftFormat !== 'sql' && hasAIDiffPreview(composer.outputTarget, composer.diffBaseText, normalizedDraft)
  const hasInsertPreview =
    composer.draftFormat === 'sql' ? normalizedDraft.length > 0 : hasAIInsertPreview(composer.outputTarget, normalizedDraft)
  const defaultInsertTarget: AIInsertTarget =
    composer.draftFormat === 'sql'
      ? composer.outputTarget === 'new-note'
        ? 'new-note'
        : 'insert-below'
      : composer.outputTarget === 'at-cursor' || composer.outputTarget === 'insert-below'
      ? composer.outputTarget
      : aiDefaultWriteTarget !== 'replace-selection'
        ? aiDefaultWriteTarget
        : 'insert-below'
  const preferredResultAction: 'replace' | 'insert' | 'new-note' =
    composer.draftFormat === 'sql'
      ? composer.outputTarget === 'new-note'
        ? 'new-note'
        : 'insert'
      : composer.outputTarget === 'replace-selection' || composer.outputTarget === 'replace-current-block'
      ? 'replace'
      : composer.outputTarget === 'new-note'
        ? 'new-note'
        : 'insert'
  const currentDocumentResultActionStyle = {
    background: 'var(--accent)',
    color: 'white',
    border: '1px solid var(--accent)',
  }
  const runShortcutLabel = formatPrimaryShortcut('Enter')
  const applyShortcutLabel = formatPrimaryShortcut('Enter', { shift: true })
  const diffBlocks =
    hasDiffPreview
      ? diffTextByLine(composer.diffBaseText ?? '', normalizedDraft)
      : []
  const templateModels = useMemo(() => getAITemplateModels(t), [t])
  const promptPlaceholder = useMemo(() => buildAIComposerPromptPlaceholder(t), [t])
  const composerContentTypography = useMemo(() => buildAIComposerContentTypography(fontSize), [fontSize])

  useEffect(() => {
    focusElementWithoutScroll(textareaRef.current)
  }, [])

  useEffect(() => {
    const initialPrompt = initialTemplatePromptRef.current
    initialTemplatePromptRef.current = null
    if (!initialPrompt) return

    const matchingTemplate = templateModels.find((template) => template.prompt === initialPrompt)
    if (!matchingTemplate) return

    const nextPrompt = buildTemplatePromptDraft(matchingTemplate.prompt)
    pendingPromptSelectionRef.current = nextPrompt.length
    if (nextPrompt !== composer.prompt) {
      setPrompt(nextPrompt)
    }
  }, [composer.prompt, setPrompt, templateModels])

  useEffect(() => {
    setResultView('draft')
  }, [composer.draftText, composer.outputTarget])

  useEffect(() => {
    setRetrievalPanelOpen(false)
  }, [composer.startedAt, composer.retrievalQuery, composer.retrievalResultCount, composer.retrievalResults.length])

  useEffect(() => {
    const nextSelection = pendingPromptSelectionRef.current
    const textarea = textareaRef.current
    if (nextSelection === null || !textarea) return

    const caret = Math.min(nextSelection, composer.prompt.length)
    focusElementWithoutScroll(textarea)
    textarea.setSelectionRange(caret, caret)
    pendingPromptSelectionRef.current = null
  }, [composer.prompt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void handleCloseComposer()
        return
      }

      if (matchesPrimaryShortcut(event, { key: 'enter', shift: true }) && canApplyDraft) {
        event.preventDefault()
        handleApply()
        return
      }

      if (matchesPrimaryShortcut(event, { key: 'enter' }) && canSubmit) {
        event.preventDefault()
        void handleSubmit()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canApplyDraft, canSubmit, composer.outputTarget, composer.requestState, effectiveContext, effectivePrompt])

  async function handleCloseComposer() {
    if (composer.requestState === 'streaming') {
      await handleCancelRequest()
    }
    closeComposer()
  }

  function applyTemplate(template: AITemplateModel) {
    const resolution = resolveAIComposerTemplateResolution(template, {
      hasSelection,
      hasCurrentBlock,
      hasSlashCommandContext,
      aiDefaultWriteTarget,
    })
    if (!resolution.enabled) return

    setIntent(resolution.intent)
    setScope(resolution.scope)
    setOutputTarget(resolution.outputTarget)
    const nextPrompt = buildTemplatePromptDraft(template.prompt)
    pendingPromptSelectionRef.current = nextPrompt.length
    setPrompt(nextPrompt)
    setResultView('draft')
  }

  function handleApply() {
    if (!normalizedDraft || !composer.sourceSnapshot || !activeTab) return

    dispatchEditorAIApply({
      tabId: activeTab.id,
      outputTarget: composer.outputTarget,
      text: normalizedDraft,
      snapshot: composer.sourceSnapshot,
      provenance: {
        badge: t('ai.provenance.badge'),
        detail: composer.outputTarget === 'new-note' ? t('ai.provenance.newNoteDetail') : t('ai.provenance.applyDetail'),
        kind: composer.outputTarget === 'new-note' ? 'new-note' : 'apply',
        createdAt: Date.now(),
      },
    })
  }

  function handleApplyToTarget(target: AIInsertTarget) {
    if (!normalizedDraft || !composer.sourceSnapshot || !activeTab) return

    dispatchEditorAIApply({
      tabId: activeTab.id,
      outputTarget: target,
      text: normalizedDraft,
      snapshot: composer.sourceSnapshot,
      provenance: {
        badge: t('ai.provenance.badge'),
        detail: target === 'new-note' ? t('ai.provenance.newNoteDetail') : t('ai.provenance.applyDetail'),
        kind: target === 'new-note' ? 'new-note' : 'apply',
        createdAt: Date.now(),
      },
    })
  }

  const workspaceExecutionPanel = workspaceExecution ? (
    <AIWorkspaceExecutionPanel
      execution={workspaceExecution}
      phaseGroups={workspaceExecutionPhaseGroups}
      onOpenDraft={handleOpenWorkspaceTaskDraft}
      onExecuteTask={executeWorkspaceTask}
      onSetTargetOverride={setWorkspaceTaskTargetOverride}
      targetOverrides={workspaceTaskTargetOverrides}
      taskStates={workspaceExecutionStates}
      agentSession={workspaceAgentSession}
      preflightState={workspacePreflight}
    />
  ) : null

  return (
    <AIComposerCoreView
      composer={composer}
      promptPlaceholder={promptPlaceholder}
      composerContentTypography={composerContentTypography}
      showConnectionHint={showConnectionHint}
      connectionHintTitle={connectionHintTitle}
      connectionHintMessage={connectionHintMessage}
      showSlashCommandHint={showSlashCommandHint}
      slashCommandContext={slashCommandContext}
      oracleProviderConfig={oracleProviderConfig}
      knowledgeType={knowledgeType}
      hasWorkspaceExecutionTasks={hasWorkspaceExecutionTasks}
      workspaceAgentRunning={workspaceAgentSession?.status === 'running'}
      workspaceExecutionPanel={workspaceExecutionPanel}
      textareaRef={textareaRef}
      promptRows={promptRows}
      promptMinHeight={promptMinHeight}
      promptMaxHeight={promptMaxHeight}
      resultPanelMinHeight={resultPanelMinHeight}
      effectivePrompt={effectivePrompt}
      normalizedDraft={normalizedDraft}
      hasSelection={hasSelection}
      hasCurrentBlock={hasCurrentBlock}
      hasSlashCommandContext={hasSlashCommandContext}
      aiDefaultWriteTarget={aiDefaultWriteTarget}
      templateModels={templateModels}
      resultView={resultView}
      setResultView={setResultView}
      retrievalPanelOpen={retrievalPanelOpen}
      setRetrievalPanelOpen={setRetrievalPanelOpen}
      hasRetrievalDetails={hasRetrievalDetails}
      hasDiffPreview={hasDiffPreview}
      hasInsertPreview={hasInsertPreview}
      diffBlocks={diffBlocks}
      canSubmit={canSubmit}
      canApplyToEditor={canApplyToEditor}
      canApplyToAnyTarget={canApplyToAnyTarget}
      canReplaceCurrentTarget={canReplaceCurrentTarget}
      replaceActionTarget={replaceActionTarget}
      defaultInsertTarget={defaultInsertTarget}
      preferredResultAction={preferredResultAction}
      currentDocumentResultActionStyle={currentDocumentResultActionStyle}
      runShortcutLabel={runShortcutLabel}
      applyShortcutLabel={applyShortcutLabel}
      selectedHostedAgentProfileId={composer.hostedAgentProfileId}
      onClose={handleCloseComposer}
      onCancelRequest={handleCancelRequest}
      onRun={handleSubmit}
      onResetAndClose={() => {
        resetDraftState()
        void handleCloseComposer()
      }}
      onPromptChange={setPrompt}
      onSelectKnowledgeType={handleSelectKnowledgeType}
      onSelectDocsStore={handleSelectDocsStore}
      onSelectDataStore={handleSelectDataStore}
      onSelectHostedAgentProfile={handleSelectHostedAgentProfile}
      onSelectTemplate={applyTemplate}
      onRetry={handleSubmit}
      onDiscard={() => {
        resetDraftState()
        setResultView('draft')
      }}
      onRunWorkspaceAgent={runWorkspaceAgent}
      onStopWorkspaceAgent={cancelWorkspaceAgentRun}
      onOpenAllWorkspaceDrafts={openAllWorkspaceTaskDrafts}
      canRunWorkspaceAgent={canRunWorkspaceAgent}
      onCopy={handleCopy}
      onApplyReplace={() => {
        if (replaceActionTarget) handleApplyToTarget(replaceActionTarget)
      }}
      onApplyInsert={() => handleApplyToTarget(defaultInsertTarget)}
      onApplyNewNote={() => handleApplyToTarget('new-note')}
    />
  )
}
function buildTemplatePromptDraft(prompt: string): string {
  const trimmedPrompt = prompt.trimEnd()
  if (!trimmedPrompt) return ''
  return `${trimmedPrompt}\n`
}

