import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY,
  isAIHistoryCollectionRetrievalPolicyCustomized,
  resolveAIHistoryCollectionProviderRerankBudget,
  resolveAIHistoryCollectionProviderRerankEnabled,
} from '../../lib/ai/historyCollectionPolicy.ts'
import {
  createDefaultAIHistorySavedViewRetrievalPreset,
  isAIHistorySavedViewRetrievalPresetCustomized,
  matchesAIHistorySavedViewStatusFilter,
  resolveAIHistorySavedViewProviderRerankBudget,
} from '../../lib/ai/historySavedViewPreset.ts'
import {
  matchesAIHistoryWorkspaceFacet,
  type AIHistoryWorkspaceFacet,
} from '../../lib/ai/historyWorkspaceFacet.ts'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import {
  buildAIHistoryArchiveFileName,
  readAIHistoryArchiveText,
  saveAIHistoryArchiveText,
  saveAIHistoryJsonText,
} from '../../lib/ai/historyArchiveFile.ts'
import { buildAIHistoryProviderAuditInsights } from '../../lib/ai/providerHistoryAuditAnalysis.ts'
import {
  buildAIHistoryProviderAuditReport,
  buildAIHistoryProviderAuditReportFileName,
} from '../../lib/ai/providerHistoryAuditReport.ts'
import { openDesktopDocumentPath } from '../../lib/desktopFileOpen.ts'
import { retrieveAIHistoryCandidates, sortHistoryCandidates, type AIHistoryRetrievalMatch } from '../../lib/ai/historyRetrieval.ts'
import { normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import {
  estimateAIHistoryProviderRerankSendCount,
  getAIHistoryProviderRerankFieldSet,
  resolveAIHistoryProviderRerankPolicy,
} from '../../lib/ai/providerHistoryBudget.ts'
import { buildAIHistoryProviderRerankPayload, rerankAIHistoryCandidatesWithProvider } from '../../lib/ai/providerHistoryRetrieval.ts'
import { createAISlashCommandEntries } from '../../lib/ai/slashCommands.ts'
import { createAITemplateOpenDetail, getAITemplateModels } from '../../lib/ai/templateLibrary.ts'
import { getAIDocumentThreadKey, parseAIDocumentThreadKey } from '../../lib/ai/thread.ts'
import type {
  AIDocumentSessionHistoryEntry,
  AIHistoryCollectionRetrievalPolicy,
  AIHistoryProviderRerankBudget,
  AIHistorySavedViewRetrievalPreset,
  AIHistorySavedViewStatusFilter,
  AIWorkspaceExecutionHistoryRecord,
  AIWorkspaceExecutionHistoryTaskRecord,
} from '../../lib/ai/types.ts'
import { pushErrorNotice, pushSuccessNotice } from '../../lib/notices'
import { formatPrimaryShortcut } from '../../lib/platform.ts'
import { useAIStore } from '../../store/ai'
import { useActiveTab, useEditorStore } from '../../store/editor'
import AppIcon, { type IconName } from '../Icons/AppIcon'
import {
  getAISidebarSourceLabel,
  getAISessionHistoryStatusMeta,
  getAISidebarStatus,
  getAITemplateIcon,
  truncateSidebarCopy,
  type AISidebarPeekView,
  SIDEBAR_TAB_SOURCE,
} from './aiSidebarShared'

interface Props {
  view: AISidebarPeekView
  onClose: () => void
}

export default function AISidebarPeekRail({ view, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const activeTab = useActiveTab()
  const composer = useAIStore((state) => state.composer)
  const historyRetentionPreset = useAIStore((state) => state.historyRetentionPreset)
  const setHistoryRetentionPreset = useAIStore((state) => state.setHistoryRetentionPreset)
  const threadIdsByDocument = useAIStore((state) => state.threadIdsByDocument)
  const sessionHistoryByDocument = useAIStore((state) => state.sessionHistoryByDocument)
  const historyCollections = useAIStore((state) => state.historyCollections)
  const historySavedViews = useAIStore((state) => state.historySavedViews)
  const toggleSessionHistoryPin = useAIStore((state) => state.toggleSessionHistoryPin)
  const removeSessionHistoryEntry = useAIStore((state) => state.removeSessionHistoryEntry)
  const clearSessionHistory = useAIStore((state) => state.clearSessionHistory)
  const clearAllSessionHistory = useAIStore((state) => state.clearAllSessionHistory)
  const createHistoryCollection = useAIStore((state) => state.createHistoryCollection)
  const updateHistoryCollectionPolicy = useAIStore((state) => state.updateHistoryCollectionPolicy)
  const deleteHistoryCollection = useAIStore((state) => state.deleteHistoryCollection)
  const createHistorySavedView = useAIStore((state) => state.createHistorySavedView)
  const updateHistorySavedViewRetrievalPreset = useAIStore((state) => state.updateHistorySavedViewRetrievalPreset)
  const deleteHistorySavedView = useAIStore((state) => state.deleteHistorySavedView)
  const historyProviderRerankAudit = useAIStore((state) => state.historyProviderRerankAudit)
  const addHistoryProviderRerankAudit = useAIStore((state) => state.addHistoryProviderRerankAudit)
  const exportHistoryArchive = useAIStore((state) => state.exportHistoryArchive)
  const importHistoryArchive = useAIStore((state) => state.importHistoryArchive)
  const openTabs = useEditorStore((state) => state.tabs)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const aiDefaultWriteTarget = useEditorStore((state) => state.aiDefaultWriteTarget)
  const aiDefaultSelectedTextRole = useEditorStore((state) => state.aiDefaultSelectedTextRole)
  const aiHistoryProviderRerankEnabled = useEditorStore((state) => state.aiHistoryProviderRerankEnabled)
  const aiHistoryProviderRerankBudget = useEditorStore((state) => state.aiHistoryProviderRerankBudget)
  const [historyQuery, setHistoryQuery] = useState('')
  const [collectionNameInput, setCollectionNameInput] = useState('')
  const [collectionProviderModeInput, setCollectionProviderModeInput] =
    useState<AIHistoryCollectionRetrievalPolicy['providerMode']>('inherit')
  const [collectionBudgetOverrideInput, setCollectionBudgetOverrideInput] =
    useState<'inherit' | AIHistoryProviderRerankBudget>('inherit')
  const [savedViewNameInput, setSavedViewNameInput] = useState('')
  const [savedViewBudgetOverrideInput, setSavedViewBudgetOverrideInput] =
    useState<'inherit' | AIHistoryProviderRerankBudget>('inherit')
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<AIHistorySavedViewStatusFilter>('all')
  const [historyWorkspaceFacet, setHistoryWorkspaceFacet] =
    useState<AIHistoryWorkspaceFacet>('all')
  const [historyPinnedOnly, setHistoryPinnedOnly] = useState(false)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null)
  const [providerRetrievalState, setProviderRetrievalState] = useState<'idle' | 'running' | 'ready' | 'error'>('idle')
  const [providerRetrievalMatches, setProviderRetrievalMatches] = useState<AIHistoryRetrievalMatch[] | null>(null)
  const [providerRetrievalError, setProviderRetrievalError] = useState<string | null>(null)
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | 'success' | 'error'>('all')
  const [auditBudgetFilter, setAuditBudgetFilter] = useState<'all' | AIHistoryProviderRerankBudget>('all')
  const [auditCompareIds, setAuditCompareIds] = useState<string[]>([])
  const templates = useMemo(() => getAITemplateModels(t), [t])
  const slashCommands = useMemo(() => createAISlashCommandEntries(t), [t])
  const threadKey = activeTab ? getAIDocumentThreadKey(activeTab.id, activeTab.path) : null
  const threadId = threadKey ? threadIdsByDocument[threadKey] ?? null : null
  const sessionHistory = threadKey ? sessionHistoryByDocument[threadKey] ?? [] : []
  const latestSession = sessionHistory[0] ?? null
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase()
  const relatedSeedQuery = useMemo(() => {
    if (normalizedHistoryQuery) return historyQuery.trim()
    const prompt = composer.prompt.trim()
    if (prompt) return prompt
    const latestPrompt = latestSession?.prompt.trim() ?? ''
    return latestPrompt
  }, [composer.prompt, historyQuery, latestSession?.prompt, normalizedHistoryQuery])
  const allHistoryEntries = useMemo(
    () =>
      Object.entries(sessionHistoryByDocument).flatMap(([documentKey, entries]) =>
        entries.map((entry) => ({ ...entry, documentKey }))
      ),
    [sessionHistoryByDocument]
  )
  const historyEntriesByRef = useMemo(
    () =>
      new Map(
        allHistoryEntries.map((entry) => [`${entry.documentKey}::${entry.id}`, entry] as const)
      ),
    [allHistoryEntries]
  )
  const activeCollection = historyCollections.find((collection) => collection.id === activeCollectionId) ?? null
  const activeSavedView = historySavedViews.find((view) => view.id === activeSavedViewId) ?? null
  const activeCollectionEntries = useMemo(
    () =>
      activeCollection
        ? activeCollection.entryRefs
            .map((ref) => historyEntriesByRef.get(`${ref.documentKey}::${ref.entryId}`) ?? null)
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        : [],
    [activeCollection, historyEntriesByRef]
  )
  const historyDocumentCount = Object.keys(sessionHistoryByDocument).length
  const currentDocumentPinnedCount = sessionHistory.filter((entry) => entry.pinned).length
  const pinnedHistoryCount = allHistoryEntries.filter((entry) => entry.pinned).length
  const implicitRelatedMode = !normalizedHistoryQuery && relatedSeedQuery.trim().length > 0
  const historyExplorerBaseCandidates = useMemo(() => {
    if (activeCollection) return activeCollectionEntries
    return allHistoryEntries.filter((entry) => entry.documentKey !== threadKey)
  }, [activeCollection, activeCollectionEntries, allHistoryEntries, threadKey])
  const activeCollectionRetrievalPolicy: AIHistoryCollectionRetrievalPolicy =
    activeCollection?.retrievalPolicy ?? {
      providerMode: DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerMode,
      providerBudgetOverride: DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerBudgetOverride,
    }
  const activeSavedViewRetrievalPreset: AIHistorySavedViewRetrievalPreset =
    activeSavedView?.retrievalPreset ?? createDefaultAIHistorySavedViewRetrievalPreset()
  const historyExplorerCandidates = useMemo(
    () =>
      historyExplorerBaseCandidates.filter(
        (entry) =>
          matchesAIHistorySavedViewStatusFilter(entry.status, historyStatusFilter) &&
          matchesAIHistoryWorkspaceFacet(entry, historyWorkspaceFacet) &&
          (!historyPinnedOnly || entry.pinned)
      ),
    [historyExplorerBaseCandidates, historyPinnedOnly, historyStatusFilter, historyWorkspaceFacet]
  )
  const effectiveProviderRerankEnabled = resolveAIHistoryCollectionProviderRerankEnabled(
    aiHistoryProviderRerankEnabled,
    activeCollection?.retrievalPolicy
  )
  const effectiveProviderBaseBudget = resolveAIHistoryCollectionProviderRerankBudget(
    aiHistoryProviderRerankBudget,
    activeCollection?.retrievalPolicy
  )
  const effectiveProviderRerankBudget = resolveAIHistorySavedViewProviderRerankBudget(
    effectiveProviderBaseBudget,
    activeSavedView?.retrievalPreset
  )
  const providerRerankPolicy = resolveAIHistoryProviderRerankPolicy(effectiveProviderRerankBudget)
  const providerRerankFieldSet = getAIHistoryProviderRerankFieldSet(providerRerankPolicy)
  const providerRerankSendCount = estimateAIHistoryProviderRerankSendCount(
    historyExplorerCandidates.length,
    effectiveProviderRerankBudget
  )
  const providerRerankPreview = useMemo(
    () =>
      buildAIHistoryProviderRerankPayload({
        query: relatedSeedQuery,
        candidates: historyExplorerCandidates.slice(0, providerRerankPolicy.maxCandidates),
        budget: effectiveProviderRerankBudget,
      }),
    [effectiveProviderRerankBudget, historyExplorerCandidates, providerRerankPolicy.maxCandidates, relatedSeedQuery]
  )
  const providerRerankPreviewRaw = useMemo(
    () => JSON.stringify(providerRerankPreview, null, 2),
    [providerRerankPreview]
  )
  const filteredAuditEntries = useMemo(
    () =>
      historyProviderRerankAudit.filter((entry) => {
        if (auditStatusFilter !== 'all' && entry.status !== auditStatusFilter) return false
        if (auditBudgetFilter !== 'all' && entry.budget !== auditBudgetFilter) return false
        return true
      }),
    [auditBudgetFilter, auditStatusFilter, historyProviderRerankAudit]
  )
  const comparedAuditEntries = useMemo(
    () =>
      auditCompareIds
        .map((id) => filteredAuditEntries.find((entry) => entry.id === id) ?? null)
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [auditCompareIds, filteredAuditEntries]
  )
  const auditInsights = useMemo(
    () => buildAIHistoryProviderAuditInsights(filteredAuditEntries),
    [filteredAuditEntries]
  )
  const historyExplorerMatches = useMemo(() => {
    const candidates = historyExplorerCandidates
    const related = retrieveAIHistoryCandidates(candidates, relatedSeedQuery)
    if (relatedSeedQuery.trim().length > 0) {
      return related.length > 0
        ? related
        : sortHistoryCandidates(candidates).map((candidate) => ({
            candidate,
            score: 0,
            matchKind: 'recency' as const,
            matchedTerms: [],
          }))
    }
    return sortHistoryCandidates(candidates).map((candidate) => ({
      candidate,
      score: 0,
      matchKind: 'recency' as const,
      matchedTerms: [],
    }))
  }, [historyExplorerCandidates, relatedSeedQuery])
  const displayedHistoryMatches = providerRetrievalMatches ?? historyExplorerMatches
  const normalizedDraft = normalizeAIDraftText(composer.draftText, composer.outputTarget)
  const status = getAISidebarStatus({
    composerOpen: composer.open,
    draftText: normalizedDraft,
    errorMessage: composer.errorMessage,
    requestState: composer.requestState,
    maxDetailLength: 220,
    t,
  })
  const selectedRoleLabel =
    aiDefaultSelectedTextRole === 'reference-only'
      ? t('ai.preferences.roleReferenceOnly')
      : t('ai.preferences.roleTransformTarget')
  const shortcut = formatPrimaryShortcut('J')
  const meta = getPeekMeta(view, t)
  const providerRerankScopeLabel = activeSavedView
    ? t('ai.sidebar.historyProviderPreviewScopeSavedView', { name: activeSavedView.name })
    : activeCollection
      ? t('ai.sidebar.historyProviderPreviewScopeCollection', { name: activeCollection.name })
      : t('ai.sidebar.historyProviderPreviewScopeGlobal')
  const providerPolicySummary = describeEffectiveHistoryProviderPolicySummary({
    activeCollectionName: activeCollection?.name ?? null,
    collectionPolicy: activeCollection ? activeCollectionRetrievalPolicy : null,
    savedViewName: activeSavedView?.name ?? null,
    savedViewPreset: activeSavedView ? activeSavedViewRetrievalPreset : null,
    t,
  })

  async function handleExportHistory() {
    try {
      const archive = exportHistoryArchive()
      const saved = await saveAIHistoryArchiveText(
        JSON.stringify(archive, null, 2),
        buildAIHistoryArchiveFileName(new Date(archive.exportedAt))
      )
      if (!saved) return

      const documentCount = Object.keys(archive.sessionHistoryByDocument).length
      const entryCount = Object.values(archive.sessionHistoryByDocument).reduce((total, entries) => total + entries.length, 0)
      const auditCount = archive.historyProviderRerankAudit?.length ?? 0
      pushSuccessNotice('notices.aiHistoryExportedTitle', 'notices.aiHistoryExportedMessage', {
        values: { documents: documentCount, entries: entryCount, audits: auditCount },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      pushErrorNotice('notices.aiHistoryExportErrorTitle', 'notices.aiHistoryExportErrorMessage', {
        values: { reason },
      })
    }
  }

  async function handleImportHistory() {
    try {
      const raw = await readAIHistoryArchiveText()
      if (raw === null) return

      const imported = importHistoryArchive(JSON.parse(raw))
      pushSuccessNotice('notices.aiHistoryImportedTitle', 'notices.aiHistoryImportedMessage', {
        values: { documents: imported.documentCount, entries: imported.entryCount, audits: imported.auditCount },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      pushErrorNotice('notices.aiHistoryImportErrorTitle', 'notices.aiHistoryImportErrorMessage', {
        values: { reason },
      })
    }
  }

  async function handleExportProviderAuditReport() {
    try {
      const report = buildAIHistoryProviderAuditReport({
        entries: filteredAuditEntries,
        comparedEntries: comparedAuditEntries,
        statusFilter: auditStatusFilter,
        budgetFilter: auditBudgetFilter,
      })
      const saved = await saveAIHistoryJsonText(
        JSON.stringify(report, null, 2),
        buildAIHistoryProviderAuditReportFileName(new Date(report.generatedAt))
      )
      if (!saved) return

      pushSuccessNotice('notices.aiHistoryAuditReportExportedTitle', 'notices.aiHistoryAuditReportExportedMessage', {
        values: { entries: report.entries.length },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      pushErrorNotice('notices.aiHistoryAuditReportExportErrorTitle', 'notices.aiHistoryAuditReportExportErrorMessage', {
        values: { reason },
      })
    }
  }

  async function handleProviderRerank() {
    const query = relatedSeedQuery.trim()
    if (!query || historyExplorerCandidates.length === 0) return
    if (!effectiveProviderRerankEnabled) return

    setProviderRetrievalState('running')
    setProviderRetrievalError(null)

    try {
      const result = await rerankAIHistoryCandidatesWithProvider({
        query,
        candidates: historyExplorerCandidates,
        activeDocumentName: activeTab?.name ?? t('app.untitled'),
        budget: effectiveProviderRerankBudget,
      })

      setProviderRetrievalMatches(result.matches)
      setProviderRetrievalState('ready')
      addHistoryProviderRerankAudit({
        query,
        budget: effectiveProviderRerankBudget,
        collectionId: activeCollectionId,
        savedViewId: activeSavedViewId,
        retrievalStatusFilter: historyStatusFilter,
        retrievalPinnedOnly: historyPinnedOnly,
        candidateCount: historyExplorerCandidates.length,
        sentCount: result.sentCount,
        providerModel: result.providerModel,
        status: 'success',
        errorMessage: null,
      })
      pushSuccessNotice('notices.aiHistoryProviderRankedTitle', 'notices.aiHistoryProviderRankedMessage', {
        values: { count: result.matches.length },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setProviderRetrievalMatches(null)
      setProviderRetrievalState('error')
      setProviderRetrievalError(reason)
      addHistoryProviderRerankAudit({
        query,
        budget: effectiveProviderRerankBudget,
        collectionId: activeCollectionId,
        savedViewId: activeSavedViewId,
        retrievalStatusFilter: historyStatusFilter,
        retrievalPinnedOnly: historyPinnedOnly,
        candidateCount: historyExplorerCandidates.length,
        sentCount: providerRerankSendCount,
        providerModel: null,
        status: 'error',
        errorMessage: reason,
      })
      pushErrorNotice('notices.aiHistoryProviderErrorTitle', 'notices.aiHistoryProviderErrorMessage', {
        values: { reason },
      })
    }
  }

  function handleCreateCollection() {
    const entryRefs = displayedHistoryMatches.map((match) => ({
      documentKey: match.candidate.documentKey,
      entryId: match.candidate.id,
    }))
    const collectionId = createHistoryCollection(collectionNameInput, entryRefs, {
      retrievalPolicy: {
        providerMode: collectionProviderModeInput,
        providerBudgetOverride:
          collectionBudgetOverrideInput === 'inherit' ? null : collectionBudgetOverrideInput,
      },
    })
    if (!collectionId) return

    setCollectionNameInput('')
    setCollectionProviderModeInput('inherit')
    setCollectionBudgetOverrideInput('inherit')
    setActiveCollectionId(collectionId)
    setActiveSavedViewId(null)
  }

  function handleCreateSavedView() {
    const viewId = createHistorySavedView(savedViewNameInput, {
      query: historyQuery,
      collectionId: activeCollectionId,
      retrievalPreset: {
        statusFilter: historyStatusFilter,
        pinnedOnly: historyPinnedOnly,
        providerBudgetOverride:
          savedViewBudgetOverrideInput === 'inherit' ? null : savedViewBudgetOverrideInput,
        automationMode: 'manual',
      },
    })
    if (!viewId) return

    setSavedViewNameInput('')
    setSavedViewBudgetOverrideInput('inherit')
    setActiveSavedViewId(viewId)
  }

  function handleApplyCollection(collectionId: string) {
    setActiveCollectionId(collectionId)
    setActiveSavedViewId(null)
  }

  function handleCollectionProviderModeChange(
    collectionId: string,
    providerMode: AIHistoryCollectionRetrievalPolicy['providerMode']
  ) {
    updateHistoryCollectionPolicy(collectionId, { providerMode })
  }

  function handleCollectionBudgetOverrideChange(
    collectionId: string,
    providerBudgetOverride: 'inherit' | AIHistoryProviderRerankBudget
  ) {
    updateHistoryCollectionPolicy(collectionId, {
      providerBudgetOverride: providerBudgetOverride === 'inherit' ? null : providerBudgetOverride,
    })
  }

  function handleApplySavedView(viewId: string) {
    const nextView = historySavedViews.find((view) => view.id === viewId)
    if (!nextView) return

    setHistoryQuery(nextView.query)
    setActiveCollectionId(nextView.collectionId)
    setHistoryStatusFilter(nextView.retrievalPreset.statusFilter)
    setHistoryPinnedOnly(nextView.retrievalPreset.pinnedOnly)
    setActiveSavedViewId(nextView.id)
  }

  function handleSavedViewStatusFilterChange(
    viewId: string,
    statusFilter: AIHistorySavedViewStatusFilter
  ) {
    updateHistorySavedViewRetrievalPreset(viewId, { statusFilter })
  }

  function handleSavedViewPinnedOnlyChange(viewId: string, pinnedOnly: boolean) {
    updateHistorySavedViewRetrievalPreset(viewId, { pinnedOnly })
  }

  function handleSavedViewBudgetOverrideChange(
    viewId: string,
    providerBudgetOverride: 'inherit' | AIHistoryProviderRerankBudget
  ) {
    updateHistorySavedViewRetrievalPreset(viewId, {
      providerBudgetOverride: providerBudgetOverride === 'inherit' ? null : providerBudgetOverride,
    })
  }

  function handleReplayProviderAudit(entryId: string) {
    const entry = historyProviderRerankAudit.find((item) => item.id === entryId)
    if (!entry) return

    const matchingSavedView =
      entry.savedViewId
        ? historySavedViews.find((view) => view.id === entry.savedViewId) ?? null
        : null
    const savedViewStillMatchesAudit =
      matchingSavedView !== null &&
      matchingSavedView.query.trim() === entry.query.trim() &&
      matchingSavedView.retrievalPreset.statusFilter === entry.retrievalStatusFilter &&
      matchingSavedView.retrievalPreset.pinnedOnly === entry.retrievalPinnedOnly

    setHistoryQuery(entry.query)
    setHistoryStatusFilter(entry.retrievalStatusFilter)
    setHistoryPinnedOnly(entry.retrievalPinnedOnly)
    setActiveCollectionId(
      entry.collectionId && historyCollections.some((collection) => collection.id === entry.collectionId)
        ? entry.collectionId
        : null
    )
    setActiveSavedViewId(savedViewStillMatchesAudit ? matchingSavedView.id : null)
    setProviderRetrievalMatches(null)
    setProviderRetrievalError(null)
    setProviderRetrievalState('idle')
  }

  function reuseHistoryEntry(
    entry: Pick<AIDocumentSessionHistoryEntry, 'intent' | 'scope' | 'outputTarget' | 'prompt'>
  ) {
    dispatchEditorAIOpen({
      source: SIDEBAR_TAB_SOURCE,
      intent: entry.intent,
      scope: entry.scope,
      outputTarget: entry.outputTarget,
      prompt: entry.prompt,
    })
    onClose()
  }

  function toggleAuditCompare(entryId: string) {
    setAuditCompareIds((current) => {
      if (current.includes(entryId)) return current.filter((id) => id !== entryId)
      return [...current.slice(-1), entryId]
    })
  }

  function clearExplorerFilters() {
    setHistoryQuery('')
    setHistoryStatusFilter('all')
    setHistoryWorkspaceFacet('all')
    setHistoryPinnedOnly(false)
    setSavedViewBudgetOverrideInput('inherit')
    setActiveCollectionId(null)
    setActiveSavedViewId(null)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (activeCollectionId && !historyCollections.some((collection) => collection.id === activeCollectionId)) {
      setActiveCollectionId(null)
    }
  }, [activeCollectionId, historyCollections])

  useEffect(() => {
    if (activeSavedViewId && !historySavedViews.some((view) => view.id === activeSavedViewId)) {
      setActiveSavedViewId(null)
    }
  }, [activeSavedViewId, historySavedViews])

  useEffect(() => {
    if (!activeSavedView) return
    setHistoryStatusFilter(activeSavedView.retrievalPreset.statusFilter)
    setHistoryPinnedOnly(activeSavedView.retrievalPreset.pinnedOnly)
  }, [
    activeSavedView,
    activeSavedView?.retrievalPreset.pinnedOnly,
    activeSavedView?.retrievalPreset.statusFilter,
  ])

  useEffect(() => {
    setAuditCompareIds((current) =>
      current.filter((id) => filteredAuditEntries.some((entry) => entry.id === id)).slice(-2)
    )
  }, [filteredAuditEntries])

  useEffect(() => {
    setProviderRetrievalMatches(null)
    setProviderRetrievalError(null)
    setProviderRetrievalState('idle')
  }, [
    activeCollectionId,
    activeSavedViewId,
    effectiveProviderRerankBudget,
    effectiveProviderRerankEnabled,
    historyExplorerCandidates,
    relatedSeedQuery,
  ])

  return (
    <aside
      id="ai-sidebar-peek-rail"
      role="dialog"
      aria-modal="false"
      aria-label={meta.title}
      data-ai-sidebar-peek={view}
      className="sidebar-peek-rail flex h-full flex-col overflow-hidden rounded-[28px] border"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
        boxShadow: '0 28px 64px -28px rgba(15, 23, 42, 0.42)',
      }}
    >
      <div
        className="flex flex-shrink-0 items-start justify-between gap-3 border-b px-4 py-4"
        style={{
          borderBottomColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                color: 'var(--accent)',
              }}
            >
              <AppIcon name={meta.icon} size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {meta.title}
              </div>
              <p className="mt-0.5 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                {meta.detail}
              </p>
            </div>
          </div>

          <div
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
              color: 'var(--text-secondary)',
            }}
            title={activeTab?.name ?? t('app.untitled')}
          >
            <AppIcon name="file" size={12} />
            <span className="truncate">{activeTab?.name ?? t('app.untitled')}</span>
          </div>
        </div>

        <button
          type="button"
          data-ai-sidebar-peek-close="true"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-sm transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
            color: 'var(--text-muted)',
          }}
          title={t('ai.sidebar.peekClose')}
          aria-label={t('ai.sidebar.peekClose')}
        >
          ×
        </button>
      </div>

      <div className="sidebar-surface__scroll flex-1 overflow-y-auto px-4 py-4">
        {view === 'library' && (
          <div className="grid gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                data-ai-sidebar-template={template.id}
                onClick={() => {
                  dispatchEditorAIOpen(createAITemplateOpenDetail(template.id, t, SIDEBAR_TAB_SOURCE))
                  onClose()
                }}
                className="cursor-pointer rounded-[22px] border px-4 py-4 text-left transition-colors"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 68%, transparent)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                      }}
                    >
                      <AppIcon name={getAITemplateIcon(template.id)} size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {template.label}
                      </div>
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                        {template.detail}
                      </p>
                    </div>
                  </div>

                  <PeekPill label={t(`ai.intent.${template.intent}`)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <PeekPill label={t(`ai.outputTarget.${template.outputTarget}`)} />
                </div>
              </button>
            ))}
          </div>
        )}

        {view === 'session' && (
          <div className="grid gap-3">
            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border))',
                background:
                  'linear-gradient(160deg, color-mix(in srgb, var(--accent) 8%, var(--bg-primary)) 0%, color-mix(in srgb, var(--bg-secondary) 82%, transparent) 100%)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.lastRun')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {latestSession ? t('ai.sidebar.lastRunDetail') : t('ai.sidebar.lastRunEmptyDetail')}
                  </p>
                </div>

                {latestSession && (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {formatSessionTimestamp(latestSession.updatedAt, i18n.language)}
                  </span>
                )}
              </div>

              {latestSession ? (
                <div className="mt-3">
                  <SessionHistoryCard
                    entry={latestSession}
                    locale={i18n.language}
                    reuseLabel={t('ai.sidebar.historyReuseHere')}
                    onTogglePin={() => {
                      if (!activeTab) return
                      toggleSessionHistoryPin(activeTab.id, activeTab.path, latestSession.id)
                    }}
                    onRemove={() => {
                      if (!activeTab) return
                      removeSessionHistoryEntry(activeTab.id, activeTab.path, latestSession.id)
                    }}
                    onReuse={() => reuseHistoryEntry(latestSession)}
                  />
                </div>
              ) : (
                <div
                  data-ai-sidebar-session-last-run-empty="true"
                  className="mt-3 rounded-2xl border px-4 py-4"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('ai.sidebar.historyEmptyShort')}
                  </div>
                  <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.lastRunEmptyDetail')}
                  </p>
                </div>
              )}
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.sidebar.historyOverviewTitle')}
                </div>
                <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.sidebar.historyOverviewDetail')}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <PeekMetric label={t('ai.sidebar.activeStatus')} value={status.label} icon={status.icon} accent={status.accent} />
                <PeekMetric label={t('ai.sidebar.defaultTarget')} value={t(`ai.outputTarget.${aiDefaultWriteTarget}`)} icon="edit" />
                <PeekMetric label={t('ai.sidebar.selectedRole')} value={selectedRoleLabel} icon="outline" />
                <PeekMetric label={t('ai.sidebar.historyCount')} value={String(sessionHistory.length)} icon="copy" />
              </div>

              <div className="mt-3 grid gap-2">
                <PeekField label={t('ai.sidebar.document')} value={activeTab?.name ?? t('app.untitled')} />
                <PeekField
                  label={t('ai.sidebar.thread')}
                  value={threadId ?? threadKey ?? t('ai.sidebar.threadPending')}
                  copyable={Boolean(threadId || threadKey)}
                  copyLabel={t('ai.copy')}
                />
              </div>
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyTitleDetail')}
                  </p>
                </div>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sessionHistory.length}
                </span>
              </div>

              {sessionHistory.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {sessionHistory.map((entry) => (
                    <SessionHistoryCard
                      key={entry.id}
                      entry={entry}
                      locale={i18n.language}
                      onTogglePin={() => {
                        if (!activeTab) return
                        toggleSessionHistoryPin(activeTab.id, activeTab.path, entry.id)
                      }}
                      onRemove={() => {
                        if (!activeTab) return
                        removeSessionHistoryEntry(activeTab.id, activeTab.path, entry.id)
                      }}
                      onReuse={() => reuseHistoryEntry(entry)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  data-ai-sidebar-session-empty="true"
                  className="mt-3 rounded-2xl border px-4 py-4"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('ai.sidebar.historyEmpty')}
                  </div>
                  <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyEmptyDetail')}
                  </p>
                </div>
              )}
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyControlsTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyControlsDetail')}
                  </p>
                </div>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {t(`ai.sidebar.historyPreset.${historyRetentionPreset}`)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['compact', 'standard', 'extended'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-ai-sidebar-history-preset={preset}
                    onClick={() => setHistoryRetentionPreset(preset)}
                    className="rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      borderColor:
                        historyRetentionPreset === preset
                          ? 'color-mix(in srgb, var(--accent) 28%, var(--border))'
                          : 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background:
                        historyRetentionPreset === preset
                          ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                          : 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: historyRetentionPreset === preset ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {t(`ai.sidebar.historyPreset.${preset}`)}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <PeekMetric label={t('ai.sidebar.pinnedCount')} value={String(pinnedHistoryCount)} icon="bookmark" />
                <PeekMetric label={t('ai.sidebar.currentPinnedCount')} value={String(currentDocumentPinnedCount)} icon="bookmark" />
                <PeekMetric label={t('ai.sidebar.historyDocumentCount')} value={String(historyDocumentCount)} icon="clock" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ai-sidebar-history-export="true"
                  onClick={() => void handleExportHistory()}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {t('ai.sidebar.historyExport')}
                </button>
                <button
                  type="button"
                  data-ai-sidebar-history-import="true"
                  onClick={() => void handleImportHistory()}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {t('ai.sidebar.historyImport')}
                </button>
                <button
                  type="button"
                  data-ai-sidebar-history-clear-current="true"
                  onClick={() => {
                    if (!activeTab) return
                    clearSessionHistory(activeTab.id, activeTab.path, { preservePinned: true })
                  }}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                  disabled={!activeTab || sessionHistory.length === 0}
                >
                  {t('ai.sidebar.historyClearCurrent')}
                </button>
                <button
                  type="button"
                  data-ai-sidebar-history-clear-all="true"
                  onClick={() => clearAllSessionHistory({ preservePinned: true })}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                  disabled={allHistoryEntries.length === 0}
                >
                  {t('ai.sidebar.historyClearAll')}
                </button>
              </div>
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.collectionsTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.collectionsDetail')}
                  </p>
                </div>
                {(activeCollectionId || activeSavedViewId || historyQuery.trim() || historyStatusFilter !== 'all' || historyWorkspaceFacet !== 'all' || historyPinnedOnly) && (
                  <button
                    type="button"
                    data-ai-sidebar-history-reset-view="true"
                    onClick={clearExplorerFilters}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {t('ai.sidebar.historyResetView')}
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-3">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={collectionNameInput}
                    onChange={(event) => setCollectionNameInput(event.target.value)}
                    data-ai-sidebar-history-collection-input="true"
                    placeholder={t('ai.sidebar.collectionNamePlaceholder')}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    data-ai-sidebar-history-collection-create="true"
                    onClick={handleCreateCollection}
                    className="rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                      background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                      color: 'var(--text-primary)',
                    }}
                    disabled={collectionNameInput.trim().length === 0 || displayedHistoryMatches.length === 0}
                  >
                    {t('ai.sidebar.collectionCreate')}
                  </button>
                </div>

                <div
                  data-ai-sidebar-history-collection-create-policy="true"
                  className="rounded-2xl border px-3 py-3"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.collectionPolicyTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.collectionPolicyDetail')}
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.sidebar.collectionPolicyProviderMode')}
                      </span>
                      <select
                        value={collectionProviderModeInput}
                        onChange={(event) =>
                          setCollectionProviderModeInput(
                            event.target.value as AIHistoryCollectionRetrievalPolicy['providerMode']
                          )
                        }
                        data-ai-sidebar-history-collection-create-policy-mode="true"
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="inherit">{t('ai.sidebar.collectionPolicyModeOption.inherit')}</option>
                        <option value="local-only">{t('ai.sidebar.collectionPolicyModeOption.localOnly')}</option>
                        <option value="allow-provider">{t('ai.sidebar.collectionPolicyModeOption.allowProvider')}</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.sidebar.collectionPolicyBudget')}
                      </span>
                      <select
                        value={collectionBudgetOverrideInput}
                        onChange={(event) =>
                          setCollectionBudgetOverrideInput(
                            event.target.value as 'inherit' | AIHistoryProviderRerankBudget
                          )
                        }
                        data-ai-sidebar-history-collection-create-policy-budget="true"
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="inherit">{t('ai.sidebar.collectionPolicyBudgetInherit')}</option>
                        <option value="conservative">{t('ai.preferences.historyProviderBudgetOption.conservative')}</option>
                        <option value="balanced">{t('ai.preferences.historyProviderBudgetOption.balanced')}</option>
                        <option value="deep">{t('ai.preferences.historyProviderBudgetOption.deep')}</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={savedViewNameInput}
                    onChange={(event) => setSavedViewNameInput(event.target.value)}
                    data-ai-sidebar-history-view-input="true"
                    placeholder={t('ai.sidebar.savedViewNamePlaceholder')}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    data-ai-sidebar-history-view-create="true"
                    onClick={handleCreateSavedView}
                    className="rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                      background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                      color: 'var(--text-primary)',
                    }}
                    disabled={savedViewNameInput.trim().length === 0 || (historyQuery.trim().length === 0 && !activeCollectionId)}
                  >
                    {t('ai.sidebar.savedViewCreate')}
                  </button>
                </div>

                <div
                  data-ai-sidebar-history-view-create-preset="true"
                  className="rounded-2xl border px-3 py-3"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.savedViewPresetTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.savedViewPresetDetail')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PeekPill
                      label={t(
                        `ai.sidebar.historyFilterStatusOption.${mapSavedViewStatusFilterToLocaleKey(historyStatusFilter)}`
                      )}
                    />
                    {historyPinnedOnly && <PeekPill label={t('ai.sidebar.historyFilterPinnedOnly')} />}
                  </div>
                  <label className="mt-3 grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.sidebar.savedViewPresetBudget')}
                    </span>
                    <select
                      value={savedViewBudgetOverrideInput}
                      onChange={(event) =>
                        setSavedViewBudgetOverrideInput(
                          event.target.value as 'inherit' | AIHistoryProviderRerankBudget
                        )
                      }
                      data-ai-sidebar-history-view-create-preset-budget="true"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="inherit">{t('ai.sidebar.savedViewPresetBudgetInherit')}</option>
                      <option value="conservative">{t('ai.preferences.historyProviderBudgetOption.conservative')}</option>
                      <option value="balanced">{t('ai.preferences.historyProviderBudgetOption.balanced')}</option>
                      <option value="deep">{t('ai.preferences.historyProviderBudgetOption.deep')}</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.collectionListTitle')}
                  </div>
                  {historyCollections.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {historyCollections.map((collection) => (
                        <div
                          key={collection.id}
                          data-ai-sidebar-history-collection={collection.id}
                          className="rounded-2xl border px-3 py-3"
                          style={{
                            borderColor:
                              activeCollectionId === collection.id
                                ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                                : 'color-mix(in srgb, var(--border) 74%, transparent)',
                            background:
                              activeCollectionId === collection.id
                                ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                                : 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {collection.name}
                              </div>
                              <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                                {t('ai.sidebar.collectionCount', { count: collection.entryRefs.length })}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <PeekPill
                                  label={t(
                                    `ai.sidebar.collectionPolicyModeOption.${mapCollectionPolicyModeToLocaleKey(collection.retrievalPolicy.providerMode)}`
                                  )}
                                />
                                <PeekPill
                                  label={
                                    collection.retrievalPolicy.providerBudgetOverride
                                      ? t('ai.sidebar.collectionPolicyBudgetOverrideBadge', {
                                          budget: t(
                                            `ai.preferences.historyProviderBudgetOption.${collection.retrievalPolicy.providerBudgetOverride}`
                                          ),
                                        })
                                      : t('ai.sidebar.collectionPolicyBudgetInheritBadge')
                                  }
                                />
                              </div>
                              <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                                {describeHistoryCollectionRetrievalPolicy(collection.retrievalPolicy, t)}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                data-ai-sidebar-history-collection-apply={collection.id}
                                onClick={() => handleApplyCollection(collection.id)}
                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                                style={{
                                  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {t('ai.sidebar.collectionApply')}
                              </button>
                              <button
                                type="button"
                                data-ai-sidebar-history-collection-delete={collection.id}
                                onClick={() => deleteHistoryCollection(collection.id)}
                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                                style={{
                                  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {t('ai.sidebar.collectionDelete')}
                              </button>
                            </div>
                          </div>

                          {activeCollectionId === collection.id && (
                            <div
                              data-ai-sidebar-history-collection-policy-panel={collection.id}
                              className="mt-3 grid gap-2 md:grid-cols-2"
                            >
                              <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                                  {t('ai.sidebar.collectionPolicyProviderMode')}
                                </span>
                                <select
                                  value={collection.retrievalPolicy.providerMode}
                                  onChange={(event) =>
                                    handleCollectionProviderModeChange(
                                      collection.id,
                                      event.target.value as AIHistoryCollectionRetrievalPolicy['providerMode']
                                    )
                                  }
                                  data-ai-sidebar-history-collection-policy-mode={collection.id}
                                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                  style={{
                                    borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <option value="inherit">{t('ai.sidebar.collectionPolicyModeOption.inherit')}</option>
                                  <option value="local-only">{t('ai.sidebar.collectionPolicyModeOption.localOnly')}</option>
                                  <option value="allow-provider">{t('ai.sidebar.collectionPolicyModeOption.allowProvider')}</option>
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                                  {t('ai.sidebar.collectionPolicyBudget')}
                                </span>
                                <select
                                  value={collection.retrievalPolicy.providerBudgetOverride ?? 'inherit'}
                                  onChange={(event) =>
                                    handleCollectionBudgetOverrideChange(
                                      collection.id,
                                      event.target.value as 'inherit' | AIHistoryProviderRerankBudget
                                    )
                                  }
                                  data-ai-sidebar-history-collection-policy-budget={collection.id}
                                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                  style={{
                                    borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <option value="inherit">{t('ai.sidebar.collectionPolicyBudgetInherit')}</option>
                                  <option value="conservative">{t('ai.preferences.historyProviderBudgetOption.conservative')}</option>
                                  <option value="balanced">{t('ai.preferences.historyProviderBudgetOption.balanced')}</option>
                                  <option value="deep">{t('ai.preferences.historyProviderBudgetOption.deep')}</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.sidebar.collectionEmpty')}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.savedViewsTitle')}
                  </div>
                  {historySavedViews.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {historySavedViews.map((view) => (
                        <div
                          key={view.id}
                          data-ai-sidebar-history-view={view.id}
                          className="rounded-2xl border px-3 py-3"
                          style={{
                            borderColor:
                              activeSavedViewId === view.id
                                ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                                : 'color-mix(in srgb, var(--border) 74%, transparent)',
                            background:
                              activeSavedViewId === view.id
                                ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                                : 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {view.name}
                              </div>
                              <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                                {describeSavedView(view, historyCollections, t)}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <PeekPill
                                  label={t(
                                    `ai.sidebar.historyFilterStatusOption.${mapSavedViewStatusFilterToLocaleKey(view.retrievalPreset.statusFilter)}`
                                  )}
                                />
                                {view.retrievalPreset.pinnedOnly && <PeekPill label={t('ai.sidebar.historyFilterPinnedOnly')} />}
                                <PeekPill
                                  label={
                                    view.retrievalPreset.providerBudgetOverride
                                      ? t('ai.sidebar.savedViewPresetBudgetOverrideBadge', {
                                          budget: t(
                                            `ai.preferences.historyProviderBudgetOption.${view.retrievalPreset.providerBudgetOverride}`
                                          ),
                                        })
                                      : t('ai.sidebar.savedViewPresetBudgetInheritBadge')
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                data-ai-sidebar-history-view-apply={view.id}
                                onClick={() => handleApplySavedView(view.id)}
                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                                style={{
                                  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {t('ai.sidebar.savedViewApply')}
                              </button>
                              <button
                                type="button"
                                data-ai-sidebar-history-view-delete={view.id}
                                onClick={() => deleteHistorySavedView(view.id)}
                                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                                style={{
                                  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {t('ai.sidebar.savedViewDelete')}
                              </button>
                            </div>
                          </div>

                          {activeSavedViewId === view.id && (
                            <div
                              data-ai-sidebar-history-view-preset-panel={view.id}
                              className="mt-3 grid gap-2 md:grid-cols-3"
                            >
                              <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                                  {t('ai.sidebar.historyFilterStatus')}
                                </span>
                                <select
                                  value={view.retrievalPreset.statusFilter}
                                  onChange={(event) =>
                                    handleSavedViewStatusFilterChange(
                                      view.id,
                                      event.target.value as AIHistorySavedViewStatusFilter
                                    )
                                  }
                                  data-ai-sidebar-history-view-preset-status={view.id}
                                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                  style={{
                                    borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <option value="all">{t('ai.sidebar.historyFilterStatusOption.all')}</option>
                                  <option value="done">{t('ai.sidebar.historyFilterStatusOption.done')}</option>
                                  <option value="error">{t('ai.sidebar.historyFilterStatusOption.error')}</option>
                                  <option value="canceled">{t('ai.sidebar.historyFilterStatusOption.canceled')}</option>
                                  <option value="streaming">{t('ai.sidebar.historyFilterStatusOption.streaming')}</option>
                                </select>
                              </label>
                              <div className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                                  {t('ai.sidebar.savedViewPresetPinned')}
                                </span>
                                <button
                                  type="button"
                                  data-ai-sidebar-history-view-preset-pinned={view.id}
                                  onClick={() =>
                                    handleSavedViewPinnedOnlyChange(view.id, !view.retrievalPreset.pinnedOnly)
                                  }
                                  className="rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
                                  style={{
                                    borderColor: view.retrievalPreset.pinnedOnly
                                      ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                                      : 'color-mix(in srgb, var(--border) 76%, transparent)',
                                    background: view.retrievalPreset.pinnedOnly
                                      ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                                      : 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {view.retrievalPreset.pinnedOnly
                                    ? t('ai.sidebar.historyFilterPinnedOnly')
                                    : t('ai.sidebar.historyFilterPinnedAll')}
                                </button>
                              </div>
                              <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                                  {t('ai.sidebar.savedViewPresetBudget')}
                                </span>
                                <select
                                  value={view.retrievalPreset.providerBudgetOverride ?? 'inherit'}
                                  onChange={(event) =>
                                    handleSavedViewBudgetOverrideChange(
                                      view.id,
                                      event.target.value as 'inherit' | AIHistoryProviderRerankBudget
                                    )
                                  }
                                  data-ai-sidebar-history-view-preset-budget={view.id}
                                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                                  style={{
                                    borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <option value="inherit">{t('ai.sidebar.savedViewPresetBudgetInherit')}</option>
                                  <option value="conservative">{t('ai.preferences.historyProviderBudgetOption.conservative')}</option>
                                  <option value="balanced">{t('ai.preferences.historyProviderBudgetOption.balanced')}</option>
                                  <option value="deep">{t('ai.preferences.historyProviderBudgetOption.deep')}</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.sidebar.savedViewEmpty')}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {activeCollection
                      ? t('ai.sidebar.collectionResultsTitle')
                      : activeSavedView
                        ? t('ai.sidebar.savedViewResultsTitle')
                        : t('ai.sidebar.crossDocumentHistoryTitle')}
                  </div>
                  <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {activeCollection
                      ? t('ai.sidebar.collectionResultsDetail', { name: activeCollection.name })
                      : activeSavedView
                        ? t('ai.sidebar.savedViewResultsDetail', { name: activeSavedView.name })
                        : normalizedHistoryQuery
                      ? t('ai.sidebar.crossDocumentHistorySearchDetail')
                      : implicitRelatedMode
                        ? t('ai.sidebar.crossDocumentHistoryRelatedDetail')
                        : t('ai.sidebar.crossDocumentHistoryDetail')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(providerRetrievalState === 'ready' || providerRetrievalState === 'running' || providerRetrievalState === 'error') && (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                        color:
                          providerRetrievalState === 'ready'
                            ? 'var(--accent)'
                            : providerRetrievalState === 'running'
                              ? 'var(--text-primary)'
                              : '#b91c1c',
                      }}
                    >
                      {providerRetrievalState === 'ready'
                        ? t('ai.sidebar.historyProviderReady')
                        : providerRetrievalState === 'running'
                          ? t('ai.sidebar.historyProviderRunning')
                          : t('ai.sidebar.statusError')}
                    </span>
                  )}
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {displayedHistoryMatches.length}
                  </span>
                </div>
              </div>

              <label className="mt-3 block">
                <span className="sr-only">{t('ai.sidebar.historySearchPlaceholder')}</span>
                <input
                  value={historyQuery}
                  onChange={(event) => {
                    setHistoryQuery(event.target.value)
                    setActiveSavedViewId(null)
                  }}
                  data-ai-sidebar-history-search="true"
                  placeholder={t('ai.sidebar.historySearchPlaceholder')}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyFilterStatus')}
                  </span>
                  <select
                    value={historyStatusFilter}
                    onChange={(event) => {
                      setHistoryStatusFilter(event.target.value as AIHistorySavedViewStatusFilter)
                      setActiveSavedViewId(null)
                    }}
                    data-ai-sidebar-history-status-filter="true"
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="all">{t('ai.sidebar.historyFilterStatusOption.all')}</option>
                    <option value="done">{t('ai.sidebar.historyFilterStatusOption.done')}</option>
                    <option value="error">{t('ai.sidebar.historyFilterStatusOption.error')}</option>
                    <option value="canceled">{t('ai.sidebar.historyFilterStatusOption.canceled')}</option>
                    <option value="streaming">{t('ai.sidebar.historyFilterStatusOption.streaming')}</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyFilterWorkspace')}
                  </span>
                  <select
                    value={historyWorkspaceFacet}
                    onChange={(event) => {
                      setHistoryWorkspaceFacet(event.target.value as AIHistoryWorkspaceFacet)
                      setActiveSavedViewId(null)
                    }}
                    data-ai-sidebar-history-workspace-filter="true"
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="all">{t('ai.sidebar.historyFilterWorkspaceOption.all')}</option>
                    <option value="workspace">{t('ai.sidebar.historyFilterWorkspaceOption.workspace')}</option>
                    <option value="workspace-completed">{t('ai.sidebar.historyFilterWorkspaceOption.workspaceCompleted')}</option>
                    <option value="workspace-attention">{t('ai.sidebar.historyFilterWorkspaceOption.workspaceAttention')}</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    data-ai-sidebar-history-pinned-filter="true"
                    onClick={() => {
                      setHistoryPinnedOnly((current) => !current)
                      setActiveSavedViewId(null)
                    }}
                    className="w-full rounded-xl border px-3 py-2 text-xs font-semibold transition-colors sm:w-auto"
                    style={{
                      borderColor: historyPinnedOnly
                        ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                        : 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background: historyPinnedOnly
                        ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                        : 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {historyPinnedOnly
                      ? t('ai.sidebar.historyFilterPinnedOnly')
                      : t('ai.sidebar.historyFilterPinnedAll')}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-ai-sidebar-history-provider-rank="true"
                  onClick={() => void handleProviderRerank()}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                    background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                    color: 'var(--text-primary)',
                  }}
                  disabled={
                    !effectiveProviderRerankEnabled ||
                    providerRetrievalState === 'running' ||
                    relatedSeedQuery.trim().length === 0 ||
                    historyExplorerCandidates.length === 0
                  }
                >
                  {t('ai.sidebar.historyProviderRank')}
                </button>
                {providerRetrievalMatches && (
                  <button
                    type="button"
                    data-ai-sidebar-history-provider-reset="true"
                    onClick={() => {
                      setProviderRetrievalMatches(null)
                      setProviderRetrievalError(null)
                      setProviderRetrievalState('idle')
                    }}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {t('ai.sidebar.historyProviderReset')}
                  </button>
                )}
              </div>

              <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                {!effectiveProviderRerankEnabled
                  ? activeCollection
                    ? t('ai.sidebar.historyProviderDisabledByCollection', { name: activeCollection.name })
                    : t('ai.sidebar.historyProviderDisabled')
                  : providerRetrievalMatches
                    ? t('ai.sidebar.historyProviderDetail')
                    : t('ai.sidebar.historyProviderBudgetDetail', {
                        count: providerRerankSendCount,
                        cost: t(`ai.preferences.historyProviderCost.${providerRerankPolicy.estimatedCost}`),
                        fields: t(`ai.preferences.historyProviderFields.${providerRerankFieldSet}`),
                      })}
              </p>
              <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                {providerPolicySummary}
              </p>

              {providerRetrievalError && (
                <div className="mt-2 text-[11px] leading-5" style={{ color: '#b91c1c' }}>
                  {providerRetrievalError}
                </div>
              )}

              <div className="mt-3 rounded-2xl border px-4 py-4"
                data-ai-sidebar-history-provider-preview="true"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.sidebar.historyProviderPreviewTitle')}
                </div>
                <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.sidebar.historyProviderPreviewDetail', {
                    count: providerRerankPreview.candidates.length,
                    query: providerRerankPreview.query || t('ai.sidebar.historyEmptyShort'),
                    scope: providerRerankScopeLabel,
                  })}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <PeekMetric
                    label={t('ai.sidebar.historyProviderPreviewBudget')}
                    value={t(`ai.preferences.historyProviderBudgetOption.${effectiveProviderRerankBudget}`)}
                    icon="sparkles"
                  />
                  <PeekMetric
                    label={t('ai.sidebar.historyProviderPreviewFields')}
                    value={t(`ai.preferences.historyProviderFields.${providerRerankFieldSet}`)}
                    icon="copy"
                  />
                  <PeekMetric
                    label={t('ai.sidebar.historyProviderPreviewSentCount')}
                    value={String(providerRerankPreview.candidates.length)}
                    icon="outline"
                  />
                  <PeekMetric
                    label={t('ai.sidebar.historyProviderPreviewScope')}
                    value={providerRerankScopeLabel}
                    icon="bookmark"
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  <PeekField
                    label={t('ai.sidebar.historyProviderPreviewQuery')}
                    value={providerRerankPreview.query || t('ai.sidebar.historyEmptyShort')}
                    copyable={providerRerankPreview.query.trim().length > 0}
                    copyLabel={t('ai.sidebar.historyProviderPreviewCopy')}
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  {providerRerankPreview.candidates.length > 0 ? (
                    providerRerankPreview.candidates.map((candidate) => (
                      <div
                        key={candidate.id}
                        data-ai-sidebar-history-provider-preview-item={candidate.id}
                        className="rounded-xl border px-3 py-3"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {candidate.documentName}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <PeekPill label={t(`ai.intent.${candidate.intent}`)} />
                              <PeekPill label={t(`ai.outputTarget.${candidate.outputTarget}`)} />
                              {candidate.pinned && <PeekPill label={t('ai.sidebar.historyPinned')} />}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                            {candidate.id}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <PeekField label={t('ai.sidebar.historyPrompt')} value={truncateSidebarCopy(candidate.prompt, 180)} />
                          <PeekField
                            label={t('ai.sidebar.historyProviderPreviewResultPreview')}
                            value={formatProviderPreviewFieldValue(candidate.resultPreview, t)}
                          />
                          <PeekField
                            label={t('ai.sidebar.historyProviderPreviewErrorField')}
                            value={formatProviderPreviewFieldValue(candidate.errorMessage, t)}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="rounded-xl border px-3 py-3"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                      }}
                    >
                      <div className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.sidebar.historyNoMatches')}
                      </div>
                    </div>
                  )}
                </div>
                <details
                  data-ai-sidebar-history-provider-preview-raw="true"
                  className="mt-3 rounded-xl border px-3 py-3"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  }}
                >
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyProviderPreviewRawLabel')}
                  </summary>
                  <div className="mt-3">
                    <PeekField
                      label={t('ai.sidebar.historyProviderPreviewPayloadJson')}
                      value={providerRerankPreviewRaw}
                      copyable
                      copyLabel={t('ai.sidebar.historyProviderPreviewCopy')}
                      preformatted
                    />
                  </div>
                </details>
              </div>

              <div className="mt-3 rounded-2xl border px-4 py-4"
                data-ai-sidebar-history-provider-audit="true"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyProviderAuditTitle')}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {filteredAuditEntries.length}
                    </span>
                    <button
                      type="button"
                      data-ai-sidebar-history-provider-audit-export="true"
                      onClick={() => void handleExportProviderAuditReport()}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                        background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                        color: 'var(--text-primary)',
                      }}
                      disabled={filteredAuditEntries.length === 0}
                    >
                      {t('ai.sidebar.historyProviderAuditExport')}
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.sidebar.historyProviderAuditArchiveDetail')}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.sidebar.historyProviderAuditFilterStatus')}
                    </span>
                    <select
                      value={auditStatusFilter}
                      onChange={(event) => setAuditStatusFilter(event.target.value as 'all' | 'success' | 'error')}
                      data-ai-sidebar-history-provider-audit-status-filter="true"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="all">{t('ai.sidebar.historyProviderAuditFilterOption.all')}</option>
                      <option value="success">{t('ai.sidebar.historyProviderAuditFilterOption.success')}</option>
                      <option value="error">{t('ai.sidebar.historyProviderAuditFilterOption.error')}</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.sidebar.historyProviderAuditFilterBudget')}
                    </span>
                    <select
                      value={auditBudgetFilter}
                      onChange={(event) =>
                        setAuditBudgetFilter(event.target.value as 'all' | AIHistoryProviderRerankBudget)
                      }
                      data-ai-sidebar-history-provider-audit-budget-filter="true"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="all">{t('ai.sidebar.historyProviderAuditFilterOption.all')}</option>
                      <option value="conservative">{t('ai.preferences.historyProviderBudgetOption.conservative')}</option>
                      <option value="balanced">{t('ai.preferences.historyProviderBudgetOption.balanced')}</option>
                      <option value="deep">{t('ai.preferences.historyProviderBudgetOption.deep')}</option>
                    </select>
                  </label>
                </div>
                <div
                  data-ai-sidebar-history-provider-audit-insights="true"
                  className="mt-3 rounded-xl border px-3 py-3"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyProviderAuditInsightsTitle')}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <PeekMetric
                      label={t('ai.sidebar.historyProviderAuditInsightsSuccessRate')}
                      value={`${auditInsights.successRatePercent}%`}
                      icon="checkCircle"
                    />
                    <PeekMetric
                      label={t('ai.sidebar.historyProviderAuditInsightsSendRatio')}
                      value={`${auditInsights.averageSendRatioPercent}%`}
                      icon="copy"
                    />
                    <PeekMetric
                      label={t('ai.sidebar.historyProviderAuditInsightsAverageSent')}
                      value={String(auditInsights.averageSentCount)}
                      icon="outline"
                    />
                    <PeekMetric
                      label={t('ai.sidebar.historyProviderAuditInsightsAverageVisible')}
                      value={String(auditInsights.averageVisibleCount)}
                      icon="file"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {auditInsights.topBudget && (
                      <PeekPill
                        label={t('ai.sidebar.historyProviderAuditInsightsTopBudget', {
                          budget: t(`ai.preferences.historyProviderBudgetOption.${auditInsights.topBudget}`),
                        })}
                      />
                    )}
                    {auditInsights.topProviderModel && (
                      <PeekPill
                        label={t('ai.sidebar.historyProviderAuditInsightsTopModel', {
                          model: auditInsights.topProviderModel,
                        })}
                      />
                    )}
                  </div>
                  {auditInsights.repeatedQueries.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.sidebar.historyProviderAuditInsightsRepeatedQueries')}
                      </div>
                      {auditInsights.repeatedQueries.map((item) => (
                        <div
                          key={item.query}
                          data-ai-sidebar-history-provider-audit-insight-query={item.query}
                          className="rounded-xl border px-3 py-2"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                            background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                          }}
                        >
                          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {truncateSidebarCopy(item.query, 96)}
                          </div>
                          <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                            {t('ai.sidebar.historyProviderAuditInsightsRepeatedCount', { count: item.count })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {comparedAuditEntries.length > 0 && (
                  <div
                    data-ai-sidebar-history-provider-audit-compare="true"
                    className="mt-3 rounded-xl border px-3 py-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.sidebar.historyProviderAuditCompareTitle')}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                        {comparedAuditEntries.length}/2
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      {comparedAuditEntries.length === 2
                        ? t('ai.sidebar.historyProviderAuditCompareReady')
                        : t('ai.sidebar.historyProviderAuditCompareHint')}
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {comparedAuditEntries.map((entry) => (
                        <div
                          key={entry.id}
                          data-ai-sidebar-history-provider-audit-compare-entry={entry.id}
                          className="rounded-xl border px-3 py-3"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                            background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {truncateSidebarCopy(entry.query, 96)}
                              </div>
                              <div className="mt-1 text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
                                {formatSessionTimestamp(entry.createdAt, i18n.language)}
                              </div>
                            </div>
                            <PeekPill
                              label={
                                entry.status === 'success'
                                  ? t('ai.sidebar.historyProviderReady')
                                  : t('ai.sidebar.statusError')
                              }
                            />
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <PeekMetric
                              label={t('ai.sidebar.historyProviderPreviewBudget')}
                              value={t(`ai.preferences.historyProviderBudgetOption.${entry.budget}`)}
                              icon="sparkles"
                            />
                            <PeekMetric
                              label={t('ai.sidebar.historyProviderAuditCompareVolume')}
                              value={t('ai.sidebar.historyProviderAuditCompareVolumeValue', {
                                visible: entry.candidateCount,
                                sent: entry.sentCount,
                              })}
                              icon="outline"
                            />
                          </div>
                          <div className="mt-3 grid gap-2">
                            <PeekField
                              label={t('ai.sidebar.historyProviderAuditCompareRetrieval')}
                              value={formatProviderAuditRetrievalSummary(entry, t)}
                            />
                            <PeekField
                              label={t('ai.sidebar.historyProviderAuditCompareContext')}
                              value={formatProviderAuditContextSummary(entry, historyCollections, historySavedViews, t)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {filteredAuditEntries.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {filteredAuditEntries.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        data-ai-sidebar-history-provider-audit-entry={entry.id}
                        className="rounded-xl border px-3 py-3"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {truncateSidebarCopy(entry.query, 96)}
                            </div>
                            <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                              {formatProviderAuditSummary(entry, historyCollections, historySavedViews, t)}
                            </div>
                            <div className="mt-1 text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
                              {formatSessionTimestamp(entry.createdAt, i18n.language)}
                            </div>
                            {entry.errorMessage && (
                              <div className="mt-2 text-[11px] leading-5" style={{ color: '#b91c1c' }}>
                                {truncateSidebarCopy(entry.errorMessage, 160)}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <PeekPill
                              label={
                                entry.status === 'success'
                                  ? t('ai.sidebar.historyProviderReady')
                                  : t('ai.sidebar.statusError')
                              }
                            />
                            <button
                              type="button"
                              data-ai-sidebar-history-provider-audit-compare-toggle={entry.id}
                              onClick={() => toggleAuditCompare(entry.id)}
                              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                              style={{
                                borderColor: auditCompareIds.includes(entry.id)
                                  ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                                  : 'color-mix(in srgb, var(--border) 72%, transparent)',
                                background: auditCompareIds.includes(entry.id)
                                  ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                                  : 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {auditCompareIds.includes(entry.id)
                                ? t('ai.sidebar.historyProviderAuditCompareSelected')
                                : t('ai.sidebar.historyProviderAuditCompareAction')}
                            </button>
                            <button
                              type="button"
                              data-ai-sidebar-history-provider-audit-replay={entry.id}
                              onClick={() => handleReplayProviderAudit(entry.id)}
                              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                              style={{
                                borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                                background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {t('ai.sidebar.historyProviderAuditReplay')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.sidebar.historyProviderAuditEmpty')}
                  </div>
                )}
              </div>

              {displayedHistoryMatches.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {displayedHistoryMatches.slice(0, normalizedHistoryQuery ? 12 : 6).map((match) => {
                    const entry = match.candidate
                    return (
                      <SessionHistoryCard
                        key={`${entry.documentKey}:${entry.id}`}
                        entry={entry}
                        retrievalMatch={match}
                        locale={i18n.language}
                        documentLabel={entry.documentName}
                        documentDetail={formatHistoryDocumentDetail(entry.documentKey, t)}
                        reuseLabel={t('ai.sidebar.historyReuseHere')}
                        onTogglePin={() => {
                          const target = getHistoryStoreLookupArgs(entry.documentKey)
                          if (!target) return
                          toggleSessionHistoryPin(target.tabId, target.tabPath, entry.id)
                        }}
                        onRemove={() => {
                          const target = getHistoryStoreLookupArgs(entry.documentKey)
                          if (!target) return
                          removeSessionHistoryEntry(target.tabId, target.tabPath, entry.id)
                        }}
                        onReuse={() => {
                          dispatchEditorAIOpen({
                            source: SIDEBAR_TAB_SOURCE,
                            intent: entry.intent,
                            scope: entry.scope,
                            outputTarget: entry.outputTarget,
                            prompt: entry.prompt,
                          })
                          onClose()
                        }}
                        onRestore={
                          canRestoreHistorySource(entry.documentKey, openTabs)
                            ? async () => {
                                const restored = await restoreHistorySourceDocument(entry.documentKey, openTabs, setActiveTab)
                                if (!restored) return

                                dispatchEditorAIOpen({
                                  source: SIDEBAR_TAB_SOURCE,
                                  intent: entry.intent,
                                  scope: entry.scope,
                                  outputTarget: entry.outputTarget,
                                  prompt: entry.prompt,
                                })
                                onClose()
                              }
                            : undefined
                        }
                      />
                    )
                  })}
                </div>
              ) : (
                <div
                  data-ai-sidebar-cross-history-empty="true"
                  className="mt-3 rounded-2xl border px-4 py-4"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {normalizedHistoryQuery ? t('ai.sidebar.historyNoMatches') : t('ai.sidebar.crossDocumentHistoryEmpty')}
                  </div>
                  <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {normalizedHistoryQuery
                      ? t('ai.sidebar.historyNoMatchesDetail')
                      : t('ai.sidebar.crossDocumentHistoryEmptyDetail')}
                  </p>
                </div>
              )}
            </section>

            {normalizedDraft.trim().length > 0 && (
              <section
                className="rounded-[20px] border px-4 py-4"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.result.draft')}
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {truncateSidebarCopy(normalizedDraft, 420)}
                </p>
              </section>
            )}

            <p className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.sidebar.threadHint')}
            </p>
          </div>
        )}

        {view === 'commands' && (
          <div className="grid gap-3">
            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.sidebar.shortcutLabel')}
              </div>
              <div
                className="mt-3 inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                }}
              >
                {shortcut}
              </div>
              <p className="mt-3 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                {t('ai.sidebar.peekCommandsDetail')}
              </p>
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.sidebar.slashLabel')}
              </div>
              <div className="mt-3 grid gap-2">
                {slashCommands.map((entry) => (
                  <div
                    key={entry.id}
                    data-ai-sidebar-command={entry.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                    }}
                  >
                    <div
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                      }}
                    >
                      /{entry.label}
                    </div>
                    <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                      {entry.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}

function PeekMetric({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: IconName
  accent?: string
}) {
  return (
    <div
      className="rounded-[18px] border px-3 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
        background: 'color-mix(in srgb, var(--bg-secondary) 66%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <AppIcon name={icon} size={13} style={{ color: accent ?? 'var(--accent)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function PeekField({
  label,
  value,
  copyable = false,
  copyLabel,
  preformatted = false,
}: {
  label: string
  value: string
  copyable?: boolean
  copyLabel?: string
  preformatted?: boolean
}) {
  const canCopy = copyable && typeof navigator !== 'undefined' && 'clipboard' in navigator

  return (
    <div
      className="rounded-[20px] border px-4 py-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
        background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        {canCopy && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(value)
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              color: 'var(--text-muted)',
            }}
            title={copyLabel}
            aria-label={copyLabel}
          >
            <AppIcon name="copy" size={13} />
          </button>
        )}
      </div>
      <div
        className="mt-2 break-words text-xs leading-5"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
          whiteSpace: preformatted ? 'pre-wrap' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PeekPill({ label }: { label: string }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
  )
}

function SessionHistoryCard({
  entry,
  retrievalMatch,
  locale,
  documentLabel,
  documentDetail,
  reuseLabel,
  onTogglePin,
  onRemove,
  onReuse,
  onRestore,
}: {
  entry: AIDocumentSessionHistoryEntry & { documentKey?: string }
  retrievalMatch?: AIHistoryRetrievalMatch
  locale: string
  documentLabel?: string
  documentDetail?: string
  reuseLabel?: string
  onTogglePin?: () => void
  onRemove?: () => void
  onReuse: () => void
  onRestore?: (() => Promise<void>) | (() => void)
}) {
  const { t } = useTranslation()
  const status = getAISessionHistoryStatusMeta(entry.status, t)
  const sourceLabel = getAISidebarSourceLabel(entry.source, t)
  const hasResult = !!entry.resultPreview?.trim()
  const hasError = !!entry.errorMessage?.trim()
  const workspaceExecution = entry.workspaceExecution ?? null
  const workspaceTasksWithActivity = workspaceExecution
    ? workspaceExecution.tasks.filter((task) => task.status !== 'idle')
    : []
  const visibleWorkspaceTasks = workspaceTasksWithActivity.slice(0, 4)
  const hiddenWorkspaceTaskCount = Math.max(0, workspaceTasksWithActivity.length - visibleWorkspaceTasks.length)
  const semanticLabel =
    retrievalMatch?.matchKind === 'provider'
      ? t('ai.sidebar.historyMatchProvider')
      : retrievalMatch?.matchKind === 'semantic'
      ? t('ai.sidebar.historyMatchSemantic')
      : retrievalMatch?.matchKind === 'lexical'
        ? t('ai.sidebar.historyMatchLexical')
        : retrievalMatch?.matchKind === 'fuzzy'
          ? t('ai.sidebar.historyMatchFuzzy')
          : null

  return (
    <article
      data-ai-sidebar-session-history={entry.id}
      className="rounded-[22px] border px-4 py-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {documentLabel && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
              {documentLabel}
            </div>
          )}
          {documentDetail && (
            <div className="mt-1 break-words text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
              {documentDetail}
            </div>
          )}
          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t(`ai.intent.${entry.intent}`)} · {t(`ai.outputTarget.${entry.outputTarget}`)}
          </div>
          <div className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
            {formatSessionTimestamp(entry.updatedAt, locale)}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {entry.pinned && <PeekPill label={t('ai.sidebar.historyPinned')} />}
          {semanticLabel && <PeekPill label={semanticLabel} />}
          <PeekPill label={sourceLabel} />
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
              color: status.accent,
            }}
          >
            {status.label}
          </span>
          {entry.attachmentCount > 0 && <PeekPill label={t('ai.sidebar.historyAttachments', { count: entry.attachmentCount })} />}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.sidebar.historyPrompt')}
        </div>
        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
          {truncateSidebarCopy(entry.prompt, 220)}
        </p>
      </div>

      {retrievalMatch && retrievalMatch.matchedTerms.length > 0 && (
        <div
          data-ai-sidebar-session-match={entry.id}
          className="mt-3 text-[11px] leading-5"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('ai.sidebar.historyMatchedTerms', {
            terms: retrievalMatch.matchedTerms.join(', '),
          })}
        </div>
      )}

      {retrievalMatch?.matchKind === 'provider' && retrievalMatch.explanation && (
        <div
          data-ai-sidebar-session-provider-reason={entry.id}
          className="mt-3 text-[11px] leading-5"
          style={{ color: 'var(--text-muted)' }}
        >
          {retrievalMatch.explanation}
        </div>
      )}

      {hasResult && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.sidebar.historyResult')}
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {truncateSidebarCopy(entry.resultPreview ?? '', 220)}
          </p>
        </div>
      )}

      {hasError && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#b91c1c' }}>
            {t('ai.sidebar.historyError')}
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {truncateSidebarCopy(entry.errorMessage ?? '', 220)}
          </p>
        </div>
      )}

      {workspaceExecution && (
        <div
          data-ai-sidebar-session-workspace={entry.id}
          className="mt-3 rounded-[20px] border px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.sidebar.historyWorkspaceExecutionTitle')}
          </div>
          <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {formatHistoryWorkspaceExecutionSummary(workspaceExecution, t)}
          </div>

          {visibleWorkspaceTasks.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {visibleWorkspaceTasks.map((task) => {
                const status = getHistoryWorkspaceExecutionStatusMeta(task.status, t)
                return (
                  <div
                    key={`${entry.id}:${task.taskId}`}
                    data-ai-sidebar-session-workspace-task={task.taskId}
                    className="rounded-[18px] border px-3 py-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {task.title}
                        </div>
                        <div className="mt-1 break-words text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                          {formatHistoryWorkspaceTaskDescriptor(task, t)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {task.completionSource && (
                          <PeekPill label={t(`ai.workspaceExecution.completionSource.${task.completionSource}`)} />
                        )}
                        <span
                          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                            background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                            color: status.accent,
                          }}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                    {task.message && (
                      <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-secondary)' }}>
                        {truncateSidebarCopy(task.message, 180)}
                      </div>
                    )}
                    {(task.completionAt || typeof task.originRunId === 'number') && (
                      <div className="mt-2 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
                        {formatHistoryWorkspaceTaskMeta(task, locale, t)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.sidebar.historyWorkspaceExecutionNoActivity')}
            </div>
          )}

          {hiddenWorkspaceTaskCount > 0 && (
            <div className="mt-2 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.sidebar.historyWorkspaceExecutionMore', { count: hiddenWorkspaceTaskCount })}
            </div>
          )}
        </div>
      )}

      {entry.status === 'canceled' && !hasResult && !hasError && (
        <p className="mt-3 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
          {t('ai.sidebar.historyCanceledDetail')}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        {onTogglePin && (
          <button
            type="button"
            data-ai-sidebar-session-pin={entry.id}
            onClick={onTogglePin}
            className="mr-2 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              borderColor: entry.pinned
                ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                : 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: entry.pinned
                ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                : 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            <AppIcon name="bookmark" size={12} />
            <span>{entry.pinned ? t('ai.sidebar.historyUnpin') : t('ai.sidebar.historyPin')}</span>
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            data-ai-sidebar-session-remove={entry.id}
            onClick={onRemove}
            className="mr-2 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            <AppIcon name="trash" size={12} />
            <span>{t('ai.sidebar.historyRemove')}</span>
          </button>
        )}
        {onRestore && (
          <button
            type="button"
            data-ai-sidebar-session-restore={entry.id}
            onClick={() => void onRestore()}
            className="mr-2 inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            <AppIcon name="file" size={12} />
            <span>{t('ai.sidebar.historyRestoreSource')}</span>
          </button>
        )}
        <button
          type="button"
          data-ai-sidebar-session-reuse={entry.id}
          onClick={onReuse}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
            color: 'var(--text-primary)',
          }}
        >
          <AppIcon name="sparkles" size={12} />
          <span>{reuseLabel ?? t('ai.sidebar.historyReusePrompt')}</span>
        </button>
      </div>
    </article>
  )
}

function formatSessionTimestamp(value: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  } catch {
    return new Date(value).toLocaleString()
  }
}

function formatHistoryWorkspaceExecutionSummary(
  record: AIWorkspaceExecutionHistoryRecord,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return t('ai.sidebar.historyWorkspaceExecutionSummary', {
    total: record.taskCount,
    completed: record.completedCount,
    failed: record.failedCount,
    waiting: record.waitingCount,
  })
}

function formatHistoryWorkspaceTaskDescriptor(
  task: AIWorkspaceExecutionHistoryTaskRecord,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts = [
    task.phase,
    task.action === 'create-note'
      ? t('ai.workspaceExecution.actionCreate')
      : t('ai.workspaceExecution.actionUpdate'),
    task.target,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return parts.join(' · ')
}

function formatHistoryWorkspaceTaskMeta(
  task: AIWorkspaceExecutionHistoryTaskRecord,
  locale: string,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts: string[] = []

  if (typeof task.completionAt === 'number') {
    parts.push(
      t('ai.workspaceExecution.completionAt', {
        time: formatSessionTimestamp(task.completionAt, locale),
      })
    )
  }

  if (typeof task.originRunId === 'number') {
    parts.push(t('ai.workspaceExecution.originRun', { runId: task.originRunId }))
  }

  return parts.join(' · ')
}

function getHistoryWorkspaceExecutionStatusMeta(
  status: AIWorkspaceExecutionHistoryTaskRecord['status'],
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (status) {
    case 'waiting':
      return { label: t('ai.workspaceExecution.statusWaiting'), accent: '#2563eb' }
    case 'running':
      return { label: t('ai.workspaceExecution.statusRunning'), accent: 'var(--accent)' }
    case 'done':
      return { label: t('ai.workspaceExecution.statusDone'), accent: '#15803d' }
    case 'canceled':
      return { label: t('ai.workspaceExecution.statusCanceled'), accent: '#b45309' }
    case 'error':
      return { label: t('ai.workspaceExecution.statusError'), accent: '#b91c1c' }
    case 'idle':
    default:
      return { label: t('ai.workspaceExecution.statusReady'), accent: 'var(--text-muted)' }
  }
}

function formatHistoryDocumentDetail(
  documentKey: string,
  t: (key: string) => string
) {
  const parsed = parseAIDocumentThreadKey(documentKey)
  if (!parsed) return documentKey
  if (parsed.kind === 'path') return parsed.value
  return t('ai.sidebar.historyDraftDetail')
}

function getHistoryStoreLookupArgs(documentKey: string): { tabId: string; tabPath: string | null } | null {
  const parsed = parseAIDocumentThreadKey(documentKey)
  if (!parsed) return null

  if (parsed.kind === 'path') {
    return {
      tabId: parsed.value,
      tabPath: parsed.value,
    }
  }

  return {
    tabId: parsed.value,
    tabPath: null,
  }
}

function describeSavedView(
  view: { query: string; collectionId: string | null; retrievalPreset: AIHistorySavedViewRetrievalPreset },
  collections: readonly { id: string; name: string }[],
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts: string[] = []
  if (view.query) {
    parts.push(t('ai.sidebar.savedViewQueryDetail', { query: view.query }))
  }
  if (view.collectionId) {
    const collection = collections.find((item) => item.id === view.collectionId)
    if (collection) {
      parts.push(t('ai.sidebar.savedViewCollectionDetail', { name: collection.name }))
    }
  }
  parts.push(describeSavedViewRetrievalPreset(view.retrievalPreset, t))
  return parts.join(' · ') || t('ai.sidebar.savedViewEmpty')
}

function mapSavedViewStatusFilterToLocaleKey(filter: AIHistorySavedViewStatusFilter) {
  switch (filter) {
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'canceled':
      return 'canceled'
    case 'streaming':
      return 'streaming'
    case 'all':
    default:
      return 'all'
  }
}

function describeSavedViewRetrievalPreset(
  preset: AIHistorySavedViewRetrievalPreset,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts = [
    t(`ai.sidebar.historyFilterStatusOption.${mapSavedViewStatusFilterToLocaleKey(preset.statusFilter)}`),
  ]

  if (preset.pinnedOnly) parts.push(t('ai.sidebar.historyFilterPinnedOnly'))

  if (preset.providerBudgetOverride) {
    parts.push(
      t('ai.sidebar.savedViewPresetBudgetOverrideDetail', {
        budget: t(`ai.preferences.historyProviderBudgetOption.${preset.providerBudgetOverride}`),
      })
    )
  } else {
    parts.push(t('ai.sidebar.savedViewPresetBudgetInheritDetail'))
  }

  if (isAIHistorySavedViewRetrievalPresetCustomized(preset)) {
    parts.push(t('ai.sidebar.savedViewPresetCustom'))
  }

  return parts.join(' · ')
}

function mapCollectionPolicyModeToLocaleKey(
  mode: AIHistoryCollectionRetrievalPolicy['providerMode']
) {
  switch (mode) {
    case 'local-only':
      return 'localOnly'
    case 'allow-provider':
      return 'allowProvider'
    case 'inherit':
    default:
      return 'inherit'
  }
}

function describeHistoryCollectionRetrievalPolicy(
  policy: AIHistoryCollectionRetrievalPolicy,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts = [
    t(
      `ai.sidebar.collectionPolicyModeOption.${mapCollectionPolicyModeToLocaleKey(policy.providerMode)}`
    ),
  ]

  if (policy.providerBudgetOverride) {
    parts.push(
      t('ai.sidebar.collectionPolicyBudgetOverrideDetail', {
        budget: t(`ai.preferences.historyProviderBudgetOption.${policy.providerBudgetOverride}`),
      })
    )
  } else {
    parts.push(t('ai.sidebar.collectionPolicyBudgetInheritDetail'))
  }

  if (isAIHistoryCollectionRetrievalPolicyCustomized(policy)) {
    parts.push(t('ai.sidebar.collectionPolicyCustom'))
  }

  return parts.join(' · ')
}

function formatProviderPreviewFieldValue(
  value: string | null | undefined,
  t: (key: string) => string
) {
  const trimmed = value?.trim()
  return trimmed ? truncateSidebarCopy(trimmed, 180) : t('ai.sidebar.historyProviderPreviewRedacted')
}

function formatProviderAuditSummary(
  entry: {
    budget: string
    retrievalStatusFilter: AIHistorySavedViewStatusFilter
    retrievalPinnedOnly: boolean
    candidateCount: number
    sentCount: number
    providerModel: string | null
    collectionId: string | null
    savedViewId: string | null
  },
  collections: readonly { id: string; name: string }[],
  savedViews: readonly { id: string; name: string }[],
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts = [
    t(`ai.preferences.historyProviderBudgetOption.${entry.budget}`),
    t('ai.sidebar.historyProviderAuditCandidateCount', { count: entry.candidateCount }),
    t('ai.sidebar.historyProviderAuditSentCount', { count: entry.sentCount }),
    formatProviderAuditRetrievalSummary(entry, t),
  ]

  if (entry.providerModel) parts.push(entry.providerModel)
  if (entry.collectionId) {
    const collection = collections.find((item) => item.id === entry.collectionId)
    if (collection) parts.push(t('ai.sidebar.savedViewCollectionDetail', { name: collection.name }))
  }
  if (entry.savedViewId) {
    const savedView = savedViews.find((item) => item.id === entry.savedViewId)
    if (savedView) parts.push(savedView.name)
  }

  return parts.join(' · ')
}

function formatProviderAuditRetrievalSummary(
  entry: {
    retrievalStatusFilter: AIHistorySavedViewStatusFilter
    retrievalPinnedOnly: boolean
  },
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts = [
    t(`ai.sidebar.historyFilterStatusOption.${mapSavedViewStatusFilterToLocaleKey(entry.retrievalStatusFilter)}`),
  ]
  if (entry.retrievalPinnedOnly) parts.push(t('ai.sidebar.historyFilterPinnedOnly'))
  return parts.join(' · ')
}

function formatProviderAuditContextSummary(
  entry: {
    collectionId: string | null
    savedViewId: string | null
    providerModel: string | null
  },
  collections: readonly { id: string; name: string }[],
  savedViews: readonly { id: string; name: string }[],
  t: (key: string, values?: Record<string, string | number>) => string
) {
  const parts: string[] = []

  if (entry.providerModel) parts.push(entry.providerModel)
  if (entry.collectionId) {
    const collection = collections.find((item) => item.id === entry.collectionId)
    if (collection) parts.push(t('ai.sidebar.savedViewCollectionDetail', { name: collection.name }))
  }
  if (entry.savedViewId) {
    const savedView = savedViews.find((item) => item.id === entry.savedViewId)
    if (savedView) parts.push(t('ai.sidebar.historyProviderPreviewScopeSavedView', { name: savedView.name }))
  }

  return parts.join(' · ') || t('ai.sidebar.historyProviderPolicyGlobal')
}

function describeEffectiveHistoryProviderPolicySummary(args: {
  activeCollectionName: string | null
  collectionPolicy: AIHistoryCollectionRetrievalPolicy | null
  savedViewName: string | null
  savedViewPreset: AIHistorySavedViewRetrievalPreset | null
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const parts: string[] = []

  if (args.collectionPolicy && args.activeCollectionName) {
    parts.push(
      args.t('ai.sidebar.historyProviderPolicyCollection', {
        name: args.activeCollectionName,
        detail: describeHistoryCollectionRetrievalPolicy(args.collectionPolicy, args.t),
      })
    )
  } else {
    parts.push(args.t('ai.sidebar.historyProviderPolicyGlobal'))
  }

  if (args.savedViewPreset && args.savedViewName) {
    parts.push(
      args.t('ai.sidebar.historyProviderPolicySavedView', {
        name: args.savedViewName,
        detail: describeSavedViewRetrievalPreset(args.savedViewPreset, args.t),
      })
    )
  }

  return parts.join(' · ')
}

function canRestoreHistorySource(documentKey: string, tabs: ReturnType<typeof useEditorStore.getState>['tabs']) {
  const parsed = parseAIDocumentThreadKey(documentKey)
  if (!parsed) return false

  if (parsed.kind === 'path') {
    const normalizedPath = normalizeHistoryPath(parsed.value)
    const tabAlreadyOpen = tabs.some((tab) => normalizeHistoryPath(tab.path) === normalizedPath)
    const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    return tabAlreadyOpen || isDesktop
  }

  return tabs.some((tab) => tab.id === parsed.value)
}

async function restoreHistorySourceDocument(
  documentKey: string,
  tabs: ReturnType<typeof useEditorStore.getState>['tabs'],
  setActiveTab: ReturnType<typeof useEditorStore.getState>['setActiveTab']
) {
  const parsed = parseAIDocumentThreadKey(documentKey)
  if (!parsed) return false

  if (parsed.kind === 'path') {
    const normalizedPath = normalizeHistoryPath(parsed.value)
    const openTab = tabs.find((tab) => normalizeHistoryPath(tab.path) === normalizedPath)
    if (openTab) {
      setActiveTab(openTab.id)
    } else {
      const opened = await openDesktopDocumentPath(parsed.value)
      if (!opened) return false
    }
  } else {
    const draftTab = tabs.find((tab) => tab.id === parsed.value)
    if (!draftTab) return false
    setActiveTab(draftTab.id)
  }

  await waitForNextPaint()
  return true
}

function normalizeHistoryPath(path: string | null) {
  return path?.replace(/\\/g, '/') ?? null
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

function getPeekMeta(view: AISidebarPeekView, t: (key: string) => string): { icon: IconName; title: string; detail: string } {
  if (view === 'library') {
    return {
      icon: 'copy',
      title: t('ai.sidebar.peekLibrary'),
      detail: t('ai.sidebar.peekLibraryDetail'),
    }
  }

  if (view === 'session') {
    return {
      icon: 'clock',
      title: t('ai.sidebar.peekSession'),
      detail: t('ai.sidebar.peekSessionDetail'),
    }
  }

  return {
    icon: 'keyboard',
    title: t('ai.sidebar.peekCommands'),
    detail: t('ai.sidebar.peekCommandsDetail'),
  }
}
