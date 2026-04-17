import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialAIComposerState, useAIStore } from '../src/store/ai.ts'

test('AI store opens composer, tracks request lifecycle, and closes cleanly', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  useAIStore.getState().openComposer({ source: 'shortcut', intent: 'generate', outputTarget: 'at-cursor' })
  assert.equal(useAIStore.getState().composer.open, true)
  assert.equal(useAIStore.getState().composer.intent, 'generate')
  assert.equal(useAIStore.getState().composer.outputTarget, 'at-cursor')

  useAIStore.getState().setRetrievalQuery('Who is Mei\'s sister?')
  useAIStore.getState().setRetrievalExecuted(true)
  useAIStore.getState().setRetrievalResults([
    {
      title: 'totoro-character-guide.md',
      detail: 'references/totoro-character-guide.md',
      snippet: 'Satsuki is Mei\'s older sister.',
    },
  ])
  useAIStore.getState().setRetrievalResultCount(1)

  useAIStore.getState().startRequest()
  assert.equal(useAIStore.getState().composer.requestState, 'streaming')
  assert.equal(useAIStore.getState().composer.retrievalExecuted, false)
  assert.equal(useAIStore.getState().composer.retrievalQuery, null)
  assert.equal(useAIStore.getState().composer.retrievalResults.length, 0)
  assert.equal(useAIStore.getState().composer.retrievalResultCount, null)

  useAIStore.getState().appendDraftText('Hello')
  useAIStore.getState().appendDraftText(' world')
  assert.equal(useAIStore.getState().composer.draftText, 'Hello world')

  useAIStore.getState().finishRequest()
  assert.equal(useAIStore.getState().composer.requestState, 'done')

  useAIStore.getState().closeComposer()
  assert.deepEqual(useAIStore.getState().composer, createInitialAIComposerState())
})

test('AI store binds thread ids by saved path or draft id', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  useAIStore.getState().bindThreadId('tab-1', 'notes/demo.md', 'thread-a')
  useAIStore.getState().bindThreadId('draft-1', null, 'thread-b')

  assert.equal(useAIStore.getState().getThreadId('tab-1', 'notes/demo.md'), 'thread-a')
  assert.equal(useAIStore.getState().getThreadId('draft-1', null), 'thread-b')
})

test('AI store tracks transient provenance marks by tab', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  useAIStore.getState().addProvenanceMark('tab-1', {
    id: 'mark-1',
    from: 0,
    to: 10,
    badge: 'AI',
    detail: 'AI-applied content',
    kind: 'apply',
    createdAt: 1,
  })
  assert.equal(useAIStore.getState().getProvenanceMarks('tab-1').length, 1)

  useAIStore.getState().setProvenanceMarks('tab-1', [
    {
      id: 'mark-2',
      from: 5,
      to: 12,
      badge: 'AI',
      detail: 'Accepted AI ghost text continuation',
      kind: 'ghost-text',
      createdAt: 2,
    },
  ])
  assert.deepEqual(
    useAIStore.getState().getProvenanceMarks('tab-1').map((mark) => mark.id),
    ['mark-2']
  )

  useAIStore.getState().clearProvenanceMarks('tab-1')
  assert.deepEqual(useAIStore.getState().getProvenanceMarks('tab-1'), [])
})

test('AI store creates per-document session history entries and binds a thread on first request', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const started = useAIStore.getState().startSessionHistory({
    tabId: 'tab-1',
    tabPath: 'notes/demo.md',
    documentName: 'demo.md',
    source: 'shortcut',
    intent: 'ask',
    scope: 'current-block',
    outputTarget: 'chat-only',
    prompt: 'Summarize the current draft',
    attachmentCount: 2,
  })

  assert.equal(useAIStore.getState().getThreadId('tab-1', 'notes/demo.md'), started.threadId)

  useAIStore.getState().updateSessionHistory('tab-1', 'notes/demo.md', started.entryId, {
    status: 'done',
    resultPreview: 'A concise summary',
    errorMessage: null,
  })

  const history = useAIStore.getState().getSessionHistory('tab-1', 'notes/demo.md')
  assert.equal(history.length, 1)
  assert.equal(history[0]?.threadId, started.threadId)
  assert.equal(history[0]?.status, 'done')
  assert.equal(history[0]?.resultPreview, 'A concise summary')
  assert.equal(history[0]?.attachmentCount, 2)
})

