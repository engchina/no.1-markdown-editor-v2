import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import AppIcon from '../Icons/AppIcon'
import { useAIStore } from '../../store/ai'
import { useActiveTab, useEditorStore } from '../../store/editor'
import { useFileTreeStore } from '../../store/fileTree'
import {
  isAIRuntimeAvailable,
  cancelAICompletion,
  loadAIProviderState,
  runAICompletion,
} from '../../lib/ai/client.ts'
import { dispatchEditorAIApply } from '../../lib/ai/events.ts'
import { diffTextByLine } from '../../lib/lineDiff.ts'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import { buildAIComposerContextPacket } from '../../lib/ai/context.ts'
import {
  buildMarkdownPreviewLines,
  getMarkdownPreviewLineBadge,
  type MarkdownPreviewLineKind,
} from '../../lib/ai/diffPresentation.ts'
import { buildAIRequestMessages, normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import { extractLegacyAIRetrievalMetadata } from '../../lib/ai/retrievalMetadata.ts'
import {
  hasAIDiffPreview,
  hasAIInsertPreview,
  type AIInsertTarget,
  type AIResultView,
} from '../../lib/ai/resultViews.ts'
import {
  AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER,
  buildAIComposerPromptPlaceholder,
  getAITemplateModels,
  resolveAIComposerTemplateResolution,
  type AITemplateModel,
} from '../../lib/ai/templateLibrary.ts'
import { formatPrimaryShortcut, matchesPrimaryShortcut } from '../../lib/platform.ts'
import {
  findHostedAgentProfile,
  getAIKnowledgeType,
  isAIProviderConnectionReady,
  isOCIResponsesProviderConfig,
} from '../../lib/ai/provider.ts'
import type {
  AIIntent,
  AIKnowledgeType,
  AIProviderState,
  AIRetrievalResultPreview,
} from '../../lib/ai/types.ts'
import { findWorkspaceDocumentReferences } from '../../lib/workspaceSearch.ts'
import {
  buildAIWorkspaceExecutionAgentResumeState,
  buildAIWorkspaceExecutionHistoryRecord,
  buildAIWorkspaceExecutionPreflight,
  buildAIWorkspaceDraftTabName,
  groupAIWorkspaceExecutionTasksByPhase,
  parseAIWorkspaceExecutionPlan,
  type AIWorkspaceExecutionPreflight,
  type AIWorkspaceExecutionPhaseGroup,
  type AIWorkspaceExecutionTaskCompletionSource,
  type AIWorkspaceExecutionProducedDraft,
  type AIWorkspaceExecutionTaskRuntimeState,
  type AIWorkspaceExecutionTask,
  type AIWorkspaceExecutionTaskRuntimeStatus,
  type AIWorkspaceExecutionTaskPreflight,
} from '../../lib/ai/workspaceExecution.ts'
import { createAIProvenanceMark } from '../../lib/ai/provenance.ts'
import { openDesktopDocumentPath } from '../../lib/desktopFileOpen.ts'
import { primeAIUndoHistorySnapshot } from '../../lib/editorStateCache.ts'
import { focusElementWithoutScroll } from '../../hooks/useDialogFocusRestore'

type WorkspaceExecutionTaskStatus = AIWorkspaceExecutionTaskRuntimeStatus

interface WorkspaceAgentSessionLogEntry {
  id: string
  taskId: string
  title: string
  status: 'done' | 'error' | 'canceled'
  message: string
  completionSource?: AIWorkspaceExecutionTaskCompletionSource
  completionAt?: number
  originRunId?: number | null
}

interface WorkspaceAgentSessionState {
  status: 'running' | 'completed' | 'canceled'
  total: number
  completed: number
  failed: number
  currentTaskId: string | null
  logs: WorkspaceAgentSessionLogEntry[]
}

interface WorkspaceTaskRunResult {
  success: boolean
  canceled?: boolean
  message: string
}

type WorkspaceExecutionPreflightState =
  | { status: 'idle'; data: null; errorMessage: null }
  | { status: 'loading'; data: AIWorkspaceExecutionPreflight | null; errorMessage: null }
  | { status: 'ready'; data: AIWorkspaceExecutionPreflight; errorMessage: null }
  | { status: 'error'; data: AIWorkspaceExecutionPreflight | null; errorMessage: string }

interface AIComposerContentTypography {
  text: CSSProperties
  meta: CSSProperties
  code: CSSProperties
}

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
  const openTabs = useEditorStore((state) => state.tabs)
  const viewMode = useEditorStore((state) => state.viewMode)
  const fontSize = useEditorStore((state) => state.fontSize)
  const aiDefaultWriteTarget = useEditorStore((state) => state.aiDefaultWriteTarget)
  const addTab = useEditorStore((state) => state.addTab)
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingPromptSelectionRef = useRef<number | null>(null)
  const requestRunIdRef = useRef(0)
  const activeRequestIdRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const activeSessionHistoryRef = useRef<{
    tabId: string
    tabPath: string | null
    entryId: string
  } | null>(null)
  const {
    composer,
    closeComposer,
    setIntent,
    setScope,
    setOutputTarget,
    setExecutionTargetKind,
    setInvocationCapability,
    setKnowledgeSelection,
    setHostedAgentProfileId,
    setPrompt,
    setDraftText,
    setDraftFormat,
    appendDraftText,
    setExplanationText,
    setWarningText,
    setSourceLabel,
    setRetrievalExecuted,
    setRetrievalQuery,
    setRetrievalResults,
    setRetrievalResultCount,
    setDiffBaseText,
    startRequest,
    finishRequest,
    failRequest,
    resetDraftState,
    setProvenanceMarks,
    setThreadId,
    startSessionHistory,
    updateSessionHistory,
  } = useAIStore()
  const initialTemplatePromptRef = useRef<string | null>(composer.prompt)
  const [resultView, setResultView] = useState<AIResultView>('draft')
  const [retrievalPanelOpen, setRetrievalPanelOpen] = useState(false)
  const [providerState, setProviderState] = useState<AIProviderState | null>(null)
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [workspaceExecutionStates, setWorkspaceExecutionStates] = useState<Record<string, {
    status: WorkspaceExecutionTaskStatus
    message?: string
    completionSource?: AIWorkspaceExecutionTaskCompletionSource
    completionAt?: number
    originRunId?: number | null
  }>>({})
  const [workspaceProducedDrafts, setWorkspaceProducedDrafts] = useState<Record<string, AIWorkspaceExecutionProducedDraft>>({})
  const [workspaceTaskTargetOverrides, setWorkspaceTaskTargetOverrides] = useState<Record<string, string | null>>({})
  const [workspaceHistoryBinding, setWorkspaceHistoryBinding] = useState<{
    tabId: string
    tabPath: string | null
    entryId: string
  } | null>(null)
  const [workspacePreflight, setWorkspacePreflight] = useState<WorkspaceExecutionPreflightState>({
    status: 'idle',
    data: null,
    errorMessage: null,
  })
  const [workspaceAgentSession, setWorkspaceAgentSession] = useState<WorkspaceAgentSessionState | null>(null)
  const workspaceAgentRunIdRef = useRef(0)
  const workspacePreflightRequestIdRef = useRef(0)
  const workspaceProducedDraftsRef = useRef<Record<string, AIWorkspaceExecutionProducedDraft>>({})

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
  const oracleProviderConfig = isOCIResponsesProviderConfig(providerState?.config) ? providerState.config : null
  const knowledgeType = getAIKnowledgeType(composer.knowledgeSelection, composer.executionTargetKind)
  const selectedUnstructuredRegistrationId =
    composer.knowledgeSelection.kind === 'oracle-unstructured-store'
      ? composer.knowledgeSelection.registrationId
      : null
  const selectedStructuredRegistrationId =
    composer.knowledgeSelection.kind === 'oracle-structured-store'
      ? composer.knowledgeSelection.registrationId
      : null
  const selectedStructuredStore =
    selectedStructuredRegistrationId
      ? oracleProviderConfig?.structuredStores.find((store) => store.id === selectedStructuredRegistrationId) ?? null
      : null
  const selectedHostedAgentProfile = findHostedAgentProfile(oracleProviderConfig, composer.hostedAgentProfileId)
  const defaultHostedAgentProfile = oracleProviderConfig?.hostedAgentProfiles[0] ?? null
  const isHostedAgentKnowledge = knowledgeType === 'agent'
  const hasConnection = isHostedAgentKnowledge
    ? !!selectedHostedAgentProfile &&
      providerState?.hasHostedAgentClientSecretById?.[selectedHostedAgentProfile.id] === true
    : isAIProviderConnectionReady(providerState)
  const normalizedDraft =
    composer.draftFormat === 'sql'
      ? composer.draftText.trim()
      : normalizeAIDraftText(composer.draftText, composer.outputTarget)
  const workspaceExecution = useMemo(
    () => parseAIWorkspaceExecutionPlan(normalizedDraft),
    [normalizedDraft]
  )
  const workspaceExecutionPhaseGroups = useMemo(
    () => (workspaceExecution ? groupAIWorkspaceExecutionTasksByPhase(workspaceExecution.tasks) : []),
    [workspaceExecution]
  )
  const hasWorkspaceExecutionTasks = (workspaceExecution?.tasks.length ?? 0) > 0
  const canSubmit =
    composer.requestState !== 'streaming' &&
    !!effectivePrompt.trim() &&
    !!effectiveContext &&
    hasConnection
  const desktopOnlyMode = !isAIRuntimeAvailable()
  const showConnectionHint = !connectionLoading && (!hasConnection || connectionError !== null)
  const connectionHintTitle = connectionError
    ? t('notices.aiConnectionErrorTitle')
    : desktopOnlyMode
      ? t('notices.aiDesktopOnlyTitle')
      : isHostedAgentKnowledge
        ? t('ai.connection.hostedAgentMissingTitle')
        : t('notices.aiProviderMissingTitle')
  const connectionHintMessage = connectionError
    ? connectionError
    : desktopOnlyMode
      ? t('notices.aiDesktopOnlyMessage')
      : isHostedAgentKnowledge
        ? t('ai.connection.hostedAgentMissingMessage')
        : t('notices.aiProviderMissingMessage')
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
  const completedWorkspaceTaskIds = useMemo(
    () =>
      Object.entries(workspaceExecutionStates)
        .filter(([, state]) => state.status === 'done')
        .map(([taskId]) => taskId),
    [workspaceExecutionStates]
  )
  const canRunWorkspaceAgent =
    hasWorkspaceExecutionTasks &&
    workspaceAgentSession?.status !== 'running' &&
    workspacePreflight.status !== 'loading' &&
    canStartWorkspaceAgent({
      phaseGroups: workspaceExecutionPhaseGroups,
      preflight: workspacePreflight.data,
      taskStates: workspaceExecutionStates,
    })

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
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      requestRunIdRef.current += 1
      const requestId = activeRequestIdRef.current
      activeRequestIdRef.current = null
      if (requestId) void cancelAICompletion(requestId).catch(() => undefined)
    }
  }, [])

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
    setWorkspaceExecutionStates({})
    workspaceProducedDraftsRef.current = {}
    setWorkspaceProducedDrafts({})
    setWorkspaceTaskTargetOverrides({})
    setWorkspaceAgentSession(null)
    if (!workspaceExecution) {
      setWorkspaceHistoryBinding(null)
    }
    workspaceAgentRunIdRef.current += 1
  }, [normalizedDraft, workspaceExecution])

  useEffect(() => {
    const requestId = workspacePreflightRequestIdRef.current + 1
    workspacePreflightRequestIdRef.current = requestId

    if (!workspaceExecution) {
      setWorkspacePreflight({
        status: 'idle',
        data: null,
        errorMessage: null,
      })
      return
    }

    setWorkspacePreflight((current) => ({
      status: 'loading',
      data: current.data,
      errorMessage: null,
    }))

    void buildAIWorkspaceExecutionPreflight({
      tasks: workspaceExecution.tasks,
      tabs: useEditorStore.getState().tabs,
      rootPath,
      targetOverrides: workspaceTaskTargetOverrides,
      completedTaskIds: completedWorkspaceTaskIds,
      producedDrafts: workspaceProducedDrafts,
    })
      .then((data) => {
        if (workspacePreflightRequestIdRef.current !== requestId) return
        setWorkspacePreflight({
          status: 'ready',
          data,
          errorMessage: null,
        })
      })
      .catch((error) => {
        if (workspacePreflightRequestIdRef.current !== requestId) return
        setWorkspacePreflight((current) => ({
          status: 'error',
          data: current.data,
          errorMessage: error instanceof Error ? error.message : String(error),
        }))
      })
  }, [completedWorkspaceTaskIds, openTabs, rootPath, workspaceExecution, workspaceProducedDrafts, workspaceTaskTargetOverrides])

  useEffect(() => {
    if (!workspaceExecution || !workspaceHistoryBinding) return

    updateSessionHistory(
      workspaceHistoryBinding.tabId,
      workspaceHistoryBinding.tabPath,
      workspaceHistoryBinding.entryId,
      {
        workspaceExecution: buildAIWorkspaceExecutionHistoryRecord({
          execution: workspaceExecution,
          taskStates: workspaceExecutionStates,
        }),
        updatedAt: Date.now(),
      }
    )
  }, [updateSessionHistory, workspaceExecution, workspaceExecutionStates, workspaceHistoryBinding])

  useEffect(() => {
    if (desktopOnlyMode) {
      setConnectionLoading(false)
      setConnectionError(null)
      setProviderState(null)
      return
    }

    let cancelled = false
    setConnectionLoading(true)
    setConnectionError(null)

    void loadAIProviderState()
      .then((state) => {
        if (cancelled) return
        setProviderState(state)
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setConnectionError(message)
      })
      .finally(() => {
        if (!cancelled) setConnectionLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [desktopOnlyMode])

  useEffect(() => {
    if (!oracleProviderConfig) {
      if (
        composer.knowledgeSelection.kind !== 'none' ||
        composer.executionTargetKind !== 'direct-provider' ||
        composer.invocationCapability !== 'text-generation' ||
        composer.hostedAgentProfileId !== null
      ) {
        setKnowledgeSelection({ kind: 'none' })
        setExecutionTargetKind('direct-provider')
        setInvocationCapability('text-generation')
        setHostedAgentProfileId(null)
      }
      return
    }

    if (composer.executionTargetKind === 'oracle-hosted-agent') {
      if (composer.knowledgeSelection.kind !== 'none') {
        setKnowledgeSelection({ kind: 'none' })
      }
      if (composer.invocationCapability !== 'structured-execution') {
        setInvocationCapability('structured-execution')
      }

      const profileExists = oracleProviderConfig.hostedAgentProfiles.some(
        (profile) => profile.id === composer.hostedAgentProfileId
      )
      const fallbackProfileId = profileExists ? composer.hostedAgentProfileId : defaultHostedAgentProfile?.id ?? null
      if (fallbackProfileId !== composer.hostedAgentProfileId) {
        setHostedAgentProfileId(fallbackProfileId)
      }
      return
    }

    if (composer.knowledgeSelection.kind === 'oracle-unstructured-store') {
      const stillExists = oracleProviderConfig.unstructuredStores.some(
        (store) => store.id === selectedUnstructuredRegistrationId && store.enabled
      )
      if (!stillExists) {
        setKnowledgeSelection({ kind: 'none' })
        setExecutionTargetKind('direct-provider')
        setInvocationCapability('text-generation')
        return
      }

      if (composer.invocationCapability !== 'rag-unstructured') {
        setInvocationCapability('rag-unstructured')
      }
      return
    }

    if (composer.knowledgeSelection.kind === 'oracle-structured-store') {
      const store =
        oracleProviderConfig.structuredStores.find(
          (candidate) => candidate.id === selectedStructuredRegistrationId && candidate.enabled
        ) ?? null
      if (!store) {
        setKnowledgeSelection({ kind: 'none' })
        setExecutionTargetKind('direct-provider')
        setInvocationCapability('text-generation')
        return
      }

      if (composer.knowledgeSelection.mode !== 'sql-draft') {
        setKnowledgeSelection({
          kind: 'oracle-structured-store',
          registrationId: store.id,
          mode: 'sql-draft',
        })
      }
      if (composer.executionTargetKind !== 'direct-provider') {
        setExecutionTargetKind('direct-provider')
      }
      if (composer.invocationCapability !== 'nl2sql-draft') {
        setInvocationCapability('nl2sql-draft')
      }
      return
    }

    if (composer.invocationCapability !== 'text-generation') {
      setInvocationCapability('text-generation')
    }
  }, [
    composer.executionTargetKind,
    composer.invocationCapability,
    composer.hostedAgentProfileId,
    composer.knowledgeSelection,
    defaultHostedAgentProfile?.id,
    oracleProviderConfig,
    setExecutionTargetKind,
    setHostedAgentProfileId,
    setInvocationCapability,
    setKnowledgeSelection,
  ])

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

  function updateActiveSessionHistory(
    patch: {
      status?: 'done' | 'error' | 'canceled'
      resultPreview?: string | null
      errorMessage?: string | null
      generatedSqlPreview?: string | null
      executionAgentLabel?: string | null
    }
  ) {
    const activeSession = activeSessionHistoryRef.current
    if (!activeSession) return

    updateSessionHistory(activeSession.tabId, activeSession.tabPath, activeSession.entryId, {
      ...patch,
      updatedAt: Date.now(),
    })

    if (patch.status) {
      activeSessionHistoryRef.current = null
    }
  }

  function setKnowledgeType(nextType: AIKnowledgeType) {
    if (!oracleProviderConfig || nextType === 'none') {
      setKnowledgeSelection({ kind: 'none' })
      setExecutionTargetKind('direct-provider')
      setInvocationCapability('text-generation')
      return
    }

    if (nextType === 'docs') {
      const fallback = oracleProviderConfig.unstructuredStores.find((store) => store.enabled) ?? null
      if (!fallback) return
      setKnowledgeSelection({
        kind: 'oracle-unstructured-store',
        registrationId: fallback.id,
      })
      setExecutionTargetKind('direct-provider')
      setInvocationCapability('rag-unstructured')
      return
    }

    if (nextType === 'agent') {
      setKnowledgeSelection({ kind: 'none' })
      setExecutionTargetKind('oracle-hosted-agent')
      setInvocationCapability('structured-execution')
      setHostedAgentProfileId(composer.hostedAgentProfileId ?? defaultHostedAgentProfile?.id ?? null)
      return
    }

    const fallback = oracleProviderConfig.structuredStores.find((store) => store.enabled) ?? null
    if (!fallback) return
    setKnowledgeSelection({
      kind: 'oracle-structured-store',
      registrationId: fallback.id,
      mode: 'sql-draft',
    })
    setExecutionTargetKind('direct-provider')
    setInvocationCapability('nl2sql-draft')
    if (composer.outputTarget === 'replace-selection' || composer.outputTarget === 'replace-current-block') {
      setOutputTarget('insert-below')
    }
  }

  async function handleSubmit() {
    if (!effectiveContext) return

    if (desktopOnlyMode) {
      pushInfoNotice('notices.aiDesktopOnlyTitle', 'notices.aiDesktopOnlyMessage')
      return
    }

    if (!hasConnection) {
      pushInfoNotice(
        isHostedAgentKnowledge ? 'ai.connection.hostedAgentMissingTitle' : 'notices.aiProviderMissingTitle',
        isHostedAgentKnowledge ? 'ai.connection.hostedAgentMissingMessage' : 'notices.aiProviderMissingMessage'
      )
      return
    }

    const runId = requestRunIdRef.current + 1
    requestRunIdRef.current = runId
    const requestId = `${activeTab?.id ?? 'ai'}-${runId}-${Date.now()}`
    activeRequestIdRef.current = requestId
    setWorkspaceHistoryBinding(null)
    const { entryId, threadId } = startSessionHistory({
      tabId: effectiveContext.tabId,
      tabPath: effectiveContext.tabPath,
      documentName: effectiveContext.fileName,
      source: composer.source,
      intent: effectiveContext.intent,
      scope: effectiveContext.scope,
      outputTarget: effectiveContext.outputTarget,
      prompt: effectivePrompt,
      attachmentCount: effectiveContext.explicitContextAttachments?.length ?? 0,
      executionTargetKind: composer.executionTargetKind,
      knowledgeKind: composer.knowledgeSelection.kind,
      storeLabel:
        composer.knowledgeSelection.kind === 'oracle-unstructured-store'
          ? oracleProviderConfig?.unstructuredStores.find((store) => store.id === selectedUnstructuredRegistrationId)?.label ?? null
          : selectedStructuredStore?.label ?? null,
      structuredMode:
        composer.knowledgeSelection.kind === 'oracle-structured-store'
          ? composer.knowledgeSelection.mode
          : null,
      executionAgentLabel:
        composer.executionTargetKind === 'oracle-hosted-agent' ? selectedHostedAgentProfile?.label ?? null : null,
      threadId: composer.threadId,
    })
    activeSessionHistoryRef.current = {
      tabId: effectiveContext.tabId,
      tabPath: effectiveContext.tabPath,
      entryId,
    }
    setThreadId(threadId)
    startRequest()

    try {
      const response = await runAICompletion({
        requestId,
        intent: effectiveContext.intent,
        scope: effectiveContext.scope,
        outputTarget: effectiveContext.outputTarget,
        prompt: effectivePrompt,
        context: effectiveContext,
        messages: buildAIRequestMessages({
          prompt: effectivePrompt,
          context: effectiveContext,
        }),
        executionTargetKind: composer.executionTargetKind,
        invocationCapability: composer.invocationCapability,
        knowledgeSelection: composer.knowledgeSelection,
        threadId: composer.threadId,
        hostedAgentProfileId:
          composer.executionTargetKind === 'oracle-hosted-agent'
            ? composer.hostedAgentProfileId ?? selectedHostedAgentProfile?.id ?? null
            : null,
      }, {
        onChunk: (chunk) => {
          if (disposedRef.current || runId !== requestRunIdRef.current) return
          appendDraftText(chunk)
        },
      })
      if (disposedRef.current || runId !== requestRunIdRef.current) return
      activeRequestIdRef.current = null

      const legacyRetrieval = extractLegacyAIRetrievalMetadata(response.text)
      const responseText = legacyRetrieval.text
      const draft =
        response.contentType === 'sql'
          ? responseText.trim()
          : normalizeAIDraftText(responseText, effectiveContext.outputTarget)
      setDraftText(draft)
      setDraftFormat(response.contentType)
      setExplanationText(response.explanationText ?? '')
      setWarningText(response.warningText)
      setSourceLabel(response.sourceLabel)
      setRetrievalExecuted(response.retrievalExecuted || legacyRetrieval.query !== null)
      setRetrievalQuery(response.retrievalQuery ?? legacyRetrieval.query)
      setRetrievalResults(response.retrievalResults)
      setRetrievalResultCount(response.retrievalResultCount)
      setThreadId(response.threadId ?? threadId)
      if (response.contentType === 'sql') {
        setDiffBaseText(null)
      } else if (effectiveContext.outputTarget === 'replace-selection' && effectiveContext.selectedText) {
        setDiffBaseText(effectiveContext.selectedText)
      } else if (effectiveContext.outputTarget === 'replace-current-block' && effectiveContext.currentBlock) {
        setDiffBaseText(effectiveContext.currentBlock)
      } else {
        setDiffBaseText(null)
      }
      finishRequest()
      const nextWorkspaceExecution = parseAIWorkspaceExecutionPlan(draft)
      updateActiveSessionHistory({
        status: 'done',
        resultPreview: draft,
        errorMessage: null,
        generatedSqlPreview: response.contentType === 'sql' ? draft : null,
        executionAgentLabel:
          composer.executionTargetKind === 'oracle-hosted-agent' ? selectedHostedAgentProfile?.label ?? null : null,
      })
      if (nextWorkspaceExecution) {
        setWorkspaceHistoryBinding({
          tabId: effectiveContext.tabId,
          tabPath: effectiveContext.tabPath,
          entryId,
        })
      }
    } catch (error) {
      if (disposedRef.current || runId !== requestRunIdRef.current) return
      activeRequestIdRef.current = null
      const message = error instanceof Error ? error.message : String(error)
      failRequest(message)
      updateActiveSessionHistory({
        status: 'error',
        errorMessage: message,
        resultPreview: null,
      })
      pushErrorNotice('notices.aiRequestErrorTitle', 'notices.aiRequestErrorMessage', {
        values: { reason: message },
      })
    }
  }

  async function handleCancelRequest() {
    const requestId = activeRequestIdRef.current
    requestRunIdRef.current += 1
    activeRequestIdRef.current = null
    if (requestId) {
      try {
        await cancelAICompletion(requestId)
      } catch {
        // Ignore cancellation transport failures and fall back to stale-response protection.
      }
    }
    updateActiveSessionHistory({
      status: 'canceled',
      errorMessage: null,
      resultPreview: normalizedDraft || null,
    })
    resetDraftState()
    pushInfoNotice('notices.aiRequestCanceledTitle', 'notices.aiRequestCanceledMessage')
  }

  async function handleCloseComposer() {
    if (composer.requestState === 'streaming') {
      await handleCancelRequest()
    }
    closeComposer()
  }

  async function handleCopy() {
    if (!normalizedDraft) return
    try {
      await navigator.clipboard.writeText(normalizedDraft)
      pushSuccessNotice('notices.aiCopiedTitle', 'notices.aiCopiedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pushErrorNotice('notices.aiCopyErrorTitle', 'notices.aiCopyErrorMessage', {
        values: { reason: message },
      })
    }
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

  function setWorkspaceProducedDraft(taskId: string, draft: AIWorkspaceExecutionProducedDraft) {
    workspaceProducedDraftsRef.current = {
      ...workspaceProducedDraftsRef.current,
      [taskId]: draft,
    }
    setWorkspaceProducedDrafts(workspaceProducedDraftsRef.current)
  }

  function openWorkspaceTaskDraft(task: AIWorkspaceExecutionTask): { tabId: string; name: string } {
    const draftName = buildAIWorkspaceDraftTabName(task)
    const tabId = addTab({
      name: draftName,
      content: task.content,
      savedContent: '',
      isDirty: true,
    })
    primeAIUndoHistorySnapshot({
      tabId,
      beforeContent: '',
      afterContent: task.content,
    })

    setProvenanceMarks(tabId, [
      createAIProvenanceMark({
        from: 0,
        to: task.content.length,
        badge: t('ai.provenance.badge'),
        detail: t('ai.provenance.workspaceTaskDetail'),
        kind: 'new-note',
      }),
    ])

    if (task.action === 'create-note') {
      setWorkspaceProducedDraft(task.id, {
        tabId,
        content: task.content,
      })
    }

    return { tabId, name: draftName }
  }

  function handleOpenWorkspaceTaskDraft(task: AIWorkspaceExecutionTask) {
    const openedDraft = openWorkspaceTaskDraft(task)
    if (task.action === 'create-note') {
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [task.id]: {
          status: 'done',
          message: t('ai.workspaceExecution.taskDraftOpened', { target: openedDraft.name }),
          completionSource: 'manual-open-draft',
          completionAt: Date.now(),
          originRunId: null,
        },
      }))
    }
    return openedDraft
  }

  function openAllWorkspaceTaskDrafts() {
    if (!workspaceExecution || workspaceAgentSession?.status === 'running') return
    for (const task of workspaceExecution.tasks) {
      handleOpenWorkspaceTaskDraft(task)
    }
  }

  function setWorkspaceTaskTargetOverride(taskId: string, target: string | null) {
    setWorkspaceTaskTargetOverrides((current) => {
      const normalizedTarget = target?.trim() ?? null
      if (!normalizedTarget) {
        if (!(taskId in current)) return current
        const next = { ...current }
        delete next[taskId]
        return next
      }

      if (current[taskId] === normalizedTarget) return current
      return {
        ...current,
        [taskId]: normalizedTarget,
      }
    })
  }

  async function runWorkspaceTask(
    task: AIWorkspaceExecutionTask,
    options: {
      suppressNotices?: boolean
      runId?: number
      preflight?: AIWorkspaceExecutionTaskPreflight | null
    } = {}
  ): Promise<WorkspaceTaskRunResult> {
    const isCanceled = () =>
      typeof options.runId === 'number' && workspaceAgentRunIdRef.current !== options.runId

    if (isCanceled()) {
      return {
        success: false,
        canceled: true,
        message: t('ai.workspaceExecution.agentCanceled'),
      }
    }

    if (task.action === 'create-note') {
      const openedDraft = openWorkspaceTaskDraft(task)
      return {
        success: true,
        message: t('ai.workspaceExecution.taskDraftOpened', { target: openedDraft.name }),
      }
    }

    const directProducedDraft =
      options.preflight?.upstreamTaskId &&
      options.preflight.matchedReference?.tabId &&
      workspaceProducedDraftsRef.current[options.preflight.upstreamTaskId]?.tabId === options.preflight.matchedReference.tabId
        ? {
            upstreamTaskId: options.preflight.upstreamTaskId,
            tabId: options.preflight.matchedReference.tabId,
            content: workspaceProducedDraftsRef.current[options.preflight.upstreamTaskId]?.content ?? '',
          }
        : null
    const directDraftTab = directProducedDraft
      ? useEditorStore
          .getState()
          .tabs.find(
            (tab) =>
              tab.id === directProducedDraft.tabId &&
              tab.content === directProducedDraft.content
          ) ?? null
      : null

    if (directProducedDraft && directDraftTab) {
      primeAIUndoHistorySnapshot({
        tabId: directDraftTab.id,
        beforeContent: directDraftTab.content,
        afterContent: task.content,
      })
      useEditorStore.getState().updateTabContent(directDraftTab.id, task.content)
      setProvenanceMarks(directDraftTab.id, [
        createAIProvenanceMark({
          from: 0,
          to: task.content.length,
          badge: t('ai.provenance.badge'),
          detail: t('ai.provenance.workspaceTaskDetail'),
          kind: 'apply',
        }),
      ])
      setWorkspaceProducedDraft(directProducedDraft.upstreamTaskId, {
        tabId: directDraftTab.id,
        content: task.content,
      })

      const message = t('ai.workspaceExecution.taskApplied', { target: directDraftTab.name })
      if (!options.suppressNotices) {
        pushSuccessNotice('notices.aiWorkspaceTaskAppliedTitle', 'notices.aiWorkspaceTaskAppliedMessage', {
          values: { target: directDraftTab.name },
        })
      }

      return { success: true, message }
    }

    const resolvedTarget = workspaceTaskTargetOverrides[task.id]?.trim() || task.target
    const references = await findWorkspaceDocumentReferences({
      query: resolvedTarget,
      tabs: useEditorStore.getState().tabs,
      rootPath,
      limit: 1,
    })
    if (isCanceled()) {
      return {
        success: false,
        canceled: true,
        message: t('ai.workspaceExecution.agentCanceled'),
      }
    }
    const reference = references[0]

    if (!reference) {
      const message = t('ai.workspaceExecution.targetNotFound', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (reference.ambiguous) {
      const message = t('ai.workspaceExecution.targetAmbiguous', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (reference.confidence === 'low') {
      const message = t('ai.workspaceExecution.targetLowConfidence', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    let tabId = reference.tabId
    if (!tabId && reference.path) {
      const opened = await openDesktopDocumentPath(reference.path)
      if (isCanceled()) {
        return {
          success: false,
          canceled: true,
          message: t('ai.workspaceExecution.agentCanceled'),
        }
      }
      if (!opened) {
        const message = t('ai.workspaceExecution.targetOpenFailed', { target: reference.path })
        if (!options.suppressNotices) {
          pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
            values: { reason: message },
          })
        }
        return { success: false, message }
      }

      tabId = useEditorStore.getState().tabs.find((tab) => tab.path === reference.path)?.id ?? null
    }

    const targetTab = useEditorStore.getState().tabs.find((tab) => tab.id === tabId)
    if (!targetTab) {
      const message = t('ai.workspaceExecution.targetNotFound', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (targetTab.isDirty) {
      const message = t('ai.workspaceExecution.targetDirty', { target: targetTab.name })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    primeAIUndoHistorySnapshot({
      tabId: targetTab.id,
      beforeContent: targetTab.content,
      afterContent: task.content,
    })
    useEditorStore.getState().updateTabContent(targetTab.id, task.content)
    setProvenanceMarks(targetTab.id, [
      createAIProvenanceMark({
        from: 0,
        to: task.content.length,
        badge: t('ai.provenance.badge'),
        detail: t('ai.provenance.workspaceTaskDetail'),
        kind: 'apply',
      }),
    ])

    const message = t('ai.workspaceExecution.taskApplied', { target: targetTab.name })
    if (!options.suppressNotices) {
      pushSuccessNotice('notices.aiWorkspaceTaskAppliedTitle', 'notices.aiWorkspaceTaskAppliedMessage', {
        values: { target: targetTab.name },
      })
    }

    return { success: true, message }
  }

  async function executeWorkspaceTask(task: AIWorkspaceExecutionTask): Promise<boolean> {
    if (workspaceAgentSession?.status === 'running') return false
    const preflightEntry = workspacePreflight.data?.tasks[task.id]
    if (preflightEntry?.status === 'blocked' || preflightEntry?.status === 'waiting') {
      const message = formatWorkspacePreflightMessage(preflightEntry, task, t)
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [task.id]: {
          status: preflightEntry.status === 'waiting' ? 'waiting' : 'error',
          message,
        },
      }))
      return false
    }

    setWorkspaceExecutionStates((state) => ({
      ...state,
      [task.id]: { status: 'running' },
    }))

    const result = await runWorkspaceTask(task, { preflight: preflightEntry })
    if (result.canceled) return false

    setWorkspaceExecutionStates((state) => ({
      ...state,
      [task.id]: {
        status: result.success ? 'done' : 'error',
        message: result.message,
        completionSource: result.success ? 'manual-apply' : undefined,
        completionAt: result.success ? Date.now() : undefined,
        originRunId: result.success ? null : undefined,
      },
    }))
    return result.success
  }

  function cancelWorkspaceAgentRun() {
    const currentTaskId = workspaceAgentSession?.currentTaskId ?? null
    const currentTask = currentTaskId
      ? workspaceExecution?.tasks.find((task) => task.id === currentTaskId) ?? null
      : null
    const canceledMessage = t('ai.workspaceExecution.agentCanceled')

    workspaceAgentRunIdRef.current += 1
    if (currentTaskId) {
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [currentTaskId]: {
          status: 'canceled',
          message: canceledMessage,
        },
      }))
    }
    setWorkspaceAgentSession((session) =>
      session
        ? {
            ...session,
            status: 'canceled',
            currentTaskId: null,
            logs:
              currentTask && session.currentTaskId === currentTask.id
                ? [
                    ...session.logs,
                    {
                      id: `${currentTask.id}:canceled:${session.logs.length}`,
                      taskId: currentTask.id,
                      title: currentTask.title,
                      status: 'canceled',
                      message: canceledMessage,
                    },
                  ]
                : session.logs,
          }
        : null
    )
    pushInfoNotice('notices.aiWorkspaceAgentCanceledTitle', 'notices.aiWorkspaceAgentCanceledMessage')
  }

  async function runWorkspaceAgent() {
    if (!workspaceExecution || workspaceAgentSession?.status === 'running') return
    const phaseGroups = groupAIWorkspaceExecutionTasksByPhase(workspaceExecution.tasks)
    if (
      workspacePreflight.status === 'loading' ||
      !canStartWorkspaceAgent({
        phaseGroups,
        preflight: workspacePreflight.data,
        taskStates: workspaceExecutionStates,
      })
    ) {
      return
    }

    const runId = workspaceAgentRunIdRef.current + 1
    workspaceAgentRunIdRef.current = runId
    const resumeState = buildAIWorkspaceExecutionAgentResumeState({
      tasks: workspaceExecution.tasks,
      taskStates: workspaceExecutionStates,
    })
    const resumedLogs: WorkspaceAgentSessionLogEntry[] = resumeState.completedTaskIds.flatMap((taskId, index) => {
      const task = workspaceExecution.tasks.find((item) => item.id === taskId)
      if (!task) return []

      const completionSource = resumeState.taskStates[taskId]?.completionSource
      const completionAt = resumeState.taskStates[taskId]?.completionAt
      const originRunId = resumeState.taskStates[taskId]?.originRunId
      return [{
        id: `${task.id}:resumed:${index}`,
        taskId: task.id,
        title: task.title,
        status: 'done',
        message: buildWorkspaceExecutionResumedLogMessage(completionSource, originRunId, t),
        completionSource,
        completionAt,
        originRunId,
      }]
    })
    setWorkspaceExecutionStates(resumeState.taskStates)
    setWorkspaceAgentSession({
      status: 'running',
      total: workspaceExecution.tasks.length,
      completed: resumeState.completedTaskIds.length,
      failed: 0,
      currentTaskId: null,
      logs: resumedLogs,
    })

    let appliedCount = resumeState.completedTaskIds.length
    let failedCount = 0
    const logs: WorkspaceAgentSessionLogEntry[] = [...resumedLogs]
    const completedTaskIds = new Set<string>(resumeState.completedTaskIds)
    const queuedPhaseGroups = phaseGroups.map((phaseGroup) => ({
      ...phaseGroup,
      tasks: [...phaseGroup.tasks],
    }))

    phaseLoop: for (let phaseIndex = 0; phaseIndex < queuedPhaseGroups.length; phaseIndex += 1) {
      const phaseGroup = queuedPhaseGroups[phaseIndex]
      if (!phaseGroup) continue

      while (phaseGroup.tasks.length > 0) {
        if (workspaceAgentRunIdRef.current !== runId) return
        const iterationPreflight = await buildAIWorkspaceExecutionPreflight({
          tasks: workspaceExecution.tasks,
          tabs: useEditorStore.getState().tabs,
          rootPath,
          targetOverrides: workspaceTaskTargetOverrides,
          completedTaskIds: [...completedTaskIds],
          producedDrafts: workspaceProducedDraftsRef.current,
        })
        if (workspaceAgentRunIdRef.current !== runId) return

        const waitingStateUpdates = Object.fromEntries(
          phaseGroup.tasks
            .map((task) => {
              const meta = iterationPreflight.tasks[task.id]
              if (!meta) return null
              if (meta.status === 'waiting') {
                return [
                  task.id,
                  {
                    status: 'waiting' as WorkspaceExecutionTaskStatus,
                    message: formatWorkspacePreflightMessage(meta, task, t),
                  },
                ] as const
              }

              return [task.id, { status: 'idle' as WorkspaceExecutionTaskStatus }] as const
            })
            .filter((entry): entry is [string, AIWorkspaceExecutionTaskRuntimeState] => entry !== null)
        )
        setWorkspaceExecutionStates((state) => {
          let changed = false
          const nextState = { ...state }

          for (const [taskId, update] of Object.entries(waitingStateUpdates)) {
            const current = nextState[taskId]
            if (current?.status === 'done' || current?.status === 'running' || current?.status === 'error' || current?.status === 'canceled') {
              continue
            }

            const nextMessage = update.message
            if (current?.status === update.status && current?.message === nextMessage) continue
            nextState[taskId] = nextMessage ? { status: update.status, message: nextMessage } : { status: update.status }
            changed = true
          }

          return changed ? nextState : state
        })

        const nextTaskIndex = phaseGroup.tasks.findIndex((task) => {
          const meta = iterationPreflight.tasks[task.id]
          if (!meta || meta.status === 'blocked' || meta.status === 'waiting') return false
          return true
        })

        if (nextTaskIndex === -1) {
          const waitingTasks = phaseGroup.tasks.filter((task) => iterationPreflight.tasks[task.id]?.status === 'waiting')
          const hasWaitingOnly = waitingTasks.length === phaseGroup.tasks.length && waitingTasks.length > 0
          const stalledMessage = hasWaitingOnly
            ? buildWorkspaceExecutionPhaseStalledMessage({
                phaseGroup,
                phaseIndex,
                tasks: waitingTasks,
                preflight: iterationPreflight,
                t,
              })
            : null

          for (const task of phaseGroup.tasks) {
            const meta = iterationPreflight.tasks[task.id]
            const message =
              stalledMessage && meta?.status === 'waiting'
                ? stalledMessage
                : meta
                  ? formatWorkspacePreflightMessage(meta, task, t)
                  : t('ai.workspaceExecution.preflightBlockedDetail')

            failedCount += 1
            logs.push({
              id: `${task.id}:${logs.length}`,
              taskId: task.id,
              title: task.title,
              status: 'error',
              message,
            })
            setWorkspaceExecutionStates((state) => ({
              ...state,
              [task.id]: {
                status: 'error',
                message,
              },
            }))
          }

          const blockedPhaseLabel = formatWorkspaceExecutionPhaseHeading(phaseGroup, phaseIndex, t)
          const deferredMessage = t('ai.workspaceExecution.phaseBlockedByEarlierPhase', {
            phase: blockedPhaseLabel,
          })

          for (const laterPhase of queuedPhaseGroups.slice(phaseIndex + 1)) {
            for (const task of laterPhase.tasks) {
              failedCount += 1
              logs.push({
                id: `${task.id}:${logs.length}`,
                taskId: task.id,
                title: task.title,
                status: 'error',
                message: deferredMessage,
              })
              setWorkspaceExecutionStates((state) => ({
                ...state,
                [task.id]: {
                  status: 'error',
                  message: deferredMessage,
                },
              }))
            }
          }
          break phaseLoop
        }

        const [task] = phaseGroup.tasks.splice(nextTaskIndex, 1)
        if (!task) break

        setWorkspaceExecutionStates((state) => ({
          ...state,
          [task.id]: { status: 'running' },
        }))
        setWorkspaceAgentSession((session) =>
          session
            ? {
                ...session,
                currentTaskId: task.id,
              }
            : session
        )

        const result = await runWorkspaceTask(task, {
          suppressNotices: true,
          runId,
          preflight: iterationPreflight.tasks[task.id] ?? null,
        })
        if (workspaceAgentRunIdRef.current !== runId) return

        if (result.success) {
          appliedCount += 1
          completedTaskIds.add(task.id)
        } else {
          failedCount += 1
        }

        const completionAt = result.success ? Date.now() : undefined
        const originRunId = result.success ? runId : undefined

        logs.push({
          id: `${task.id}:${logs.length}`,
          taskId: task.id,
          title: task.title,
          status: result.success ? 'done' : 'error',
          message: result.message,
          completionSource: result.success ? 'agent' : undefined,
          completionAt,
          originRunId,
        })

        setWorkspaceExecutionStates((state) => ({
          ...state,
          [task.id]: {
            status: result.success ? 'done' : 'error',
            message: result.message,
            completionSource: result.success ? 'agent' : undefined,
            completionAt,
            originRunId,
          },
        }))
        setWorkspaceAgentSession((session) =>
          session
            ? {
                ...session,
                completed: appliedCount,
                failed: failedCount,
                currentTaskId: null,
                logs: [...logs],
              }
            : session
        )
      }
    }

    if (workspaceAgentRunIdRef.current !== runId) return

    setWorkspaceAgentSession((session) =>
      session
        ? {
            ...session,
            status: 'completed',
            completed: appliedCount,
            failed: failedCount,
            currentTaskId: null,
            logs: [...logs],
          }
        : session
    )
    pushInfoNotice('notices.aiWorkspaceExecutionSummaryTitle', 'notices.aiWorkspaceExecutionSummaryMessage', {
      values: {
        count: appliedCount,
        total: workspaceExecution.tasks.length,
      },
    })
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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(0, 0, 0, 0.24)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void handleCloseComposer()
      }}
    >
      <div
        data-ai-composer="true"
        role="dialog"
        aria-modal="true"
        aria-label={t('ai.title')}
        className="glass-panel flex w-full flex-col overflow-hidden rounded-[20px] border shadow-2xl"
        style={{
          maxWidth: 'min(960px, calc(100vw - 4rem))',
          minHeight: '540px',
          maxHeight: '85vh',
          background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)' }}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <AppIcon name="sparkles" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('ai.title')}
            </div>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => void handleCloseComposer()}
            aria-label={t('dialog.cancel')}
          >
            <span className="block text-base leading-none">×</span>
          </button>
        </div>

        {/* Body */}
        <div
          data-ai-composer-scroll="form"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-5 py-4"
        >
          {/* Connection hint */}
          {showConnectionHint && (
            <div
              data-ai-setup-hint="true"
              className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 16%, var(--border))',
                background: 'color-mix(in srgb, var(--bg-secondary) 74%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <AppIcon name="settings" size={13} />
              </span>
              <div className="min-w-0">
                <div className="font-medium">{connectionHintTitle}</div>
                <div className="mt-0.5 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {connectionHintMessage}
                </div>
              </div>
            </div>
          )}

          {showSlashCommandHint && (
            <div
              data-ai-slash-context={slashCommandContext.isEmpty ? 'empty' : 'attached'}
              className="rounded-2xl border px-4 py-3 text-xs leading-5"
              style={
                slashCommandContext.isEmpty
                  ? {
                      borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
                      background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-secondary))',
                      color: 'var(--text-primary)',
                    }
                  : {
                      borderColor: 'color-mix(in srgb, var(--accent) 16%, var(--border))',
                      background: 'color-mix(in srgb, var(--bg-secondary) 74%, transparent)',
                      color: 'var(--text-primary)',
                    }
              }
            >
              <p className="m-0 truncate whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {slashCommandContext.isEmpty
                  ? t('ai.slashContext.emptyMessage')
                  : t('ai.slashContext.attachedMessage')}
              </p>
            </div>
          )}

          {oracleProviderConfig && (
            <section
              data-ai-knowledge="true"
              className="grid gap-3 rounded-2xl border px-4 py-3"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="grid gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.knowledge.title')}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { value: 'none', label: t('ai.knowledge.type.none') },
                    { value: 'docs', label: t('ai.knowledge.type.docs') },
                    { value: 'data', label: t('ai.knowledge.type.data') },
                    { value: 'agent', label: t('ai.knowledge.type.agent') },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-ai-knowledge-type={option.value}
                      onClick={() => setKnowledgeType(option.value)}
                      className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        borderColor: knowledgeType === option.value ? 'var(--accent)' : 'var(--border)',
                        background:
                          knowledgeType === option.value
                            ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                            : 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {knowledgeType === 'docs' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.knowledge.docsLabel')}
                  </span>
                  <select
                    value={
                      composer.knowledgeSelection.kind === 'oracle-unstructured-store'
                        ? composer.knowledgeSelection.registrationId
                        : ''
                    }
                    onChange={(event) => {
                      const storeId = event.target.value
                      if (!storeId) {
                        setKnowledgeType('none')
                        return
                      }
                      setKnowledgeSelection({ kind: 'oracle-unstructured-store', registrationId: storeId })
                      setExecutionTargetKind('direct-provider')
                      setInvocationCapability('rag-unstructured')
                    }}
                    className="rounded-2xl border px-3 py-2 text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">{t('ai.connection.noneOption')}</option>
                    {oracleProviderConfig.unstructuredStores
                      .filter((store) => store.enabled)
                      .map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.label || store.id}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {knowledgeType === 'data' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.knowledge.dataLabel')}
                  </span>
                  <select
                    value={
                      composer.knowledgeSelection.kind === 'oracle-structured-store'
                        ? composer.knowledgeSelection.registrationId
                        : ''
                    }
                    onChange={(event) => {
                      const registrationId = event.target.value
                      const store =
                        oracleProviderConfig.structuredStores.find((candidate) => candidate.id === registrationId) ?? null
                      if (!store) {
                        setKnowledgeType('none')
                        return
                      }
                      setKnowledgeSelection({
                        kind: 'oracle-structured-store',
                        registrationId,
                        mode: 'sql-draft',
                      })
                      setExecutionTargetKind('direct-provider')
                      setInvocationCapability('nl2sql-draft')
                      if (composer.outputTarget === 'replace-selection' || composer.outputTarget === 'replace-current-block') {
                        setOutputTarget('insert-below')
                      }
                    }}
                    className="rounded-2xl border px-3 py-2 text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">{t('ai.connection.noneOption')}</option>
                    {oracleProviderConfig.structuredStores
                      .filter((store) => store.enabled)
                      .map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.label || store.id}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {knowledgeType === 'agent' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.knowledge.executionAgent')}
                  </span>
                  <select
                    value={composer.hostedAgentProfileId ?? ''}
                    onChange={(event) => {
                      setKnowledgeSelection({ kind: 'none' })
                      setExecutionTargetKind('oracle-hosted-agent')
                      setInvocationCapability('structured-execution')
                      setHostedAgentProfileId(event.target.value || null)
                    }}
                    data-ai-agent-profile-select="true"
                    className="rounded-2xl border px-3 py-2 text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">{t('ai.connection.noneOption')}</option>
                    {oracleProviderConfig.hostedAgentProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label || profile.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
          )}

          {/* Textarea — primary element */}
          <textarea
            ref={textareaRef}
            data-ai-composer-prompt="true"
            value={composer.prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={promptRows}
            className="w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{
              ...composerContentTypography.text,
              minHeight: promptMinHeight,
              maxHeight: promptMaxHeight,
              overflowY: 'auto',
              background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
              borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
              color: 'var(--text-primary)',
            }}
            placeholder={promptPlaceholder}
          />

          {/* Quick action chips */}
          <AIQuickChips
            templates={templateModels}
            composerIntent={composer.intent}
            composerScope={composer.scope}
            composerOutputTarget={composer.outputTarget}
            composerPrompt={effectivePrompt}
            hasSelection={hasSelection}
            hasCurrentBlock={hasCurrentBlock}
            hasSlashCommandContext={hasSlashCommandContext}
            aiDefaultWriteTarget={aiDefaultWriteTarget}
            onSelectTemplate={applyTemplate}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2">
              {composer.requestState === 'streaming' ? (
                <button
                  type="button"
                  onClick={() => void handleCancelRequest()}
                  data-ai-action="cancel-request"
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {t('ai.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  data-ai-action="run"
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ background: 'var(--accent)', color: 'white' }}
                  disabled={!canSubmit}
                  title={`${t('ai.run')} (${runShortcutLabel})`}
                >
                  {t('ai.run')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetDraftState()
                  void handleCloseComposer()
                }}
                data-ai-action="close"
                className="rounded-full border px-4 py-1.5 text-sm transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
              >
                {t('dialog.cancel')}
              </button>
            </div>
            <div
              data-ai-current-output-target="true"
              className="ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 84%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 64%, transparent)',
                color: 'var(--text-muted)',
              }}
            >
              <span>{t('ai.responseModeLabel')}</span>
              <span style={{ color: 'var(--text-primary)' }}>{t(`ai.outputTarget.${composer.outputTarget}`)}</span>
            </div>
          </div>

          {showResultPanel && hasRetrievalDetails && !composer.errorMessage && !workspaceExecution && (
            <AIRetrievalDisclosure
              expanded={retrievalPanelOpen}
              onToggle={() => setRetrievalPanelOpen((value) => !value)}
              retrievalExecuted={composer.retrievalExecuted}
              query={composer.retrievalQuery}
              results={composer.retrievalResults}
              totalResultCount={composer.retrievalResultCount}
              typography={composerContentTypography}
            />
          )}

          {/* Result panel */}
          {showResultPanel && (
            <div
              data-ai-result-panel="true"
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border"
              style={{
                minHeight: resultPanelMinHeight,
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              }}
            >
              {/* Result header */}
              <div
                className="flex flex-wrap items-center gap-1.5 px-4 py-2"
                style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)' }}
              >
                <div className="flex items-center gap-0.5">
                  {(
                    [
                      { view: 'draft', label: t('ai.result.draft') },
                      { view: 'diff', label: t('ai.result.diff'), disabled: !hasDiffPreview && !hasInsertPreview },
                    ] as Array<{ view: typeof resultView; label: string; disabled?: boolean }>
                  ).map(({ view, label, disabled }) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => !disabled && setResultView(view)}
                      data-ai-result-view={view}
                      disabled={disabled}
                      className="rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background:
                          resultView === view
                            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                            : 'transparent',
                        color: resultView === view ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                {composer.sourceLabel && (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {composer.sourceLabel}
                  </span>
                )}
                {normalizedDraft && (
                  <div className="flex items-center gap-1.5">
                    {/* Secondary: Retry (text-style, low weight) */}
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      data-ai-action="retry"
                      className="px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{ color: 'var(--text-muted)' }}
                      disabled={composer.requestState === 'streaming' || !canSubmit}
                    >
                      {t('ai.retry')}
                    </button>
                    {/* Secondary: Discard (border ghost) */}
                    <button
                      type="button"
                      onClick={() => {
                        resetDraftState()
                        setResultView('draft')
                      }}
                      data-ai-action="discard"
                      className="rounded-lg border px-2.5 py-1 text-xs transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {t('ai.discard')}
                    </button>
                    {/* Workspace agent actions */}
                    {hasWorkspaceExecutionTasks && (
                      <>
                        <button
                          type="button"
                          onClick={() => void runWorkspaceAgent()}
                          data-ai-action="run-workspace-agent"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ background: 'var(--accent)', color: 'white' }}
                          disabled={!canRunWorkspaceAgent}
                        >
                          {t('ai.workspaceExecution.runAgent')}
                        </button>
                        {workspaceAgentSession?.status === 'running' && (
                          <button
                            type="button"
                            onClick={cancelWorkspaceAgentRun}
                            data-ai-action="stop-workspace-agent"
                            className="rounded-lg border px-2.5 py-1 text-xs transition-colors"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {t('ai.workspaceExecution.stopAgent')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={openAllWorkspaceTaskDrafts}
                          data-ai-action="open-all-workspace-drafts"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))',
                            color: 'var(--text-primary)',
                            border: '1px solid color-mix(in srgb, var(--accent) 26%, var(--border))',
                          }}
                          disabled={workspaceAgentSession?.status === 'running'}
                        >
                          {t('ai.workspaceExecution.openAllDrafts')}
                        </button>
                      </>
                    )}
                    {/* Result actions: explicit destination choices */}
                    {!hasWorkspaceExecutionTasks && canApplyToEditor && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopy()}
                          data-ai-action="copy"
                          className="rounded-lg border px-2.5 py-1 text-xs transition-colors"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          {t('ai.copy')}
                        </button>
                        <div
                          aria-hidden="true"
                          className="mx-0.5 h-4 w-px"
                          style={{ background: 'color-mix(in srgb, var(--border) 88%, transparent)' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (replaceActionTarget) handleApplyToTarget(replaceActionTarget)
                          }}
                          data-ai-action="replace"
                          disabled={!canApplyToAnyTarget || !canReplaceCurrentTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'replace' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={currentDocumentResultActionStyle}
                          title={
                            preferredResultAction === 'replace'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : undefined
                          }
                        >
                          {replaceActionTarget ? t(`ai.outputTarget.${replaceActionTarget}`) : t('search.replace')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyToTarget(defaultInsertTarget)}
                          data-ai-action="insert"
                          disabled={!canApplyToAnyTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'insert' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={currentDocumentResultActionStyle}
                          title={
                            preferredResultAction === 'insert'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : t(`ai.outputTarget.${defaultInsertTarget}`)
                          }
                        >
                          {t('ai.insert')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyToTarget('new-note')}
                          data-ai-action="new-note"
                          disabled={!canApplyToAnyTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'new-note' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            background:
                              preferredResultAction === 'new-note'
                                ? 'var(--accent)'
                                : 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
                            color: preferredResultAction === 'new-note' ? 'white' : 'var(--text-primary)',
                            border:
                              preferredResultAction === 'new-note'
                                ? '1px solid var(--accent)'
                                : '1px solid color-mix(in srgb, var(--border) 88%, transparent)',
                          }}
                          title={
                            preferredResultAction === 'new-note'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : undefined
                          }
                        >
                          {t('ai.outputTarget.new-note')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Result body */}
              <div data-ai-result-body="true" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {composer.requestState === 'streaming' && (
                  <p className="text-sm" style={{ ...composerContentTypography.text, color: 'var(--text-muted)' }}>
                    {t('ai.loading')}
                  </p>
                )}
                {composer.errorMessage && (
                  <p className="text-sm" style={{ ...composerContentTypography.text, color: '#dc2626' }}>
                    {composer.errorMessage}
                  </p>
                )}
                {!composer.errorMessage && resultView === 'draft' && (
                  <>
                    {workspaceExecution ? (
                      <AIWorkspaceExecutionView
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
                    ) : composer.draftFormat === 'sql' ? (
                      <AISqlDraftPreview
                        sql={normalizedDraft}
                        explanationText={composer.explanationText}
                        warningText={composer.warningText}
                        sourceLabel={composer.sourceLabel}
                        typography={composerContentTypography}
                      />
                    ) : (
                      <pre
                        className="m-0 whitespace-pre-wrap break-words text-sm"
                        style={{
                          ...composerContentTypography.text,
                          color: 'var(--text-primary)',
                          fontFamily: 'inherit',
                        }}
                      >
                        {normalizedDraft || t('ai.result.empty')}
                      </pre>
                    )}
                  </>
                )}
                {!composer.errorMessage && resultView === 'diff' && (
                  <>
                    {hasDiffPreview ? (
                      <AIDiffPreview
                        blocks={diffBlocks}
                        emptyLabel={t('ai.result.noDiff')}
                        typography={composerContentTypography}
                      />
                    ) : hasInsertPreview ? (
                      <AIInsertionPreview
                        outputTarget={composer.outputTarget}
                        text={normalizedDraft}
                        targetLabel={t(`ai.outputTarget.${composer.outputTarget}`)}
                        emptyLabel={t('ai.result.noDiff')}
                        typography={composerContentTypography}
                      />
                    ) : (
                      <p className="text-sm" style={{ ...composerContentTypography.text, color: 'var(--text-muted)' }}>
                        {t('ai.result.noDiff')}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AIRetrievalDisclosure({
  expanded,
  onToggle,
  retrievalExecuted,
  query,
  results,
  totalResultCount,
  typography,
}: {
  expanded: boolean
  onToggle: () => void
  retrievalExecuted: boolean
  query: string | null
  results: AIRetrievalResultPreview[]
  totalResultCount: number | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()
  const visibleResultCount = results.length
  const summaryCount = totalResultCount ?? visibleResultCount
  const showResultsList = visibleResultCount > 0
  const summaryLabel =
    totalResultCount === null && visibleResultCount === 0
      ? t('ai.retrieval.summaryUnavailable')
      : t('ai.retrieval.summary', { count: summaryCount })

  return (
    <div
      data-ai-retrieval-panel="true"
      className="min-w-0 overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
        background: 'color-mix(in srgb, var(--bg-secondary) 84%, var(--bg-primary))',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-ai-retrieval-toggle="true"
        className="group flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{
          background: expanded
            ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
            : 'color-mix(in srgb, var(--accent) 4%, var(--bg-primary))',
          color: 'var(--text-primary)',
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <AppIcon name="search" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ ...typography.text, color: 'var(--text-primary)' }}
          >
            {t('ai.retrieval.title')}
          </div>
          <div className="mt-1 text-xs" style={{ ...typography.meta, color: 'var(--text-secondary)' }}>
            {summaryLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {query ? (
            <span
              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              {t('ai.retrieval.query')}
            </span>
          ) : null}
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              color: 'var(--text-muted)',
            }}
          >
            {t('ai.retrieval.resultsCount', { count: summaryCount })}
          </span>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border transition-transform"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border))',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-secondary)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            <AppIcon name="chevronRight" size={16} />
          </span>
        </div>
      </button>
      {expanded ? (
        <div
          data-ai-retrieval-body="true"
          className="grid gap-3 border-t px-4 py-4"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)' }}
        >
          {query ? (
            <section
              data-ai-retrieval-query="true"
              className="rounded-xl border px-3 py-3"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
                background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-primary))',
              }}
            >
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ ...typography.meta, color: 'var(--text-muted)' }}
              >
                {t('ai.retrieval.query')}
              </div>
              <pre
                className="mt-2 whitespace-pre-wrap break-words"
                style={{
                  ...typography.code,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                  margin: 0,
                }}
              >
                {query}
              </pre>
            </section>
          ) : retrievalExecuted ? (
            <section
              data-ai-retrieval-query="true"
              className="rounded-xl border px-3 py-3"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
                background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-primary))',
              }}
            >
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ ...typography.meta, color: 'var(--text-muted)' }}
              >
                {t('ai.retrieval.query')}
              </div>
              <p className="mt-2 text-sm" style={{ ...typography.text, color: 'var(--text-muted)', margin: 0 }}>
                {t('ai.retrieval.noQuery')}
              </p>
            </section>
          ) : null}

          <section data-ai-retrieval-results="true" className="grid gap-2">
            <div
              className="flex items-center justify-between gap-3"
              style={{ ...typography.meta, color: 'var(--text-muted)' }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                {t('ai.retrieval.results')}
              </span>
              <span>{t('ai.retrieval.resultsCount', { count: summaryCount })}</span>
            </div>
            {showResultsList ? (
              results.map((result, index) => (
                <article
                  key={`${result.title}-${result.detail ?? index}`}
                  data-ai-retrieval-result={index}
                  className="rounded-xl border px-3 py-3"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" style={typography.text}>
                      {result.title}
                    </div>
                    {result.detail ? (
                      <div className="mt-1 text-xs" style={{ ...typography.meta, color: 'var(--text-muted)' }}>
                        {result.detail}
                      </div>
                    ) : null}
                    {result.snippet ? (
                      <p className="mt-2 text-sm" style={{ ...typography.text, color: 'var(--text-secondary)', margin: 0 }}>
                        {result.snippet}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div
                className="rounded-xl border px-3 py-3 text-sm"
                style={{
                  ...typography.text,
                  borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
                  color: 'var(--text-muted)',
                }}
              >
                {t('ai.retrieval.noResults')}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function AIQuickChips({
  templates,
  composerIntent,
  composerScope,
  composerOutputTarget,
  composerPrompt,
  hasSelection,
  hasCurrentBlock,
  hasSlashCommandContext,
  aiDefaultWriteTarget,
  onSelectTemplate,
}: {
  templates: AITemplateModel[]
  composerIntent: AIIntent
  composerScope: 'selection' | 'current-block' | 'document'
  composerOutputTarget: string
  composerPrompt: string
  hasSelection: boolean
  hasCurrentBlock: boolean
  hasSlashCommandContext: boolean
  aiDefaultWriteTarget: 'replace-selection' | 'at-cursor' | 'insert-below'
  onSelectTemplate: (template: AITemplateModel) => void
}) {
  const { t } = useTranslation()

  const chipTemplates = useMemo(
    () =>
      AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER
        .map((id) => templates.find((tmpl) => tmpl.id === id))
        .filter((tmpl): tmpl is AITemplateModel => tmpl !== undefined),
    [templates]
  )
  const resolvedTemplates = useMemo(
    () =>
      chipTemplates.map((template) => ({
        template,
        resolution: resolveAIComposerTemplateResolution(template, {
          hasSelection,
          hasCurrentBlock,
          hasSlashCommandContext,
          aiDefaultWriteTarget,
        }),
      })),
    [aiDefaultWriteTarget, chipTemplates, hasCurrentBlock, hasSelection, hasSlashCommandContext]
  )
  const showTransformHint = resolvedTemplates.some(({ resolution }) => !resolution.enabled)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.mode.suggestions')}
        </span>
        {resolvedTemplates.map(({ template, resolution }) => {
          const active =
            composerIntent === resolution.intent &&
            composerScope === resolution.scope &&
            composerOutputTarget === resolution.outputTarget &&
            composerPrompt === template.prompt

          return (
            <button
              key={template.id}
              type="button"
              data-ai-template={template.id}
              onClick={() => onSelectTemplate(template)}
              disabled={!resolution.enabled}
              className="rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                borderColor: active
                  ? 'color-mix(in srgb, var(--accent) 32%, var(--border))'
                  : 'color-mix(in srgb, var(--border) 82%, transparent)',
                background: active
                  ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                  : 'color-mix(in srgb, var(--bg-secondary) 64%, transparent)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              title={resolution.enabled ? template.detail : t('ai.target.transformHint')}
            >
              {template.label}
            </button>
          )
        })}
      </div>
      {showTransformHint && (
        <p
          data-ai-template-hint="transform-target-required"
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('ai.target.transformHint')}
        </p>
      )}
    </div>
  )
}

function AISqlDraftPreview({
  sql,
  explanationText,
  warningText,
  sourceLabel,
  typography,
}: {
  sql: string
  explanationText: string
  warningText: string | null
  sourceLabel: string | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3">
      <div
        className="rounded-2xl border px-3 py-3"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.knowledge.structuredAction.sqlDraft')}
          </div>
          {sourceLabel ? (
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                color: 'var(--text-muted)',
              }}
            >
              {sourceLabel}
            </span>
          ) : null}
        </div>
        <pre
          data-ai-sql-draft="true"
          className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl px-3 py-3"
          style={{
            ...typography.code,
            background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {sql || t('ai.result.empty')}
        </pre>
      </div>
      {explanationText ? (
        <div className="text-[11px] leading-5" style={{ ...typography.meta, color: 'var(--text-secondary)' }}>
          {explanationText}
        </div>
      ) : null}
      {warningText ? (
        <div
          className="rounded-xl border px-3 py-2 text-[11px] leading-5"
          style={{
            ...typography.meta,
            borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
            background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-secondary))',
            color: 'var(--text-primary)',
          }}
        >
          {warningText}
        </div>
      ) : null}
    </div>
  )
}

function AIWorkspaceExecutionView({
  execution,
  phaseGroups,
  onOpenDraft,
  onExecuteTask,
  onSetTargetOverride,
  targetOverrides,
  taskStates,
  agentSession,
  preflightState,
}: {
  execution: ReturnType<typeof parseAIWorkspaceExecutionPlan>
  phaseGroups: AIWorkspaceExecutionPhaseGroup[]
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverrides: Record<string, string | null>
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  agentSession: WorkspaceAgentSessionState | null
  preflightState: WorkspaceExecutionPreflightState
}) {
  const { t } = useTranslation()
  const agentRunning = agentSession?.status === 'running'
  const showPhaseHeaders = phaseGroups.length > 1 || phaseGroups.some((phaseGroup) => phaseGroup.label !== null)
  const currentPhaseIndex = agentSession?.currentTaskId
    ? phaseGroups.findIndex((phaseGroup) =>
        phaseGroup.tasks.some((task) => task.id === agentSession.currentTaskId)
      )
    : -1
  const currentPhase = currentPhaseIndex >= 0 ? phaseGroups[currentPhaseIndex] ?? null : null
  if (!execution) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('ai.result.empty')}</p>
  }

  const blockedTaskCount = preflightState.data?.summary.blocked ?? 0
  const waitingTaskCount = preflightState.data?.summary.waiting ?? 0
  const reviewTaskCount = preflightState.data?.summary.review ?? 0
  const readyTaskCount = preflightState.data?.summary.ready ?? 0
  const completedByAgentCount = Object.values(taskStates).filter(
    (taskState) => taskState.status === 'done' && taskState.completionSource === 'agent'
  ).length
  const completedManuallyCount = Object.values(taskStates).filter(
    (taskState) => taskState.status === 'done' && isManualWorkspaceExecutionCompletionSource(taskState.completionSource)
  ).length

  return (
    <div className="grid gap-4">
      {agentSession && (
        <section
          data-ai-workspace-agent-session="true"
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
              {t('ai.workspaceExecution.agentTitle')}
            </div>
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                color:
                  agentSession.status === 'running'
                    ? 'var(--accent)'
                    : agentSession.status === 'completed'
                      ? '#15803d'
                      : '#b45309',
              }}
            >
              {agentSession.status === 'running'
                ? t('ai.workspaceExecution.agentStatusRunning')
                : agentSession.status === 'completed'
                  ? t('ai.workspaceExecution.agentStatusCompleted')
                  : t('ai.workspaceExecution.agentStatusCanceled')}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompleted')} value={String(agentSession.completed)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompletedByAgent')} value={String(completedByAgentCount)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompletedManual')} value={String(completedManuallyCount)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricFailed')} value={String(agentSession.failed)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricTotal')} value={String(agentSession.total)} />
          </div>

          {currentPhase && currentPhaseIndex >= 0 && (
            <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.workspaceExecution.agentCurrentPhase', {
                phase: formatWorkspaceExecutionPhaseHeading(currentPhase, currentPhaseIndex, t),
              })}
            </div>
          )}

          {agentSession.logs.length > 0 && (
            <div className="mt-4 grid gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.agentLogTitle')}
              </div>
              {agentSession.logs.map((entry) => (
                <div
                  key={entry.id}
                  data-ai-workspace-agent-log={entry.id}
                  className="rounded-xl border px-3 py-2"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {entry.title}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {entry.status === 'done' && entry.completionSource && (
                        <PeekInlinePill
                          label={t(`ai.workspaceExecution.completionSource.${entry.completionSource}`)}
                          tone={getWorkspaceExecutionCompletionSourceTone(entry.completionSource)}
                        />
                      )}
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
                          color:
                            entry.status === 'done'
                              ? '#15803d'
                              : entry.status === 'error'
                                ? '#b91c1c'
                                : '#b45309',
                        }}
                      >
                        {entry.status === 'done'
                          ? t('ai.workspaceExecution.statusDone')
                          : entry.status === 'error'
                            ? t('ai.workspaceExecution.statusError')
                            : t('ai.workspaceExecution.statusCanceled')}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {entry.message}
                  </div>
                  {entry.status === 'done' && (entry.completionAt || typeof entry.originRunId === 'number') && (
                    <div className="mt-1 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      {formatWorkspaceExecutionCompletionMeta({
                        completionAt: entry.completionAt,
                        originRunId: entry.originRunId,
                        t,
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {execution.summary && (
        <section
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.workspaceExecution.summary')}
          </div>
          <pre
            className="mt-3 whitespace-pre-wrap break-words text-sm"
            style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}
          >
            {execution.summary}
          </pre>
        </section>
      )}

      <section
        data-ai-workspace-preflight="true"
        className="rounded-2xl border px-4 py-4"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.workspaceExecution.preflightTitle')}
          </div>
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              color:
                preflightState.status === 'loading'
                  ? 'var(--text-primary)'
                  : blockedTaskCount > 0
                    ? '#b91c1c'
                    : waitingTaskCount > 0
                      ? '#2563eb'
                    : reviewTaskCount > 0
                      ? '#b45309'
                      : '#15803d',
            }}
          >
            {preflightState.status === 'loading'
              ? t('ai.workspaceExecution.preflightLoading')
              : blockedTaskCount > 0
                ? t('ai.workspaceExecution.preflightBlocked')
                : waitingTaskCount > 0
                  ? t('ai.workspaceExecution.preflightWaiting')
                : reviewTaskCount > 0
                  ? t('ai.workspaceExecution.preflightReview')
                  : t('ai.workspaceExecution.preflightReady')}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightReadyCount')} value={String(readyTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightWaitingCount')} value={String(waitingTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightReviewCount')} value={String(reviewTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightBlockedCount')} value={String(blockedTaskCount)} />
        </div>

        {preflightState.status === 'error' && preflightState.errorMessage && (
          <div className="mt-3 text-[11px] leading-5" style={{ color: '#b91c1c' }}>
            {preflightState.errorMessage}
          </div>
        )}

        {preflightState.status !== 'error' && (
          <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {blockedTaskCount > 0
              ? t('ai.workspaceExecution.preflightBlockedDetail')
              : waitingTaskCount > 0
                ? t('ai.workspaceExecution.preflightWaitingDetail')
              : reviewTaskCount > 0
                ? t('ai.workspaceExecution.preflightReviewDetail')
                : t('ai.workspaceExecution.preflightReadyDetail')}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.workspaceExecution.tasksTitle')}
        </div>
        {phaseGroups.map((phaseGroup, phaseIndex) => (
          <AIWorkspaceExecutionPhaseSection
            key={phaseGroup.id}
            phaseGroup={phaseGroup}
            phaseIndex={phaseIndex}
            showHeader={showPhaseHeaders}
            isCurrentPhase={currentPhaseIndex === phaseIndex}
            taskStates={taskStates}
            preflightState={preflightState}
            agentRunning={agentRunning}
            onExecuteTask={onExecuteTask}
            onOpenDraft={onOpenDraft}
            onSetTargetOverride={onSetTargetOverride}
            targetOverrides={targetOverrides}
          />
        ))}
      </section>
    </div>
  )
}

