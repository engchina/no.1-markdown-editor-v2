import { Children, useEffect, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearAIHostedAgentClientSecret,
  clearAIOCIKeyFilePassphrase,
  clearAIProviderApiKey,
  generateAIEnrichmentJob,
  getAIEnrichmentJob,
  isAIDesktopAvailable,
  listAIEnrichmentJobs,
  loadAIProviderState,
  saveAIProviderConfig,
  storeAIHostedAgentClientSecret,
  storeAIOCIKeyFilePassphrase,
  storeAIProviderApiKey,
} from '../../lib/ai/client.ts'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import AppIcon from '../Icons/AppIcon'
import {
  createDefaultAIOracleHostedAgentProfile,
  createDefaultAIOracleMCPExecutionProfile,
  createDefaultAIOracleOCIAuthProfile,
  createDefaultAIOracleStructuredStoreRegistration,
  createDefaultAIOracleUnstructuredStoreRegistration,
  DEFAULT_OCI_IAM_CONFIG_FILE,
  buildHostedAgentInvokeUrlPreview,
  buildHostedAgentTokenUrlPreview,
  createDefaultAIProviderConfig,
  isAIProviderConnectionReady,
  isOCIResponsesProviderConfig,
  tryParseAIOracleMCPConfigJson,
} from '../../lib/ai/provider.ts'
import { dispatchAIProviderStateChanged } from '../../lib/ai/events.ts'
import type {
  AIOracleMCPExecutionProfile,
  AIOracleOCIAuthProfile,
  AIOracleHostedAgentProfile,
  AIOracleStructuredStoreRegistration,
  AIOracleUnstructuredStoreRegistration,
  AIOCIResponsesProviderConfig,
  AIProviderConfig,
  AIProviderState,
} from '../../lib/ai/types.ts'

type AISettingsSaveScope =
  | 'connection'
  | 'oci-auth'
  | 'mcp-execution'
  | 'unstructured'
  | 'structured'
  | 'hosted-agent'