test('AI store persists workspace execution provenance on session history entries and archives', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const started = useAIStore.getState().startSessionHistory({
    tabId: 'tab-workspace-history',
    tabPath: 'notes/workspace.md',
    documentName: 'workspace.md',
    source: 'command-palette',
    intent: 'generate',
    scope: 'document',
    outputTarget: 'chat-only',
    prompt: 'Draft a coordinated workspace plan',
    attachmentCount: 2,
  })

  useAIStore.getState().updateSessionHistory('tab-workspace-history', 'notes/workspace.md', started.entryId, {
    status: 'done',
    resultPreview: '<!-- ai-workspace-task -->',
    errorMessage: null,
    workspaceExecution: {
      summary: '- Draft launch docs',
      taskCount: 2,
      completedCount: 1,
      failedCount: 0,
      waitingCount: 1,
      updatedAt: 1700000001000,
      tasks: [
        {
          taskId: 'task-1',
          action: 'update-note',
          title: 'Launch Plan',
          target: 'launch-plan.md',
          phase: 'Planning',
          status: 'done',
          message: 'Updated launch plan',
          completionSource: 'manual-apply',
          completionAt: 1700000000000,
          originRunId: null,
        },
        {
          taskId: 'task-2',
          action: 'create-note',
          title: 'Launch Checklist',
          target: 'launch-checklist.md',
          phase: 'Delivery',
          status: 'waiting',
          message: 'Waiting for Launch Plan',
          completionSource: null,
          completionAt: null,
          originRunId: null,
        },
      ],
    },
  })

  const history = useAIStore.getState().getSessionHistory('tab-workspace-history', 'notes/workspace.md')
  assert.equal(history[0]?.workspaceExecution?.taskCount, 2)
  assert.equal(history[0]?.workspaceExecution?.tasks[0]?.completionSource, 'manual-apply')

  const archive = useAIStore.getState().exportHistoryArchive()
  assert.equal(
    archive.sessionHistoryByDocument['path:notes/workspace.md']?.[0]?.workspaceExecution?.tasks[1]?.status,
    'waiting'
  )

  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  useAIStore.getState().importHistoryArchive(archive)
  const imported = useAIStore.getState().getSessionHistory('tab-workspace-history', 'notes/workspace.md')
  assert.equal(imported[0]?.workspaceExecution?.completedCount, 1)
  assert.equal(imported[0]?.workspaceExecution?.tasks[0]?.completionAt, 1700000000000)
  assert.equal(imported[0]?.workspaceExecution?.tasks[1]?.message, 'Waiting for Launch Plan')
})

test('AI store can rekey, remap, and remove persisted document history safely', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const draftStarted = useAIStore.getState().startSessionHistory({
    tabId: 'draft-1',
    tabPath: null,
    documentName: 'Untitled',
    source: 'shortcut',
    intent: 'generate',
    scope: 'current-block',
    outputTarget: 'new-note',
    prompt: 'Draft a release note',
    attachmentCount: 0,
  })

  useAIStore.getState().rekeyDocumentHistory('draft-1', null, 'notes/release.md')
  assert.equal(useAIStore.getState().getSessionHistory('draft-1', null).length, 0)
  assert.equal(useAIStore.getState().getSessionHistory('draft-1', 'notes/release.md').length, 1)
  assert.equal(useAIStore.getState().getThreadId('draft-1', 'notes/release.md'), draftStarted.threadId)

  useAIStore.getState().remapHistoryForPathChange('notes/release.md', 'archive/release.md')
  assert.equal(useAIStore.getState().getSessionHistory('draft-1', 'notes/release.md').length, 0)
  assert.equal(useAIStore.getState().getSessionHistory('draft-1', 'archive/release.md').length, 1)

  useAIStore.getState().removeHistoryByPathPrefix('archive')
  assert.equal(useAIStore.getState().getSessionHistory('draft-1', 'archive/release.md').length, 0)
  assert.equal(useAIStore.getState().getThreadId('draft-1', 'archive/release.md'), null)
})

