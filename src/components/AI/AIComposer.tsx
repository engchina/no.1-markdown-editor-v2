import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStore } from '../../store/ai'
import { useActiveTab, useEditorStore } from '../../store/editor'
import { dispatchEditorAIApply, dispatchEditorAISetupOpen } from '../../lib/ai/events.ts'
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
import { normalizeAISlashCommandContext } from '../../lib/ai/slashCommands.ts'
import { formatPrimaryShortcut, matchesPrimaryShortcut } from '../../lib/platform.ts'
import { focusElementWithoutScroll } from '../../hooks/useDialogFocusRestore'
import AIWorkspaceExecutionPanel from './AIWorkspaceExecutionPanel'
import { useAIWorkspaceExecution } from './useAIWorkspaceExecution'
import { useAIComposerRuntime } from './useAIComposerRuntime'
import AIComposerCoreView, {
  type AIComposerContentTypography,
  type AIComposerFrameBounds,
} from './AIComposerCoreView'

type AIResultPrimaryAction = 'replace' | 'insert' | 'new-note'

const AI_COMPOSER_SOURCE_SURFACE_SELECTOR = '[data-source-editor-surface="true"], .cm-editor'
const DEFAULT_AI_COMPOSER_FRAME_BOUNDS: AIComposerFrameBounds = { top: 0, bottom: 0 }

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
  const zoom = useEditorStore((state) => state.zoom)
  const fontSize = useEditorStore((state) => state.fontSize)
  const aiDefaultWriteTarget = useEditorStore((state) => state.aiDefaultWriteTarget)
  const dialogRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingPromptSelectionRef = useRef<number | null>(null)
  const {
    composer,
    closeComposer,
    setIntent,
    setScope,
    setOutputTarget,
    setPrompt,
    setUseSlashCommandContext,
    setUseSelectedTextContext,
    resetDraftState,
  } = useAIStore()
  const initialTemplatePromptRef = useRef<string | null>(composer.prompt)
  const [resultView, setResultView] = useState<AIResultView>('draft')
  const [retrievalPanelOpen, setRetrievalPanelOpen] = useState(false)
  const [composerFrameBounds, setComposerFrameBounds] = useState<AIComposerFrameBounds>(() =>
    resolveAIComposerSourceFrameBounds()
  )

  const effectivePrompt = composer.prompt.trim()
  const hasSelectionRange =
    composer.sourceSnapshot !== null && composer.sourceSnapshot.selectionFrom !== composer.sourceSnapshot.selectionTo
  const hasSelectedTextContext = !!composer.context?.selectedText?.trim()
  const hasEnabledSelectedTextContext = hasSelectedTextContext && composer.useSelectedTextContext
  const hasCurrentBlock = !!composer.context?.currentBlock
  const effectiveContext = useMemo(
    () =>
      buildAIComposerContextPacket({
        baseContext: composer.context,
        sourceSnapshot: composer.sourceSnapshot,
        intent: composer.intent,
        scope: composer.scope,
        outputTarget: composer.outputTarget,
        includeSlashCommandContext: composer.useSlashCommandContext,
        includeSelectedTextContext: hasEnabledSelectedTextContext,
      }),
    [
      composer.context,
      composer.intent,
      composer.outputTarget,
      composer.scope,
      composer.sourceSnapshot,
      composer.useSlashCommandContext,
      hasEnabledSelectedTextContext,
    ]
  )
  const hasSlashCommandContext =
    composer.source === 'slash-command' &&
    !!normalizeAISlashCommandContext(composer.context?.slashCommandContext ?? '')
  const hasEnabledSlashCommandContext = hasSlashCommandContext && composer.useSlashCommandContext
  const replaceActionTarget: Extract<AIInsertTarget, 'replace-selection' | 'replace-current-block'> | null =
    hasSelectionRange ? 'replace-selection' : hasCurrentBlock ? 'replace-current-block' : null
  const canReplaceCurrentTarget = replaceActionTarget !== null && composer.draftFormat !== 'sql'
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
    handleSelectDataMode,
    handleSelectHostedAgentProfile,
    handleSubmit,
    handleExecuteStructuredSql,
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
  const currentDocumentPrimaryResultActionStyle = {
    background: 'var(--accent)',
    color: 'white',
    border: '1px solid var(--accent)',
  }
  const currentDocumentSecondaryResultActionStyle = {
    background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
    color: 'var(--text-primary)',
    border: '1px solid color-mix(in srgb, var(--border) 88%, transparent)',
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

  useLayoutEffect(() => {
    let resizeObserver: ResizeObserver | null = null
    let rafId: number | null = null

    const updateFrameBounds = () => {
      rafId = null
      const nextBounds = resolveAIComposerSourceFrameBounds()
      setComposerFrameBounds((currentBounds) =>
        areAIComposerFrameBoundsEqual(currentBounds, nextBounds) ? currentBounds : nextBounds
      )
    }

    const scheduleFrameBoundsUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateFrameBounds)
    }

    updateFrameBounds()
    window.addEventListener('resize', scheduleFrameBoundsUpdate)
    window.addEventListener('orientationchange', scheduleFrameBoundsUpdate)

    const sourceSurface = getAIComposerSourceSurface()
    if (sourceSurface && typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(scheduleFrameBoundsUpdate)
      resizeObserver.observe(sourceSurface)
    }

    return () => {
      window.removeEventListener('resize', scheduleFrameBoundsUpdate)
      window.removeEventListener('orientationchange', scheduleFrameBoundsUpdate)
      resizeObserver?.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [viewMode, zoom])

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      const target = event.target
      if (target instanceof Node && dialog.contains(target)) return

      const focusTarget = getAIComposerFocusableElements(dialog)[0] ?? dialog
      focusElementWithoutScroll(focusTarget)
    }

    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
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
      if (trapAIComposerTabFocus(event, dialogRef.current)) return

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

  async function handleOpenAISetup() {
    if (composer.requestState === 'streaming') {
      await handleCancelRequest()
    }
    closeComposer()
    dispatchEditorAISetupOpen()
  }

  function applyTemplate(template: AITemplateModel) {
    const resolution = resolveAIComposerTemplateResolution(template, {
      hasSelection: hasEnabledSelectedTextContext,
      hasSlashCommandContext: hasEnabledSlashCommandContext,
      hasCurrentBlock,
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

  function getCurrentDocumentResultActionStyle(action: AIResultPrimaryAction) {
    return preferredResultAction === action
      ? currentDocumentPrimaryResultActionStyle
      : currentDocumentSecondaryResultActionStyle
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
      dialogRef={dialogRef}
      composerFrameBounds={composerFrameBounds}
      composer={composer}
      promptPlaceholder={promptPlaceholder}
      composerContentTypography={composerContentTypography}
      showConnectionHint={showConnectionHint}
      connectionHintTitle={connectionHintTitle}
      connectionHintMessage={connectionHintMessage}
      showSlashCommandContextToggle={composer.source === 'slash-command'}
      canToggleSlashCommandContext={hasSlashCommandContext}
      useSlashCommandContext={hasEnabledSlashCommandContext}
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
      hasSelection={hasEnabledSelectedTextContext}
      hasSlashCommandContext={hasEnabledSlashCommandContext}
      showSelectedTextContextToggle={hasSelectionRange}
      canToggleSelectedTextContext={hasSelectedTextContext}
      useSelectedTextContext={hasEnabledSelectedTextContext}
      hasCurrentBlock={hasCurrentBlock}
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
      canExecuteStructuredSql={
        composer.requestState !== 'streaming' &&
        composer.knowledgeSelection.kind === 'oracle-structured-store' &&
        composer.knowledgeSelection.mode === 'agent-answer' &&
        !!(composer.generatedSql ?? (composer.draftFormat === 'sql' ? normalizedDraft : '')).trim() &&
        !composer.structuredExecutionStatus &&
        hasConnection
      }
      canApplyToEditor={canApplyToEditor}
      canApplyToAnyTarget={canApplyToAnyTarget}
      canReplaceCurrentTarget={canReplaceCurrentTarget}
      replaceActionTarget={replaceActionTarget}
      defaultInsertTarget={defaultInsertTarget}
      preferredResultAction={preferredResultAction}
      getCurrentDocumentResultActionStyle={getCurrentDocumentResultActionStyle}
      runShortcutLabel={runShortcutLabel}
      applyShortcutLabel={applyShortcutLabel}
      selectedHostedAgentProfileId={composer.hostedAgentProfileId}
      onClose={handleCloseComposer}
      onOpenAISetup={handleOpenAISetup}
      onCancelRequest={handleCancelRequest}
      onRun={handleSubmit}
      onExecuteStructuredSql={handleExecuteStructuredSql}
      onResetAndClose={() => {
        resetDraftState()
        void handleCloseComposer()
      }}
      onPromptChange={setPrompt}
      onToggleSlashCommandContext={setUseSlashCommandContext}
      onToggleSelectedTextContext={setUseSelectedTextContext}
      onSelectKnowledgeType={handleSelectKnowledgeType}
      onSelectDocsStore={handleSelectDocsStore}
      onSelectDataStore={handleSelectDataStore}
      onSelectDataMode={handleSelectDataMode}
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

function getAIComposerSourceSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(AI_COMPOSER_SOURCE_SURFACE_SELECTOR)
}

function resolveAIComposerSourceFrameBounds(): AIComposerFrameBounds {
  if (typeof window === 'undefined') return DEFAULT_AI_COMPOSER_FRAME_BOUNDS

  const sourceSurface = getAIComposerSourceSurface()
  if (!sourceSurface) return DEFAULT_AI_COMPOSER_FRAME_BOUNDS

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_AI_COMPOSER_FRAME_BOUNDS
  }

  const rect = sourceSurface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return DEFAULT_AI_COMPOSER_FRAME_BOUNDS
  }

  const top = clampAIComposerFrameInset(Math.round(rect.top), viewportHeight)
  const bottom = clampAIComposerFrameInset(Math.round(viewportHeight - rect.bottom), viewportHeight)

  if (top + bottom >= viewportHeight) return DEFAULT_AI_COMPOSER_FRAME_BOUNDS
  return { top, bottom }
}

function clampAIComposerFrameInset(value: number, viewportHeight: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), viewportHeight)
}

