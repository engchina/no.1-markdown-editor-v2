import { invoke } from '@tauri-apps/api/core'
import type {
  AICompletionStreamChunk,
  AIProviderConfig,
  AIProviderState,
  AIRunCompletionRequest,
  AIRunCompletionResponse,
} from './types.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const AI_BROWSER_MOCK_FLAG = 'no1-ai-mock-provider'
const AI_COMPLETION_STREAM_EVENT = 'ai:completion-stream'
const mockRequests = new Map<string, { reject: (reason?: unknown) => void; timeoutId: number }>()

interface AIRunCompletionOptions {
  onChunk?: (chunk: string) => void
}

export function isAIDesktopAvailable(): boolean {
  return isTauri
}

export function isAIBrowserMockAvailable(): boolean {
  return isAIBrowserMockEnabled()
}

export function isAIRuntimeAvailable(): boolean {
  return isTauri || isAIBrowserMockEnabled()
}

export async function loadAIProviderState(): Promise<AIProviderState> {
  if (isAIBrowserMockEnabled()) {
    return {
      config: {
        provider: 'oci-responses',
        baseUrl: 'https://mock.invalid/openai/v1',
        model: 'mock-ai-model',
        project: 'ocid1.project.oc1..mock',
        unstructuredStores: [
          {
            id: 'docs-default',
            label: 'Product Docs',
            vectorStoreId: 'vs_mock_docs',
            description: 'Mock unstructured knowledge base',
            enabled: true,
            isDefault: true,
          },
        ],
        structuredStores: [
          {
            id: 'data-default',
            label: 'Analytics Schema',
            semanticStoreId: 'semantic_mock_analytics',
            vectorStoreId: 'vs_mock_data',
            storeOcid: 'ocid1.generativeaivectorstore.oc1..mock',
            description: 'Mock semantic store',
            enabled: true,
            defaultMode: 'sql-draft',
            executionAgentProfileId: 'hosted-agent-default',
          },
        ],
        hostedAgentProfiles: [
          {
            id: 'hosted-agent-default',
            label: 'Analytics Agent',
            endpointUrl: 'https://mock.invalid/hosted-agent',
            invokePath: 'chat',
            domainUrl: 'https://mock.identity.oraclecloud.com',
            clientId: 'mock-client-id',
            scope: 'urn:opc:resource:consumer::all',
            audience: '',
            transport: 'http-json',
            supportedContracts: ['chat-text', 'structured-data-answer'],
          },
        ],
      },
      hasApiKey: true,
      storageKind: 'unsupported',
      hasHostedAgentClientSecretById: {
        'hosted-agent-default': true,
      },
    }
  }

  assertTauriAIAvailable()
  return invoke<AIProviderState>('ai_load_provider_state')
}

export async function saveAIProviderConfig(config: AIProviderConfig): Promise<AIProviderConfig> {
  if (isAIBrowserMockEnabled()) {
    return config
  }

  assertTauriAIAvailable()
  return invoke<AIProviderConfig>('ai_save_provider_config', { config })
}

export async function storeAIProviderApiKey(apiKey: string): Promise<void> {
  if (isAIBrowserMockEnabled()) {
    void apiKey
    return
  }

  assertTauriAIAvailable()
  await invoke('ai_store_provider_api_key', { apiKey })
}

export async function clearAIProviderApiKey(): Promise<void> {
  if (isAIBrowserMockEnabled()) return

  assertTauriAIAvailable()
  await invoke('ai_clear_provider_api_key')
}

export async function storeAIHostedAgentClientSecret(profileId: string, clientSecret: string): Promise<void> {
  if (isAIBrowserMockEnabled()) {
    void profileId
    void clientSecret
    return
  }

  assertTauriAIAvailable()
  await invoke('ai_store_hosted_agent_client_secret', { profileId, clientSecret })
}

export async function clearAIHostedAgentClientSecret(profileId: string): Promise<void> {
  if (isAIBrowserMockEnabled()) {
    void profileId
    return
  }

  assertTauriAIAvailable()
  await invoke('ai_clear_hosted_agent_client_secret', { profileId })
}

export async function runAICompletion(
  request: AIRunCompletionRequest,
  options: AIRunCompletionOptions = {}
): Promise<AIRunCompletionResponse> {
  if (isAIBrowserMockEnabled()) {
    return runBrowserMockCompletion(request, options)
  }

  assertTauriAIAvailable()

  let unlistenStream: (() => void) | undefined

  if (options.onChunk) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const currentWindow = getCurrentWindow()
    unlistenStream = await currentWindow.listen<AICompletionStreamChunk>(
      AI_COMPLETION_STREAM_EVENT,
      (event) => {
        const payload = event.payload
        if (!payload || payload.requestId !== request.requestId || !payload.chunk) return
        options.onChunk?.(payload.chunk)
      }
    )
  }

  try {
    return await invoke<AIRunCompletionResponse>('ai_run_completion', { request })
  } finally {
    unlistenStream?.()
  }
}