test('AI store keeps pinned history while tighter retention presets trim unpinned runs', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const entryIds: string[] = []
  for (let index = 0; index < 8; index += 1) {
    const started = useAIStore.getState().startSessionHistory({
      tabId: 'tab-compact',
      tabPath: 'notes/compact.md',
      documentName: 'compact.md',
      source: 'shortcut',
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: `Prompt ${index}`,
      attachmentCount: 0,
    })
    entryIds.push(started.entryId)
    useAIStore.getState().updateSessionHistory('tab-compact', 'notes/compact.md', started.entryId, {
      status: 'done',
      resultPreview: `Result ${index}`,
      errorMessage: null,
    })
  }

  useAIStore.getState().toggleSessionHistoryPin('tab-compact', 'notes/compact.md', entryIds[7]!)
  useAIStore.getState().setHistoryRetentionPreset('compact')

  const history = useAIStore.getState().getSessionHistory('tab-compact', 'notes/compact.md')
  assert.ok(history.some((entry) => entry.id === entryIds[7] && entry.pinned))
  assert.ok(history.filter((entry) => !entry.pinned).length <= 5)
})

test('AI store can export and import history archives', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'extended',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const started = useAIStore.getState().startSessionHistory({
    tabId: 'tab-export',
    tabPath: 'notes/export.md',
    documentName: 'export.md',
    source: 'shortcut',
    intent: 'review',
    scope: 'current-block',
    outputTarget: 'chat-only',
    prompt: 'Review the release summary',
    attachmentCount: 1,
  })
  useAIStore.getState().updateSessionHistory('tab-export', 'notes/export.md', started.entryId, {
    status: 'done',
    resultPreview: 'Reviewed summary.',
    errorMessage: null,
    pinned: true,
  })
  const exportedCollectionId = useAIStore.getState().createHistoryCollection('Archive Export', [
    { documentKey: 'path:notes/export.md', entryId: started.entryId },
  ], {
    retrievalPolicy: {
      providerMode: 'local-only',
      providerBudgetOverride: 'conservative',
    },
  })
  const exportedViewId = useAIStore.getState().createHistorySavedView('Archive View', {
    query: 'release summary',
    collectionId: exportedCollectionId,
    retrievalPreset: {
      statusFilter: 'error',
      pinnedOnly: true,
      providerBudgetOverride: 'deep',
      automationMode: 'workspace-run-draft',
    },
  })
  useAIStore.getState().addHistoryProviderRerankAudit({
    query: 'review export history',
    budget: 'conservative',
    collectionId: exportedCollectionId,
    savedViewId: exportedViewId,
    retrievalStatusFilter: 'error',
    retrievalPinnedOnly: true,
    candidateCount: 4,
    sentCount: 3,
    providerModel: 'mock-ai-model',
    status: 'success',
    errorMessage: null,
  })

  const archive = useAIStore.getState().exportHistoryArchive()
  assert.equal(archive.version, 1)
  assert.equal(archive.historyRetentionPreset, 'extended')
  assert.equal(archive.sessionHistoryByDocument['path:notes/export.md']?.[0]?.pinned, true)
  assert.equal(archive.historyCollections?.[0]?.id, exportedCollectionId)
  assert.equal(archive.historyCollections?.[0]?.retrievalPolicy.providerMode, 'local-only')
  assert.equal(archive.historyCollections?.[0]?.retrievalPolicy.providerBudgetOverride, 'conservative')
  assert.equal(archive.historySavedViews?.[0]?.id, exportedViewId)
  assert.equal(archive.historySavedViews?.[0]?.retrievalPreset.statusFilter, 'error')
  assert.equal(archive.historySavedViews?.[0]?.retrievalPreset.pinnedOnly, true)
  assert.equal(archive.historySavedViews?.[0]?.retrievalPreset.providerBudgetOverride, 'deep')
  assert.equal(archive.historySavedViews?.[0]?.retrievalPreset.automationMode, 'workspace-run-draft')
  assert.equal(archive.historyProviderRerankAudit?.[0]?.providerModel, 'mock-ai-model')
  assert.equal(archive.historyProviderRerankAudit?.[0]?.retrievalStatusFilter, 'error')
  assert.equal(archive.historyProviderRerankAudit?.[0]?.retrievalPinnedOnly, true)

  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'compact',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const imported = useAIStore.getState().importHistoryArchive(archive)
  assert.equal(imported.documentCount, 1)
  assert.equal(imported.entryCount, 1)
  assert.equal(imported.auditCount, 1)
  assert.equal(useAIStore.getState().getSessionHistory('tab-export', 'notes/export.md')[0]?.prompt, 'Review the release summary')
  assert.equal(useAIStore.getState().getSessionHistory('tab-export', 'notes/export.md')[0]?.pinned, true)
  assert.equal(useAIStore.getState().historyCollections[0]?.name, 'Archive Export')
  assert.equal(useAIStore.getState().historyCollections[0]?.retrievalPolicy.providerMode, 'local-only')
  assert.equal(useAIStore.getState().historyCollections[0]?.retrievalPolicy.providerBudgetOverride, 'conservative')
  assert.equal(useAIStore.getState().historySavedViews[0]?.name, 'Archive View')
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.statusFilter, 'error')
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.pinnedOnly, true)
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.providerBudgetOverride, 'deep')
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.automationMode, 'workspace-run-draft')
  assert.equal(useAIStore.getState().historyProviderRerankAudit[0]?.providerModel, 'mock-ai-model')
  assert.equal(useAIStore.getState().historyProviderRerankAudit[0]?.retrievalStatusFilter, 'error')
  assert.equal(useAIStore.getState().historyProviderRerankAudit[0]?.retrievalPinnedOnly, true)
})

