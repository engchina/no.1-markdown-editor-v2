import type {
  AIOCIResponsesProviderConfig,
  AIOpenAICompatibleProviderConfig,
  AIKnowledgeSelection,
  AIMCPExecutionTransport,
  AIOracleEnrichmentMode,
  AIOracleHostedAgentProfile,
  AIOracleMCPExecutionProfile,
  AIOracleOCIAuthProfile,
  AIOracleStructuredStoreMode,
  AIOracleStructuredStoreRegistration,
  AIOracleUnstructuredStoreRegistration,
  AIProviderConfig,
  AIProviderState,
} from './types.ts'

export const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible' as const
export const OCI_RESPONSES_PROVIDER = 'oci-responses' as const
export const DEFAULT_OCI_IAM_CONFIG_FILE = '~/.oci_iam/config'
const DEFAULT_NL2SQL_MCP_SERVER_URL = 'https://genai.oci.{region-identifier}.oraclecloud.com/nl2sql/toolchain'
const DEFAULT_MCP_REMOTE_COMMAND = '/opt/homebrew/bin/npx'
const DEFAULT_MCP_REMOTE_ARGS = ['-y', 'mcp-remote', DEFAULT_NL2SQL_MCP_SERVER_URL, '--allow-http'] as const

export function createDefaultAIProviderConfig(): AIProviderConfig {
  return {
    provider: OCI_RESPONSES_PROVIDER,
    baseUrl: '',
    model: '',
    project: '',
    ociAuthProfiles: [],
    unstructuredStores: [],
    structuredStores: [],
    mcpExecutionProfiles: [],
    hostedAgentProfiles: [],
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
    compartmentId: '',
    storeOcid: '',
    ociAuthProfileId: null,
    regionOverride: '',
    schemaName: '',
    description: '',
    enabled: true,
    isDefault: false,
    defaultMode: 'sql-draft',
    executionProfileId: null,
    enrichmentDefaultMode: 'full',
    enrichmentObjectNames: '',
  }
}

export function createDefaultAIOracleOCIAuthProfile(): AIOracleOCIAuthProfile {
  return {
    id: createAIConfigId('oci-auth'),
    label: '',
    configFile: DEFAULT_OCI_IAM_CONFIG_FILE,
    profile: 'DEFAULT',
    region: '',
    tenancy: '',
    user: '',
    fingerprint: '',
    keyFile: '',
    enabled: true,
  }
}

export function createDefaultAIOracleMCPExecutionProfile(): AIOracleMCPExecutionProfile {
  const profile = {
    id: createAIConfigId('mcp-execution'),
    label: '',
    description: '',
    command: defaultMcpRemoteCommand(),
    args: [...DEFAULT_MCP_REMOTE_ARGS],
    serverUrl: DEFAULT_NL2SQL_MCP_SERVER_URL,
    transport: 'streamable-http' as const,
    toolName: '',
    enabled: true,
  }
  return {
    ...profile,
    configJson: buildAIOracleMCPConfigJson(profile),
  }
}