export async function cancelAICompletion(requestId: string): Promise<boolean> {
  if (isAIBrowserMockEnabled()) {
    const pending = mockRequests.get(requestId)
    if (!pending) return false
    clearTimeout(pending.timeoutId)
    mockRequests.delete(requestId)
    pending.reject(new Error('AI request was canceled'))
    return true
  }

  assertTauriAIAvailable()
  return invoke<boolean>('ai_cancel_completion', { requestId })
}

function assertTauriAIAvailable(): void {
  if (!isTauri) {
    throw new Error('AI desktop provider commands are unavailable outside the Tauri runtime.')
  }
}

function isAIBrowserMockEnabled(): boolean {
  if (typeof window === 'undefined' || isTauri) return false
  return window.localStorage.getItem(AI_BROWSER_MOCK_FLAG) === '1'
}

function runBrowserMockCompletion(
  request: AIRunCompletionRequest,
  options: AIRunCompletionOptions
): Promise<AIRunCompletionResponse> {
  return new Promise((resolve, reject) => {
    const response = buildBrowserMockResponse(request)
    const chunks = buildBrowserMockChunks(response.text)
    let chunkIndex = 0
    const pendingRequest = {
      reject,
      timeoutId: 0,
    }

    const flushNextChunk = () => {
      pendingRequest.timeoutId = window.setTimeout(() => {
        const nextChunk = chunks[chunkIndex]
        if (nextChunk) {
          options.onChunk?.(nextChunk)
          chunkIndex += 1
        }

        if (chunkIndex < chunks.length) {
          flushNextChunk()
          return
        }

        mockRequests.delete(request.requestId)
        resolve({
          ...response,
          requestId: request.requestId,
        })
      }, 220)
    }

    flushNextChunk()
    mockRequests.set(request.requestId, pendingRequest)
  })
}

