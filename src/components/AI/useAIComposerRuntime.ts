import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isAIRuntimeAvailable,
  cancelAICompletion,
  loadAIProviderState,
  runAICompletion,
} from '../../lib/ai/client.ts'
import { AI_PROVIDER_STATE_CHANGED_EVENT } from '../../lib/ai/events.ts'
import { buildAIRequestMessages, normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import { extractLegacyAIRetrievalMetadata } from '../../lib/ai/retrievalMetadata.ts'
import {
  findHostedAgentProfile,
  getAIKnowledgeType,
  isAIProviderConnectionReady,
  isOCIResponsesProviderConfig,
} from '../../lib/ai/provider.ts'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import { useAIStore } from '../../store/ai'
import type { FileTab } from '../../store/editor'
import type {
  AIComposerState,
  AIContextPacket,
  AIKnowledgeType,
  AIOCIResponsesProviderConfig,
  AIProviderState,
} from '../../lib/ai/types.ts'

interface WorkspaceHistoryBinding {
  tabId: string
  tabPath: string | null
  entryId: string
}

interface UseAIComposerRuntimeArgs {
  composer: AIComposerState
  activeTab: FileTab | null
  effectiveContext: AIContextPacket | null
  effectivePrompt: string
  normalizedDraft: string
  clearWorkspaceHistoryBinding: () => void
  bindWorkspaceHistoryForDraft: (binding: WorkspaceHistoryBinding, draftText: string) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

interface UseAIComposerRuntimeResult {
  oracleProviderConfig: AIOCIResponsesProviderConfig | null
  knowledgeType: AIKnowledgeType
  hasConnection: boolean
  showConnectionHint: boolean
  connectionHintTitle: string
  connectionHintMessage: string
  handleSelectKnowledgeType: (nextType: AIKnowledgeType) => void
  handleSelectDocsStore: (storeId: string) => void
  handleSelectDataStore: (registrationId: string) => void
  handleSelectHostedAgentProfile: (profileId: string | null) => void
  handleSubmit: () => Promise<void>
  handleCancelRequest: () => Promise<void>
  handleCopy: () => Promise<void>
}

export function useAIComposerRuntime({
  composer,
  activeTab,
  effectiveContext,
  effectivePrompt,
  normalizedDraft,
  clearWorkspaceHistoryBinding,
  bindWorkspaceHistoryForDraft,
  t,
}: UseAIComposerRuntimeArgs): UseAIComposerRuntimeResult {
  const {
    setOutputTarget,
    setExecutionTargetKind,
    setInvocationCapability,
    setKnowledgeSelection,
    setHostedAgentProfileId,
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
    setThreadId,
    startSessionHistory,
    updateSessionHistory,
  } = useAIStore()

  const activeRequestIdRef = useRef<string | null>(null)
  const requestRunIdRef = useRef(0)
  const disposedRef = useRef(false)
  const activeSessionHistoryRef = useRef<WorkspaceHistoryBinding | null>(null)
  const [providerState, setProviderState] = useState<AIProviderState | null>(null)
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

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
    if (desktopOnlyMode) {
      setConnectionLoading(false)
      setConnectionError(null)
      setProviderState(null)
      return
    }

    let cancelled = false
    let loadVersion = 0

    const refreshProviderState = () => {
      const currentLoadVersion = loadVersion + 1
      loadVersion = currentLoadVersion
      setConnectionLoading(true)
      setConnectionError(null)

      void loadAIProviderState()
        .then((state) => {
          if (cancelled || currentLoadVersion !== loadVersion) return
          setProviderState(state)
        })
        .catch((error) => {
          if (cancelled || currentLoadVersion !== loadVersion) return
          const message = error instanceof Error ? error.message : String(error)
          setConnectionError(message)
        })
        .finally(() => {
          if (!cancelled && currentLoadVersion === loadVersion) {
            setConnectionLoading(false)
          }
        })
    }

    const handleProviderStateChanged = () => {
      refreshProviderState()
    }

    refreshProviderState()
    document.addEventListener(AI_PROVIDER_STATE_CHANGED_EVENT, handleProviderStateChanged)

    return () => {
      cancelled = true
      document.removeEventListener(AI_PROVIDER_STATE_CHANGED_EVENT, handleProviderStateChanged)
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
    composer.hostedAgentProfileId,
    composer.invocationCapability,
    composer.knowledgeSelection,
    defaultHostedAgentProfile?.id,
    oracleProviderConfig,
    selectedStructuredRegistrationId,
    selectedUnstructuredRegistrationId,
    setExecutionTargetKind,
    setHostedAgentProfileId,
    setInvocationCapability,
    setKnowledgeSelection,
  ])

  const updateActiveSessionHistory = useCallback((
    patch: {
      status?: 'done' | 'error' | 'canceled'
      resultPreview?: string | null
      errorMessage?: string | null
      generatedSqlPreview?: string | null
      executionAgentLabel?: string | null
    }
  ) => {
    const activeSession = activeSessionHistoryRef.current
    if (!activeSession) return

    updateSessionHistory(activeSession.tabId, activeSession.tabPath, activeSession.entryId, {
      ...patch,
      updatedAt: Date.now(),
    })

    if (patch.status) {
      activeSessionHistoryRef.current = null
    }
  }, [updateSessionHistory])

  const handleSelectKnowledgeType = useCallback((nextType: AIKnowledgeType) => {
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
  }, [
    composer.outputTarget,
    composer.hostedAgentProfileId,
    defaultHostedAgentProfile?.id,
    oracleProviderConfig,
    setExecutionTargetKind,
    setHostedAgentProfileId,
    setInvocationCapability,
    setKnowledgeSelection,
    setOutputTarget,
  ])

  const handleSelectDocsStore = useCallback((storeId: string) => {
    if (!storeId) {
      handleSelectKnowledgeType('none')
      return
    }
    setKnowledgeSelection({ kind: 'oracle-unstructured-store', registrationId: storeId })
    setExecutionTargetKind('direct-provider')
    setInvocationCapability('rag-unstructured')
  }, [handleSelectKnowledgeType, setExecutionTargetKind, setInvocationCapability, setKnowledgeSelection])

  const handleSelectDataStore = useCallback((registrationId: string) => {
    const store =
      oracleProviderConfig?.structuredStores.find((candidate) => candidate.id === registrationId) ?? null
    if (!store) {
      handleSelectKnowledgeType('none')
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
  }, [
    composer.outputTarget,
    handleSelectKnowledgeType,
    oracleProviderConfig?.structuredStores,
    setExecutionTargetKind,
    setInvocationCapability,
    setKnowledgeSelection,
    setOutputTarget,
  ])

  const handleSelectHostedAgentProfile = useCallback((profileId: string | null) => {
    setKnowledgeSelection({ kind: 'none' })
    setExecutionTargetKind('oracle-hosted-agent')
    setInvocationCapability('structured-execution')
    setHostedAgentProfileId(profileId)
  }, [setExecutionTargetKind, setHostedAgentProfileId, setInvocationCapability, setKnowledgeSelection])

  const handleSubmit = useCallback(async () => {
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
    clearWorkspaceHistoryBinding()
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
          : normalizedDraftTextForContext(responseText, effectiveContext.outputTarget)
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
      updateActiveSessionHistory({
        status: 'done',
        resultPreview: draft,
        errorMessage: null,
        generatedSqlPreview: response.contentType === 'sql' ? draft : null,
        executionAgentLabel:
          composer.executionTargetKind === 'oracle-hosted-agent' ? selectedHostedAgentProfile?.label ?? null : null,
      })
      bindWorkspaceHistoryForDraft({
        tabId: effectiveContext.tabId,
        tabPath: effectiveContext.tabPath,
        entryId,
      }, draft)
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
  }, [
    activeTab?.id,
    appendDraftText,
    bindWorkspaceHistoryForDraft,
    clearWorkspaceHistoryBinding,
    composer.executionTargetKind,
    composer.hostedAgentProfileId,
    composer.invocationCapability,
    composer.knowledgeSelection,
    composer.source,
    composer.threadId,
    desktopOnlyMode,
    effectiveContext,
    effectivePrompt,
    failRequest,
    finishRequest,
    hasConnection,
    isHostedAgentKnowledge,
    oracleProviderConfig?.unstructuredStores,
    selectedHostedAgentProfile?.id,
    selectedHostedAgentProfile?.label,
    selectedStructuredStore?.label,
    selectedUnstructuredRegistrationId,
    setDiffBaseText,
    setDraftFormat,
    setDraftText,
    setExplanationText,
    setRetrievalExecuted,
    setRetrievalQuery,
    setRetrievalResultCount,
    setRetrievalResults,
    setSourceLabel,
    setThreadId,
    setWarningText,
    startRequest,
    startSessionHistory,
    t,
    updateActiveSessionHistory,
  ])

  const handleCancelRequest = useCallback(async () => {
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
  }, [normalizedDraft, resetDraftState, updateActiveSessionHistory])

  const handleCopy = useCallback(async () => {
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
  }, [normalizedDraft])

  return {
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
  }
}

function normalizedDraftTextForContext(text: string, outputTarget: AIContextPacket['outputTarget']): string {
  return normalizeAIDraftText(text, outputTarget)
}
