import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearAIHostedAgentClientSecret,
  clearAIProviderApiKey,
  isAIDesktopAvailable,
  loadAIProviderState,
  saveAIProviderConfig,
  storeAIHostedAgentClientSecret,
  storeAIProviderApiKey,
} from '../../lib/ai/client.ts'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import {
  createDefaultAIOracleHostedAgentProfile,
  createDefaultAIOracleStructuredStoreRegistration,
  createDefaultAIOracleUnstructuredStoreRegistration,
  createDefaultAIProviderConfig,
  isAIProviderConnectionReady,
  isOCIResponsesProviderConfig,
} from '../../lib/ai/provider.ts'
import type {
  AIHostedAgentSupportedContract,
  AIOracleHostedAgentProfile,
  AIOracleStructuredStoreRegistration,
  AIOracleUnstructuredStoreRegistration,
  AIProviderConfig,
  AIProviderKind,
  AIProviderState,
} from '../../lib/ai/types.ts'

export default function AISettingsSection() {
  const { t } = useTranslation()
  const [aiProviderState, setAiProviderState] = useState<AIProviderState | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiProviderKind, setAiProviderKind] = useState<AIProviderKind>('openai-compatible')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiProject, setAiProject] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiUnstructuredStores, setAiUnstructuredStores] = useState<AIOracleUnstructuredStoreRegistration[]>([])
  const [aiStructuredStores, setAiStructuredStores] = useState<AIOracleStructuredStoreRegistration[]>([])
  const [aiHostedAgentProfiles, setAiHostedAgentProfiles] = useState<AIOracleHostedAgentProfile[]>([])
  const [aiHostedAgentSecrets, setAiHostedAgentSecrets] = useState<Record<string, string>>({})

  const canShowOracleSections = aiProviderKind === 'oci-responses'
  const connectionReady = isAIProviderConnectionReady(aiProviderState)
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
    setAiProviderKind(config.provider)
    setAiBaseUrl(config.baseUrl)
    setAiModel(config.model)
    setAiProject(config.project)
    if (isOCIResponsesProviderConfig(config)) {
      setAiUnstructuredStores(config.unstructuredStores)
      setAiStructuredStores(config.structuredStores)
      setAiHostedAgentProfiles(config.hostedAgentProfiles)
    } else {
      setAiUnstructuredStores([])
      setAiStructuredStores([])
      setAiHostedAgentProfiles([])
    }
    setAiApiKey('')
    setAiHostedAgentSecrets({})
  }

  async function refreshAiProviderState() {
    if (!isAIDesktopAvailable()) return
    const state = await loadAIProviderState()
    setAiProviderState(state)
    applyProviderStateToForm(state)
  }

  async function saveAiConnection() {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)

    try {
      const nextConfig: AIProviderConfig =
        aiProviderKind === 'openai-compatible'
          ? {
              provider: 'openai-compatible',
              baseUrl: aiBaseUrl,
              model: aiModel,
              project: aiProject,
            }
          : {
              provider: 'oci-responses',
              baseUrl: aiBaseUrl,
              model: aiModel,
              project: aiProject,
              unstructuredStores: aiUnstructuredStores,
              structuredStores: aiStructuredStores.map((store) => ({
                ...store,
                defaultMode: 'sql-draft',
                executionAgentProfileId: null,
              })),
              hostedAgentProfiles: aiHostedAgentProfiles,
            }

      const savedConfig = await saveAIProviderConfig(nextConfig)

      if (aiApiKey.trim()) {
        await storeAIProviderApiKey(aiApiKey)
      }

      if (savedConfig.provider === 'oci-responses') {
        for (const profile of savedConfig.hostedAgentProfiles) {
          const clientSecret = aiHostedAgentSecrets[profile.id]?.trim()
          if (!clientSecret) continue
          await storeAIHostedAgentClientSecret(profile.id, clientSecret)
        }
      }

      await refreshAiProviderState()
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

  function updateStructuredStore(
    storeId: string,
    updater: (store: AIOracleStructuredStoreRegistration) => AIOracleStructuredStoreRegistration
  ) {
    setAiStructuredStores((current) => current.map((store) => (store.id === storeId ? updater(store) : store)))
  }

  function updateHostedAgentProfile(
    profileId: string,
    updater: (profile: AIOracleHostedAgentProfile) => AIOracleHostedAgentProfile
  ) {
    setAiHostedAgentProfiles((current) => current.map((profile) => (profile.id === profileId ? updater(profile) : profile)))
  }

  function toggleHostedAgentContract(profileId: string, contract: AIHostedAgentSupportedContract) {
    updateHostedAgentProfile(profileId, (profile) => {
      const hasContract = profile.supportedContracts.includes(contract)
      const nextContracts = hasContract
        ? profile.supportedContracts.filter((value) => value !== contract)
        : [...profile.supportedContracts, contract]

      return {
        ...profile,
        supportedContracts: nextContracts.length > 0 ? nextContracts : ['chat-text'],
      }
    })
  }

  if (!isAIDesktopAvailable()) {
    return (
      <div data-ai-settings="true">
        <div className="flex items-center justify-between mb-2 gap-3">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {t('ai.connection.title')}
          </p>
        </div>
        <div className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
          {t('ai.connection.desktopOnly')}
        </div>
      </div>
    )
  }

  return (
    <div data-ai-settings="true" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {t('ai.connection.title')}
        </p>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {connectionReady ? t('ai.connection.ready') : t('ai.connection.notReady')}
        </span>
      </div>

      <div className="space-y-3 rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="space-y-1">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.connection.provider')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'openai-compatible', label: t('ai.connection.providerOption.openaiCompatible') },
              { value: 'oci-responses', label: t('ai.connection.providerOption.ociResponses') },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                data-ai-provider-option={option.value}
                onClick={() => setAiProviderKind(option.value)}
                className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  borderColor: aiProviderKind === option.value ? 'var(--accent)' : 'var(--border)',
                  background:
                    aiProviderKind === option.value
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

        <FormField label={t('ai.connection.baseUrl')}>
          <input
            value={aiBaseUrl}
            onChange={(event) => setAiBaseUrl(event.target.value)}
            className="rounded-lg border px-3 py-2 text-xs outline-none"
            style={inputStyle}
            placeholder={aiProviderKind === 'oci-responses' ? 'https://.../openai/v1' : 'https://api.openai.com/v1'}
          />
        </FormField>

        <FormField label={t('ai.connection.model')}>
          <input
            value={aiModel}
            onChange={(event) => setAiModel(event.target.value)}
            className="rounded-lg border px-3 py-2 text-xs outline-none"
            style={inputStyle}
            placeholder={aiProviderKind === 'oci-responses' ? 'meta.llama-4-maverick-17b-128e-instruct-fp8' : 'gpt-4.1-mini'}
          />
        </FormField>

        <FormField
          label={t('ai.connection.project')}
          meta={aiProviderKind === 'oci-responses' ? t('ai.connection.required') : t('ai.connection.optional')}
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
          <input
            type="password"
            value={aiApiKey}
            onChange={(event) => setAiApiKey(event.target.value)}
            className="rounded-lg border px-3 py-2 text-xs outline-none"
            style={inputStyle}
            placeholder={
              aiProviderState?.hasApiKey ? t('ai.connection.apiKeyStored') : t('ai.connection.apiKeyPlaceholder')
            }
          />
        </FormField>
      </div>

      {canShowOracleSections ? (
        <>
          {renderUnstructuredSection({
            t,
            aiUnstructuredStores,
            updateUnstructuredStore,
            setAiUnstructuredStores,
          })}
          {renderStructuredSection({
            t,
            aiStructuredStores,
            updateStructuredStore,
            setAiStructuredStores,
          })}
          {renderHostedAgentSection({
            t,
            aiHostedAgentProfiles,
            aiHostedAgentSecrets,
            hostedAgentSecretStatus,
            aiLoading,
            updateHostedAgentProfile,
            setAiHostedAgentProfiles,
            setAiHostedAgentSecrets,
            toggleHostedAgentContract,
            clearHostedAgentSecret,
          })}
        </>
      ) : null}

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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void saveAiConnection()}
          className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}
          disabled={aiLoading}
        >
          {t('ai.connection.save')}
        </button>
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
    </div>
  )
}