function buildBrowserMockResponse(request: AIRunCompletionRequest): Omit<AIRunCompletionResponse, 'requestId'> {
  const prompt = request.prompt.toLowerCase()
  const noRetrieval = {
    retrievalExecuted: false,
    retrievalQuery: null,
    retrievalResults: [],
    retrievalResultCount: null,
  }

  if (prompt.includes('[ai-history-ranking]')) {
    return {
      text: buildBrowserMockHistoryRerankText(request.prompt),
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: 'text',
      explanationText: null,
      warningText: null,
      sourceLabel: null,
      ...noRetrieval,
    }
  }

  if (request.knowledgeSelection.kind === 'oracle-structured-store' && request.knowledgeSelection.mode === 'sql-draft') {
    return {
      text: [
        'SELECT customer_name, total_amount',
        'FROM sales_orders',
        'WHERE order_status = \'OPEN\'',
        'ORDER BY total_amount DESC',
        'FETCH FIRST 10 ROWS ONLY;',
      ].join('\n'),
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: 'sql',
      explanationText: 'Drafted from the selected semantic store using the current natural-language request.',
      warningText: 'Review table names and predicates before running this SQL against production data.',
      sourceLabel: 'Analytics Schema',
      ...noRetrieval,
    }
  }

  if (request.executionTargetKind === 'oracle-hosted-agent') {
    return {
      text: 'Hosted analytics agent answered the structured query and summarized the result set.',
      finishReason: 'stop',
      model: 'mock-hosted-agent',
      threadId: request.threadId ?? `thread-${Date.now().toString(36)}`,
      contentType: 'markdown',
      explanationText: 'Returned by the configured Oracle hosted agent profile.',
      warningText: null,
      sourceLabel: 'Analytics Agent',
      ...noRetrieval,
    }
  }

  if (prompt.includes('ai-workspace-task') || prompt.includes('workspace execution plan')) {
    const primaryTarget =
      request.context.explicitContextAttachments?.find((attachment) => attachment.kind === 'note')?.label ??
      request.context.fileName

    return {
      text: [
        '<!-- ai-workspace-summary -->',
        '- Coordinate the attached note context into a single workspace pass.',
        '- Draft one update for an existing note and one follow-up note for review.',
        '<!-- /ai-workspace-summary -->',
        '',
        `<!-- ai-workspace-task action="update-note" target="${primaryTarget}" title="${primaryTarget} Draft" -->`,
        `# ${stripMarkdownExtension(primaryTarget)} Update`,
        '',
        '- Align the key checklist items across the attached notes.',
        '- Preserve the document structure while tightening the wording.',
        '<!-- /ai-workspace-task -->',
        '',
        '<!-- ai-workspace-task action="create-note" target="release-checklist.md" title="release-checklist.md" -->',
        '# Release Checklist',
        '',
        '- Verify the coordinated workspace changes.',
        '- Confirm follow-up owners and next review date.',
        '<!-- /ai-workspace-task -->',
      ].join('\n'),
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: 'markdown',
      explanationText: null,
      warningText: null,
      sourceLabel: null,
      ...noRetrieval,
    }
  }

  if (request.knowledgeSelection.kind === 'oracle-unstructured-store') {
    return {
      text: 'Grounded answer using the selected Oracle document store.',
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: request.outputTarget === 'chat-only' ? 'text' : 'markdown',
      explanationText: 'Generated with file search over the selected unstructured store.',
      warningText: null,
      sourceLabel: 'Product Docs',
      retrievalExecuted: true,
      retrievalQuery: request.prompt.trim() || 'vector search query',
      retrievalResults: [
        {
          title: 'mei-family-notes.md',
          detail: 'references/mei-family-notes.md',
          snippet: 'Satsuki is Mei\'s older sister and usually looks after her.',
        },
        {
          title: 'totoro-character-guide.md',
          detail: 'references/totoro-character-guide.md',
          snippet: 'The character guide identifies Mei as the younger sister in the family.',
        },
      ],
      retrievalResultCount: 2,
    }
  }

  if (prompt.includes('translate')) {
    return {
      text: 'Translated replacement sentence.',
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: 'markdown',
      explanationText: null,
      warningText: null,
      sourceLabel: null,
      ...noRetrieval,
    }
  }
  if (prompt.includes('continue')) {
    return {
      text: 'Mock continuation paragraph.',
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: 'markdown',
      explanationText: null,
      warningText: null,
      sourceLabel: null,
      ...noRetrieval,
    }
  }
  if (prompt.includes('summarize')) {
    return {
      text: 'Mock summary of the selected content.',
      finishReason: 'stop',
      model: 'mock-ai-model',
      threadId: request.threadId,
      contentType: request.outputTarget === 'chat-only' ? 'text' : 'markdown',
      explanationText: null,
      warningText: null,
      sourceLabel: null,
      ...noRetrieval,
    }
  }

  return {
    text: request.outputTarget === 'chat-only' ? 'Mock AI answer.' : 'Mock AI draft.',
    finishReason: 'stop',
    model: 'mock-ai-model',
    threadId: request.threadId,
    contentType: request.outputTarget === 'chat-only' ? 'text' : 'markdown',
    explanationText: null,
    warningText: null,
    sourceLabel: null,
    ...noRetrieval,
  }
}

function buildBrowserMockHistoryRerankText(prompt: string): string {
  const payloadMatch = prompt.match(/CANDIDATES_JSON:\s*([\s\S]+)$/u)
  if (!payloadMatch) {
    return JSON.stringify({ results: [] }, null, 2)
  }

  try {
    const payload = JSON.parse(payloadMatch[1]) as {
      query?: string
      candidates?: Array<{ id?: string; prompt?: string; resultPreview?: string | null; documentName?: string }>
    }
    const query = payload.query?.toLowerCase() ?? ''
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []

    const results = candidates
      .map((candidate, index) => {
        const id = typeof candidate.id === 'string' ? candidate.id : ''
        if (!id) return null
        const haystack =
          `${candidate.prompt ?? ''} ${candidate.resultPreview ?? ''} ${candidate.documentName ?? ''}`.toLowerCase()
        const overlap = query
          .split(/\s+/u)
          .filter((token) => token.length > 1 && haystack.includes(token)).length
        return {
          id,
          score: Math.max(40, 92 - index * 7 + overlap * 4),
          rationale:
            overlap > 0
              ? 'Strong semantic overlap with the current query.'
              : 'Useful prior run for nearby drafting intent.',
        }
      })
      .filter((item): item is { id: string; score: number; rationale: string } => item !== null)
      .slice(0, 6)

    return JSON.stringify({ results }, null, 2)
  } catch {
    return JSON.stringify({ results: [] }, null, 2)
  }
}

function buildBrowserMockChunks(text: string): string[] {
  const parts = text.match(/\S+\s*/gu)
  if (!parts || parts.length <= 1) return [text]

  const chunkCount = Math.min(3, parts.length)
  const partSize = Math.ceil(parts.length / chunkCount)
  const chunks: string[] = []

  for (let index = 0; index < parts.length; index += partSize) {
    chunks.push(parts.slice(index, index + partSize).join(''))
  }

  return chunks
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/iu, '')
}