export function createDefaultAIOracleHostedAgentProfile(): AIOracleHostedAgentProfile {
  return {
    id: createAIConfigId('hosted-agent'),
    label: '',
    ociRegion: '',
    hostedApplicationOcid: '',
    apiVersion: '20251112',
    apiAction: 'chat',
    domainUrl: '',
    clientId: '',
    scope: '',
    transport: 'http-json',
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

  const ociAuthProfiles = normalizeOCIAuthProfiles(config.ociAuthProfiles)
  const mcpExecutionProfiles = normalizeMCPExecutionProfiles(config.mcpExecutionProfiles)
  const hostedAgentProfiles = normalizeHostedAgentProfiles(config.hostedAgentProfiles)
  const ociAuthProfileIds = new Set(ociAuthProfiles.map((profile) => profile.id))
  const mcpExecutionProfileIds = new Set(mcpExecutionProfiles.map((profile) => profile.id))

  return {
    provider: OCI_RESPONSES_PROVIDER,
    baseUrl,
    model,
    project,
    ociAuthProfiles,
    unstructuredStores: normalizeUnstructuredStoreRegistrations(config.unstructuredStores),
    structuredStores: normalizeStructuredStoreRegistrations(
      config.structuredStores,
      ociAuthProfileIds,
      mcpExecutionProfileIds
    ),
    mcpExecutionProfiles,
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
  const enabled = config.structuredStores.filter((store) => store.enabled)
  return enabled.find((store) => store.isDefault) ?? enabled[0] ?? null
}

export function findHostedAgentProfile(
  config: AIOCIResponsesProviderConfig | null | undefined,
  hostedAgentProfileId: string | null | undefined
): AIOracleHostedAgentProfile | null {
  if (!config || !hostedAgentProfileId) return null
  return config.hostedAgentProfiles.find((profile) => profile.id === hostedAgentProfileId) ?? null
}

export function buildHostedAgentTokenUrlPreview(domainUrl: string): string {
  const trimmed = domainUrl.trim()
  if (!trimmed) return ''

  try {
    return `${normalizeBaseUrl(trimmed)}/oauth2/v1/token`
  } catch {
    return ''
  }
}

export function buildHostedAgentInvokeUrlPreview(
  profile: Pick<AIOracleHostedAgentProfile, 'ociRegion' | 'hostedApplicationOcid' | 'apiVersion' | 'apiAction'>
): string {
  const region = profile.ociRegion?.trim() ?? ''
  const hostedApplicationOcid = profile.hostedApplicationOcid?.trim() ?? ''
  if (!region || !hostedApplicationOcid) return ''

  const apiVersion = normalizeHostedAgentApiVersion(profile.apiVersion)
  const apiAction = normalizeHostedAgentApiAction(profile.apiAction)
  return `https://application.generativeai.${region}.oci.oraclecloud.com/${apiVersion}/hostedApplications/${hostedApplicationOcid}/actions/invoke/${apiAction}`
}

export interface AIOracleMCPConfigJsonImport {
  label: string
  description: string
  command: string
  args: string[]
  serverUrl: string
  transport: AIMCPExecutionTransport
  configJson: string
}

export function parseAIOracleMCPConfigJson(input: string): AIOracleMCPConfigJsonImport {
  const parsed = JSON.parse(input) as unknown
  const serverEntries = getMCPServerEntries(parsed)
  if (serverEntries.length === 0) {
    throw new Error('MCP JSON must contain at least one mcpServers entry.')
  }

  const [label, server] = serverEntries[0] as [string, Record<string, unknown>]
  const command = getStringValue(server.command).trim()
  if (!command) throw new Error('MCP JSON server command is required.')

  const args = Array.isArray(server.args)
    ? server.args.map((arg) => (typeof arg === 'string' ? arg.trim() : '')).filter(Boolean)
    : []
  const serverUrl = getStringValue(server.url).trim() || getStringValue(server.serverUrl).trim() || extractMCPServerUrl(args)

  return {
    label,
    description: getStringValue(server.description).trim(),
    command,
    args,
    serverUrl,
    transport: normalizeMCPTransport(getStringValue(server.transport)),
    configJson: JSON.stringify(parsed, null, 2),
  }
}

export function tryParseAIOracleMCPConfigJson(input: string): AIOracleMCPConfigJsonImport | null {
  try {
    return parseAIOracleMCPConfigJson(input)
  } catch {
    return null
  }
}

export function buildAIOracleMCPConfigJson(
  profile: Pick<AIOracleMCPExecutionProfile, 'id' | 'label' | 'description' | 'command' | 'args' | 'transport'>
): string {
  const serverName = normalizeMCPServerName(profile.label || profile.id || 'nl2sql')
  const server: Record<string, unknown> = {
    command: profile.command.trim() || defaultMcpRemoteCommand(),
    args: profile.args.map((arg) => arg.trim()).filter(Boolean),
    transport: normalizeMCPTransport(profile.transport),
  }
  const description = profile.description.trim()
  if (description) server.description = description

  return JSON.stringify({ mcpServers: { [serverName]: server } }, null, 2)
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
  ociAuthProfileIds: ReadonlySet<string>,
  mcpExecutionProfileIds: ReadonlySet<string>
): AIOracleStructuredStoreRegistration[] {
  const normalized = (stores ?? []).map((store, index) => ({
    id: normalizeConfigId(store.id, 'structured', index),
    label: store.label.trim(),
    semanticStoreId: store.semanticStoreId.trim(),
    compartmentId: store.compartmentId?.trim() || store.storeOcid?.trim() || '',
    storeOcid: store.storeOcid?.trim() ?? '',
    ociAuthProfileId:
      store.ociAuthProfileId && ociAuthProfileIds.has(store.ociAuthProfileId)
        ? store.ociAuthProfileId
        : null,
    regionOverride: store.regionOverride?.trim() ?? '',
    schemaName: store.schemaName?.trim() ?? '',
    description: store.description.trim(),
    enabled: store.enabled !== false,
    isDefault: store.isDefault === true,
    defaultMode: normalizeStructuredStoreMode(store.defaultMode),
    executionProfileId:
      store.executionProfileId && mcpExecutionProfileIds.has(store.executionProfileId)
        ? store.executionProfileId
        : null,
    enrichmentDefaultMode: normalizeEnrichmentMode(store.enrichmentDefaultMode),
    enrichmentObjectNames: store.enrichmentObjectNames?.trim() ?? '',
  }))

  enforceSingleDefault(normalized, (store) => store.isDefault, (store, next) => ({ ...store, isDefault: next }))
  return normalized
}

function normalizeOCIAuthProfiles(
  profiles: readonly AIOracleOCIAuthProfile[] | undefined
): AIOracleOCIAuthProfile[] {
  return (profiles ?? []).map((profile, index) => ({
    id: normalizeConfigId(profile.id, 'oci-auth', index),
    label: profile.label?.trim() ?? '',
    configFile: DEFAULT_OCI_IAM_CONFIG_FILE,
    profile: profile.profile?.trim() || 'DEFAULT',
    region: profile.region?.trim() ?? '',
    tenancy: profile.tenancy?.trim() ?? '',
    user: profile.user?.trim() ?? '',
    fingerprint: profile.fingerprint?.trim() ?? '',
    keyFile: profile.keyFile?.trim() ?? '',
    enabled: profile.enabled !== false,
  }))
}

function normalizeMCPExecutionProfiles(
  profiles: readonly AIOracleMCPExecutionProfile[] | undefined
): AIOracleMCPExecutionProfile[] {
  return (profiles ?? []).map((profile, index) => {
    const normalized = {
      id: normalizeConfigId(profile.id, 'mcp-execution', index),
      label: profile.label?.trim() ?? '',
      description: profile.description?.trim() ?? '',
      command: profile.command?.trim() || defaultMcpRemoteCommand(),
      args: normalizeMCPArgs(profile.args, profile.serverUrl),
      serverUrl: profile.serverUrl?.trim() ?? '',
      transport: normalizeMCPTransport(profile.transport),
      toolName: profile.toolName?.trim() ?? '',
      enabled: profile.enabled !== false,
    }

    return {
      ...normalized,
      configJson: profile.configJson?.trim() || buildAIOracleMCPConfigJson(normalized),
    }
  })
}

function normalizeHostedAgentProfiles(
  profiles: readonly AIOracleHostedAgentProfile[] | undefined
): AIOracleHostedAgentProfile[] {
  return (profiles ?? []).map((profile, index) => ({
    id: normalizeConfigId(profile.id, 'hosted-agent', index),
    label: profile.label.trim(),
    ociRegion: normalizeHostedAgentOciRegion(profile),
    hostedApplicationOcid: normalizeHostedAgentApplicationOcid(profile),
    apiVersion: normalizeHostedAgentApiVersion(profile.apiVersion),
    apiAction: normalizeHostedAgentApiAction(profile.apiAction),
    domainUrl: normalizeBaseUrl(profile.domainUrl),
    clientId: profile.clientId.trim(),
    scope: profile.scope.trim(),
    transport: profile.transport === 'sse' ? 'sse' : 'http-json',
  }))
}

function normalizeStructuredStoreMode(mode: AIOracleStructuredStoreMode | undefined): AIOracleStructuredStoreMode {
  return mode === 'agent-answer' ? 'agent-answer' : 'sql-draft'
}

function normalizeEnrichmentMode(mode: AIOracleEnrichmentMode | undefined): AIOracleEnrichmentMode {
  if (mode === 'partial' || mode === 'delta') return mode
  return 'full'
}

function normalizeMCPArgs(args: readonly string[] | undefined, serverUrl: string | undefined): string[] {
  const normalized = (args ?? []).map((arg) => arg.trim()).filter(Boolean)
  if (normalized.length > 0) return normalized
  const trimmedServerUrl = serverUrl?.trim()
  return trimmedServerUrl
    ? ['-y', 'mcp-remote', trimmedServerUrl, '--allow-http']
    : [...DEFAULT_MCP_REMOTE_ARGS]
}

function defaultMcpRemoteCommand(): string {
  return DEFAULT_MCP_REMOTE_COMMAND
}

function normalizeMCPTransport(transport: string | undefined): AIMCPExecutionTransport {
  return transport === 'streamable-http' ? 'streamable-http' : 'stdio'
}

function extractMCPServerUrl(args: readonly string[]): string {
  return args.find((arg) => /^https?:\/\//u.test(arg)) ?? ''
}

function getStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getMCPServerEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  const root = isRecord(value) ? value : {}
  const mcpServers = isRecord(root.mcpServers) ? root.mcpServers : root
  return Object.entries(mcpServers).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
}

function normalizeMCPServerName(input: string): string {
  return input.trim().replace(/[^A-Za-z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'nl2sql'
}

function normalizeHostedAgentOciRegion(profile: AIOracleHostedAgentProfile): string {
  const trimmed = profile.ociRegion?.trim() ?? ''
  if (!trimmed) {
    throw new Error('Hosted agent OCI region is required.')
  }
  return trimmed
}

function normalizeHostedAgentApplicationOcid(profile: AIOracleHostedAgentProfile): string {
  const trimmed = profile.hostedApplicationOcid?.trim() ?? ''
  if (!trimmed) {
    throw new Error('Hosted agent application OCID is required.')
  }
  return trimmed
}

function normalizeHostedAgentApiAction(input: string | undefined): string {
  const trimmed = input?.trim().replace(/^\/+/u, '').replace(/\/+$/u, '') ?? ''
  return trimmed || 'chat'
}

function normalizeHostedAgentApiVersion(input: string | undefined): string {
  const trimmed = input?.trim()
  return trimmed || '20251112'
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