test('AI store migrates legacy sidebar-tab history sources to command-palette', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const imported = useAIStore.getState().importHistoryArchive({
    version: 1,
    exportedAt: 1,
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {
      'path:notes/legacy.md': 'thread-legacy',
    },
    sessionHistoryByDocument: {
      'path:notes/legacy.md': [
        {
          id: 'legacy-entry',
          threadId: 'thread-legacy',
          pinned: false,
          source: 'sidebar-tab',
          intent: 'ask',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Legacy sidebar request',
          resultPreview: 'Legacy result',
          errorMessage: null,
          status: 'done',
          documentName: 'legacy.md',
          attachmentCount: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
  })

  assert.equal(imported.entryCount, 1)
  assert.equal(useAIStore.getState().getSessionHistory('legacy-tab', 'notes/legacy.md')[0]?.source, 'command-palette')
  assert.equal(
    useAIStore.getState().exportHistoryArchive().sessionHistoryByDocument['path:notes/legacy.md']?.[0]?.source,
    'command-palette'
  )
})

test('AI store can create collections and saved views from persistent history', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const started = useAIStore.getState().startSessionHistory({
    tabId: 'tab-collections',
    tabPath: 'notes/collections.md',
    documentName: 'collections.md',
    source: 'shortcut',
    intent: 'review',
    scope: 'current-block',
    outputTarget: 'chat-only',
    prompt: 'Review the collections flow',
    attachmentCount: 0,
  })
  useAIStore.getState().updateSessionHistory('tab-collections', 'notes/collections.md', started.entryId, {
    status: 'done',
    resultPreview: 'Collections look good.',
    errorMessage: null,
  })

  const collectionId = useAIStore.getState().createHistoryCollection('Release Prep', [
    { documentKey: 'path:notes/collections.md', entryId: started.entryId },
  ])
  assert.ok(collectionId)
  assert.equal(useAIStore.getState().historyCollections.length, 1)
  assert.equal(useAIStore.getState().historyCollections[0]?.retrievalPolicy.providerMode, 'inherit')

  useAIStore.getState().updateHistoryCollectionPolicy(collectionId!, {
    providerMode: 'allow-provider',
    providerBudgetOverride: 'deep',
  })
  assert.equal(useAIStore.getState().historyCollections[0]?.retrievalPolicy.providerMode, 'allow-provider')
  assert.equal(useAIStore.getState().historyCollections[0]?.retrievalPolicy.providerBudgetOverride, 'deep')

  const viewId = useAIStore.getState().createHistorySavedView('Review Flow', {
    query: 'collections flow',
    collectionId: collectionId!,
    retrievalPreset: {
      statusFilter: 'done',
      pinnedOnly: false,
      providerBudgetOverride: 'balanced',
      automationMode: 'manual',
    },
  })
  assert.ok(viewId)
  assert.equal(useAIStore.getState().historySavedViews.length, 1)
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.providerBudgetOverride, 'balanced')

  useAIStore.getState().updateHistorySavedViewRetrievalPreset(viewId!, {
    statusFilter: 'error',
    pinnedOnly: true,
    providerBudgetOverride: 'deep',
    automationMode: 'provider-ranked-workspace-run-draft',
  })
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.statusFilter, 'error')
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.pinnedOnly, true)
  assert.equal(useAIStore.getState().historySavedViews[0]?.retrievalPreset.providerBudgetOverride, 'deep')
  assert.equal(
    useAIStore.getState().historySavedViews[0]?.retrievalPreset.automationMode,
    'provider-ranked-workspace-run-draft'
  )

  useAIStore.getState().deleteHistoryCollection(collectionId!)
  assert.equal(useAIStore.getState().historyCollections.length, 0)
  assert.equal(useAIStore.getState().historySavedViews[0]?.collectionId, null)

  useAIStore.getState().deleteHistorySavedView(viewId!)
  assert.equal(useAIStore.getState().historySavedViews.length, 0)
})