function areAIComposerFrameBoundsEqual(
  currentBounds: AIComposerFrameBounds,
  nextBounds: AIComposerFrameBounds
): boolean {
  return currentBounds.top === nextBounds.top && currentBounds.bottom === nextBounds.bottom
}

function buildTemplatePromptDraft(prompt: string): string {
  const trimmedPrompt = prompt.trimEnd()
  if (!trimmedPrompt) return ''
  return `${trimmedPrompt}\n`
}

function getAIComposerFocusableElements(dialog: HTMLElement): HTMLElement[] {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    return element.getClientRects().length > 0
  })
}

function trapAIComposerTabFocus(event: KeyboardEvent, dialog: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !dialog) return false

  const focusableElements = getAIComposerFocusableElements(dialog)
  const fallbackFocusTarget = focusableElements[0] ?? dialog
  const activeElement = document.activeElement

  if (!(activeElement instanceof HTMLElement) || !dialog.contains(activeElement)) {
    event.preventDefault()
    focusElementWithoutScroll(fallbackFocusTarget)
    return true
  }

  if (focusableElements.length === 0) {
    event.preventDefault()
    focusElementWithoutScroll(dialog)
    return true
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    focusElementWithoutScroll(lastElement)
    return true
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    focusElementWithoutScroll(firstElement)
    return true
  }

  return false
}