function AIWorkspaceExecutionPhaseSection({
  phaseGroup,
  phaseIndex,
  showHeader,
  isCurrentPhase,
  taskStates,
  preflightState,
  agentRunning,
  onExecuteTask,
  onOpenDraft,
  onSetTargetOverride,
  targetOverrides,
}: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  phaseIndex: number
  showHeader: boolean
  isCurrentPhase: boolean
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  preflightState: WorkspaceExecutionPreflightState
  agentRunning: boolean
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverrides: Record<string, string | null>
}) {
  const { t } = useTranslation()
  const phaseSummary = buildWorkspaceExecutionPhaseSummary({
    phaseGroup,
    taskStates,
    preflight: preflightState.data,
  })

  return (
    <section data-ai-workspace-phase={phaseGroup.id} className="grid gap-3">
      {showHeader && (
        <div
          data-ai-workspace-phase-summary={phaseGroup.id}
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: isCurrentPhase
              ? 'color-mix(in srgb, var(--accent) 28%, var(--border))'
              : 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: isCurrentPhase
              ? 'color-mix(in srgb, var(--accent) 7%, var(--bg-secondary))'
              : 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.phaseLabel', { index: phaseIndex + 1 })}
              </div>
              <div className="mt-1 break-words text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {getWorkspaceExecutionPhaseName(phaseGroup.label, t)}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isCurrentPhase && <PeekInlinePill label={t('ai.workspaceExecution.phaseCurrent')} tone="accent" />}
              <PeekInlinePill label={`${phaseSummary.total} ${t('ai.workspaceExecution.phaseTasks')}`} />
              {phaseSummary.done > 0 && (
                <PeekInlinePill label={`${phaseSummary.done} ${t('ai.workspaceExecution.phaseDone')}`} tone="success" />
              )}
              {phaseSummary.waiting > 0 && (
                <PeekInlinePill label={`${phaseSummary.waiting} ${t('ai.workspaceExecution.phaseWaiting')}`} tone="info" />
              )}
              {phaseSummary.running > 0 && (
                <PeekInlinePill label={`${phaseSummary.running} ${t('ai.workspaceExecution.phaseRunning')}`} tone="accent" />
              )}
              {phaseSummary.review > 0 && (
                <PeekInlinePill label={`${phaseSummary.review} ${t('ai.workspaceExecution.phaseReview')}`} tone="warning" />
              )}
              {phaseSummary.blocked > 0 && (
                <PeekInlinePill label={`${phaseSummary.blocked} ${t('ai.workspaceExecution.phaseBlocked')}`} tone="danger" />
              )}
            </div>
          </div>
        </div>
      )}

      {phaseGroup.tasks.map((task) => (
        <AIWorkspaceExecutionTaskCard
          key={task.id}
          task={task}
          taskState={taskStates[task.id]}
          preflight={preflightState.data?.tasks[task.id] ?? null}
          preflightLoading={preflightState.status === 'loading'}
          agentRunning={agentRunning}
          onExecuteTask={onExecuteTask}
          onOpenDraft={onOpenDraft}
          onSetTargetOverride={onSetTargetOverride}
          targetOverride={targetOverrides[task.id] ?? null}
        />
      ))}
    </section>
  )
}