function renderUnstructuredSection({
  t,
  aiUnstructuredStores,
  updateUnstructuredStore,
  setAiUnstructuredStores,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiUnstructuredStores: AIOracleUnstructuredStoreRegistration[]
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
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {store.label || t('ai.connection.unstructuredStoreFallback', { id: store.id })}
            </div>
            <button
              type="button"
              onClick={() => setAiUnstructuredStores((current) => current.filter((item) => item.id !== store.id))}
              className="text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('ai.connection.removeItem')}
            </button>
          </div>
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
          <FormField label={t('ai.connection.description')}>
            <input
              value={store.description}
              onChange={(event) =>
                updateUnstructuredStore(store.id, (current) => ({ ...current, description: event.target.value }))
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

function renderStructuredSection({
  t,
  aiStructuredStores,
  updateStructuredStore,
  setAiStructuredStores,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiStructuredStores: AIOracleStructuredStoreRegistration[]
  updateStructuredStore: (
    storeId: string,
    updater: (store: AIOracleStructuredStoreRegistration) => AIOracleStructuredStoreRegistration
  ) => void
  setAiStructuredStores: Dispatch<SetStateAction<AIOracleStructuredStoreRegistration[]>>
}) {
  return (
    <StoreSection
      title={t('ai.connection.structuredStores')}
      addLabel={t('ai.connection.addStructuredStore')}
      onAdd={() => setAiStructuredStores((current) => [...current, createDefaultAIOracleStructuredStoreRegistration()])}
    >
      {aiStructuredStores.map((store) => (
        <div key={store.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {store.label || t('ai.connection.structuredStoreFallback', { id: store.id })}
            </div>
            <button
              type="button"
              onClick={() => setAiStructuredStores((current) => current.filter((item) => item.id !== store.id))}
              className="text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('ai.connection.removeItem')}
            </button>
          </div>
          <FormField label={t('ai.connection.label')}>
            <input
              value={store.label}
              onChange={(event) => updateStructuredStore(store.id, (current) => ({ ...current, label: event.target.value }))}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
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
          <FormField label={t('ai.connection.vectorStoreId')}>
            <input
              value={store.vectorStoreId ?? ''}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({ ...current, vectorStoreId: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.description')}>
            <input
              value={store.description}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({ ...current, description: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={store.enabled}
              onChange={(event) =>
                updateStructuredStore(store.id, (current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <span>{t('ai.connection.enabled')}</span>
          </label>
        </div>
      ))}
    </StoreSection>
  )
}

function renderHostedAgentSection({
  t,
  aiHostedAgentProfiles,
  aiHostedAgentSecrets,
  hostedAgentSecretStatus,
  aiLoading,
  updateHostedAgentProfile,
  setAiHostedAgentProfiles,
  setAiHostedAgentSecrets,
  toggleHostedAgentContract,
  clearHostedAgentSecret,
}: {
  t: ReturnType<typeof useTranslation>['t']
  aiHostedAgentProfiles: AIOracleHostedAgentProfile[]
  aiHostedAgentSecrets: Record<string, string>
  hostedAgentSecretStatus: Record<string, boolean>
  aiLoading: boolean
  updateHostedAgentProfile: (
    profileId: string,
    updater: (profile: AIOracleHostedAgentProfile) => AIOracleHostedAgentProfile
  ) => void
  setAiHostedAgentProfiles: Dispatch<SetStateAction<AIOracleHostedAgentProfile[]>>
  setAiHostedAgentSecrets: Dispatch<SetStateAction<Record<string, string>>>
  toggleHostedAgentContract: (profileId: string, contract: AIHostedAgentSupportedContract) => void
  clearHostedAgentSecret: (profileId: string) => Promise<void>
}) {
  return (
    <StoreSection
      title={t('ai.connection.hostedAgentProfiles')}
      addLabel={t('ai.connection.addHostedAgentProfile')}
      onAdd={() => setAiHostedAgentProfiles((current) => [...current, createDefaultAIOracleHostedAgentProfile()])}
    >
      {aiHostedAgentProfiles.map((profile) => (
        <div key={profile.id} className="grid gap-2 rounded-xl border px-3 py-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {profile.label || t('ai.connection.hostedAgentFallback', { id: profile.id })}
            </div>
            <button
              type="button"
              onClick={() => setAiHostedAgentProfiles((current) => current.filter((item) => item.id !== profile.id))}
              className="text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('ai.connection.removeItem')}
            </button>
          </div>
          <FormField label={t('ai.connection.label')}>
            <input
              value={profile.label}
              onChange={(event) => updateHostedAgentProfile(profile.id, (current) => ({ ...current, label: event.target.value }))}
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.endpointUrl')}>
            <input
              value={profile.endpointUrl}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, endpointUrl: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.invokePath')}>
            <input
              value={profile.invokePath}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, invokePath: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.domainUrl')}>
            <input
              value={profile.domainUrl}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, domainUrl: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.clientId')}>
            <input
              value={profile.clientId}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, clientId: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.scope')}>
            <input
              value={profile.scope}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, scope: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('ai.connection.audience')}>
            <input
              value={profile.audience}
              onChange={(event) =>
                updateHostedAgentProfile(profile.id, (current) => ({ ...current, audience: event.target.value }))
              }
              className="rounded-lg border px-3 py-2 text-xs outline-none"
              style={inputStyle}
            />
          </FormField>
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
          <FormField label={t('ai.connection.supportedContracts')}>
            <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {([
                { key: 'chat-text', label: t('ai.connection.contract.chatText') },
                { key: 'structured-data-answer', label: t('ai.connection.contract.structuredDataAnswer') },
              ] as const).map((contract) => (
                <label key={contract.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.supportedContracts.includes(contract.key)}
                    onChange={() => toggleHostedAgentContract(profile.id, contract.key)}
                  />
                  <span>{contract.label}</span>
                </label>
              ))}
            </div>
          </FormField>
          <FormField label={t('ai.connection.clientSecret')}>
            <div className="flex gap-2">
              <input
                type="password"
                value={aiHostedAgentSecrets[profile.id] ?? ''}
                onChange={(event) =>
                  setAiHostedAgentSecrets((current) => ({ ...current, [profile.id]: event.target.value }))
                }
                className="flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
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
                {t('ai.connection.clearKey')}
              </button>
            </div>
          </FormField>
        </div>
      ))}
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
  return (
    <section className="space-y-2 rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {title}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border px-2.5 py-1 text-[11px] transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {addLabel}
        </button>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
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

const inputStyle = {
  borderColor: 'var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
} as const

const cardStyle = {
  borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
  background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
} as const
