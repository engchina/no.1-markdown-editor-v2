import type {
  AIOCIResponsesProviderConfig,
  AIOpenAICompatibleProviderConfig,
  AIHostedAgentSupportedContract,
  AIKnowledgeSelection,
  AIOracleHostedAgentProfile,
  AIOracleStructuredStoreMode,
  AIOracleStructuredStoreRegistration,
  AIOracleUnstructuredStoreRegistration,
  AIProviderConfig,
  AIProviderState,
} from './types.ts'

export const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible' as const
export const OCI_RESPONSES_PROVIDER = 'oci-responses' as const

export function createDefaultAIProviderConfig(): AIProviderConfig {
  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    baseUrl: '',
    model: '',
    project: '',
  }
}

export function createDefaultAIOracleUnstructuredStoreRegistration(): AIOracleUnstructuredStoreRegistration {
  return {
    id: createAIConfigId('unstructured'),
    label: '',
    vectorStoreId: '',
    description: '',
    enabled: true,
    isDefault: false,
  }
}

export function createDefaultAIOracleStructuredStoreRegistration(): AIOracleStructuredStoreRegistration {
  return {
    id: createAIConfigId('structured'),
    label: '',
    semanticStoreId: '',
    vectorStoreId: '',
    storeOcid: '',
    description: '',
    enabled: true,
    defaultMode: 'sql-draft',
    executionAgentProfileId: null,
  }
}

export function createDefaultAIOracleHostedAgentProfile(): AIOracleHostedAgentProfile {
  return {
    id: createAIConfigId('hosted-agent'),
    label: '',
    endpointUrl: '',
    invokePath: '',
    domainUrl: '',
    clientId: '',
    scope: '',
    audience: '',
    transport: 'http-json',
    supportedContracts: ['chat-text'],
  }
}

export function normalizeAIProviderConfig(config: AIProviderConfig): AIProviderConfig {
  if (config.provider === OPENAI_COMPATIBLE_PROVIDER) {
    return normalizeOpenAICompatibleProviderConfig(config)
  }

  if (config.provider === OCI_RESPONSES_PROVIDER) {
    return normalizeOCIResponsesProviderConfig(config)
  }

  throw new Error(`Unsupported AI provider: ${(config as { provider?: unknown }).provider ?? 'unknown'}`)
}

export function isAIProviderConnectionReady(state: AIProviderState | null): boolean {
  if (!state?.config || state.hasApiKey !== true) return false

  if (!state.config.baseUrl || !state.config.model) return false
  if (state.config.provider === OCI_RESPONSES_PROVIDER) {
    return !!state.config.project.trim()
  }

  return true
}

export function isOCIResponsesProviderConfig(
  config: AIProviderConfig | null | undefined
): config is AIOCIResponsesProviderConfig {
  return config?.provider === OCI_RESPONSES_PROVIDER
}

export function isOpenAICompatibleProviderConfig(
  config: AIProviderConfig | null | undefined
): config is AIOpenAICompatibleProviderConfig {
  return config?.provider === OPENAI_COMPATIBLE_PROVIDER
}

export function getAIKnowledgeType(
  selection: AIKnowledgeSelection,
  executionTargetKind: 'direct-provider' | 'oracle-hosted-agent' = 'direct-provider'
): 'none' | 'docs' | 'data' | 'agent' {
  if (executionTargetKind === 'oracle-hosted-agent') {
    return 'agent'
  }

  switch (selection.kind) {
    case 'oracle-unstructured-store':
      return 'docs'
    case 'oracle-structured-store':
      return 'data'
    default:
      return 'none'
  }
}

export function normalizeOpenAICompatibleProviderConfig(
  config: AIOpenAICompatibleProviderConfig
): AIOpenAICompatibleProviderConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const model = config.model.trim()
  if (!model) throw new Error('AI model is required.')
  const project = config.project.trim()

  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    baseUrl,
    model,
    project,
  }
}

export function normalizeOCIResponsesProviderConfig(
  config: AIOCIResponsesProviderConfig
): AIOCIResponsesProviderConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const model = config.model.trim()
  if (!model) throw new Error('AI model is required.')
  const project = config.project.trim()
  if (!project) throw new Error('Oracle project is required for OCI Responses.')

  const hostedAgentProfiles = normalizeHostedAgentProfiles(config.hostedAgentProfiles)
  const hostedAgentIds = new Set(hostedAgentProfiles.map((profile) => profile.id))

  return {
    provider: OCI_RESPONSES_PROVIDER,
    baseUrl,
    model,
    project,
    unstructuredStores: normalizeUnstructuredStoreRegistrations(config.unstructuredStores),
    structuredStores: normalizeStructuredStoreRegistrations(config.structuredStores, hostedAgentIds),
    hostedAgentProfiles,
  }
}

export function getDefaultUnstructuredStoreRegistration(
  config: AIOCIResponsesProviderConfig | null | undefined
): AIOracleUnstructuredStoreRegistration | null {
  if (!config) return null
  const enabled = config.unstructuredStores.filter((store) => store.enabled)
  return enabled.find((store) => store.isDefault) ?? enabled[0] ?? null
}