function AIWorkspaceExecutionTaskCard({
  task,
  taskState,
  preflight,
  preflightLoading,
  agentRunning,
  onExecuteTask,
  onOpenDraft,
  onSetTargetOverride,
  targetOverride,
}: {
  task: AIWorkspaceExecutionTask
  taskState: AIWorkspaceExecutionTaskRuntimeState | undefined
  preflight: AIWorkspaceExecutionTaskPreflight | null
  preflightLoading: boolean
  agentRunning: boolean
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverride: string | null
}) {
  const { t } = useTranslation()
  const effectiveTaskStatus =
    taskState?.status ??
    (preflight?.status === 'waiting' ? 'waiting' : 'idle')
  const statusMeta = getWorkspaceExecutionTaskStatusMeta(effectiveTaskStatus, t)
  const preflightMeta = getWorkspaceExecutionPreflightMeta(preflight, preflightLoading, task, t)
  const executeBlocked =
    preflight?.status === 'blocked' ||
    preflight?.status === 'waiting'

  return (
    <article
      data-ai-workspace-task={task.id}
      className="rounded-2xl border px-4 py-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
              color: statusMeta.color,
            }}
          >
            {statusMeta.label}
          </span>
          <span
            data-ai-workspace-task-preflight={task.id}
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: preflightMeta.borderColor,
              background: preflightMeta.background,
              color: preflightMeta.color,
            }}
          >
            {preflightMeta.label}
          </span>
          {effectiveTaskStatus === 'done' && taskState?.completionSource && (
            <PeekInlinePill
              label={t(`ai.workspaceExecution.completionSource.${taskState.completionSource}`)}
              tone={getWorkspaceExecutionCompletionSourceTone(taskState.completionSource)}
            />
          )}
        </div>
        {taskState?.message && (
          <span className="max-w-[50%] truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {taskState.message}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </div>
          <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {task.target}
          </div>
          <div className="mt-2 text-[11px] leading-5" style={{ color: preflightMeta.colorMuted }}>
            {preflightMeta.detail}
          </div>
          {effectiveTaskStatus === 'done' && (taskState?.completionAt || typeof taskState?.originRunId === 'number') && (
            <div className="mt-1 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {formatWorkspaceExecutionCompletionMeta({
                completionAt: taskState?.completionAt,
                originRunId: taskState?.originRunId,
                t,
              })}
            </div>
          )}
          {preflight && preflight.dependencyTaskTitles.length > 0 && (
            <div
              data-ai-workspace-task-dependencies={task.id}
              className="mt-2 flex flex-wrap gap-2"
            >
              {preflight.dependencyTaskTitles.map((dependencyTitle) => (
                <PeekInlinePill key={`${task.id}:${dependencyTitle}`} label={dependencyTitle} />
              ))}
            </div>
          )}
          {preflight && preflight.unresolvedDependencies.length > 0 && (
            <div
              data-ai-workspace-task-unresolved-dependencies={task.id}
              className="mt-2 text-[11px] leading-5"
              style={{ color: '#b91c1c' }}
            >
              {t('ai.workspaceExecution.preflightDependencyUnresolved', {
                dependencies: preflight.unresolvedDependencies.join(', '),
              })}
            </div>
          )}
        </div>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          {task.action === 'create-note'
            ? t('ai.workspaceExecution.actionCreate')
            : t('ai.workspaceExecution.actionUpdate')}
        </span>
      </div>

      <pre
        className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-3 text-xs"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      >
        {task.content}
      </pre>

      {task.action === 'update-note' &&
        preflight &&
        (targetOverride !== null ||
          preflight.reason === 'update-target-ambiguous' ||
          preflight.reason === 'update-target-low-confidence') &&
        preflight.alternatives.length > 0 && (
          <div
            data-ai-workspace-task-target-resolution={task.id}
            className="mt-3 rounded-xl border px-3 py-3"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.workspaceExecution.resolveTargetTitle')}
                </div>
                <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.workspaceExecution.resolveTargetDetail')}
                </div>
              </div>
              {targetOverride && (
                <button
                  type="button"
                  data-ai-workspace-task-target-clear={task.id}
                  onClick={() => onSetTargetOverride(task.id, null)}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {t('ai.workspaceExecution.resolveTargetClear')}
                </button>
              )}
            </div>

            {targetOverride && (
              <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.resolveTargetUsing', { target: targetOverride })}
              </div>
            )}

            <div className="mt-3 grid gap-2">
              {preflight.alternatives.map((candidate) => {
                const candidateKey = candidate.path ?? candidate.name
                const selected = targetOverride === candidateKey
                return (
                  <button
                    key={`${task.id}:${candidateKey}`}
                    type="button"
                    data-ai-workspace-task-target-option={candidateKey}
                    onClick={() => onSetTargetOverride(task.id, candidateKey)}
                    className="cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors"
                    style={{
                      borderColor: selected
                        ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                        : 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background: selected
                        ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                        : 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {candidate.name}
                        </div>
                        <div className="mt-1 break-words text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                          {candidate.path ?? candidate.name}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <PeekInlinePill label={t(`ai.workspaceExecution.targetConfidence.${candidate.confidence}`)} />
                        <PeekInlinePill label={t(`ai.workspaceExecution.targetSource.${candidate.source}`)} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      <div className="mt-3 flex flex-wrap gap-2">
        {task.action === 'update-note' && (
          <button
            type="button"
            onClick={() => void onExecuteTask(task)}
            data-ai-workspace-task-execute={task.id}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
            disabled={agentRunning || preflightLoading || executeBlocked}
          >
            {t('ai.workspaceExecution.executeTask')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenDraft(task)}
          data-ai-workspace-task-open={task.id}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
          disabled={agentRunning}
        >
          {t('ai.workspaceExecution.openDraft')}
        </button>
      </div>
    </article>
  )
}

function canStartWorkspaceAgent(args: {
  phaseGroups: AIWorkspaceExecutionPhaseGroup[]
  preflight: AIWorkspaceExecutionPreflight | null
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
}) {
  const nextPhaseGroup = args.phaseGroups.find((phaseGroup) =>
    phaseGroup.tasks.some((task) => args.taskStates[task.id]?.status !== 'done')
  )
  if (!nextPhaseGroup || !args.preflight) return false

  let hasPendingTask = false
  for (const task of nextPhaseGroup.tasks) {
    if (args.taskStates[task.id]?.status === 'done') continue
    hasPendingTask = true
    const preflightTask = args.preflight.tasks[task.id]
    if (preflightTask?.status === 'blocked') {
      return false
    }
  }

  return hasPendingTask
}

function buildWorkspaceExecutionPhaseSummary(args: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  preflight: AIWorkspaceExecutionPreflight | null
}) {
  let done = 0
  let waiting = 0
  let running = 0
  let review = 0
  let blocked = 0

  for (const task of args.phaseGroup.tasks) {
    const taskState = args.taskStates[task.id]?.status ?? 'idle'
    if (taskState === 'done') {
      done += 1
      continue
    }

    if (taskState === 'waiting') {
      waiting += 1
      continue
    }

    if (taskState === 'running') {
      running += 1
      continue
    }

    if (taskState === 'error' || taskState === 'canceled') {
      blocked += 1
      continue
    }

    const preflightStatus = args.preflight?.tasks[task.id]?.status
    if (preflightStatus === 'blocked') {
      blocked += 1
      continue
    }

    if (preflightStatus === 'waiting') {
      waiting += 1
      continue
    }

    if (preflightStatus === 'review') {
      review += 1
    }
  }

  return {
    total: args.phaseGroup.tasks.length,
    done,
    waiting,
    running,
    review,
    blocked,
  }
}

function WorkspaceExecutionMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      className="rounded-xl border px-3 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function PeekInlinePill({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const palette = getPeekInlinePillPalette(tone)

  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: palette.borderColor,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  )
}

function getPeekInlinePillPalette(tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info') {
  switch (tone) {
    case 'accent':
      return {
        borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
        color: 'var(--accent)',
      }
    case 'info':
      return {
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
        color: '#2563eb',
      }
    case 'success':
      return {
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
        color: '#15803d',
      }
    case 'warning':
      return {
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
        color: '#b45309',
      }
    case 'danger':
      return {
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
        color: '#b91c1c',
      }
    case 'default':
    default:
      return {
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
        color: 'var(--text-muted)',
      }
  }
}

function getWorkspaceExecutionCompletionSourceTone(
  source: AIWorkspaceExecutionTaskCompletionSource
): 'success' | 'info' | 'accent' {
  switch (source) {
    case 'agent':
      return 'success'
    case 'manual-apply':
      return 'accent'
    case 'manual-open-draft':
    default:
      return 'info'
  }
}

function isManualWorkspaceExecutionCompletionSource(
  source: AIWorkspaceExecutionTaskCompletionSource | undefined
) {
  return source === 'manual-apply' || source === 'manual-open-draft'
}

function formatWorkspaceExecutionCompletionMeta(args: {
  completionAt?: number
  originRunId?: number | null
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const parts: string[] = []

  if (typeof args.completionAt === 'number') {
    parts.push(
      args.t('ai.workspaceExecution.completionAt', {
        time: formatWorkspaceExecutionTimestamp(args.completionAt),
      })
    )
  }

  if (typeof args.originRunId === 'number') {
    parts.push(args.t('ai.workspaceExecution.originRun', { runId: args.originRunId }))
  }

  return parts.join(' · ')
}

function formatWorkspaceExecutionTimestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function getWorkspaceExecutionPhaseName(
  phaseLabel: string | null,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return phaseLabel ?? t('ai.workspaceExecution.phaseDefault')
}

function formatWorkspaceExecutionPhaseHeading(
  phaseGroup: AIWorkspaceExecutionPhaseGroup,
  phaseIndex: number,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return `${t('ai.workspaceExecution.phaseLabel', { index: phaseIndex + 1 })} · ${getWorkspaceExecutionPhaseName(phaseGroup.label, t)}`
}

function buildTemplatePromptDraft(prompt: string): string {
  const trimmedPrompt = prompt.trimEnd()
  if (!trimmedPrompt) return ''
  return `${trimmedPrompt}\n`
}

function getWorkspaceExecutionTaskStatusMeta(
  status: WorkspaceExecutionTaskStatus,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (status) {
    case 'waiting':
      return { label: t('ai.workspaceExecution.statusWaiting'), color: '#2563eb' }
    case 'running':
      return { label: t('ai.workspaceExecution.statusRunning'), color: 'var(--accent)' }
    case 'done':
      return { label: t('ai.workspaceExecution.statusDone'), color: '#15803d' }
    case 'canceled':
      return { label: t('ai.workspaceExecution.statusCanceled'), color: '#b45309' }
    case 'error':
      return { label: t('ai.workspaceExecution.statusError'), color: '#b91c1c' }
    case 'idle':
    default:
      return { label: t('ai.workspaceExecution.statusReady'), color: 'var(--text-muted)' }
  }
}

function getWorkspaceExecutionPreflightMeta(
  preflight: AIWorkspaceExecutionTaskPreflight | null,
  loading: boolean,
  task: AIWorkspaceExecutionTask,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  if (loading) {
    return {
      label: t('ai.workspaceExecution.preflightLoading'),
      detail: t('ai.workspaceExecution.preflightLoadingDetail'),
      color: 'var(--text-primary)',
      colorMuted: 'var(--text-muted)',
      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
    }
  }

  if (!preflight) {
    return {
      label: t('ai.workspaceExecution.preflightUnknown'),
      detail: t('ai.workspaceExecution.preflightUnknownDetail'),
      color: 'var(--text-muted)',
      colorMuted: 'var(--text-muted)',
      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
    }
  }

  switch (preflight.reason) {
    case 'update-ready':
      return {
        label: t('ai.workspaceExecution.preflightReady'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskUpdateReady', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightReadyDetail'),
        color: '#15803d',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
      }
    case 'update-will-open':
      return {
        label: t('ai.workspaceExecution.preflightReview'),
        detail: preflight.matchedReference?.path
          ? t('ai.workspaceExecution.preflightTaskWillOpen', { target: preflight.matchedReference.path })
          : t('ai.workspaceExecution.preflightReviewDetail'),
        color: '#b45309',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'update-target-produced-by-task':
      return {
        label: t('ai.workspaceExecution.preflightWaiting'),
        detail: preflight.upstreamTaskTitle
          ? t('ai.workspaceExecution.preflightTaskProducedByTask', { task: preflight.upstreamTaskTitle })
          : t('ai.workspaceExecution.preflightWaitingDetail'),
        color: '#2563eb',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
      }
    case 'dependency-pending':
      return {
        label: t('ai.workspaceExecution.preflightWaiting'),
        detail: preflight.dependencyTaskTitles.length > 0
          ? t('ai.workspaceExecution.preflightTaskDependencyPending', {
              dependencies: preflight.dependencyTaskTitles.join(', '),
            })
          : t('ai.workspaceExecution.preflightWaitingDetail'),
        color: '#2563eb',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
      }
    case 'dependency-cycle':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.dependencyTaskTitles.length > 0
          ? t('ai.workspaceExecution.preflightTaskDependencyCycle', {
              dependencies: preflight.dependencyTaskTitles.join(', '),
            })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'dependency-phase-order':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail:
          (preflight.phaseOrderDependencyTaskTitles?.length ?? 0) > 0
            ? t('ai.workspaceExecution.preflightTaskDependencyPhaseOrder', {
                dependencies: preflight.phaseOrderDependencyTaskTitles?.join(', ') ?? '',
              })
            : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'dependency-unresolved':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.unresolvedDependencies.length > 0
          ? t('ai.workspaceExecution.preflightDependencyUnresolved', {
              dependencies: preflight.unresolvedDependencies.join(', '),
            })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-dirty':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskDirty', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-ambiguous':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: t('ai.workspaceExecution.preflightTaskAmbiguous', { target: task.target }),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-low-confidence':
      return {
        label: preflight.status === 'blocked'
          ? t('ai.workspaceExecution.preflightBlocked')
          : t('ai.workspaceExecution.preflightReview'),
        detail: t('ai.workspaceExecution.preflightTaskLowConfidence', { target: task.target }),
        color: preflight.status === 'blocked' ? '#b91c1c' : '#b45309',
        colorMuted: preflight.status === 'blocked' ? '#b91c1c' : 'var(--text-muted)',
        borderColor:
          preflight.status === 'blocked'
            ? 'color-mix(in srgb, #dc2626 28%, var(--border))'
            : 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background:
          preflight.status === 'blocked'
            ? 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))'
            : 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'update-target-not-found':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: t('ai.workspaceExecution.preflightTaskMissing', { target: task.target }),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'create-target-exists':
      return {
        label: t('ai.workspaceExecution.preflightReview'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskCreateExists', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightReviewDetail'),
        color: '#b45309',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'create-ready':
    default:
      return {
        label: t('ai.workspaceExecution.preflightReady'),
        detail: t('ai.workspaceExecution.preflightTaskCreateReady', { target: task.target }),
        color: '#15803d',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
      }
  }
}

function formatWorkspacePreflightMessage(
  preflight: AIWorkspaceExecutionTaskPreflight,
  task: AIWorkspaceExecutionTask,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return getWorkspaceExecutionPreflightMeta(preflight, false, task, t).detail
}

function buildWorkspaceExecutionPhaseStalledMessage(args: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  phaseIndex: number
  tasks: AIWorkspaceExecutionTask[]
  preflight: AIWorkspaceExecutionPreflight
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const dependencyLabels = Array.from(
    new Set(
      args.tasks.flatMap((task) => {
        const meta = args.preflight.tasks[task.id]
        if (!meta) return []

        return [
          ...meta.dependencyTaskTitles,
          ...(meta.upstreamTaskTitle ? [meta.upstreamTaskTitle] : []),
        ].filter((value): value is string => value.trim().length > 0)
      })
    )
  )
  const phase = formatWorkspaceExecutionPhaseHeading(args.phaseGroup, args.phaseIndex, args.t)

  if (dependencyLabels.length > 0) {
    return args.t('ai.workspaceExecution.phaseStalledDependencies', {
      phase,
      dependencies: dependencyLabels.join(', '),
    })
  }

  return args.t('ai.workspaceExecution.phaseStalled', { phase })
}

function buildWorkspaceExecutionResumedLogMessage(
  completionSource: AIWorkspaceExecutionTaskCompletionSource | undefined,
  originRunId: number | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (completionSource) {
    case 'manual-apply':
      return t('ai.workspaceExecution.agentLogResumedManualApply')
    case 'manual-open-draft':
      return t('ai.workspaceExecution.agentLogResumedManualOpenDraft')
    case 'agent':
      return typeof originRunId === 'number'
        ? t('ai.workspaceExecution.agentLogResumedAgentRun', { runId: originRunId })
        : t('ai.workspaceExecution.agentLogResumedAgent')
    default:
      return t('ai.workspaceExecution.agentLogResumed')
  }
}

function AIDiffPreview({
  blocks,
  emptyLabel,
  typography,
}: {
  blocks: ReturnType<typeof diffTextByLine>
  emptyLabel: string
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()

  if (blocks.length === 0) {
    return <p className="text-sm" style={{ ...typography.text, color: 'var(--text-muted)' }}>{emptyLabel}</p>
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <div
          key={block.id}
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 84%, transparent)' }}
        >
          {block.type === 'equal' ? (
            <AIMarkdownLineList
              title={t('ai.result.context')}
              lines={block.localLines}
              tone="context"
              typography={typography}
            />
          ) : (
            <div className="grid gap-px md:grid-cols-2" style={{ background: 'var(--border)' }}>
              <AIMarkdownLineList
                title={t('ai.result.current')}
                lines={block.localLines}
                tone="current"
                typography={typography}
              />
              <AIMarkdownLineList
                title={t('ai.result.aiDraft')}
                lines={block.diskLines}
                tone="draft"
                typography={typography}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AIMarkdownLineList({
  title,
  lines,
  tone,
  typography,
}: {
  title: string
  lines: string[]
  tone: 'context' | 'current' | 'draft'
  typography: AIComposerContentTypography
}) {
  const renderedLines = buildMarkdownPreviewLines(lines)
  const palette = getMarkdownTonePalette(tone)

  return (
    <div
      className="min-w-0"
      style={{
        background: palette.panelBackground,
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{
          borderColor: palette.headerBorder,
          color: 'var(--text-muted)',
          background: palette.headerBackground,
        }}
      >
        {title}
      </div>
      <div className="grid gap-px" style={{ background: palette.rowDivider }}>
        {renderedLines.length > 0 ? (
          renderedLines.map((line) => (
            <AIMarkdownLineRow key={line.id} line={line} tone={tone} typography={typography} />
          ))
        ) : (
          <div
            className="px-3 py-3 text-xs"
            style={{
              background: palette.rowBackground,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            }}
          >
            {' '}
          </div>
        )}
      </div>
    </div>
  )
}

function AIMarkdownLineRow({
  line,
  tone,
  typography,
}: {
  line: ReturnType<typeof buildMarkdownPreviewLines>[number]
  tone: 'context' | 'current' | 'draft'
  typography: AIComposerContentTypography
}) {
  const tonePalette = getMarkdownTonePalette(tone)
  const kindPalette = getMarkdownKindPalette(line.kind, tone)
  const preserveSpacing = line.kind === 'table' || line.kind === 'code' || line.kind === 'fence'
  const visibleText = line.text.length > 0 ? line.text : ' '

  return (
    <div
      className="flex min-w-0 items-start gap-3 px-3 py-2"
      style={{
        background: kindPalette.background ?? tonePalette.rowBackground,
        borderLeft: `3px solid ${kindPalette.border}`,
      }}
    >
      <span
        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{
          color: 'var(--text-muted)',
          minWidth: '2.25rem',
        }}
      >
        {String(line.lineNumber).padStart(2, '0')}
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
        style={{
          background: kindPalette.badgeBackground,
          color: kindPalette.badgeColor,
        }}
      >
        {getMarkdownPreviewLineBadge(line.kind)}
      </span>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <span
          className="block text-xs"
          style={{
            ...typography.code,
            color: kindPalette.text,
            fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            fontWeight: line.kind === 'heading' ? 700 : 500,
            whiteSpace: preserveSpacing ? 'pre' : 'pre-wrap',
            wordBreak: preserveSpacing ? 'normal' : 'break-word',
          }}
        >
          {visibleText}
        </span>
      </div>
    </div>
  )
}

function getMarkdownTonePalette(tone: 'context' | 'current' | 'draft') {
  switch (tone) {
    case 'current':
      return {
        panelBackground: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
        headerBackground: 'color-mix(in srgb, #dc2626 10%, var(--bg-primary))',
        headerBorder: 'color-mix(in srgb, #dc2626 18%, var(--border))',
        rowDivider: 'color-mix(in srgb, #dc2626 14%, var(--border))',
        rowBackground: 'color-mix(in srgb, #dc2626 4%, var(--bg-primary))',
      }
    case 'draft':
      return {
        panelBackground: 'color-mix(in srgb, #16a34a 8%, var(--bg-primary))',
        headerBackground: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
        headerBorder: 'color-mix(in srgb, #16a34a 18%, var(--border))',
        rowDivider: 'color-mix(in srgb, #16a34a 16%, var(--border))',
        rowBackground: 'color-mix(in srgb, #16a34a 4%, var(--bg-primary))',
      }
    case 'context':
    default:
      return {
        panelBackground: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        headerBackground: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        headerBorder: 'color-mix(in srgb, var(--border) 82%, transparent)',
        rowDivider: 'color-mix(in srgb, var(--border) 78%, transparent)',
        rowBackground: 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
      }
  }
}

function getMarkdownKindPalette(
  kind: MarkdownPreviewLineKind,
  tone: 'context' | 'current' | 'draft'
) {
  const accent =
    tone === 'current'
      ? '#dc2626'
      : tone === 'draft'
        ? '#16a34a'
        : 'var(--accent)'

  switch (kind) {
    case 'heading':
      return {
        background: `color-mix(in srgb, ${accent} 12%, var(--bg-primary))`,
        border: `color-mix(in srgb, ${accent} 58%, var(--border))`,
        badgeBackground: `color-mix(in srgb, ${accent} 16%, transparent)`,
        badgeColor: accent,
        text: 'var(--text-primary)',
      }
    case 'list':
      return {
        background: `color-mix(in srgb, ${accent} 7%, var(--bg-primary))`,
        border: `color-mix(in srgb, ${accent} 32%, var(--border))`,
        badgeBackground: `color-mix(in srgb, ${accent} 12%, transparent)`,
        badgeColor: accent,
        text: 'var(--text-primary)',
      }
    case 'quote':
      return {
        background: 'color-mix(in srgb, #f59e0b 9%, var(--bg-primary))',
        border: 'color-mix(in srgb, #f59e0b 36%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #f59e0b 14%, transparent)',
        badgeColor: '#b45309',
        text: 'var(--text-primary)',
      }
    case 'table':
      return {
        background: 'color-mix(in srgb, #0f172a 10%, var(--bg-primary))',
        border: 'color-mix(in srgb, #334155 38%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 12%, transparent)',
        badgeColor: '#334155',
        text: 'var(--text-primary)',
      }
    case 'fence':
      return {
        background: 'color-mix(in srgb, #0f172a 18%, var(--bg-primary))',
        border: 'color-mix(in srgb, #475569 48%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 16%, transparent)',
        badgeColor: '#475569',
        text: 'var(--text-primary)',
      }
    case 'code':
      return {
        background: 'color-mix(in srgb, #0f172a 14%, var(--bg-primary))',
        border: 'color-mix(in srgb, #334155 34%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 14%, transparent)',
        badgeColor: '#334155',
        text: 'var(--text-primary)',
      }
    case 'empty':
      return {
        background: undefined,
        border: 'color-mix(in srgb, var(--border) 72%, transparent)',
        badgeBackground: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        badgeColor: 'var(--text-muted)',
        text: 'var(--text-muted)',
      }
    case 'paragraph':
    default:
      return {
        background: undefined,
        border: 'color-mix(in srgb, var(--border) 72%, transparent)',
        badgeBackground: `color-mix(in srgb, ${accent} 8%, transparent)`,
        badgeColor: tone === 'context' ? 'var(--text-muted)' : accent,
        text: 'var(--text-primary)',
      }
  }
}

function AIInsertionPreview({
  outputTarget,
  targetLabel,
  text,
  emptyLabel,
  typography,
}: {
  outputTarget: string
  targetLabel: string
  text: string
  emptyLabel: string
  typography: AIComposerContentTypography
}) {
  if (!text.trim()) {
    return <p className="text-sm" style={{ ...typography.text, color: 'var(--text-muted)' }}>{emptyLabel}</p>
  }

  return (
    <div className="space-y-3">
      <p
        className="text-xs uppercase tracking-[0.18em]"
        style={{ ...typography.meta, color: 'var(--text-muted)' }}
      >
        {targetLabel}
      </p>
      <pre
        className="whitespace-pre-wrap break-words rounded-xl border px-3 py-3 text-sm"
        style={{
          ...typography.code,
          borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
          background:
            outputTarget === 'chat-only'
              ? 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)'
              : 'color-mix(in srgb, #16a34a 8%, var(--bg-primary))',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      >
        {text}
      </pre>
    </div>
  )
}