test('AI store migrates legacy saved-view workspaceRunOnApply flags into automationMode', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  const imported = useAIStore.getState().importHistoryArchive({
    version: 1,
    exportedAt: 1,
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {
      'path:notes/legacy.md': 'thread-legacy',
    },
    sessionHistoryByDocument: {
      'path:notes/legacy.md': [
        {
          id: 'legacy-entry',
          threadId: 'thread-legacy',
          pinned: false,
          source: 'shortcut',
          intent: 'ask',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Legacy prompt',
          resultPreview: null,
          errorMessage: null,
          status: 'done',
          documentName: 'legacy.md',
          attachmentCount: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    historyCollections: [],
    historySavedViews: [
      {
        id: 'legacy-view',
        name: 'Legacy View',
        query: 'legacy',
        collectionId: null,
        retrievalPreset: {
          statusFilter: 'all',
          pinnedOnly: false,
          providerBudgetOverride: null,
          workspaceRunOnApply: true,
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  })

  assert.equal(imported.entryCount, 1)
  assert.equal(
    useAIStore.getState().historySavedViews[0]?.retrievalPreset.automationMode,
    'workspace-run-draft'
  )
})

test('AI store keeps a bounded provider rerank audit trail', () => {
  useAIStore.setState({
    composer: createInitialAIComposerState(),
    historyRetentionPreset: 'standard',
    threadIdsByDocument: {},
    sessionHistoryByDocument: {},
    historyCollections: [],
    historySavedViews: [],
    historyProviderRerankAudit: [],
    provenanceMarksByTab: {},
  })

  useAIStore.getState().addHistoryProviderRerankAudit({
    query: 'translate release summary',
    budget: 'balanced',
    collectionId: null,
    savedViewId: null,
    retrievalStatusFilter: 'all',
    retrievalPinnedOnly: false,
    candidateCount: 8,
    sentCount: 6,
    providerModel: 'mock-ai-model',
    status: 'success',
    errorMessage: null,
  })

  const audit = useAIStore.getState().historyProviderRerankAudit
  assert.equal(audit.length, 1)
  assert.equal(audit[0]?.providerModel, 'mock-ai-model')
  assert.equal(audit[0]?.sentCount, 6)
  assert.equal(audit[0]?.status, 'success')
  assert.equal(audit[0]?.retrievalStatusFilter, 'all')
})