export function getDefaultStructuredStoreRegistration(
  config: AIOCIResponsesProviderConfig | null | undefined
): AIOracleStructuredStoreRegistration | null {
  if (!config) return null
  return config.structuredStores.find((store) => store.enabled) ?? null
}

export function findHostedAgentProfile(
  config: AIOCIResponsesProviderConfig | null | undefined,
  hostedAgentProfileId: string | null | undefined
): AIOracleHostedAgentProfile | null {
  if (!config || !hostedAgentProfileId) return null
  return config.hostedAgentProfiles.find((profile) => profile.id === hostedAgentProfileId) ?? null
}

function normalizeUnstructuredStoreRegistrations(
  stores: readonly AIOracleUnstructuredStoreRegistration[] | undefined
): AIOracleUnstructuredStoreRegistration[] {
  const normalized = (stores ?? []).map((store, index) => ({
    id: normalizeConfigId(store.id, 'unstructured', index),
    label: store.label.trim(),
    vectorStoreId: store.vectorStoreId.trim(),
    description: store.description.trim(),
    enabled: store.enabled !== false,
    isDefault: store.isDefault === true,
  }))

  enforceSingleDefault(normalized, (store) => store.isDefault, (store, next) => ({ ...store, isDefault: next }))
  return normalized
}

function normalizeStructuredStoreRegistrations(
  stores: readonly AIOracleStructuredStoreRegistration[] | undefined,
  hostedAgentIds: ReadonlySet<string>
): AIOracleStructuredStoreRegistration[] {
  return (stores ?? []).map((store, index) => ({
    id: normalizeConfigId(store.id, 'structured', index),
    label: store.label.trim(),
    semanticStoreId: store.semanticStoreId.trim(),
    vectorStoreId: store.vectorStoreId?.trim() ?? '',
    storeOcid: store.storeOcid?.trim() ?? '',
    description: store.description.trim(),
    enabled: store.enabled !== false,
    defaultMode: normalizeStructuredStoreMode(store.defaultMode),
    executionAgentProfileId:
      store.executionAgentProfileId && hostedAgentIds.has(store.executionAgentProfileId)
        ? store.executionAgentProfileId
        : null,
  }))
}

function normalizeHostedAgentProfiles(
  profiles: readonly AIOracleHostedAgentProfile[] | undefined
): AIOracleHostedAgentProfile[] {
  return (profiles ?? []).map((profile, index) => ({
    id: normalizeConfigId(profile.id, 'hosted-agent', index),
    label: profile.label.trim(),
    endpointUrl: normalizeBaseUrl(profile.endpointUrl),
    invokePath: normalizeHostedAgentInvokePath(profile.invokePath),
    domainUrl: normalizeBaseUrl(profile.domainUrl),
    clientId: profile.clientId.trim(),
    scope: profile.scope.trim(),
    audience: profile.audience.trim(),
    transport: profile.transport === 'sse' ? 'sse' : 'http-json',
    supportedContracts: normalizeHostedAgentSupportedContracts(profile.supportedContracts),
  }))
}

function normalizeHostedAgentSupportedContracts(
  contracts: readonly AIHostedAgentSupportedContract[] | undefined
): AIHostedAgentSupportedContract[] {
  const seen = new Set<AIHostedAgentSupportedContract>()
  const normalized: AIHostedAgentSupportedContract[] = []
  for (const candidate of contracts ?? []) {
    if (candidate !== 'chat-text' && candidate !== 'structured-data-answer') continue
    if (seen.has(candidate)) continue
    seen.add(candidate)
    normalized.push(candidate)
  }
  return normalized.length > 0 ? normalized : ['chat-text']
}

function normalizeStructuredStoreMode(mode: AIOracleStructuredStoreMode | undefined): AIOracleStructuredStoreMode {
  return mode === 'agent-answer' ? 'agent-answer' : 'sql-draft'
}

function normalizeHostedAgentInvokePath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/u, '').replace(/\/+$/u, '')
  return trimmed
}

function normalizeConfigId(input: string | undefined, prefix: string, index: number): string {
  const trimmed = input?.trim()
  if (trimmed) return trimmed
  return `${prefix}-${index + 1}`
}

function enforceSingleDefault<T>(
  items: T[],
  isDefault: (item: T) => boolean,
  setDefault: (item: T, next: boolean) => T
): void {
  let seenDefault = false
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index]
    if (!current) continue
    if (!isDefault(current)) continue
    if (seenDefault) {
      items[index] = setDefault(current, false)
      continue
    }
    seenDefault = true
  }
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/u, '')
  if (!trimmed) throw new Error('AI base URL is required.')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('AI base URL must be a valid HTTP or HTTPS URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AI base URL must use HTTP or HTTPS.')
  }

  return parsed.toString().replace(/\/+$/u, '')
}

function createAIConfigId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
