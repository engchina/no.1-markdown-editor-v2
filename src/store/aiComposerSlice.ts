import type {
  AIApplySnapshot,
  AIComposerSource,
  AIComposerState,
  AIContextPacket,
  AIDraftFormat,
  AIExecutionTargetKind,
  AIIntent,
  AIInvocationCapability,
  AIKnowledgeSelection,
  AIOutputTarget,
  AIRetrievalResultPreview,
  AIRequestState,
  AIScope,
} from '../lib/ai/types.ts'

type SliceSet<T> = (partial: object | ((state: T) => object)) => void

export interface AIComposerSliceState {
  composer: AIComposerState
  openComposer: (args?: Partial<AIComposerState>) => void
  closeComposer: () => void
  setIntent: (intent: AIIntent) => void
  setScope: (scope: AIScope) => void
  setOutputTarget: (outputTarget: AIOutputTarget) => void
  setExecutionTargetKind: (executionTargetKind: AIExecutionTargetKind) => void
  setInvocationCapability: (invocationCapability: AIInvocationCapability) => void
  setKnowledgeSelection: (knowledgeSelection: AIKnowledgeSelection) => void
  setHostedAgentProfileId: (hostedAgentProfileId: string | null) => void
  setPrompt: (prompt: string) => void
  setContext: (context: AIContextPacket | null) => void
  setUseSlashCommandContext: (useSlashCommandContext: boolean) => void
  setUseSelectedTextContext: (useSelectedTextContext: boolean) => void
  setSource: (source: AIComposerSource) => void
  setDraftText: (draftText: string) => void
  setDraftFormat: (draftFormat: AIDraftFormat) => void
  appendDraftText: (chunk: string) => void
  setExplanationText: (explanationText: string) => void
  setWarningText: (warningText: string | null) => void
  setSourceLabel: (sourceLabel: string | null) => void
  setRetrievalExecuted: (retrievalExecuted: boolean) => void
  setRetrievalQuery: (retrievalQuery: string | null) => void
  setRetrievalResults: (retrievalResults: AIRetrievalResultPreview[]) => void
  setRetrievalResultCount: (retrievalResultCount: number | null) => void
  setGeneratedSql: (generatedSql: string | null) => void
  setStructuredExecutionStatus: (structuredExecutionStatus: string | null) => void
  setStructuredExecutionToolName: (structuredExecutionToolName: string | null) => void
  setDiffBaseText: (diffBaseText: string | null) => void
  setThreadId: (threadId: string | null) => void
  setSourceSnapshot: (sourceSnapshot: AIApplySnapshot | null) => void
  setRequestState: (requestState: AIRequestState) => void
  startRequest: () => void
  finishRequest: () => void
  failRequest: (errorMessage: string) => void
  resetDraftState: () => void
}

export function createInitialAIComposerState(): AIComposerState {
  return {
    open: false,
    source: 'shortcut',
    intent: 'ask',
    scope: 'current-block',
    outputTarget: 'chat-only',
    executionTargetKind: 'direct-provider',
    invocationCapability: 'text-generation',
    knowledgeSelection: { kind: 'none' },
    hostedAgentProfileId: null,
    prompt: '',
    context: null,
    useSlashCommandContext: true,
    useSelectedTextContext: true,
    requestState: 'idle',
    draftText: '',
    draftFormat: 'markdown',
    explanationText: '',
    warningText: null,
    sourceLabel: null,
    retrievalExecuted: false,
    retrievalQuery: null,
    retrievalResults: [],
    retrievalResultCount: null,
    generatedSql: null,
    structuredExecutionStatus: null,
    structuredExecutionToolName: null,
    diffBaseText: null,
    threadId: null,
    startedAt: null,
    errorMessage: null,
    sourceSnapshot: null,
  }
}

