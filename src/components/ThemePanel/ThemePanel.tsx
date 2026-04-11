import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { clearAIProviderApiKey, isAIDesktopAvailable, loadAIProviderState, saveAIProviderConfig, storeAIProviderApiKey } from '../../lib/ai/client.ts'
import {
  estimateAIHistoryProviderRerankSendCount,
  getAIHistoryProviderRerankFieldSet,
  resolveAIHistoryProviderRerankPolicy,
} from '../../lib/ai/providerHistoryBudget.ts'
import {
  FOCUS_WIDTH_CUSTOM_MAX,
  FOCUS_WIDTH_CUSTOM_MIN,
  FOCUS_WIDTH_CUSTOM_STEP,
  FOCUS_WIDTH_PRESET_VALUES,
  resolveFocusWidthPx,
  type FocusWidthMode,
} from '../../lib/focusWidth'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import { THEMES, applyTheme, getThemeById } from '../../themes'
import { useAnchoredOverlayStyle } from '../../hooks/useAnchoredOverlayStyle'
import { useEditorStore } from '../../store/editor'
import type { AIProviderState } from '../../lib/ai/types.ts'
import UpdateSettingsSection from '../Updates/UpdateSettingsSection'

interface Props {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export default function ThemePanel({ onClose, triggerRef }: Props) {
  const { t } = useTranslation()
  const {
    activeThemeId,
    setActiveThemeId,
    fontSize,
    setFontSize,
    focusWidthMode,
    setFocusWidthMode,
    focusWidthCustomPx,
    setFocusWidthCustomPx,
    lineNumbers,
    setLineNumbers,
    wordWrap,
    setWordWrap,
    wysiwygMode,
    setWysiwygMode,
    typewriterMode,
    setTypewriterMode,
    aiDefaultWriteTarget,
    setAiDefaultWriteTarget,
    aiDefaultSelectedTextRole,
    setAiDefaultSelectedTextRole,
    aiHistoryProviderRerankEnabled,
    setAiHistoryProviderRerankEnabled,
    aiHistoryProviderRerankBudget,
    setAiHistoryProviderRerankBudget,
  } = useEditorStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const [aiProviderState, setAiProviderState] = useState<AIProviderState | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiProject, setAiProject] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const overlayStyle = useAnchoredOverlayStyle(triggerRef, { align: 'right', width: 344 })
  const resolvedThemeId = getThemeById(activeThemeId).id
  const resolvedFocusWidthPx = resolveFocusWidthPx(focusWidthMode, focusWidthCustomPx)
  const historyProviderPolicy = resolveAIHistoryProviderRerankPolicy(aiHistoryProviderRerankBudget)
  const historyProviderFieldSet = getAIHistoryProviderRerankFieldSet(historyProviderPolicy)
  const historyProviderEstimatedSendCount = estimateAIHistoryProviderRerankSendCount(12, aiHistoryProviderRerankBudget)
  const focusWidthPresets: Array<{
    mode: Exclude<FocusWidthMode, 'custom'>
    label: string
    value: number
  }> = [
    { mode: 'narrow', label: t('themePanel.focusWidthPresets.narrow'), value: FOCUS_WIDTH_PRESET_VALUES.narrow },
    { mode: 'comfortable', label: t('themePanel.focusWidthPresets.comfortable'), value: FOCUS_WIDTH_PRESET_VALUES.comfortable },
    { mode: 'wide', label: t('themePanel.focusWidthPresets.wide'), value: FOCUS_WIDTH_PRESET_VALUES.wide },
  ]
  const focusWidthQuickOptions: Array<{
    label: string
    active: boolean
    onClick: () => void
  }> = [
    ...focusWidthPresets.map(({ mode, label }) => ({
      label,
      active: focusWidthMode === mode,
      onClick: () => setFocusWidthMode(mode),
    })),
    {
      label: t('themePanel.focusWidthPresets.custom'),
      active: focusWidthMode === 'custom',
      onClick: () => setFocusWidthMode('custom'),
    },
  ]