export default function AISettingsSection() {
  const { t } = useTranslation()
  const [aiProviderState, setAiProviderState] = useState<AIProviderState | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiProject, setAiProject] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiOCIAuthProfiles, setAiOCIAuthProfiles] = useState<AIOracleOCIAuthProfile[]>([])
  const [aiOCIKeyFilePassphrases, setAiOCIKeyFilePassphrases] = useState<Record<string, string>>({})
  const [aiUnstructuredStores, setAiUnstructuredStores] = useState<AIOracleUnstructuredStoreRegistration[]>([])
  const [aiStructuredStores, setAiStructuredStores] = useState<AIOracleStructuredStoreRegistration[]>([])
  const [aiMCPExecutionProfiles, setAiMCPExecutionProfiles] = useState<AIOracleMCPExecutionProfile[]>([])
  const [aiHostedAgentProfiles, setAiHostedAgentProfiles] = useState<AIOracleHostedAgentProfile[]>([])
  const [aiHostedAgentSecrets, setAiHostedAgentSecrets] = useState<Record<string, string>>({})
  const [aiEnrichmentJobIds, setAiEnrichmentJobIds] = useState<Record<string, string>>({})
  const [aiEnrichmentJobResults, setAiEnrichmentJobResults] = useState<Record<string, AIEnrichmentJobRawResponse>>({})

  const connectionReady = isAIProviderConnectionReady(aiProviderState)
  const ociKeyFilePassphraseStatus = aiProviderState?.hasOCIKeyFilePassphraseById ?? {}
  const hostedAgentSecretStatus = aiProviderState?.hasHostedAgentClientSecretById ?? {}

  useEffect(() => {
    if (!isAIDesktopAvailable()) return

    let cancelled = false
    setAiLoading(true)
    setAiError(null)

    void loadAIProviderState()
      .then((state) => {
        if (cancelled) return
        setAiProviderState(state)
        applyProviderStateToForm(state)
      })
      .catch((error) => {
        if (cancelled) return
        setAiError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function applyProviderStateToForm(state: AIProviderState) {
    const config = state.config ?? createDefaultAIProviderConfig()
    setAiBaseUrl(config.baseUrl)
    setAiModel(config.model)
    setAiProject(config.project)
    if (isOCIResponsesProviderConfig(config)) {
      setAiOCIAuthProfiles(config.ociAuthProfiles)
      setAiUnstructuredStores(config.unstructuredStores)
      setAiStructuredStores(config.structuredStores)
      setAiMCPExecutionProfiles(config.mcpExecutionProfiles)
      setAiHostedAgentProfiles(config.hostedAgentProfiles)
    } else {
      setAiOCIAuthProfiles([])
      setAiUnstructuredStores([])
      setAiStructuredStores([])
      setAiMCPExecutionProfiles([])
      setAiHostedAgentProfiles([])
    }
    setAiApiKey('')
    setAiOCIKeyFilePassphrases({})
    setAiHostedAgentSecrets({})
  }

  async function refreshAiProviderState() {
    if (!isAIDesktopAvailable()) return
    const state = await loadAIProviderState()
    setAiProviderState(state)
    applyProviderStateToForm(state)
  }

  async function refreshAiProviderStateAfterScopedSave(scope: AISettingsSaveScope) {
    if (!isAIDesktopAvailable()) return
    const state = await loadAIProviderState()
    setAiProviderState(state)
    applyProviderStateToSavedScope(state, scope)
  }

  function applyProviderStateToSavedScope(state: AIProviderState, scope: AISettingsSaveScope) {
    const config = state.config ?? createDefaultAIProviderConfig()
    if (scope === 'connection') {
      setAiBaseUrl(config.baseUrl)
      setAiModel(config.model)
      setAiProject(config.project)
      setAiApiKey('')
      return
    }

    if (!isOCIResponsesProviderConfig(config)) return

    if (scope === 'oci-auth') {
      setAiOCIAuthProfiles(config.ociAuthProfiles)
      setAiOCIKeyFilePassphrases({})
      return
    }

    if (scope === 'mcp-execution') {
      setAiMCPExecutionProfiles(config.mcpExecutionProfiles)
      return
    }

    if (scope === 'unstructured') {
      setAiUnstructuredStores(config.unstructuredStores)
      return
    }

    if (scope === 'structured') {
      setAiStructuredStores(config.structuredStores)
      return
    }

    setAiHostedAgentProfiles(config.hostedAgentProfiles)
    setAiHostedAgentSecrets({})
  }

  function getPersistedOCIProviderConfig(): AIOCIResponsesProviderConfig {
    const config = aiProviderState?.config
    if (isOCIResponsesProviderConfig(config)) return config
    return createDefaultAIProviderConfig() as AIOCIResponsesProviderConfig
  }

  function buildAIProviderConfigForScope(scope: AISettingsSaveScope): AIProviderConfig {
    const persistedConfig = getPersistedOCIProviderConfig()

    return {
      provider: 'oci-responses',
      baseUrl: scope === 'connection' ? aiBaseUrl : persistedConfig.baseUrl,
      model: scope === 'connection' ? aiModel : persistedConfig.model,
      project: scope === 'connection' ? aiProject : persistedConfig.project,
      ociAuthProfiles: scope === 'oci-auth' ? aiOCIAuthProfiles : persistedConfig.ociAuthProfiles,
      unstructuredStores: scope === 'unstructured' ? aiUnstructuredStores : persistedConfig.unstructuredStores,
      structuredStores: scope === 'structured' ? aiStructuredStores : persistedConfig.structuredStores,
      mcpExecutionProfiles: scope === 'mcp-execution' ? aiMCPExecutionProfiles : persistedConfig.mcpExecutionProfiles,
      hostedAgentProfiles: scope === 'hosted-agent' ? aiHostedAgentProfiles : persistedConfig.hostedAgentProfiles,
    }
  }

  async function saveAiConnection(scope: AISettingsSaveScope) {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)

    try {
      const nextConfig = buildAIProviderConfigForScope(scope)
      const savedConfig = await saveAIProviderConfig(nextConfig)

      if (scope === 'connection' && aiApiKey.trim()) {
        await storeAIProviderApiKey(aiApiKey)
      }

      if (scope === 'oci-auth' && savedConfig.provider === 'oci-responses') {
        for (const profile of savedConfig.ociAuthProfiles) {
          const passphrase = aiOCIKeyFilePassphrases[profile.id]?.trim()
          if (!passphrase) continue
          await storeAIOCIKeyFilePassphrase(profile.id, passphrase)
        }
      }

      if (scope === 'hosted-agent' && savedConfig.provider === 'oci-responses') {
        for (const profile of savedConfig.hostedAgentProfiles) {
          const clientSecret = aiHostedAgentSecrets[profile.id]?.trim()
          if (!clientSecret) continue
          await storeAIHostedAgentClientSecret(profile.id, clientSecret)
        }
      }

      await refreshAiProviderStateAfterScopedSave(scope)
      dispatchAIProviderStateChanged()
      pushSuccessNotice('notices.aiConnectionSavedTitle', 'notices.aiConnectionSavedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiConnectionErrorTitle', 'notices.aiConnectionErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function clearDirectApiKey() {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)
    try {
      await clearAIProviderApiKey()
      await refreshAiProviderState()
      dispatchAIProviderStateChanged()
      setAiApiKey('')
      pushInfoNotice('notices.aiApiKeyClearedTitle', 'notices.aiApiKeyClearedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiConnectionErrorTitle', 'notices.aiConnectionErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function clearHostedAgentSecret(profileId: string) {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)
    try {
      await clearAIHostedAgentClientSecret(profileId)
      await refreshAiProviderState()
      dispatchAIProviderStateChanged()
      setAiHostedAgentSecrets((current) => ({ ...current, [profileId]: '' }))
      pushInfoNotice('notices.aiApiKeyClearedTitle', 'notices.aiApiKeyClearedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiConnectionErrorTitle', 'notices.aiConnectionErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  function updateUnstructuredStore(
    storeId: string,
    updater: (store: AIOracleUnstructuredStoreRegistration) => AIOracleUnstructuredStoreRegistration
  ) {
    setAiUnstructuredStores((current) => current.map((store) => (store.id === storeId ? updater(store) : store)))
  }

  function updateOCIAuthProfile(
    profileId: string,
    updater: (profile: AIOracleOCIAuthProfile) => AIOracleOCIAuthProfile
  ) {
    setAiOCIAuthProfiles((current) => current.map((profile) => (profile.id === profileId ? updater(profile) : profile)))
  }

  function updateStructuredStore(
    storeId: string,
    updater: (store: AIOracleStructuredStoreRegistration) => AIOracleStructuredStoreRegistration
  ) {
    setAiStructuredStores((current) => current.map((store) => (store.id === storeId ? updater(store) : store)))
  }

  function updateMCPExecutionProfile(
    profileId: string,
    updater: (profile: AIOracleMCPExecutionProfile) => AIOracleMCPExecutionProfile
  ) {
    setAiMCPExecutionProfiles((current) => current.map((profile) => (profile.id === profileId ? updater(profile) : profile)))
  }

  function updateHostedAgentProfile(
    profileId: string,
    updater: (profile: AIOracleHostedAgentProfile) => AIOracleHostedAgentProfile
  ) {
    setAiHostedAgentProfiles((current) => current.map((profile) => (profile.id === profileId ? updater(profile) : profile)))
  }

  async function runEnrichmentJob(store: AIOracleStructuredStoreRegistration) {
    if (!store.id) return
    setAiLoading(true)
    setAiError(null)
    try {
      const databaseObjects = store.enrichmentObjectNames
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean)
      const result = await generateAIEnrichmentJob({
        structuredStoreId: store.id,
        mode: store.enrichmentDefaultMode,
        schemaName: store.schemaName,
        databaseObjects,
      })
      const jobId = extractEnrichmentJobId(result)
      if (jobId) {
        setAiEnrichmentJobIds((current) => ({ ...current, [store.id]: jobId }))
      }
      setAiEnrichmentJobResults((current) => ({ ...current, [store.id]: buildEnrichmentJobRawResponse(result, 'build') }))
      pushSuccessNotice('notices.aiConnectionSavedTitle', 'notices.aiEnrichmentJobStartedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiEnrichmentJobErrorTitle', 'notices.aiEnrichmentJobErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function clearOCIKeyFilePassphrase(profileId: string) {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)
    try {
      await clearAIOCIKeyFilePassphrase(profileId)
      await refreshAiProviderState()
      dispatchAIProviderStateChanged()
      setAiOCIKeyFilePassphrases((current) => ({ ...current, [profileId]: '' }))
      pushInfoNotice('notices.aiOCIKeyFilePassphraseClearedTitle', 'notices.aiOCIKeyFilePassphraseClearedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiEnrichmentJobErrorTitle', 'notices.aiEnrichmentJobErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function refreshEnrichmentJobs(store: AIOracleStructuredStoreRegistration) {
    const compartmentId = (store.compartmentId || store.storeOcid || '').trim()
    setAiLoading(true)
    setAiError(null)
    try {
      const listResult = await listAIEnrichmentJobs({
        structuredStoreId: store.id,
        compartmentId,
      })
      const jobId = extractEnrichmentJobId(listResult)
      let result: unknown = listResult
      if (jobId) {
        setAiEnrichmentJobIds((current) => ({ ...current, [store.id]: jobId }))
        result = await loadLatestEnrichmentJobDiagnostics(store, listResult, jobId)
      }
      setAiEnrichmentJobResults((current) => ({ ...current, [store.id]: buildEnrichmentJobRawResponse(result, 'refresh') }))
      pushInfoNotice('notices.aiEnrichmentJobsRefreshedTitle', 'notices.aiEnrichmentJobsRefreshedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiEnrichmentJobErrorTitle', 'notices.aiEnrichmentJobErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function inspectEnrichmentJob(store: AIOracleStructuredStoreRegistration) {
    const enrichmentJobId = resolveEnrichmentJobIdForAction(store)
    if (!enrichmentJobId) {
      return
    }

    setAiLoading(true)
    setAiError(null)
    setAiEnrichmentJobResults((current) => {
      const next = { ...current }
      delete next[store.id]
      return next
    })
    try {
      const result = await getAIEnrichmentJob({
        structuredStoreId: store.id,
        enrichmentJobId,
      })
      setAiEnrichmentJobResults((current) => ({ ...current, [store.id]: buildEnrichmentJobRawResponse(result, 'get') }))
      pushInfoNotice('notices.aiEnrichmentJobLoadedTitle', 'notices.aiEnrichmentJobLoadedMessage')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
      pushErrorNotice('notices.aiEnrichmentJobErrorTitle', 'notices.aiEnrichmentJobErrorMessage', {
        values: { reason: message },
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function loadLatestEnrichmentJobDiagnostics(
    store: AIOracleStructuredStoreRegistration,
    jobList: unknown,
    enrichmentJobId: string
  ): Promise<unknown> {
    try {
      const latestJob = await getAIEnrichmentJob({
        structuredStoreId: store.id,
        enrichmentJobId,
      })
      return {
        latestJob,
        jobList,
      }
    } catch (error) {
      return {
        latestJob: extractLatestEnrichmentJob(jobList),
        latestJobDetailError: error instanceof Error ? error.message : String(error),
        jobList,
      }
    }
  }

  function resolveEnrichmentJobIdForAction(store: AIOracleStructuredStoreRegistration): string {
    const input = aiEnrichmentJobIds[store.id] ?? ''
    const enrichmentJobId = normalizeEnrichmentJobIdInput(input)
    if (!enrichmentJobId) {
      pushInfoNotice('notices.aiEnrichmentJobIdMissingTitle', 'notices.aiEnrichmentJobIdMissingMessage')
      return ''
    }

    if (!isLikelyOracleEnrichmentJobId(enrichmentJobId)) {
      const message = t('ai.connection.invalidEnrichmentJobIdHint')
      setAiError(message)
      pushErrorNotice('notices.aiEnrichmentJobInvalidIdTitle', 'notices.aiEnrichmentJobInvalidIdMessage', {
        values: { reason: message },
      })
      return ''
    }

    if (enrichmentJobId !== input.trim()) {
      setAiEnrichmentJobIds((current) => ({ ...current, [store.id]: enrichmentJobId }))
    }

    return enrichmentJobId
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveAiConnection('connection')
  }

  if (!isAIDesktopAvailable()) {
    return (
      <div data-ai-settings="true" className="space-y-2">
        <SettingsSectionHeader title={t('ai.connection.title')} />
        <div
          className="border-l pl-3 text-[11px] leading-5"
          style={{ ...sectionBodyStyle, color: 'var(--text-muted)' }}
        >
          <p>{t('ai.connection.providerDescription')}</p>
          <p className="mt-1">{t('ai.connection.desktopOnly')}</p>
        </div>
      </div>
    )
  }

  return (
    <form data-ai-settings="true" className="space-y-2" onSubmit={handleSubmit}>
      <fieldset className="min-w-0 space-y-2">
        <legend className="sr-only">{t('ai.connection.title')}</legend>
        <SettingsSectionHeader
          title={t('ai.connection.title')}
          trailing={
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="text-[11px] font-medium"
                style={{ color: connectionReady ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {connectionReady ? t('ai.connection.ready') : t('ai.connection.notReady')}
              </span>
              <button
                type="submit"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: 'var(--accent)', color: 'white' }}
                disabled={aiLoading}
              >
                <AppIcon name="save" size={13} />
                <span>{t('ai.connection.saveProvider')}</span>
              </button>
            </div>
          }
        />

        <div className="grid gap-2 border-l pl-3" style={sectionBodyStyle}>
          <p className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {t('ai.connection.providerDescription')}
          </p>

          <FormField label={t('ai.connection.baseUrl')}>
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              value={aiBaseUrl}
              onChange={(event) => setAiBaseUrl(event.target.value)}
              className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              placeholder="https://.../openai/v1"
              spellCheck={false}
            />
          </FormField>

          <FormField label={t('ai.connection.model')}>
            <input
              value={aiModel}
              onChange={(event) => setAiModel(event.target.value)}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
              placeholder="meta.llama-4-maverick-17b-128e-instruct-fp8"
            />
          </FormField>

          <FormField
            label={t('ai.connection.project')}
            meta={t('ai.connection.optional')}
          >
            <input
              value={aiProject}
              onChange={(event) => setAiProject(event.target.value)}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
              placeholder={t('ai.connection.projectPlaceholder')}
            />
          </FormField>

          <FormField label={t('ai.connection.apiKey')}>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="new-password"
                value={aiApiKey}
                onChange={(event) => setAiApiKey(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
                placeholder={
                  aiProviderState?.hasApiKey ? t('ai.connection.apiKeyStored') : t('ai.connection.apiKeyPlaceholder')
                }
              />
              <button
                type="button"
                onClick={() => void clearDirectApiKey()}
                className="rounded-lg border px-3 py-2 text-xs transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                }}
                disabled={aiLoading || !aiProviderState?.hasApiKey}
              >
                {t('ai.connection.clearKey')}
              </button>
            </div>
          </FormField>
        </div>
      </fieldset>

      {renderOCIAuthSection({
        t,
        aiOCIAuthProfiles,
        aiOCIKeyFilePassphrases,
        ociKeyFilePassphraseStatus,
        aiLoading,
        onSave: () => void saveAiConnection('oci-auth'),
        updateOCIAuthProfile,
        setAiOCIAuthProfiles,
        setAiOCIKeyFilePassphrases,
        clearOCIKeyFilePassphrase,
      })}
      {renderMCPExecutionSection({
        t,
        aiMCPExecutionProfiles,
        aiLoading,
        onSave: () => void saveAiConnection('mcp-execution'),
        updateMCPExecutionProfile,
        setAiMCPExecutionProfiles,
      })}
      {renderUnstructuredSection({
        t,
        aiUnstructuredStores,
        aiLoading,
        onSave: () => void saveAiConnection('unstructured'),
        updateUnstructuredStore,
        setAiUnstructuredStores,
      })}
      {renderStructuredSection({
        t,
        aiStructuredStores,
        aiOCIAuthProfiles,
        aiMCPExecutionProfiles,
        aiEnrichmentJobIds,
        aiEnrichmentJobResults,
        aiLoading,
        onSave: () => void saveAiConnection('structured'),
        updateStructuredStore,
        setAiStructuredStores,
        setAiEnrichmentJobIds,
        runEnrichmentJob,
        refreshEnrichmentJobs,
        inspectEnrichmentJob,
      })}
      {renderHostedAgentSection({
        t,
        aiHostedAgentProfiles,
        aiHostedAgentSecrets,
        hostedAgentSecretStatus,
        aiLoading,
        onSave: () => void saveAiConnection('hosted-agent'),
        updateHostedAgentProfile,
        setAiHostedAgentProfiles,
        setAiHostedAgentSecrets,
        clearHostedAgentSecret,
      })}

      {aiError ? (
        <div className="text-[11px] leading-5" style={{ color: '#dc2626' }}>
          {aiError}
        </div>
      ) : null}

      {aiLoading ? (
        <div className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
          {t('ai.loadingShort')}
        </div>
      ) : null}
    </form>
  )
}

function renderUnstructuredSection({
  t,
  aiUnstructuredStores,
  aiLoading,
  onSave,
  updateUnstructuredStore,
  setAiUnstructuredStores,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiUnstructuredStores: AIOracleUnstructuredStoreRegistration[]
  aiLoading: boolean
  onSave: () => void
  updateUnstructuredStore: (
    storeId: string,
    updater: (store: AIOracleUnstructuredStoreRegistration) => AIOracleUnstructuredStoreRegistration
  ) => void
  setAiUnstructuredStores: Dispatch<SetStateAction<AIOracleUnstructuredStoreRegistration[]>>
}) {
  return (
    <StoreSection
      title={t('ai.connection.unstructuredStores')}
      addLabel={t('ai.connection.addUnstructuredStore')}
      onAdd={() => setAiUnstructuredStores((current) => [...current, createDefaultAIOracleUnstructuredStoreRegistration()])}
    >
      {aiUnstructuredStores.map((store) => (
        <div key={store.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <ConfigItemHeader
            title={store.label || t('ai.connection.unstructuredStoreFallback', { id: store.id })}
            t={t}
            aiLoading={aiLoading}
            onSave={onSave}
            onRemove={() => setAiUnstructuredStores((current) => current.filter((item) => item.id !== store.id))}
          />
          <FormField label={t('ai.connection.label')}>
            <input
              value={store.label}
              onChange={(event) => updateUnstructuredStore(store.id, (current) => ({ ...current, label: event.target.value }))}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.vectorStoreId')}>
            <input
              value={store.vectorStoreId}
              onChange={(event) =>
                updateUnstructuredStore(store.id, (current) => ({ ...current, vectorStoreId: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <div className="flex gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={store.enabled}
                onChange={(event) =>
                  updateUnstructuredStore(store.id, (current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>{t('ai.connection.enabled')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={store.isDefault}
                onChange={(event) =>
                  setAiUnstructuredStores((current) =>
                    current.map((item) => ({
                      ...item,
                      isDefault: item.id === store.id ? event.target.checked : false,
                    }))
                  )
                }
              />
              <span>{t('ai.connection.defaultStore')}</span>
            </label>
          </div>
        </div>
      ))}
    </StoreSection>
  )
}

function renderOCIAuthSection({
  t,
  aiOCIAuthProfiles,
  aiOCIKeyFilePassphrases,
  ociKeyFilePassphraseStatus,
  aiLoading,
  onSave,
  updateOCIAuthProfile,
  setAiOCIAuthProfiles,
  setAiOCIKeyFilePassphrases,
  clearOCIKeyFilePassphrase,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiOCIAuthProfiles: AIOracleOCIAuthProfile[]
  aiOCIKeyFilePassphrases: Record<string, string>
  ociKeyFilePassphraseStatus: Record<string, boolean>
  aiLoading: boolean
  onSave: () => void
  updateOCIAuthProfile: (
    profileId: string,
    updater: (profile: AIOracleOCIAuthProfile) => AIOracleOCIAuthProfile
  ) => void
  setAiOCIAuthProfiles: Dispatch<SetStateAction<AIOracleOCIAuthProfile[]>>
  setAiOCIKeyFilePassphrases: Dispatch<SetStateAction<Record<string, string>>>
  clearOCIKeyFilePassphrase: (profileId: string) => Promise<void>
}) {
  return (
    <StoreSection
      title={t('ai.connection.ociAuthProfiles')}
      addLabel={t('ai.connection.addOCIAuthProfile')}
      onAdd={() => setAiOCIAuthProfiles((current) => [...current, createDefaultAIOracleOCIAuthProfile()])}
    >
      {aiOCIAuthProfiles.map((profile) => (
        <div key={profile.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <ConfigItemHeader
            title={profile.label || t('ai.connection.ociAuthProfileFallback', { id: profile.id })}
            t={t}
            aiLoading={aiLoading}
            onSave={onSave}
            onRemove={() => setAiOCIAuthProfiles((current) => current.filter((item) => item.id !== profile.id))}
          />
          <FormField label={t('ai.connection.label')}>
            <input
              value={profile.label}
              onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, label: event.target.value }))}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.ociConfigFile')} meta={t('ai.connection.fixed')}>
            <code
              className={`${technicalInputClassName} overflow-x-auto whitespace-nowrap rounded-lg border px-3 py-2 text-xs`}
              style={readOnlyInputStyle}
              title={DEFAULT_OCI_IAM_CONFIG_FILE}
            >
              {DEFAULT_OCI_IAM_CONFIG_FILE}
            </code>
          </FormField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label={t('ai.connection.ociProfile')}>
              <input
                value={profile.profile}
                onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, profile: event.target.value }))}
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="DEFAULT"
                spellCheck={false}
              />
            </FormField>
            <FormField label={t('ai.connection.ociRegion')}>
              <input
                value={profile.region}
                onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, region: event.target.value }))}
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="us-chicago-1"
                spellCheck={false}
              />
            </FormField>
          </div>
          <FormField label={t('ai.connection.tenancyOcid')}>
            <input
              value={profile.tenancy}
              onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, tenancy: event.target.value }))}
              className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              spellCheck={false}
            />
          </FormField>
          <FormField label={t('ai.connection.userOcid')}>
            <input
              value={profile.user}
              onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, user: event.target.value }))}
              className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              spellCheck={false}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label={t('ai.connection.fingerprint')}>
              <input
                value={profile.fingerprint}
                onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, fingerprint: event.target.value }))}
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                spellCheck={false}
              />
            </FormField>
            <FormField label={t('ai.connection.keyFile')}>
              <div className="flex gap-2">
                <input
                  value={profile.keyFile}
                  readOnly
                  className={`${technicalInputClassName} min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none`}
                  style={readOnlyInputStyle}
                  placeholder={t('ai.connection.keyFilePlaceholder')}
                  spellCheck={false}
                  title={profile.keyFile}
                />
                <button
                  type="button"
                  onClick={() => void chooseOCIKeyFile(profile.id, t, updateOCIAuthProfile)}
                  className="cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                  }}
                >
                  {t('ai.connection.chooseFile')}
                </button>
              </div>
            </FormField>
          </div>
          <FormField label={t('ai.connection.keyFilePassphrase')} meta={t('ai.connection.optional')}>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="new-password"
                value={aiOCIKeyFilePassphrases[profile.id] ?? ''}
                onChange={(event) =>
                  setAiOCIKeyFilePassphrases((current) => ({ ...current, [profile.id]: event.target.value }))
                }
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
                placeholder={
                  ociKeyFilePassphraseStatus[profile.id]
                    ? t('ai.connection.keyFilePassphraseStored')
                    : t('ai.connection.keyFilePassphrasePlaceholder')
                }
              />
              <button
                type="button"
                onClick={() => void clearOCIKeyFilePassphrase(profile.id)}
                className="rounded-lg border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                }}
                disabled={aiLoading || !ociKeyFilePassphraseStatus[profile.id]}
              >
                {t('ai.connection.clearKey')}
              </button>
            </div>
          </FormField>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={profile.enabled}
              onChange={(event) => updateOCIAuthProfile(profile.id, (current) => ({ ...current, enabled: event.target.checked }))}
            />
            <span>{t('ai.connection.enabled')}</span>
          </label>
        </div>
      ))}
    </StoreSection>
  )
}

async function chooseOCIKeyFile(
  profileId: string,
  t: ReturnType<typeof useTranslation>['t'],
  updateOCIAuthProfile: (
    profileId: string,
    updater: (profile: AIOracleOCIAuthProfile) => AIOracleOCIAuthProfile
  ) => void
) {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: false,
      multiple: false,
      title: t('ai.connection.chooseKeyFile'),
    })
    if (typeof selected !== 'string' || !selected.trim()) return
    updateOCIAuthProfile(profileId, (current) => ({ ...current, keyFile: selected }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushErrorNotice('notices.aiConnectionErrorTitle', 'notices.aiConnectionErrorMessage', {
      values: { reason: message },
    })
  }
}

function renderMCPExecutionSection({
  t,
  aiMCPExecutionProfiles,
  aiLoading,
  onSave,
  updateMCPExecutionProfile,
  setAiMCPExecutionProfiles,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiMCPExecutionProfiles: AIOracleMCPExecutionProfile[]
  aiLoading: boolean
  onSave: () => void
  updateMCPExecutionProfile: (
    profileId: string,
    updater: (profile: AIOracleMCPExecutionProfile) => AIOracleMCPExecutionProfile
  ) => void
  setAiMCPExecutionProfiles: Dispatch<SetStateAction<AIOracleMCPExecutionProfile[]>>
}) {
  return (
    <StoreSection
      title={t('ai.connection.mcpExecutionProfiles')}
      addLabel={t('ai.connection.addMCPExecutionProfile')}
      onAdd={() => setAiMCPExecutionProfiles((current) => [...current, createDefaultAIOracleMCPExecutionProfile()])}
    >
      {aiMCPExecutionProfiles.map((profile) => (
        <div key={profile.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <ConfigItemHeader
            title={profile.label || t('ai.connection.mcpExecutionProfileFallback', { id: profile.id })}
            t={t}
            aiLoading={aiLoading}
            onSave={onSave}
            onRemove={() => setAiMCPExecutionProfiles((current) => current.filter((item) => item.id !== profile.id))}
          />
          <FormField label={t('ai.connection.label')}>
            <input
              value={profile.label}
              onChange={(event) =>
                updateMCPExecutionProfile(profile.id, (current) => ({ ...current, label: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.mcpConfigJson')}>
            <textarea
              value={profile.configJson}
              onChange={(event) => {
                const configJson = event.target.value
                const parsed = tryParseAIOracleMCPConfigJson(configJson)
                updateMCPExecutionProfile(profile.id, (current) =>
                  parsed
                    ? {
                        ...current,
                        label: current.label || parsed.label,
                        description: parsed.description,
                        configJson: parsed.configJson,
                        command: parsed.command,
                        args: parsed.args,
                        serverUrl: parsed.serverUrl,
                        transport: parsed.transport,
                      }
                    : { ...current, configJson }
                )
              }}
              rows={6}
              className={`${technicalInputClassName} resize-y rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              spellCheck={false}
            />
          </FormField>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={profile.enabled}
              onChange={(event) =>
                updateMCPExecutionProfile(profile.id, (current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <span>{t('ai.connection.enabled')}</span>
          </label>
        </div>
      ))}
    </StoreSection>
  )
}

function renderStructuredSection({
  t,
  aiStructuredStores,
  aiOCIAuthProfiles,
  aiMCPExecutionProfiles,
  aiEnrichmentJobIds,
  aiEnrichmentJobResults,
  aiLoading,
  onSave,
  updateStructuredStore,
  setAiStructuredStores,
  setAiEnrichmentJobIds,
  runEnrichmentJob,
  refreshEnrichmentJobs,
  inspectEnrichmentJob,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiStructuredStores: AIOracleStructuredStoreRegistration[]
  aiOCIAuthProfiles: AIOracleOCIAuthProfile[]
  aiMCPExecutionProfiles: AIOracleMCPExecutionProfile[]
  aiEnrichmentJobIds: Record<string, string>
  aiEnrichmentJobResults: Record<string, AIEnrichmentJobRawResponse>
  aiLoading: boolean
  onSave: () => void
  updateStructuredStore: (
    storeId: string,
    updater: (store: AIOracleStructuredStoreRegistration) => AIOracleStructuredStoreRegistration
  ) => void
  setAiStructuredStores: Dispatch<SetStateAction<AIOracleStructuredStoreRegistration[]>>
  setAiEnrichmentJobIds: Dispatch<SetStateAction<Record<string, string>>>
  runEnrichmentJob: (store: AIOracleStructuredStoreRegistration) => Promise<void>
  refreshEnrichmentJobs: (store: AIOracleStructuredStoreRegistration) => Promise<void>
  inspectEnrichmentJob: (store: AIOracleStructuredStoreRegistration) => Promise<void>
}) {
  return (
    <StoreSection
      title={t('ai.connection.structuredStores')}
      addLabel={t('ai.connection.addStructuredStore')}
      onAdd={() => setAiStructuredStores((current) => [...current, createDefaultAIOracleStructuredStoreRegistration()])}
    >
      {aiStructuredStores.map((store) => {
        const enrichmentJobResult = aiEnrichmentJobResults[store.id]
        const enrichmentJobRawResponse = enrichmentJobResult?.raw ?? ''
        const enrichmentJobDiagnostics = extractEnrichmentJobDiagnostics(enrichmentJobRawResponse)
        const enrichmentJobRawResponseLabel = getEnrichmentJobRawResponseLabelKey(enrichmentJobResult?.source)

        return (
        <div key={store.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <ConfigItemHeader
            title={store.label || t('ai.connection.structuredStoreFallback', { id: store.id })}
            t={t}
            aiLoading={aiLoading}
            onSave={onSave}
            onRemove={() => setAiStructuredStores((current) => current.filter((item) => item.id !== store.id))}
          />
          <FormField label={t('ai.connection.label')}>
            <input
              value={store.label}
              onChange={(event) => updateStructuredStore(store.id, (current) => ({ ...current, label: event.target.value }))}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.compartmentId')} meta={t('ai.connection.required')}>
            <input
              value={store.compartmentId || ''}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({
                  ...current,
                  compartmentId: event.target.value,
                }))
              }
              className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              placeholder="ocid1.compartment.oc1..."
              spellCheck={false}
            />
          </FormField>
          <FormField label={t('ai.connection.semanticStoreId')}>
            <input
              value={store.semanticStoreId}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({ ...current, semanticStoreId: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label={t('ai.connection.ociAuthProfile')}>
              <select
                value={store.ociAuthProfileId ?? ''}
                onChange={(event) =>
                  updateStructuredStore(store.id, (current) => ({
                    ...current,
                    ociAuthProfileId: event.target.value || null,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
              >
                <option value="">{t('ai.connection.noneOption')}</option>
                {aiOCIAuthProfiles
                  .filter((profile) => profile.enabled)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label || profile.profile || profile.id}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label={t('ai.connection.regionOverride')} meta={t('ai.connection.optional')}>
              <input
                value={store.regionOverride}
                onChange={(event) =>
                  updateStructuredStore(store.id, (current) => ({ ...current, regionOverride: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="us-chicago-1"
                spellCheck={false}
              />
            </FormField>
          </div>
          <FormField label={t('ai.connection.schemaName')}>
            <input
              value={store.schemaName}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({ ...current, schemaName: event.target.value }))
              }
              className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
              style={inputStyle}
              spellCheck={false}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label={t('ai.connection.defaultMode')}>
              <select
                value={store.defaultMode}
                onChange={(event) =>
                  updateStructuredStore(store.id, (current) => ({
                    ...current,
                    defaultMode: event.target.value === 'agent-answer' ? 'agent-answer' : 'sql-draft',
                  }))
                }
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
              >
                <option value="sql-draft">{t('ai.knowledge.structuredAction.sqlDraft')}</option>
                <option value="agent-answer">{t('ai.knowledge.structuredAction.agentAnswer')}</option>
              </select>
            </FormField>
            <FormField label={t('ai.connection.executionProfile')}>
              <select
                value={store.executionProfileId ?? ''}
                onChange={(event) =>
                  updateStructuredStore(store.id, (current) => ({
                    ...current,
                    executionProfileId: event.target.value || null,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
              >
                <option value="">{t('ai.connection.noneOption')}</option>
                {aiMCPExecutionProfiles
                  .filter((profile) => profile.enabled)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label || profile.id}
                    </option>
                  ))}
              </select>
            </FormField>
          </div>
          <details
            className="ai-settings-disclosure grid gap-2 border-t pt-2"
            style={sectionDividerStyle}
            data-ai-semantic-metadata="advanced"
          >
            <DisclosureSummary
              title={t('ai.connection.semanticMetadata')}
              meta={t('ai.connection.semanticMetadataMeta')}
            />
            <div className="grid gap-2 pt-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <FormField
                  label={t('ai.connection.enrichmentDefaultMode')}
                  meta={store.enrichmentDefaultMode === 'delta' ? t('ai.connection.enrichmentDeltaUnsupported') : undefined}
                >
                  <select
                    value={store.enrichmentDefaultMode === 'delta' ? 'delta' : store.enrichmentDefaultMode}
                    onChange={(event) =>
                      updateStructuredStore(store.id, (current) => ({
                        ...current,
                        enrichmentDefaultMode: event.target.value === 'partial' ? 'partial' : 'full',
                      }))
                    }
                    className="rounded-lg border px-3 py-2 text-xs outline-none"
                    style={inputStyle}
                  >
                    <option value="full">{t('ai.connection.enrichmentMode.full')}</option>
                    <option value="partial">{t('ai.connection.enrichmentMode.partial')}</option>
                    {store.enrichmentDefaultMode === 'delta' ? (
                      <option value="delta" disabled>
                        {t('ai.connection.enrichmentMode.delta')}
                      </option>
                    ) : null}
                  </select>
                </FormField>
                <button
                  type="button"
                  onClick={() => void runEnrichmentJob(store)}
                  className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border))',
                    background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                    color: 'var(--text-primary)',
                  }}
                  disabled={
                    aiLoading ||
                    !(store.compartmentId || store.storeOcid || '').trim() ||
                    !store.semanticStoreId ||
                    !store.schemaName ||
                    store.enrichmentDefaultMode === 'delta'
                  }
                >
                  {t('ai.connection.generateEnrichmentJob')}
                </button>
              </div>
              {store.enrichmentDefaultMode === 'partial' ? (
                <FormField label={t('ai.connection.enrichmentObjectNames')} meta={t('ai.connection.optional')}>
                  <textarea
                    value={store.enrichmentObjectNames}
                    onChange={(event) =>
                      updateStructuredStore(store.id, (current) => ({
                        ...current,
                        enrichmentObjectNames: event.target.value,
                      }))
                    }
                    rows={3}
                    className={`${technicalInputClassName} resize-y rounded-lg border px-3 py-2 text-xs outline-none`}
                    style={inputStyle}
                    placeholder={'TABLE_A\nTABLE_B'}
                    spellCheck={false}
                  />
                </FormField>
              ) : null}
              <details
                className="ai-settings-disclosure grid min-w-0 gap-2 border-t pt-2"
                style={sectionDividerStyle}
                data-ai-metadata-diagnostics="true"
              >
                <DisclosureSummary
                  title={t('ai.connection.enrichmentDiagnostics')}
                  meta={t('ai.connection.optional')}
                  size="compact"
                  tone="secondary"
                />
                <div className="grid min-w-0 gap-2 pt-1">
                  <FormField label={t('ai.connection.enrichmentJobId')} meta={t('ai.connection.enrichmentJobIdMeta')}>
                    <input
                      value={aiEnrichmentJobIds[store.id] ?? ''}
                      onChange={(event) =>
                        setAiEnrichmentJobIds((current) => ({ ...current, [store.id]: event.target.value }))
                      }
                      className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                      style={inputStyle}
                      placeholder="JB253785cc-2d6f-413e-b47e-a07e3b462a8c"
                      spellCheck={false}
                    />
                  </FormField>
                  <div className="text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.connection.enrichmentJobIdHint')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void refreshEnrichmentJobs(store)}
                      className="cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      disabled={
                        aiLoading || !store.semanticStoreId || !(store.compartmentId || store.storeOcid || '').trim()
                      }
                    >
                      {t('ai.connection.refreshEnrichmentJobs')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void inspectEnrichmentJob(store)}
                      className="cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      disabled={aiLoading || !store.semanticStoreId}
                    >
                      {t('ai.connection.getEnrichmentJob')}
                    </button>
                  </div>
                  {enrichmentJobDiagnostics ? (
                    <EnrichmentJobDiagnosticsPanel t={t} diagnostics={enrichmentJobDiagnostics} />
                  ) : null}
                  {enrichmentJobRawResponse ? (
                    <details
                      className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-lg border px-3 py-2"
                      style={sectionDividerStyle}
                    >
                      <summary className="cursor-pointer text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {t(enrichmentJobRawResponseLabel)}
                      </summary>
                      <pre
                        className={`${technicalInputClassName} min-w-0 max-w-full overflow-x-auto overflow-y-auto whitespace-pre pt-2 text-[11px] leading-5`}
                        style={{
                          maxHeight: '11rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {enrichmentJobRawResponse}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </details>
            </div>
          </details>
          <div className="flex gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={store.enabled}
                onChange={(event) =>
                  updateStructuredStore(store.id, (current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>{t('ai.connection.enabled')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={store.isDefault}
                onChange={(event) =>
                  setAiStructuredStores((current) =>
                    current.map((item) => ({
                      ...item,
                      isDefault: item.id === store.id ? event.target.checked : false,
                    }))
                  )
                }
              />
              <span>{t('ai.connection.defaultStore')}</span>
            </label>
          </div>
        </div>
        )
      })}
    </StoreSection>
  )
}

function renderHostedAgentSection({
  t,
  aiHostedAgentProfiles,
  aiHostedAgentSecrets,
  hostedAgentSecretStatus,
  aiLoading,
  onSave,
  updateHostedAgentProfile,
  setAiHostedAgentProfiles,
  setAiHostedAgentSecrets,
  clearHostedAgentSecret,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiHostedAgentProfiles: AIOracleHostedAgentProfile[]
  aiHostedAgentSecrets: Record<string, string>
  hostedAgentSecretStatus: Record<string, boolean>
  aiLoading: boolean
  onSave: () => void
  updateHostedAgentProfile: (
    profileId: string,
    updater: (profile: AIOracleHostedAgentProfile) => AIOracleHostedAgentProfile
  ) => void
  setAiHostedAgentProfiles: Dispatch<SetStateAction<AIOracleHostedAgentProfile[]>>
  setAiHostedAgentSecrets: Dispatch<SetStateAction<Record<string, string>>>
  clearHostedAgentSecret: (profileId: string) => Promise<void>
}) {
  return (
    <StoreSection
      title={t('ai.connection.hostedAgentProfiles')}
      addLabel={t('ai.connection.addHostedAgentProfile')}
      onAdd={() => setAiHostedAgentProfiles((current) => [...current, createDefaultAIOracleHostedAgentProfile()])}
    >
      {aiHostedAgentProfiles.map((profile) => {
        const resolvedTokenUrl = buildHostedAgentTokenUrlPreview(profile.domainUrl)
        const resolvedInvokeUrl = buildHostedAgentInvokeUrlPreview(profile)

        return (
          <div key={profile.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
            <ConfigItemHeader
              title={profile.label || t('ai.connection.hostedAgentFallback', { id: profile.id })}
              t={t}
              aiLoading={aiLoading}
              onSave={onSave}
              onRemove={() => setAiHostedAgentProfiles((current) => current.filter((item) => item.id !== profile.id))}
            />
            <FormField label={t('ai.connection.label')}>
              <input
                value={profile.label}
                onChange={(event) => updateHostedAgentProfile(profile.id, (current) => ({ ...current, label: event.target.value }))}
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
              />
            </FormField>
            <FormField label={t('ai.connection.ociRegion')}>
              <input
                value={profile.ociRegion}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, ociRegion: event.target.value }))
                }
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
                placeholder="us-chicago-1"
              />
            </FormField>
            <FormField label={t('ai.connection.hostedApplicationOcid')}>
              <input
                value={profile.hostedApplicationOcid}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({
                    ...current,
                    hostedApplicationOcid: event.target.value,
                  }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="ocid1.generativeaihostedapplication..."
                spellCheck={false}
                title={profile.hostedApplicationOcid}
              />
            </FormField>
            <FormField label={t('ai.connection.apiVersion')} meta={t('ai.connection.optional')}>
              <input
                value={profile.apiVersion}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, apiVersion: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="20251112"
                spellCheck={false}
              />
            </FormField>
            <FormField label={t('ai.connection.apiAction')}>
              <input
                value={profile.apiAction}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, apiAction: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                placeholder="chat"
                spellCheck={false}
              />
            </FormField>
            <FormField label={t('ai.connection.domainUrl')}>
              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                value={profile.domainUrl}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, domainUrl: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                spellCheck={false}
                title={profile.domainUrl}
              />
            </FormField>
            <FormField label={t('ai.connection.clientId')}>
              <input
                value={profile.clientId}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, clientId: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                spellCheck={false}
                title={profile.clientId}
              />
            </FormField>
            <FormField label={t('ai.connection.clientSecret')}>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={aiHostedAgentSecrets[profile.id] ?? ''}
                  onChange={(event) =>
                    setAiHostedAgentSecrets((current) => ({ ...current, [profile.id]: event.target.value }))
                  }
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
                  style={inputStyle}
                  placeholder={
                    hostedAgentSecretStatus[profile.id]
                      ? t('ai.connection.apiKeyStored')
                      : t('ai.connection.apiKeyPlaceholder')
                  }
                />
                <button
                  type="button"
                  onClick={() => void clearHostedAgentSecret(profile.id)}
                  className="rounded-lg border px-3 py-2 text-xs transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                  }}
                  disabled={aiLoading || !hostedAgentSecretStatus[profile.id]}
                >
                  {t('ai.connection.clearClientSecret')}
                </button>
              </div>
            </FormField>
            <FormField label={t('ai.connection.scope')}>
              <input
                value={profile.scope}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({ ...current, scope: event.target.value }))
                }
                className={`${technicalInputClassName} rounded-lg border px-3 py-2 text-xs outline-none`}
                style={inputStyle}
                spellCheck={false}
                title={profile.scope}
              />
            </FormField>
            {resolvedTokenUrl || resolvedInvokeUrl ? (
              <div className="grid gap-2 rounded-lg border px-3 py-2 text-[11px]" style={derivedUrlCardStyle}>
                {resolvedTokenUrl ? (
                  <ResolvedUrlPreview label={t('ai.connection.resolvedTokenUrl')} value={resolvedTokenUrl} />
                ) : null}
                {resolvedInvokeUrl ? (
                  <ResolvedUrlPreview label={t('ai.connection.resolvedInvokeUrl')} value={resolvedInvokeUrl} />
                ) : null}
              </div>
            ) : null}
            <FormField label={t('ai.connection.transport')}>
              <select
                value={profile.transport}
                onChange={(event) =>
                  updateHostedAgentProfile(profile.id, (current) => ({
                    ...current,
                    transport: event.target.value === 'sse' ? 'sse' : 'http-json',
                  }))
                }
                className="rounded-lg border px-3 py-2 text-xs outline-none"
                style={inputStyle}
              >
                <option value="http-json">HTTP JSON</option>
                <option value="sse">SSE</option>
              </select>
            </FormField>
          </div>
        )
      })}
    </StoreSection>
  )
}

function StoreSection({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string
  addLabel: string
  onAdd: () => void
  children: ReactNode
}) {
  const hasChildren = Children.count(children) > 0

  return (
    <fieldset className="min-w-0 border-t pt-2" style={sectionDividerStyle}>
      <legend className="sr-only">{title}</legend>
      <div className="space-y-2">
        <SettingsSectionHeader
          title={title}
          trailing={
            <button
              type="button"
              onClick={onAdd}
              className="cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={sectionActionStyle}
            >
              {addLabel}
            </button>
          }
        />
        {hasChildren ? <div className="grid gap-2 border-l pl-3" style={sectionBodyStyle}>{children}</div> : null}
      </div>
    </fieldset>
  )
}

function ConfigItemHeader({
  title,
  t,
  aiLoading,
  onSave,
  onRemove,
}: {
  title: string
  t: ReturnType<typeof useTranslation>['t']
  aiLoading: boolean
  onSave: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={`${t('ai.connection.save')} ${title}`}
          onClick={onSave}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
          style={itemSaveActionStyle}
          disabled={aiLoading}
        >
          <AppIcon name="save" size={12} />
          <span>{t('ai.connection.save')}</span>
        </button>
        <button
          type="button"
          aria-label={`${t('ai.connection.removeItem')} ${title}`}
          onClick={onRemove}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors"
          style={itemRemoveActionStyle}
        >
          <AppIcon name="trash" size={12} />
          <span>{t('ai.connection.removeItem')}</span>
        </button>
      </div>
    </div>
  )
}

function DisclosureSummary({
  title,
  meta,
  size = 'default',
  tone = 'primary',
}: {
  title: string
  meta?: string
  size?: 'default' | 'compact'
  tone?: 'primary' | 'secondary'
}) {
  return (
    <summary
      className={`ai-settings-disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border px-2.5 py-2 font-medium outline-none transition-colors ${
        size === 'compact' ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="ai-settings-disclosure-icon inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border">
          <AppIcon name="chevronRight" size={13} className="ai-settings-disclosure-chevron" />
        </span>
        <span className="truncate" style={{ color: tone === 'primary' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {title}
        </span>
      </span>
      {meta ? (
        <span className="shrink-0 text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
          {meta}
        </span>
      ) : null}
    </summary>
  )
}

function SettingsSectionHeader({
  title,
  trailing,
}: {
  title: string
  trailing?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-3.5 w-1 rounded-full" style={sectionAccentStyle} aria-hidden="true" />
        <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}

function FormField({
  label,
  meta,
  children,
}: {
  label: string
  meta?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span>{label}</span>
        {meta ? <span>{meta}</span> : null}
      </span>
      {children}
    </label>
  )
}

function ResolvedUrlPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <code
        className="block overflow-x-auto whitespace-nowrap rounded-md px-2 py-1.5"
        style={derivedUrlValueStyle}
        title={value}
      >
        {value}
      </code>
    </div>
  )
}

function EnrichmentJobDiagnosticsPanel({
  t,
  diagnostics,
}: {
  t: ReturnType<typeof useTranslation>['t']
  diagnostics: AIEnrichmentJobDiagnostics
}) {
  const toneStyle = getEnrichmentJobToneStyle(diagnostics.tone)

  return (
    <div
      data-ai-enrichment-job-summary="true"
      className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-lg border px-3 py-2 text-[11px] leading-5"
      style={{
        borderColor: toneStyle.borderColor,
        background: toneStyle.background,
        color: 'var(--text-secondary)',
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('ai.connection.latestEnrichmentJob')}
        </span>
        <span
          className="max-w-full truncate rounded-full border px-2 py-0.5 font-medium"
          style={{
            borderColor: toneStyle.pillBorderColor,
            background: toneStyle.pillBackground,
            color: toneStyle.pillColor,
          }}
        >
          {diagnostics.lifecycleState || t('ai.connection.unknownValue')}
        </span>
      </div>
      <div style={{ color: toneStyle.messageColor }}>{t(diagnostics.messageKey)}</div>
      <div
        className="grid min-w-0 gap-1"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(12rem, 100%), 1fr))' }}
      >
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentJobId')} value={diagnostics.id} />
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentJobType')} value={diagnostics.enrichmentJobType} />
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentProgress')} value={diagnostics.percentComplete} />
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentAcceptedAt')} value={diagnostics.timeAccepted} />
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentStartedAt')} value={diagnostics.timeStarted} />
        <EnrichmentJobDiagnosticRow label={t('ai.connection.enrichmentFinishedAt')} value={diagnostics.timeFinished} />
      </div>
      {diagnostics.failureDetails ? (
        <div
          data-ai-enrichment-failure-details="true"
          className="rounded-md border px-2 py-1.5"
          style={{
            borderColor: 'color-mix(in srgb, #dc2626 24%, var(--border))',
            background: 'color-mix(in srgb, #dc2626 6%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="mb-0.5 font-medium">{t('ai.connection.enrichmentFailureDetails')}</div>
          <div className="whitespace-pre-wrap">{diagnostics.failureDetails}</div>
        </div>
      ) : diagnostics.tone === 'danger' ? (
        <div
          data-ai-enrichment-no-failure-details="true"
          className="rounded-md border px-2 py-1.5"
          style={{
            borderColor: 'color-mix(in srgb, #f59e0b 30%, var(--border))',
            background: 'color-mix(in srgb, #f59e0b 7%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          {t('ai.connection.enrichmentNoFailureDetails')}
        </div>
      ) : null}
      {diagnostics.detailLoadError ? (
        <div data-ai-enrichment-detail-error="true" style={{ color: 'var(--text-muted)' }}>
          {t('ai.connection.enrichmentDetailLoadError', { reason: diagnostics.detailLoadError })}
        </div>
      ) : null}
    </div>
  )
}

function EnrichmentJobDiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 max-w-full overflow-hidden rounded-md px-2 py-1"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 72%, transparent)' }}
    >
      <div className="truncate text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className={`${technicalInputClassName} truncate`} style={{ color: 'var(--text-primary)' }} title={value}>
        {value}
      </div>
    </div>
  )
}

function formatAISettingsJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

type AIEnrichmentJobRawResponseSource = 'build' | 'refresh' | 'get'

interface AIEnrichmentJobRawResponse {
  source: AIEnrichmentJobRawResponseSource
  raw: string
}

function buildEnrichmentJobRawResponse(value: unknown, source: AIEnrichmentJobRawResponseSource): AIEnrichmentJobRawResponse {
  return {
    source,
    raw: formatAISettingsJson(value),
  }
}

function getEnrichmentJobRawResponseLabelKey(source: AIEnrichmentJobRawResponseSource | undefined): string {
  if (source === 'build') return 'ai.connection.enrichmentRawBuildMetadataResponse'
  if (source === 'refresh') return 'ai.connection.enrichmentRawRefreshJobsResponse'
  if (source === 'get') return 'ai.connection.enrichmentRawGetJobResponse'
  return 'ai.connection.enrichmentRawResponse'
}

type AIEnrichmentJobStatusTone = 'neutral' | 'success' | 'warning' | 'danger'

interface AIEnrichmentJobDiagnostics {
  id: string
  lifecycleState: string
  messageKey: string
  tone: AIEnrichmentJobStatusTone
  enrichmentJobType: string
  percentComplete: string
  timeAccepted: string
  timeStarted: string
  timeFinished: string
  failureDetails: string
  detailLoadError: string
}

function extractEnrichmentJobDiagnostics(resultText: string): AIEnrichmentJobDiagnostics | null {
  if (!resultText.trim()) return null
  const parsed = parseAISettingsResult(resultText)
  const job = extractLatestEnrichmentJob(parsed)
  if (!job) return null

  const lifecycleState = getRecordString(job, 'lifecycleState') || getRecordString(job, 'status')
  const tone = getEnrichmentJobStatusTone(lifecycleState)
  return {
    id: extractEnrichmentJobId(job) || getRecordString(job, 'id') || '-',
    lifecycleState: lifecycleState || '-',
    messageKey: getEnrichmentJobStatusMessageKey(lifecycleState),
    tone,
    enrichmentJobType:
      getRecordString(job, 'enrichmentJobType') ||
      getRecordString(isRecord(job.enrichmentJobConfiguration) ? job.enrichmentJobConfiguration : {}, 'enrichmentJobType') ||
      '-',
    percentComplete: formatEnrichmentPercent(job.percentComplete),
    timeAccepted: formatEnrichmentTimestamp(job.timeAccepted ?? job.timeCreated),
    timeStarted: formatEnrichmentTimestamp(job.timeStarted),
    timeFinished: formatEnrichmentTimestamp(job.timeFinished),
    failureDetails: extractEnrichmentFailureDetails(job),
    detailLoadError: extractEnrichmentDetailLoadError(parsed),
  }
}

function parseAISettingsResult(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function getEnrichmentJobStatusTone(lifecycleState: string): AIEnrichmentJobStatusTone {
  const normalized = lifecycleState.trim().toUpperCase()
  if (normalized === 'SUCCEEDED') return 'success'
  if (normalized === 'FAILED' || normalized === 'CANCELED') return 'danger'
  if (normalized === 'ACCEPTED' || normalized === 'IN_PROGRESS' || normalized === 'CANCELING') return 'warning'
  return 'neutral'
}

function getEnrichmentJobStatusMessageKey(lifecycleState: string): string {
  const normalized = lifecycleState.trim().toUpperCase()
  if (normalized === 'SUCCEEDED') return 'ai.connection.enrichmentStatusReady'
  if (normalized === 'FAILED') return 'ai.connection.enrichmentStatusFailed'
  if (normalized === 'ACCEPTED' || normalized === 'IN_PROGRESS') return 'ai.connection.enrichmentStatusPending'
  return 'ai.connection.enrichmentStatusUnknown'
}

function getEnrichmentJobToneStyle(tone: AIEnrichmentJobStatusTone) {
  if (tone === 'success') {
    return {
      borderColor: 'color-mix(in srgb, #16a34a 30%, var(--border))',
      background: 'color-mix(in srgb, #16a34a 7%, var(--bg-primary))',
      pillBorderColor: 'color-mix(in srgb, #16a34a 42%, var(--border))',
      pillBackground: 'color-mix(in srgb, #16a34a 12%, transparent)',
      pillColor: '#15803d',
      messageColor: 'var(--text-secondary)',
    }
  }

  if (tone === 'danger') {
    return {
      borderColor: 'color-mix(in srgb, #dc2626 32%, var(--border))',
      background: 'color-mix(in srgb, #dc2626 6%, var(--bg-primary))',
      pillBorderColor: 'color-mix(in srgb, #dc2626 42%, var(--border))',
      pillBackground: 'color-mix(in srgb, #dc2626 10%, transparent)',
      pillColor: '#b91c1c',
      messageColor: '#b91c1c',
    }
  }

  if (tone === 'warning') {
    return {
      borderColor: 'color-mix(in srgb, #f59e0b 32%, var(--border))',
      background: 'color-mix(in srgb, #f59e0b 7%, var(--bg-primary))',
      pillBorderColor: 'color-mix(in srgb, #f59e0b 42%, var(--border))',
      pillBackground: 'color-mix(in srgb, #f59e0b 12%, transparent)',
      pillColor: '#b45309',
      messageColor: 'var(--text-secondary)',
    }
  }

  return {
    borderColor: 'var(--border)',
    background: 'var(--bg-secondary)',
    pillBorderColor: 'var(--border)',
    pillBackground: 'var(--bg-primary)',
    pillColor: 'var(--text-secondary)',
    messageColor: 'var(--text-secondary)',
  }
}

function formatEnrichmentPercent(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.round(value)}%`
  if (typeof value !== 'string') return '-'

  const trimmed = value.trim()
  if (!trimmed) return '-'
  if (/%$/u.test(trimmed)) return trimmed

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : trimmed
}

function formatEnrichmentTimestamp(value: unknown): string {
  const timestamp = parseEnrichmentTimestamp(value)
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString()
}

function parseEnrichmentTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return value
    if (value > 1_000_000_000) return value * 1000
    return 0
  }

  if (typeof value !== 'string') return 0

  const trimmed = value.trim()
  if (!trimmed) return 0
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return parseEnrichmentTimestamp(numeric)

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : 0
}

function extractLatestEnrichmentJob(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return pickLatestEnrichmentJob(value)
  if (!isRecord(value)) return null

  if (isRecord(value.latestJob)) return value.latestJob

  for (const key of ['enrichmentJob', 'job', 'data', 'response', 'result', 'payload']) {
    const nested = extractLatestEnrichmentJob(value[key])
    if (nested) return nested
  }

  const items = Array.isArray(value.items) ? pickLatestEnrichmentJob(value.items) : null
  if (items) return items

  return isEnrichmentJobRecord(value) ? value : null
}

function pickLatestEnrichmentJob(values: readonly unknown[]): Record<string, unknown> | null {
  const jobs = values.filter(isEnrichmentJobRecord)
  if (jobs.length === 0) return null

  return jobs.reduce((latest, job) => {
    const latestTime = getEnrichmentJobCreatedTime(latest)
    const jobTime = getEnrichmentJobCreatedTime(job)
    return jobTime > latestTime ? job : latest
  })
}

function getEnrichmentJobCreatedTime(job: Record<string, unknown>): number {
  return (
    parseEnrichmentTimestamp(job.timeCreated) ||
    parseEnrichmentTimestamp(job.timeAccepted) ||
    parseEnrichmentTimestamp(job.timeStarted) ||
    parseEnrichmentTimestamp(job.timeFinished)
  )
}

function isEnrichmentJobRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const id = normalizeEnrichmentJobIdText(getRecordString(value, 'id'))
  if (!isLikelyOracleEnrichmentJobId(id)) return false

  return Boolean(
    getRecordString(value, 'lifecycleState') ||
      getRecordString(value, 'status') ||
      getRecordString(value, 'semanticStoreId') ||
      getRecordString(value, 'enrichmentJobType') ||
      value.timeAccepted ||
      value.timeCreated
  )
}

function extractEnrichmentFailureDetails(value: unknown): string {
  return collectEnrichmentFailureDetails(value).join('\n')
}

function collectEnrichmentFailureDetails(value: unknown, depth = 0): string[] {
  if (depth > 5) return []

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEnrichmentFailureDetails(item, depth + 1)).slice(0, 4)
  }

  if (!isRecord(value)) return []

  const details: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (key === 'latestJobDetailError') continue
    if (isEnrichmentFailureDetailKey(key)) {
      const detail = formatFailureDetailValue(item)
      if (detail) details.push(detail)
    }
  }

  if (details.length > 0) return dedupeStrings(details).slice(0, 4)

  return dedupeStrings(
    Object.values(value).flatMap((item) => collectEnrichmentFailureDetails(item, depth + 1))
  ).slice(0, 4)
}

function isEnrichmentFailureDetailKey(key: string): boolean {
  return /^(?:lifecycleDetails?|lifecycleMessage|failureDetails?|failureReason|errorDetails?|errorMessage|statusMessage|diagnosticMessage|message|reason)$/iu.test(
    key
  )
}

function formatFailureDetailValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatFailureDetailValue).filter(Boolean).join('\n')
  if (isRecord(value)) {
    const nested = collectEnrichmentFailureDetails(value)
    if (nested.length > 0) return nested.join('\n')
    return ''
  }
  return ''
}

function extractEnrichmentDetailLoadError(value: unknown): string {
  if (!isRecord(value)) return ''
  const detailError = value.latestJobDetailError
  return typeof detailError === 'string' ? detailError.trim() : ''
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

const ENRICHMENT_JOB_ID_PATTERN =
  /(?:ocid1\.[a-z0-9._-]*enrichmentjob[a-z0-9._-]*|JB[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu
const ENRICHMENT_JOB_ID_KEYS = ['id', 'enrichmentJobId', 'jobId', 'identifier'] as const

function extractEnrichmentJobId(value: unknown): string {
  const latestJob = extractLatestEnrichmentJob(value)
  if (latestJob) {
    const latestId = findEnrichmentJobIdCandidate(latestJob)
    if (latestId) return latestId
  }

  return findEnrichmentJobIdCandidate(value)
}

function findEnrichmentJobIdCandidate(value: unknown): string {
  if (typeof value === 'string') {
    const candidate = normalizeEnrichmentJobIdText(value)
    return isLikelyOracleEnrichmentJobId(candidate) ? candidate : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findEnrichmentJobIdCandidate(item)
      if (candidate) return candidate
    }
    return ''
  }

  if (!isRecord(value)) return ''

  for (const key of ENRICHMENT_JOB_ID_KEYS) {
    const candidate = normalizeEnrichmentJobIdText(getRecordString(value, key))
    if (isLikelyOracleEnrichmentJobId(candidate)) return candidate
  }

  for (const key of ['enrichmentJob', 'job', 'data', 'response', 'result', 'payload', 'items']) {
    const candidate = findEnrichmentJobIdCandidate(value[key])
    if (candidate) return candidate
  }

  for (const item of Object.values(value)) {
    const candidate = findEnrichmentJobIdCandidate(item)
    if (candidate) return candidate
  }

  return ''
}

function normalizeEnrichmentJobIdInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const extracted = extractEnrichmentJobId(parsed)
      if (extracted) return extracted
    } catch {
      // Fall through to text normalization for partial JSON snippets pasted from the result panel.
    }
  }

  return normalizeEnrichmentJobIdText(trimmed)
}

function normalizeEnrichmentJobIdText(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const embeddedJobId = trimmed.match(ENRICHMENT_JOB_ID_PATTERN)?.[0]
  if (embeddedJobId) return trimEnrichmentJobIdToken(embeddedJobId)

  const keyValue = trimmed.match(/(?:^|[\s{,])(?:id|enrichmentJobId|jobId|identifier)\s*[:=]\s*["']?([^"',\s}]+)/iu)
  if (keyValue?.[1]) return trimEnrichmentJobIdToken(keyValue[1])

  return trimEnrichmentJobIdToken(trimmed)
}

function trimEnrichmentJobIdToken(input: string): string {
  return input
    .trim()
    .replace(/^[`"'(<[{]+/u, '')
    .replace(/[`"',;)>}\]]+$/u, '')
}

function isLikelyOracleEnrichmentJobId(value: string): boolean {
  const normalized = normalizeEnrichmentJobIdText(value)
  return ENRICHMENT_JOB_ID_PATTERN.test(normalized)
}

function getRecordString(value: Record<string, unknown>, key: string): string {
  const item = value[key]
  return typeof item === 'string' ? item : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const inputStyle = {
  borderColor: 'var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
} as const

const readOnlyInputStyle = {
  borderColor: 'var(--border)',
  background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
  color: 'var(--text-secondary)',
} as const

const technicalInputClassName = 'font-mono'

const cardStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
  background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
} as const

const sectionAccentStyle = {
  background: 'color-mix(in srgb, var(--accent) 58%, var(--border))',
} as const

const sectionDividerStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
} as const

const sectionBodyStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
} as const

const sectionActionStyle = {
  borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
  background: 'color-mix(in srgb, var(--accent) 7%, transparent)',
  color: 'var(--text-secondary)',
} as const

const itemSaveActionStyle = {
  borderColor: 'color-mix(in srgb, var(--accent) 36%, var(--border))',
  background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
  color: 'var(--text-primary)',
} as const

const itemRemoveActionStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)',
  background: 'transparent',
  color: 'var(--text-muted)',
} as const

const derivedUrlCardStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
  background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
} as const

const derivedUrlValueStyle = {
  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
  color: 'var(--text-primary)',
} as const