export function createAIComposerSlice<T extends AIComposerSliceState>(
  set: SliceSet<T>,
  options: {
    maxDraftTextLength: number
  }
): AIComposerSliceState {
  return {
    composer: createInitialAIComposerState(),
    openComposer: (args = {}) =>
      set((state) => ({
        composer: {
          ...state.composer,
          ...args,
          open: true,
          useSlashCommandContext: args.useSlashCommandContext ?? true,
          useSelectedTextContext: args.useSelectedTextContext ?? true,
          requestState: args.requestState ?? 'idle',
          startedAt: args.startedAt ?? null,
          errorMessage: args.errorMessage ?? null,
        },
      })),
    closeComposer: () => set({ composer: createInitialAIComposerState() } as Partial<T>),
    setIntent: (intent) => set((state) => ({ composer: { ...state.composer, intent } })),
    setScope: (scope) => set((state) => ({ composer: { ...state.composer, scope } })),
    setOutputTarget: (outputTarget) => set((state) => ({ composer: { ...state.composer, outputTarget } })),
    setExecutionTargetKind: (executionTargetKind) =>
      set((state) => ({ composer: { ...state.composer, executionTargetKind } })),
    setInvocationCapability: (invocationCapability) =>
      set((state) => ({ composer: { ...state.composer, invocationCapability } })),
    setKnowledgeSelection: (knowledgeSelection) =>
      set((state) => ({ composer: { ...state.composer, knowledgeSelection } })),
    setHostedAgentProfileId: (hostedAgentProfileId) =>
      set((state) => ({ composer: { ...state.composer, hostedAgentProfileId } })),
    setPrompt: (prompt) => set((state) => ({ composer: { ...state.composer, prompt } })),
    setContext: (context) => set((state) => ({ composer: { ...state.composer, context } })),
    setUseSlashCommandContext: (useSlashCommandContext) =>
      set((state) => ({ composer: { ...state.composer, useSlashCommandContext } })),
    setUseSelectedTextContext: (useSelectedTextContext) =>
      set((state) => ({ composer: { ...state.composer, useSelectedTextContext } })),
    setSource: (source) => set((state) => ({ composer: { ...state.composer, source } })),
    setDraftText: (draftText) => set((state) => ({ composer: { ...state.composer, draftText } })),
    setDraftFormat: (draftFormat) => set((state) => ({ composer: { ...state.composer, draftFormat } })),
    appendDraftText: (chunk) =>
      set((state) => {
        const current = state.composer.draftText
        if (current.length >= options.maxDraftTextLength) {
          return {}
        }
        const remaining = options.maxDraftTextLength - current.length
        const safeChunk = chunk.length > remaining ? chunk.slice(0, remaining) : chunk
        return { composer: { ...state.composer, draftText: `${current}${safeChunk}` } }
      }),
    setExplanationText: (explanationText) =>
      set((state) => ({ composer: { ...state.composer, explanationText } })),
    setWarningText: (warningText) =>
      set((state) => ({ composer: { ...state.composer, warningText } })),
    setSourceLabel: (sourceLabel) =>
      set((state) => ({ composer: { ...state.composer, sourceLabel } })),
    setRetrievalExecuted: (retrievalExecuted) =>
      set((state) => ({ composer: { ...state.composer, retrievalExecuted } })),
    setRetrievalQuery: (retrievalQuery) =>
      set((state) => ({ composer: { ...state.composer, retrievalQuery } })),
    setRetrievalResults: (retrievalResults) =>
      set((state) => ({ composer: { ...state.composer, retrievalResults } })),
    setRetrievalResultCount: (retrievalResultCount) =>
      set((state) => ({ composer: { ...state.composer, retrievalResultCount } })),
    setGeneratedSql: (generatedSql) =>
      set((state) => ({ composer: { ...state.composer, generatedSql } })),
    setStructuredExecutionStatus: (structuredExecutionStatus) =>
      set((state) => ({ composer: { ...state.composer, structuredExecutionStatus } })),
    setStructuredExecutionToolName: (structuredExecutionToolName) =>
      set((state) => ({ composer: { ...state.composer, structuredExecutionToolName } })),
    setDiffBaseText: (diffBaseText) => set((state) => ({ composer: { ...state.composer, diffBaseText } })),
    setThreadId: (threadId) => set((state) => ({ composer: { ...state.composer, threadId } })),
    setSourceSnapshot: (sourceSnapshot) => set((state) => ({ composer: { ...state.composer, sourceSnapshot } })),
    setRequestState: (requestState) =>
      set((state) => ({
        composer: {
          ...state.composer,
          requestState,
          startedAt: requestState === 'streaming' ? Date.now() : state.composer.startedAt,
        },
      })),
    startRequest: () =>
      set((state) => ({
        composer: {
          ...state.composer,
          requestState: 'streaming',
          startedAt: Date.now(),
          errorMessage: null,
          draftText: '',
          draftFormat: 'markdown',
          explanationText: '',
          warningText: null,
          sourceLabel: null,
          retrievalExecuted: false,
          retrievalQuery: null,
          retrievalResults: [],
          retrievalResultCount: null,
          generatedSql: null,
          structuredExecutionStatus: null,
          structuredExecutionToolName: null,
        },
      })),
    finishRequest: () =>
      set((state) => ({
        composer: {
          ...state.composer,
          requestState: 'done',
          errorMessage: null,
        },
      })),
    failRequest: (errorMessage) =>
      set((state) => ({
        composer: {
          ...state.composer,
          requestState: 'error',
          errorMessage,
        },
      })),
    resetDraftState: () =>
      set((state) => ({
        composer: {
          ...state.composer,
          requestState: 'idle',
          draftText: '',
          draftFormat: 'markdown',
          explanationText: '',
          warningText: null,
          sourceLabel: null,
          retrievalExecuted: false,
          retrievalQuery: null,
          retrievalResults: [],
          retrievalResultCount: null,
          generatedSql: null,
          structuredExecutionStatus: null,
          structuredExecutionToolName: null,
          diffBaseText: null,
          errorMessage: null,
          startedAt: null,
        },
      })),
  }
}