  function applyFocusWidth(nextWidth: number) {
    setFocusWidthCustomPx(nextWidth)

    const matchedPreset = focusWidthPresets.find(({ value }) => value === nextWidth)
    setFocusWidthMode(matchedPreset?.mode ?? 'custom')
  }

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, triggerRef])

  useEffect(() => {
    if (!isAIDesktopAvailable()) return

    let cancelled = false
    setAiLoading(true)
    setAiError(null)

    void loadAIProviderState()
      .then((state) => {
        if (cancelled) return
        setAiProviderState(state)
        setAiBaseUrl(state.config?.baseUrl ?? '')
        setAiModel(state.config?.model ?? '')
        setAiProject(state.config?.project ?? '')
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

  function selectTheme(id: string) {
    setActiveThemeId(id)
    applyTheme(getThemeById(id))
  }

  async function refreshAiProviderState() {
    if (!isAIDesktopAvailable()) return
    const state = await loadAIProviderState()
    setAiProviderState(state)
    setAiBaseUrl(state.config?.baseUrl ?? '')
    setAiModel(state.config?.model ?? '')
    setAiProject(state.config?.project ?? '')
  }

  async function saveAiConnection() {
    if (!isAIDesktopAvailable()) return

    setAiLoading(true)
    setAiError(null)
    try {
      await saveAIProviderConfig({
        provider: 'openai-compatible',
        baseUrl: aiBaseUrl,
        model: aiModel,
        project: aiProject,
      })
      if (aiApiKey.trim()) {
        await storeAIProviderApiKey(aiApiKey)
        setAiApiKey('')
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

  async function clearAiApiKey() {
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

  if (typeof document === 'undefined' || overlayStyle === null) return null

  return createPortal(
    <div
      ref={panelRef}
      data-theme-panel="true"
      className="fixed z-[80] rounded-xl shadow-2xl overflow-hidden animate-in glass-panel"
      style={{
        ...overlayStyle,
        background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
        borderColor: 'color-mix(in srgb, var(--border) 88%, transparent)',
      }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {t('themePanel.appearance')}
        </h3>
      </div>

      <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('themePanel.theme')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => selectTheme(theme.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all text-left hover-scale"
                style={{
                  border: resolvedThemeId === theme.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: theme.vars['--bg-primary'],
                  color: theme.vars['--text-primary'],
                  boxShadow:
                    resolvedThemeId === theme.id
                      ? '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'none',
                }}
              >
                <div className="flex gap-0.5 flex-shrink-0">
                  {[theme.vars['--accent'], theme.vars['--bg-secondary'], theme.vars['--border']].map((color, index) => (
                    <div key={index} style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  ))}
                </div>
                <span className="truncate font-medium">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.fontSize')}
            </p>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fontSize}px</span>
          </div>
          <input
            type="range"
            min={11}
            max={24}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent)', background: 'var(--bg-tertiary)' }}
          />
          <div className="flex justify-between mt-1">
            {[11, 13, 15, 18, 20, 24].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setFontSize(size)}
                className="text-xs px-1.5 py-0.5 rounded transition-all hover-scale"
                style={{
                  background: fontSize === size ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: fontSize === size ? 'white' : 'var(--text-muted)',
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between mb-2 gap-3">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.focusWidth')}
            </p>
            <div className="text-right flex-shrink-0">
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{resolvedFocusWidthPx}px</div>
            </div>
          </div>

          <input
            type="range"
            min={FOCUS_WIDTH_CUSTOM_MIN}
            max={FOCUS_WIDTH_CUSTOM_MAX}
            step={FOCUS_WIDTH_CUSTOM_STEP}
            value={resolvedFocusWidthPx}
            onChange={(event) => {
              applyFocusWidth(Number(event.target.value))
            }}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent)', background: 'var(--bg-tertiary)' }}
          />
          <div className="flex justify-between mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span>{FOCUS_WIDTH_CUSTOM_MIN}</span>
            <span>{FOCUS_WIDTH_CUSTOM_MAX}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {focusWidthQuickOptions.map(({ label, active, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="text-[11px] px-1.5 py-1 rounded transition-all hover-scale truncate"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: active ? 'white' : 'var(--text-muted)',
                }}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>

          {focusWidthMode === 'custom' && (
            <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.focusWidthCustomHint')}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('themePanel.editorOptions')}
          </p>
          <div className="space-y-2">
            {([
              { label: t('themePanel.wysiwyg'), value: wysiwygMode, set: setWysiwygMode },
              { label: t('themePanel.lineNumbers'), value: lineNumbers, set: setLineNumbers },
              { label: t('themePanel.wordWrap'), value: wordWrap, set: setWordWrap },
              { label: t('themePanel.typewriterMode'), value: typewriterMode, set: setTypewriterMode },
            ] as const).map(({ label, value, set }) => (
              <label key={label} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <button
                  type="button"
                  onClick={() => (set as (nextValue: boolean) => void)(!value)}
                  className="relative rounded-full transition-colors flex-shrink-0"
                  style={{
                    width: '36px',
                    height: '20px',
                    background: value ? 'var(--accent)' : 'var(--bg-tertiary)',
                  }}
                >
                  <span
                    className="absolute top-0.5 rounded-full transition-transform"
                    style={{
                      width: '16px',
                      height: '16px',
                      background: 'white',
                      left: value ? '18px' : '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        <div data-ai-settings="true">
          <div className="flex items-center justify-between mb-2 gap-3">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('ai.connection.title')}
            </p>
            {isAIDesktopAvailable() && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {aiProviderState?.hasApiKey ? t('ai.connection.ready') : t('ai.connection.notReady')}
              </span>
            )}
          </div>

          {!isAIDesktopAvailable() ? (
            <div className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.connection.desktopOnly')}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('ai.connection.baseUrl')}</span>
                <input
                  value={aiBaseUrl}
                  onChange={(event) => setAiBaseUrl(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-xs outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('ai.connection.model')}</span>
                <input
                  value={aiModel}
                  onChange={(event) => setAiModel(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-xs outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="gpt-4.1-mini"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span>{t('ai.connection.project')}</span>
                  <span>{t('ai.connection.optional')}</span>
                </span>
                <input
                  value={aiProject}
                  onChange={(event) => setAiProject(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-xs outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder={t('ai.connection.projectPlaceholder')}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('ai.connection.apiKey')}</span>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(event) => setAiApiKey(event.target.value)}
                  className="rounded-lg border px-3 py-2 text-xs outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder={
                    aiProviderState?.hasApiKey
                      ? t('ai.connection.apiKeyStored')
                      : t('ai.connection.apiKeyPlaceholder')
                  }
                />
              </label>

              {aiError && (
                <div className="text-[11px] leading-5" style={{ color: '#dc2626' }}>
                  {aiError}
                </div>
              )}

              {aiLoading && (
                <div className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.loadingShort')}
                </div>
              )}

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
                  onClick={() => void clearAiApiKey()}
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
              <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                {t('ai.connection.privacyNote')}
              </div>
            </div>
          )}

          <div className="pt-2">
            <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('ai.preferences.defaultWriteTarget')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['at-cursor', 'insert-below', 'replace-selection'] as const).map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setAiDefaultWriteTarget(target)}
                  className="rounded-lg px-2 py-1.5 text-[11px] transition-colors"
                  style={{
                    background: aiDefaultWriteTarget === target ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: aiDefaultWriteTarget === target ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {t(`ai.outputTarget.${target}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('ai.preferences.selectedTextRole')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAiDefaultSelectedTextRole('transform-target')}
                className="rounded-lg px-2 py-1.5 text-[11px] transition-colors"
                style={{
                  background:
                    aiDefaultSelectedTextRole === 'transform-target' ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: aiDefaultSelectedTextRole === 'transform-target' ? 'white' : 'var(--text-secondary)',
                }}
              >
                {t('ai.preferences.roleTransformTarget')}
              </button>
              <button
                type="button"
                onClick={() => setAiDefaultSelectedTextRole('reference-only')}
                className="rounded-lg px-2 py-1.5 text-[11px] transition-colors"
                style={{
                  background:
                    aiDefaultSelectedTextRole === 'reference-only' ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: aiDefaultSelectedTextRole === 'reference-only' ? 'white' : 'var(--text-secondary)',
                }}
              >
                {t('ai.preferences.roleReferenceOnly')}
              </button>
            </div>
          </div>

          <div className="pt-2" data-ai-history-provider-settings="true">
            <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('ai.preferences.historyProviderTitle')}
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('ai.preferences.historyProviderEnabled')}
              </span>
              <button
                type="button"
                onClick={() => setAiHistoryProviderRerankEnabled(!aiHistoryProviderRerankEnabled)}
                className="relative rounded-full transition-colors flex-shrink-0"
                style={{
                  width: '36px',
                  height: '20px',
                  background: aiHistoryProviderRerankEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                }}
              >
                <span
                  className="absolute top-0.5 rounded-full transition-transform"
                  style={{
                    width: '16px',
                    height: '16px',
                    background: 'white',
                    left: aiHistoryProviderRerankEnabled ? '18px' : '2px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </label>

            <div className="mt-3 text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('ai.preferences.historyProviderBudget')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['conservative', 'balanced', 'deep'] as const).map((budget) => (
                <button
                  key={budget}
                  type="button"
                  onClick={() => setAiHistoryProviderRerankBudget(budget)}
                  className="rounded-lg px-2 py-1.5 text-[11px] transition-colors"
                  style={{
                    background: aiHistoryProviderRerankBudget === budget ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: aiHistoryProviderRerankBudget === budget ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {t(`ai.preferences.historyProviderBudgetOption.${budget}`)}
                </button>
              ))}
            </div>

            <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.preferences.historyProviderBudgetDetail', {
                count: historyProviderEstimatedSendCount,
                cost: t(`ai.preferences.historyProviderCost.${historyProviderPolicy.estimatedCost}`),
                fields: t(`ai.preferences.historyProviderFields.${historyProviderFieldSet}`),
              })}
            </div>
          </div>
        </div>

        <UpdateSettingsSection />
      </div>
    </div>,
    document.body
  )
}
