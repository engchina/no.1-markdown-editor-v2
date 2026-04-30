import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import AppIcon from '../Icons/AppIcon'
import {
  buildMarkdownPreviewLines,
  getMarkdownPreviewLineBadge,
  type MarkdownPreviewLineKind,
} from '../../lib/ai/diffPresentation.ts'
import {
  AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER,
  resolveAIComposerTemplateResolution,
  type AITemplateModel,
} from '../../lib/ai/templateLibrary.ts'
import type {
  AIOCIResponsesProviderConfig,
  AIComposerState,
  AIIntent,
  AIKnowledgeType,
  AIRetrievalResultPreview,
} from '../../lib/ai/types.ts'
import { type AIInsertTarget, type AIResultView } from '../../lib/ai/resultViews.ts'

export interface AIComposerContentTypography {
  text: CSSProperties
  meta: CSSProperties
  code: CSSProperties
}

export interface AIComposerFrameBounds {
  top: number
  bottom: number
}

const AI_COMPOSER_SOURCE_EDGE_GAP_PX = 16

interface Props {
  dialogRef: RefObject<HTMLDivElement>
  composerFrameBounds: AIComposerFrameBounds
  composer: AIComposerState
  promptPlaceholder: string
  composerContentTypography: AIComposerContentTypography
  showConnectionHint: boolean
  connectionHintTitle: string
  connectionHintMessage: string
  showSlashCommandContextToggle: boolean
  canToggleSlashCommandContext: boolean
  useSlashCommandContext: boolean
  showSelectedTextContextToggle: boolean
  canToggleSelectedTextContext: boolean
  useSelectedTextContext: boolean
  oracleProviderConfig: AIOCIResponsesProviderConfig | null
  knowledgeType: AIKnowledgeType
  hasWorkspaceExecutionTasks: boolean
  workspaceAgentRunning: boolean
  workspaceExecutionPanel: ReactNode | null
  textareaRef: React.RefObject<HTMLTextAreaElement>
  promptRows: number
  promptMinHeight: string
  promptMaxHeight: string
  resultPanelMinHeight: string
  effectivePrompt: string
  normalizedDraft: string
  hasSelection: boolean
  hasSlashCommandContext: boolean
  hasCurrentBlock: boolean
  aiDefaultWriteTarget: 'replace-selection' | 'at-cursor' | 'insert-below'
  templateModels: AITemplateModel[]
  resultView: AIResultView
  setResultView: (view: AIResultView) => void
  retrievalPanelOpen: boolean
  setRetrievalPanelOpen: (value: boolean | ((current: boolean) => boolean)) => void
  hasRetrievalDetails: boolean
  hasDiffPreview: boolean
  hasInsertPreview: boolean
  diffBlocks: ReturnType<typeof import('../../lib/lineDiff.ts').diffTextByLine>
  canSubmit: boolean
  canExecuteStructuredSql: boolean
  canApplyToEditor: boolean
  canApplyToAnyTarget: boolean
  canReplaceCurrentTarget: boolean
  replaceActionTarget: Extract<AIInsertTarget, 'replace-selection' | 'replace-current-block'> | null
  defaultInsertTarget: AIInsertTarget
  preferredResultAction: 'replace' | 'insert' | 'new-note'
  getCurrentDocumentResultActionStyle: (action: 'replace' | 'insert' | 'new-note') => CSSProperties
  runShortcutLabel: string
  applyShortcutLabel: string
  selectedHostedAgentProfileId: string | null
  onClose: () => void
  onOpenAISetup: () => void
  onCancelRequest: () => Promise<void>
  onRun: () => Promise<void>
  onExecuteStructuredSql: () => Promise<void>
  onResetAndClose: () => void
  onPromptChange: (value: string) => void
  onToggleSlashCommandContext: (value: boolean) => void
  onToggleSelectedTextContext: (value: boolean) => void
  onSelectKnowledgeType: (type: AIKnowledgeType) => void
  onSelectDocsStore: (storeId: string) => void
  onSelectDataStore: (registrationId: string) => void
  onSelectDataMode: (mode: 'sql-draft' | 'agent-answer') => void
  onSelectHostedAgentProfile: (profileId: string | null) => void
  onSelectTemplate: (template: AITemplateModel) => void
  onRetry: () => Promise<void>
  onDiscard: () => void
  onRunWorkspaceAgent: () => Promise<void>
  onStopWorkspaceAgent: () => void
  onOpenAllWorkspaceDrafts: () => void
  canRunWorkspaceAgent: boolean
  onCopy: () => Promise<void>
  onApplyReplace: () => void
  onApplyInsert: () => void
  onApplyNewNote: () => void
}

export default function AIComposerCoreView({
  dialogRef,
  composerFrameBounds,
  composer,
  promptPlaceholder,
  composerContentTypography,
  showConnectionHint,
  connectionHintTitle,
  connectionHintMessage,
  showSlashCommandContextToggle,
  canToggleSlashCommandContext,
  useSlashCommandContext,
  showSelectedTextContextToggle,
  canToggleSelectedTextContext,
  useSelectedTextContext,
  oracleProviderConfig,
  knowledgeType,
  hasWorkspaceExecutionTasks,
  workspaceAgentRunning,
  workspaceExecutionPanel,
  textareaRef,
  promptRows,
  promptMinHeight,
  promptMaxHeight,
  resultPanelMinHeight,
  effectivePrompt,
  normalizedDraft,
  hasSelection,
  hasSlashCommandContext,
  hasCurrentBlock,
  aiDefaultWriteTarget,
  templateModels,
  resultView,
  setResultView,
  retrievalPanelOpen,
  setRetrievalPanelOpen,
  hasRetrievalDetails,
  hasDiffPreview,
  hasInsertPreview,
  diffBlocks,
  canSubmit,
  canExecuteStructuredSql,
  canApplyToEditor,
  canApplyToAnyTarget,
  canReplaceCurrentTarget,
  replaceActionTarget,
  defaultInsertTarget,
  preferredResultAction,
  getCurrentDocumentResultActionStyle,
  runShortcutLabel,
  applyShortcutLabel,
  selectedHostedAgentProfileId,
  onClose,
  onOpenAISetup,
  onCancelRequest,
  onRun,
  onExecuteStructuredSql,
  onResetAndClose,
  onPromptChange,
  onToggleSlashCommandContext,
  onToggleSelectedTextContext,
  onSelectKnowledgeType,
  onSelectDocsStore,
  onSelectDataStore,
  onSelectDataMode,
  onSelectHostedAgentProfile,
  onSelectTemplate,
  onRetry,
  onDiscard,
  onRunWorkspaceAgent,
  onStopWorkspaceAgent,
  onOpenAllWorkspaceDrafts,
  canRunWorkspaceAgent,
  onCopy,
  onApplyReplace,
  onApplyInsert,
  onApplyNewNote,
}: Props) {
  const { t } = useTranslation()
  const formScrollerRef = useRef<HTMLDivElement>(null)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const retrievalPanelRef = useRef<HTMLDivElement>(null)
  const showResultPanel =
    composer.requestState !== 'idle' || normalizedDraft.trim().length > 0 || composer.errorMessage !== null
  const showRetrievalPanel = showResultPanel && hasRetrievalDetails && !composer.errorMessage && !workspaceExecutionPanel
  const retrievalVisibleResultCount = composer.retrievalResults.length
  const retrievalSummaryCount = composer.retrievalResultCount ?? retrievalVisibleResultCount
  const retrievalSummaryLabel =
    composer.retrievalResultCount === null && retrievalVisibleResultCount === 0
      ? t('ai.retrieval.sourcesSummaryUnavailable')
      : t('ai.retrieval.sourcesSummary', { count: retrievalSummaryCount })
  const selectedTextContextEnabledMessage =
    composer.context?.selectedTextRole === 'reference-only'
      ? t('ai.context.selectionReference')
      : composer.outputTarget === 'replace-selection'
        ? t('ai.context.selectionTarget')
        : t('ai.context.selectionContext')
  const selectionContextMessage = useSelectedTextContext
    ? selectedTextContextEnabledMessage
    : t('ai.context.promptOnly')
  const composerFrameStyle: CSSProperties = {
    top: `${composerFrameBounds.top}px`,
    bottom: `${composerFrameBounds.bottom}px`,
    paddingTop: `${AI_COMPOSER_SOURCE_EDGE_GAP_PX}px`,
    paddingBottom: `${AI_COMPOSER_SOURCE_EDGE_GAP_PX}px`,
  }
  const handleViewRetrievalSources = () => {
    setRetrievalPanelOpen(true)

    const scrollToRetrievalPanel = () => {
      retrievalPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }

    if (typeof window === 'undefined') {
      scrollToRetrievalPanel()
      return
    }

    window.requestAnimationFrame(scrollToRetrievalPanel)
  }

  useEffect(() => {
    if (!showResultPanel) return

    const scroller = formScrollerRef.current
    const panel = resultPanelRef.current
    if (!scroller || !panel) return

    const scrollerRect = scroller.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const alreadyAnswerAnchored = Math.abs(panelRect.top - scrollerRect.top) <= 16
    if (alreadyAnswerAnchored) return

    const targetScrollTop = scroller.scrollTop + panelRect.top - scrollerRect.top - 12
    scroller.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'auto' })
  }, [composer.requestState, composer.startedAt, showResultPanel])

  return (
    <div
      className="fixed inset-0 z-[110]"
      style={{ background: 'rgba(0, 0, 0, 0.24)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void onClose()
      }}
    >
      <div
        data-ai-composer-frame="source-editor"
        className="pointer-events-none fixed inset-x-0 flex items-center justify-center px-2 sm:px-6"
        style={composerFrameStyle}
      >
        <div
          ref={dialogRef}
          data-ai-composer="true"
          role="dialog"
          aria-modal="true"
          aria-label={t('ai.title')}
          tabIndex={-1}
          className="glass-panel pointer-events-auto flex w-full flex-col overflow-hidden rounded-[20px] border shadow-2xl"
          style={{
            maxWidth: 'min(960px, calc(100vw - 1rem))',
            minHeight: 'min(540px, 100%)',
            maxHeight: '100%',
            background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
          }}
        >
          <div
            className="flex items-center gap-3 px-5 py-3.5"
            style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)' }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                color: 'var(--accent)',
              }}
            >
              <AppIcon name="sparkles" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('ai.title')}
              </div>
            </div>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => void onClose()}
              aria-label={t('dialog.cancel')}
            >
              <span className="block text-base leading-none">×</span>
            </button>
          </div>

          <div
            ref={formScrollerRef}
            data-ai-composer-scroll="form"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-5 py-4"
          >
          {showConnectionHint && (
            <div
              data-ai-setup-hint="true"
              className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 16%, var(--border))',
                background: 'color-mix(in srgb, var(--bg-secondary) 74%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <AppIcon name="settings" size={13} />
              </span>
              <div className="min-w-0">
                <div className="font-medium">{connectionHintTitle}</div>
                <div className="mt-0.5 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {connectionHintMessage}
                </div>
                <button
                  type="button"
                  data-ai-action="open-ai-setup"
                  onClick={() => void onOpenAISetup()}
                  className="mt-2 inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent) 32%, var(--border))',
                    background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
                    color: 'var(--text-primary)',
                  }}
                >
                  <AppIcon name="sparkles" size={13} />
                  <span className="min-w-0 truncate">{t('ai.setup.open')}</span>
                </button>
              </div>
            </div>
          )}

          {showSelectedTextContextToggle && (
            <div
              data-ai-selection-context="true"
              data-ai-context-state={useSelectedTextContext ? 'selection-context' : 'prompt-only'}
              className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-xs leading-5"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                color: 'var(--text-secondary)',
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <AppIcon name="infoCircle" size={13} className="flex-shrink-0" />
                <p className="m-0 min-w-0 truncate whitespace-nowrap">{selectionContextMessage}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useSelectedTextContext}
                data-ai-action="toggle-selection-context"
                onClick={() => onToggleSelectedTextContext(!useSelectedTextContext)}
                disabled={composer.requestState === 'streaming' || !canToggleSelectedTextContext}
                className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: useSelectedTextContext
                    ? 'color-mix(in srgb, var(--accent) 42%, var(--border))'
                    : 'color-mix(in srgb, var(--border) 86%, transparent)',
                  background: useSelectedTextContext
                    ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                    : 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
                  color: useSelectedTextContext ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span
                  className="relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors"
                  style={{
                    background: useSelectedTextContext
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--border) 88%, transparent)',
                  }}
                  aria-hidden="true"
                >
                  <span
                    className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                    style={{
                      left: '2px',
                      transform: useSelectedTextContext ? 'translateX(12px)' : 'translateX(0)',
                    }}
                  />
                </span>
                <span className="min-w-0 truncate">{t('ai.context.useSelectionContext')}</span>
              </button>
            </div>
          )}

          {showSlashCommandContextToggle && (
            <div
              data-ai-slash-context="true"
              data-ai-context-state={useSlashCommandContext ? 'slash-context' : 'prompt-only'}
              className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-xs leading-5"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                color: 'var(--text-secondary)',
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <AppIcon name="infoCircle" size={13} />
                <p className="m-0 min-w-0 truncate whitespace-nowrap">
                  {useSlashCommandContext ? t('ai.context.slashBefore') : t('ai.context.promptOnly')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useSlashCommandContext}
                data-ai-action="toggle-slash-context"
                onClick={() => onToggleSlashCommandContext(!useSlashCommandContext)}
                disabled={composer.requestState === 'streaming' || !canToggleSlashCommandContext}
                className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: useSlashCommandContext
                    ? 'color-mix(in srgb, var(--accent) 42%, var(--border))'
                    : 'color-mix(in srgb, var(--border) 86%, transparent)',
                  background: useSlashCommandContext
                    ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                    : 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
                  color: useSlashCommandContext ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span
                  className="relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors"
                  style={{
                    background: useSlashCommandContext
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--border) 88%, transparent)',
                  }}
                  aria-hidden="true"
                >
                  <span
                    className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                    style={{
                      left: '2px',
                      transform: useSlashCommandContext ? 'translateX(12px)' : 'translateX(0)',
                    }}
                  />
                </span>
                <span className="min-w-0 truncate">{t('ai.context.useSlashBefore')}</span>
              </button>
            </div>
          )}

          {oracleProviderConfig && (
            <section
              data-ai-knowledge="true"
              className="grid gap-3 rounded-2xl border px-4 py-3"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="grid gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.knowledge.title')}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { value: 'none', label: t('ai.knowledge.type.none') },
                    { value: 'docs', label: t('ai.knowledge.type.docs') },
                    { value: 'data', label: t('ai.knowledge.type.data') },
                    { value: 'agent', label: t('ai.knowledge.type.agent') },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-ai-knowledge-type={option.value}
                      onClick={() => onSelectKnowledgeType(option.value)}
                      className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        borderColor: knowledgeType === option.value ? 'var(--accent)' : 'var(--border)',
                        background:
                          knowledgeType === option.value
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

              {knowledgeType === 'docs' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.knowledge.docsLabel')}
                  </span>
                  <select
                    value={
                      composer.knowledgeSelection.kind === 'oracle-unstructured-store'
                        ? composer.knowledgeSelection.registrationId
                        : ''
                    }
                    onChange={(event) => onSelectDocsStore(event.target.value)}
                    className="rounded-2xl border px-3 py-2 text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">{t('ai.connection.noneOption')}</option>
                    {oracleProviderConfig.unstructuredStores
                      .filter((store) => store.enabled)
                      .map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.label || store.id}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {knowledgeType === 'data' && (
                <div className="grid gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.knowledge.dataLabel')}
                    </span>
                    <select
                      value={
                        composer.knowledgeSelection.kind === 'oracle-structured-store'
                          ? composer.knowledgeSelection.registrationId
                          : ''
                      }
                      onChange={(event) => onSelectDataStore(event.target.value)}
                      className="rounded-2xl border px-3 py-2 text-xs outline-none"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="">{t('ai.connection.noneOption')}</option>
                      {oracleProviderConfig.structuredStores
                        .filter((store) => store.enabled)
                        .map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.label || store.id}
                          </option>
                        ))}
                    </select>
                  </label>
                  {composer.knowledgeSelection.kind === 'oracle-structured-store' ? (
                    <div className="grid gap-1">
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {t('ai.knowledge.action')}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { mode: 'sql-draft', label: t('ai.knowledge.structuredAction.sqlDraft') },
                          { mode: 'agent-answer', label: t('ai.knowledge.structuredAction.agentAnswer') },
                        ] as const).map((option) => (
                          <button
                            key={option.mode}
                            type="button"
                            data-ai-structured-mode={option.mode}
                            onClick={() => onSelectDataMode(option.mode)}
                            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                            style={{
                              borderColor:
                                composer.knowledgeSelection.kind === 'oracle-structured-store' &&
                                composer.knowledgeSelection.mode === option.mode
                                  ? 'var(--accent)'
                                  : 'var(--border)',
                              background:
                                composer.knowledgeSelection.kind === 'oracle-structured-store' &&
                                composer.knowledgeSelection.mode === option.mode
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
                  ) : null}
                </div>
              )}

              {knowledgeType === 'agent' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t('ai.knowledge.executionAgent')}
                  </span>
                  <select
                    value={selectedHostedAgentProfileId ?? ''}
                    onChange={(event) => onSelectHostedAgentProfile(event.target.value || null)}
                    data-ai-agent-profile-select="true"
                    className="rounded-2xl border px-3 py-2 text-xs outline-none"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">{t('ai.connection.noneOption')}</option>
                    {oracleProviderConfig.hostedAgentProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label || profile.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
          )}

          <textarea
            ref={textareaRef}
            data-ai-composer-prompt="true"
            value={composer.prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            rows={promptRows}
            className="w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none transition-colors"
            style={{
              ...composerContentTypography.text,
              minHeight: promptMinHeight,
              maxHeight: promptMaxHeight,
              overflowY: 'auto',
              background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
              borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
              color: 'var(--text-primary)',
            }}
            placeholder={promptPlaceholder}
          />

          <AIQuickChips
            templates={templateModels}
            composerIntent={composer.intent}
            composerScope={composer.scope}
            composerOutputTarget={composer.outputTarget}
            composerPrompt={effectivePrompt}
            hasSelection={hasSelection}
            hasSlashCommandContext={hasSlashCommandContext}
            hasCurrentBlock={hasCurrentBlock}
            aiDefaultWriteTarget={aiDefaultWriteTarget}
            onSelectTemplate={onSelectTemplate}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2">
              {composer.requestState === 'streaming' ? (
                <button
                  type="button"
                  onClick={() => void onCancelRequest()}
                  data-ai-action="cancel-request"
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {t('ai.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onRun()}
                  data-ai-action="run"
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ background: 'var(--accent)', color: 'white' }}
                  disabled={!canSubmit}
                  title={`${t('ai.run')} (${runShortcutLabel})`}
                >
                  {t('ai.run')}
                </button>
              )}
              <button
                type="button"
                onClick={onResetAndClose}
                data-ai-action="close"
                className="rounded-full border px-4 py-1.5 text-sm transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
              >
                {t('dialog.cancel')}
              </button>
            </div>
            <div
              data-ai-current-output-target="true"
              className="ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 84%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 64%, transparent)',
                color: 'var(--text-muted)',
              }}
            >
              <span>{t('ai.responseModeLabel')}</span>
              <span style={{ color: 'var(--text-primary)' }}>{t(`ai.outputTarget.${composer.outputTarget}`)}</span>
            </div>
          </div>

          {showResultPanel && (
            <div
              ref={resultPanelRef}
              data-ai-result-panel="true"
              className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border ${
                showRetrievalPanel ? 'shrink-0' : 'flex-1'
              }`}
              style={{
                minHeight: resultPanelMinHeight,
                maxHeight: showRetrievalPanel ? 'min(52vh, 460px)' : undefined,
                flex: showRetrievalPanel ? '0 0 auto' : undefined,
                borderColor: 'color-mix(in srgb, var(--border) 86%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              }}
            >
              <div
                className="flex flex-wrap items-start gap-2 px-4 py-2"
                style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)' }}
              >
                <div className="flex shrink-0 items-center gap-0.5">
                  {(
                    [
                      { view: 'draft', label: t('ai.result.draft') },
                      { view: 'diff', label: t('ai.result.diff'), disabled: !hasDiffPreview && !hasInsertPreview },
                    ] as Array<{ view: typeof resultView; label: string; disabled?: boolean }>
                  ).map(({ view, label, disabled }) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => !disabled && setResultView(view)}
                      data-ai-result-view={view}
                      disabled={disabled}
                      className="rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background:
                          resultView === view
                            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                            : 'transparent',
                        color: resultView === view ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="hidden flex-1 sm:block" />
                {composer.sourceLabel && (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {composer.sourceLabel}
                  </span>
                )}
                {showRetrievalPanel && (
                  <button
                    type="button"
                    onClick={handleViewRetrievalSources}
                    data-ai-result-source-summary="true"
                    aria-expanded={retrievalPanelOpen}
                    className="inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                      background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-primary))',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <AppIcon name="search" size={12} />
                    <span className="min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                      {retrievalSummaryLabel}
                    </span>
                    <span className="hidden shrink-0 sm:inline" style={{ color: 'var(--text-muted)' }}>
                      {t('ai.retrieval.viewSources')}
                    </span>
                  </button>
                )}
                {normalizedDraft && (
                  <div
                    data-ai-result-actions="true"
                    className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-1.5 sm:flex-none sm:basis-auto sm:justify-end"
                  >
                    <button
                      type="button"
                      onClick={() => void onRetry()}
                      data-ai-action="retry"
                      className="shrink-0 px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{ color: 'var(--text-muted)' }}
                      disabled={composer.requestState === 'streaming' || !canSubmit}
                    >
                      {t('ai.retry')}
                    </button>
                    <button
                      type="button"
                      onClick={onDiscard}
                      data-ai-action="discard"
                      className="max-w-full shrink-0 truncate rounded-lg border px-2.5 py-1 text-xs transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {t('ai.discard')}
                    </button>
                    {hasWorkspaceExecutionTasks && (
                      <>
                        <button
                          type="button"
                          onClick={() => void onRunWorkspaceAgent()}
                          data-ai-action="run-workspace-agent"
                          className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ background: 'var(--accent)', color: 'white' }}
                          disabled={!canRunWorkspaceAgent}
                        >
                          {t('ai.workspaceExecution.runAgent')}
                        </button>
                        {workspaceAgentRunning && (
                          <button
                            type="button"
                            onClick={onStopWorkspaceAgent}
                            data-ai-action="stop-workspace-agent"
                            className="max-w-full shrink-0 truncate rounded-lg border px-2.5 py-1 text-xs transition-colors"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {t('ai.workspaceExecution.stopAgent')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onOpenAllWorkspaceDrafts}
                          data-ai-action="open-all-workspace-drafts"
                          className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))',
                            color: 'var(--text-primary)',
                            border: '1px solid color-mix(in srgb, var(--accent) 26%, var(--border))',
                          }}
                          disabled={workspaceAgentRunning}
                        >
                          {t('ai.workspaceExecution.openAllDrafts')}
                        </button>
                      </>
                    )}
                    {!hasWorkspaceExecutionTasks && canApplyToEditor && (
                      <>
                        <button
                          type="button"
                          onClick={() => void onCopy()}
                          data-ai-action="copy"
                          className="max-w-full shrink-0 truncate rounded-lg border px-2.5 py-1 text-xs transition-colors"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          {t('ai.copy')}
                        </button>
                        <div
                          aria-hidden="true"
                          className="mx-0.5 h-4 w-px"
                          style={{ background: 'color-mix(in srgb, var(--border) 88%, transparent)' }}
                        />
                        <button
                          type="button"
                          onClick={onApplyReplace}
                          data-ai-action="replace"
                          disabled={!canApplyToAnyTarget || !canReplaceCurrentTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'replace' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={getCurrentDocumentResultActionStyle('replace')}
                          title={
                            preferredResultAction === 'replace'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : undefined
                          }
                        >
                          {replaceActionTarget ? t(`ai.outputTarget.${replaceActionTarget}`) : t('search.replace')}
                        </button>
                        <button
                          type="button"
                          onClick={onApplyInsert}
                          data-ai-action="insert"
                          disabled={!canApplyToAnyTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'insert' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={getCurrentDocumentResultActionStyle('insert')}
                          title={
                            preferredResultAction === 'insert'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : t(`ai.outputTarget.${defaultInsertTarget}`)
                          }
                        >
                          {t('ai.insert')}
                        </button>
                        <button
                          type="button"
                          onClick={onApplyNewNote}
                          data-ai-action="new-note"
                          disabled={!canApplyToAnyTarget}
                          aria-keyshortcuts={
                            preferredResultAction === 'new-note' ? 'Control+Shift+Enter Meta+Shift+Enter' : undefined
                          }
                          className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                          style={getCurrentDocumentResultActionStyle('new-note')}
                          title={
                            preferredResultAction === 'new-note'
                              ? `${t('ai.apply')} (${applyShortcutLabel})`
                              : undefined
                          }
                        >
                          {t('ai.outputTarget.new-note')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div
                data-ai-result-body="true"
                className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
                style={{ maxHeight: showRetrievalPanel ? 'min(34vh, 320px)' : undefined }}
              >
                {composer.requestState === 'streaming' && (
                  <p className="text-sm" style={{ ...composerContentTypography.text, color: 'var(--text-muted)' }}>
                    {t('ai.loading')}
                  </p>
                )}
                {composer.errorMessage && (
                  <p
                    className="whitespace-pre-wrap break-words text-sm"
                    style={{ ...composerContentTypography.text, color: '#dc2626' }}
                  >
                    {composer.errorMessage}
                  </p>
                )}
                {!composer.errorMessage && resultView === 'draft' && (
                  <>
                    {workspaceExecutionPanel ? (
                      workspaceExecutionPanel
                    ) : composer.draftFormat === 'sql' ? (
                      <AISqlDraftPreview
                        sql={normalizedDraft}
                        explanationText={composer.explanationText}
                        warningText={composer.warningText}
                        sourceLabel={composer.sourceLabel}
                        generatedSql={composer.generatedSql}
                        executionStatus={composer.structuredExecutionStatus}
                        executionToolName={composer.structuredExecutionToolName}
                        canExecuteStructuredSql={canExecuteStructuredSql}
                        onExecuteStructuredSql={onExecuteStructuredSql}
                        typography={composerContentTypography}
                      />
                    ) : composer.generatedSql ? (
                      <AIStructuredExecutionPreview
                        answer={normalizedDraft}
                        generatedSql={composer.generatedSql}
                        explanationText={composer.explanationText}
                        warningText={composer.warningText}
                        sourceLabel={composer.sourceLabel}
                        executionStatus={composer.structuredExecutionStatus}
                        executionToolName={composer.structuredExecutionToolName}
                        typography={composerContentTypography}
                      />
                    ) : (
                      <pre
                        className="m-0 whitespace-pre-wrap break-words text-sm"
                        style={{
                          ...composerContentTypography.text,
                          color: 'var(--text-primary)',
                          fontFamily: 'inherit',
                        }}
                      >
                        {normalizedDraft || t('ai.result.empty')}
                      </pre>
                    )}
                  </>
                )}
                {!composer.errorMessage && resultView === 'diff' && (
                  <>
                    {hasDiffPreview ? (
                      <AIDiffPreview
                        blocks={diffBlocks}
                        emptyLabel={t('ai.result.noDiff')}
                        typography={composerContentTypography}
                      />
                    ) : hasInsertPreview ? (
                      <AIInsertionPreview
                        outputTarget={composer.outputTarget}
                        text={normalizedDraft}
                        targetLabel={t(`ai.outputTarget.${composer.outputTarget}`)}
                        emptyLabel={t('ai.result.noDiff')}
                        typography={composerContentTypography}
                      />
                    ) : (
                      <p className="text-sm" style={{ ...composerContentTypography.text, color: 'var(--text-muted)' }}>
                        {t('ai.result.noDiff')}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {showRetrievalPanel && (
            <AIRetrievalDisclosure
              panelRef={retrievalPanelRef}
              expanded={retrievalPanelOpen}
              onToggle={() => setRetrievalPanelOpen((value) => !value)}
              retrievalExecuted={composer.retrievalExecuted}
              query={composer.retrievalQuery}
              results={composer.retrievalResults}
              totalResultCount={composer.retrievalResultCount}
              typography={composerContentTypography}
            />
          )}
        </div>
      </div>
    </div>
  </div>
  )
}

function AIRetrievalDisclosure({
  panelRef,
  expanded,
  onToggle,
  retrievalExecuted,
  query,
  results,
  totalResultCount,
  typography,
}: {
  panelRef: RefObject<HTMLDivElement>
  expanded: boolean
  onToggle: () => void
  retrievalExecuted: boolean
  query: string | null
  results: AIRetrievalResultPreview[]
  totalResultCount: number | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()
  const bodyId = useId()
  const visibleResultCount = results.length
  const summaryCount = totalResultCount ?? visibleResultCount
  const summaryLabel =
    totalResultCount === null && visibleResultCount === 0
      ? t('ai.retrieval.summaryUnavailable')
      : t('ai.retrieval.summary', { count: summaryCount })

  return (
    <div
      ref={panelRef}
      data-ai-retrieval-panel="true"
      className="min-w-0 shrink-0 overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border))',
        background: 'color-mix(in srgb, var(--bg-secondary) 82%, var(--bg-primary))',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        data-ai-retrieval-toggle="true"
        className="group flex w-full min-w-0 cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
        style={{
          background: expanded
            ? 'color-mix(in srgb, var(--accent) 9%, var(--bg-primary))'
            : 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
          color: 'var(--text-primary)',
        }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <AppIcon name="search" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-semibold"
            style={{ ...typography.text, color: 'var(--text-primary)' }}
          >
            {t('ai.retrieval.title')}
          </div>
          <div className="mt-1 truncate text-xs" style={{ ...typography.meta, color: 'var(--text-secondary)' }}>
            {summaryLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {query ? (
            <span
              className="hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:inline-flex"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              {t('ai.retrieval.query')}
            </span>
          ) : null}
          <span
            className="hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:inline-flex"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              color: 'var(--text-muted)',
            }}
          >
            {t('ai.retrieval.resultsCount', { count: summaryCount })}
          </span>
          <span
            className="hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:inline-flex"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            {expanded ? t('ai.retrieval.hide') : t('ai.retrieval.show')}
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-transform"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border))',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-secondary)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            <AppIcon name="chevronRight" size={16} />
          </span>
        </div>
      </button>
      {!expanded ? (
        <div
          data-ai-retrieval-peek="true"
          className="grid gap-2 border-t px-3.5 py-3 md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)' }}
        >
          <AIRetrievalQueryCard
            compact
            retrievalExecuted={retrievalExecuted}
            query={query}
            typography={typography}
          />
          <AIRetrievalResultsList
            compact
            results={results}
            summaryCount={summaryCount}
            typography={typography}
          />
        </div>
      ) : null}
      {expanded ? (
        <div
          id={bodyId}
          data-ai-retrieval-body="true"
          className="grid gap-3 border-t px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            maxHeight: 'min(42vh, 380px)',
            overflowY: 'auto',
          }}
        >
          <AIRetrievalQueryCard
            retrievalExecuted={retrievalExecuted}
            query={query}
            typography={typography}
          />
          <AIRetrievalResultsList
            results={results}
            summaryCount={summaryCount}
            typography={typography}
          />
        </div>
      ) : null}
    </div>
  )
}

function AIRetrievalQueryCard({
  compact = false,
  retrievalExecuted,
  query,
  typography,
}: {
  compact?: boolean
  retrievalExecuted: boolean
  query: string | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()
  if (!query && !retrievalExecuted) return null
  const compactClampStyle: CSSProperties = compact
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
      }
    : {}

  return (
    <section
      data-ai-retrieval-query="true"
      className={`min-w-0 rounded-xl border ${compact ? 'px-3 py-2.5' : 'px-3 py-3'}`}
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-primary))',
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ ...typography.meta, color: 'var(--text-muted)' }}
      >
        {t('ai.retrieval.query')}
      </div>
      {query ? (
        <pre
          className="whitespace-pre-wrap break-words"
          style={{
            ...typography.code,
            ...compactClampStyle,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            margin: 0,
            marginTop: compact ? '0.375rem' : '0.5rem',
          }}
        >
          {query}
        </pre>
      ) : (
        <p
          className={compact ? 'text-xs' : 'text-sm'}
          style={{
            ...typography.text,
            color: 'var(--text-muted)',
            margin: 0,
            marginTop: compact ? '0.375rem' : '0.5rem',
          }}
        >
          {t('ai.retrieval.noQuery')}
        </p>
      )}
    </section>
  )
}

function AIRetrievalResultsList({
  compact = false,
  results,
  summaryCount,
  typography,
}: {
  compact?: boolean
  results: AIRetrievalResultPreview[]
  summaryCount: number
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()
  const visibleResults = compact ? results.slice(0, 2) : results
  const remainingResultCount = compact ? Math.max(summaryCount - visibleResults.length, 0) : 0
  const showResultsList = visibleResults.length > 0

  return (
    <section data-ai-retrieval-results="true" className="min-w-0 grid gap-2">
      <div
        className="flex min-w-0 items-center justify-between gap-3"
        style={{ ...typography.meta, color: 'var(--text-muted)' }}
      >
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.16em]">
          {t('ai.retrieval.results')}
        </span>
        <span className="shrink-0">{t('ai.retrieval.resultsCount', { count: summaryCount })}</span>
      </div>
      {showResultsList ? (
        <div className={compact ? 'grid gap-1.5 sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-2'}>
          {visibleResults.map((result, index) => (
            <AIRetrievalResultCard
              key={`${result.title}-${result.detail ?? index}`}
              compact={compact}
              index={index}
              result={result}
              typography={typography}
            />
          ))}
          {remainingResultCount > 0 ? (
            <div
              data-ai-retrieval-more-count="true"
              className="rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                ...typography.meta,
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                color: 'var(--text-secondary)',
              }}
            >
              {t('ai.retrieval.moreResults', { count: remainingResultCount })}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="rounded-xl border px-3 py-3 text-sm"
          style={{
            ...typography.text,
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          {t('ai.retrieval.noResults')}
        </div>
      )}
    </section>
  )
}

function AIRetrievalResultCard({
  compact,
  index,
  result,
  typography,
}: {
  compact: boolean
  index: number
  result: AIRetrievalResultPreview
  typography: AIComposerContentTypography
}) {
  const snippetClampStyle: CSSProperties = compact
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
      }
    : {}

  return (
    <article
      data-ai-retrieval-result={index}
      data-ai-retrieval-result-mode={compact ? 'preview' : 'detail'}
      className={`min-w-0 rounded-xl border ${compact ? 'px-2.5 py-2' : 'px-3 py-3'}`}
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        borderLeft: '3px solid color-mix(in srgb, var(--accent) 46%, var(--border))',
        background: compact
          ? 'color-mix(in srgb, var(--bg-primary) 88%, transparent)'
          : 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`${compact ? 'text-xs' : 'text-sm'} truncate font-semibold`} style={typography.text}>
            {result.title}
          </div>
          {result.detail ? (
            <div className="mt-0.5 truncate text-xs" style={{ ...typography.meta, color: 'var(--text-muted)' }}>
              {result.detail}
            </div>
          ) : null}
          {result.snippet ? (
            <p
              className={`${compact ? 'mt-1 text-xs leading-5' : 'mt-2 text-sm'} break-words`}
              style={{
                ...typography.text,
                ...snippetClampStyle,
                color: 'var(--text-secondary)',
                marginBottom: 0,
              }}
            >
              {result.snippet}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function AIQuickChips({
  templates,
  composerIntent,
  composerScope,
  composerOutputTarget,
  composerPrompt,
  hasSelection,
  hasSlashCommandContext,
  hasCurrentBlock,
  aiDefaultWriteTarget,
  onSelectTemplate,
}: {
  templates: AITemplateModel[]
  composerIntent: AIIntent
  composerScope: 'selection' | 'current-block' | 'document'
  composerOutputTarget: string
  composerPrompt: string
  hasSelection: boolean
  hasSlashCommandContext: boolean
  hasCurrentBlock: boolean
  aiDefaultWriteTarget: 'replace-selection' | 'at-cursor' | 'insert-below'
  onSelectTemplate: (template: AITemplateModel) => void
}) {
  const { t } = useTranslation()

  const chipTemplates = useMemo(
    () =>
      AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER
        .map((id) => templates.find((tmpl) => tmpl.id === id))
        .filter((tmpl): tmpl is AITemplateModel => tmpl !== undefined),
    [templates]
  )
  const resolvedTemplates = useMemo(
    () =>
      chipTemplates.map((template) => ({
        template,
        resolution: resolveAIComposerTemplateResolution(template, {
          hasSelection,
          hasSlashCommandContext,
          hasCurrentBlock,
          aiDefaultWriteTarget,
        }),
      })),
    [aiDefaultWriteTarget, chipTemplates, hasCurrentBlock, hasSelection, hasSlashCommandContext]
  )
  const showTransformHint = resolvedTemplates.some(({ resolution }) => !resolution.enabled)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.mode.suggestions')}
        </span>
        {resolvedTemplates.map(({ template, resolution }) => {
          const active =
            composerIntent === resolution.intent &&
            composerScope === resolution.scope &&
            composerOutputTarget === resolution.outputTarget &&
            composerPrompt === template.prompt

          return (
            <button
              key={template.id}
              type="button"
              data-ai-template={template.id}
              onClick={() => onSelectTemplate(template)}
              disabled={!resolution.enabled}
              className="rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                borderColor: active
                  ? 'color-mix(in srgb, var(--accent) 32%, var(--border))'
                  : 'color-mix(in srgb, var(--border) 82%, transparent)',
                background: active
                  ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                  : 'color-mix(in srgb, var(--bg-secondary) 64%, transparent)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              title={resolution.enabled ? template.detail : t('ai.target.transformHint')}
            >
              {template.label}
            </button>
          )
        })}
      </div>
      {showTransformHint && (
        <p
          data-ai-template-hint="transform-target-required"
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('ai.target.transformHint')}
        </p>
      )}
    </div>
  )
}

function AISqlDraftPreview({
  sql,
  explanationText,
  warningText,
  sourceLabel,
  generatedSql,
  executionStatus,
  executionToolName,
  canExecuteStructuredSql,
  onExecuteStructuredSql,
  typography,
}: {
  sql: string
  explanationText: string
  warningText: string | null
  sourceLabel: string | null
  generatedSql: string | null
  executionStatus: string | null
  executionToolName: string | null
  canExecuteStructuredSql: boolean
  onExecuteStructuredSql: () => Promise<void>
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()
  const visibleSql = sql || generatedSql || ''

  return (
    <div className="grid gap-3">
      <div
        data-ai-sql-draft-card="true"
        className="min-w-0 overflow-hidden rounded-2xl border px-3 py-3"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.knowledge.structuredAction.sqlDraft')}
          </div>
          <div
            data-ai-sql-draft-header-actions="true"
            className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2"
          >
            {sourceLabel ? (
              <span
                className="min-w-0 max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                  color: 'var(--text-muted)',
                }}
                title={sourceLabel}
              >
                {sourceLabel}
              </span>
            ) : null}
            {canExecuteStructuredSql ? (
              <button
                type="button"
                data-ai-action="execute-structured-sql"
                onClick={() => void onExecuteStructuredSql()}
                className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                }}
                title={t('ai.knowledge.structuredExecution.execute')}
              >
                <AppIcon name="table" size={13} />
                <span className="min-w-0 truncate">{t('ai.knowledge.structuredExecution.execute')}</span>
              </button>
            ) : null}
          </div>
        </div>
        <pre
          data-ai-sql-draft="true"
          className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl px-3 py-3"
          style={{
            ...typography.code,
            background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {visibleSql || t('ai.result.empty')}
        </pre>
      </div>
      {executionStatus ? (
        <AIExecutionStatusCard
          status={executionStatus}
          toolName={executionToolName}
          typography={typography}
        />
      ) : null}
      {explanationText ? (
        <div className="text-[11px] leading-5" style={{ ...typography.meta, color: 'var(--text-secondary)' }}>
          {explanationText}
        </div>
      ) : null}
      {warningText ? (
        <div
          className="rounded-xl border px-3 py-2 text-[11px] leading-5"
          style={{
            ...typography.meta,
            borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
            background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-secondary))',
            color: 'var(--text-primary)',
          }}
        >
          {warningText}
        </div>
      ) : null}
    </div>
  )
}

function AIStructuredExecutionPreview({
  answer,
  generatedSql,
  explanationText,
  warningText,
  sourceLabel,
  executionStatus,
  executionToolName,
  typography,
}: {
  answer: string
  generatedSql: string
  explanationText: string
  warningText: string | null
  sourceLabel: string | null
  executionStatus: string | null
  executionToolName: string | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3">
      <AISqlDraftPreview
        sql={generatedSql}
        generatedSql={generatedSql}
        explanationText=""
        warningText={null}
        sourceLabel={sourceLabel}
        executionStatus={null}
        executionToolName={null}
        canExecuteStructuredSql={false}
        onExecuteStructuredSql={async () => undefined}
        typography={typography}
      />
      <AIExecutionStatusCard
        status={executionStatus ?? t('ai.knowledge.structuredExecution.completed')}
        toolName={executionToolName}
        typography={typography}
      />
      <div
        className="rounded-2xl border px-3 py-3"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.knowledge.structuredExecution.answer')}
        </div>
        <pre
          className="mt-3 m-0 whitespace-pre-wrap break-words text-sm"
          style={{
            ...typography.text,
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        >
          {answer || t('ai.result.empty')}
        </pre>
      </div>
      {explanationText ? (
        <div className="text-[11px] leading-5" style={{ ...typography.meta, color: 'var(--text-secondary)' }}>
          {explanationText}
        </div>
      ) : null}
      {warningText ? (
        <div
          className="rounded-xl border px-3 py-2 text-[11px] leading-5"
          style={{
            ...typography.meta,
            borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
            background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-secondary))',
            color: 'var(--text-primary)',
          }}
        >
          {warningText}
        </div>
      ) : null}
    </div>
  )
}

function AIExecutionStatusCard({
  status,
  toolName,
  typography,
}: {
  status: string
  toolName: string | null
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()

  return (
    <div
      data-ai-structured-execution-status="true"
      className="rounded-2xl border px-3 py-2"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-secondary))',
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
        {t('ai.knowledge.structuredExecution.status')}
      </div>
      <div className="mt-1 text-[11px] leading-5" style={{ ...typography.meta, color: 'var(--text-primary)' }}>
        {status}
      </div>
      {toolName ? (
        <div className="mt-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {toolName}
        </div>
      ) : null}
    </div>
  )
}

function AIDiffPreview({
  blocks,
  emptyLabel,
  typography,
}: {
  blocks: ReturnType<typeof import('../../lib/lineDiff.ts').diffTextByLine>
  emptyLabel: string
  typography: AIComposerContentTypography
}) {
  const { t } = useTranslation()

  if (blocks.length === 0) {
    return <p className="text-sm" style={{ ...typography.text, color: 'var(--text-muted)' }}>{emptyLabel}</p>
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <div
          key={block.id}
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 84%, transparent)' }}
        >
          {block.type === 'equal' ? (
            <AIMarkdownLineList
              title={t('ai.result.context')}
              lines={block.localLines}
              tone="context"
              typography={typography}
            />
          ) : (
            <div className="grid gap-px md:grid-cols-2" style={{ background: 'var(--border)' }}>
              <AIMarkdownLineList
                title={t('ai.result.current')}
                lines={block.localLines}
                tone="current"
                typography={typography}
              />
              <AIMarkdownLineList
                title={t('ai.result.aiDraft')}
                lines={block.diskLines}
                tone="draft"
                typography={typography}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AIMarkdownLineList({
  title,
  lines,
  tone,
  typography,
}: {
  title: string
  lines: string[]
  tone: 'context' | 'current' | 'draft'
  typography: AIComposerContentTypography
}) {
  const renderedLines = buildMarkdownPreviewLines(lines)
  const palette = getMarkdownTonePalette(tone)

  return (
    <div
      className="min-w-0"
      style={{
        background: palette.panelBackground,
        color: 'var(--text-primary)',
      }}
    >
      <div
        className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{
          borderColor: palette.headerBorder,
          color: 'var(--text-muted)',
          background: palette.headerBackground,
        }}
      >
        {title}
      </div>
      <div className="grid gap-px" style={{ background: palette.rowDivider }}>
        {renderedLines.length > 0 ? (
          renderedLines.map((line) => (
            <AIMarkdownLineRow key={line.id} line={line} tone={tone} typography={typography} />
          ))
        ) : (
          <div
            className="px-3 py-3 text-xs"
            style={{
              background: palette.rowBackground,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            }}
          >
            {' '}
          </div>
        )}
      </div>
    </div>
  )
}

function AIMarkdownLineRow({
  line,
  tone,
  typography,
}: {
  line: ReturnType<typeof buildMarkdownPreviewLines>[number]
  tone: 'context' | 'current' | 'draft'
  typography: AIComposerContentTypography
}) {
  const tonePalette = getMarkdownTonePalette(tone)
  const kindPalette = getMarkdownKindPalette(line.kind, tone)
  const preserveSpacing = line.kind === 'table' || line.kind === 'code' || line.kind === 'fence'
  const visibleText = line.text.length > 0 ? line.text : ' '

  return (
    <div
      className="flex min-w-0 items-start gap-3 px-3 py-2"
      style={{
        background: kindPalette.background ?? tonePalette.rowBackground,
        borderLeft: `3px solid ${kindPalette.border}`,
      }}
    >
      <span
        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{
          color: 'var(--text-muted)',
          minWidth: '2.25rem',
        }}
      >
        {String(line.lineNumber).padStart(2, '0')}
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
        style={{
          background: kindPalette.badgeBackground,
          color: kindPalette.badgeColor,
        }}
      >
        {getMarkdownPreviewLineBadge(line.kind)}
      </span>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <span
          className="block text-xs"
          style={{
            ...typography.code,
            color: kindPalette.text,
            fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            fontWeight: line.kind === 'heading' ? 700 : 500,
            whiteSpace: preserveSpacing ? 'pre' : 'pre-wrap',
            wordBreak: preserveSpacing ? 'normal' : 'break-word',
          }}
        >
          {visibleText}
        </span>
      </div>
    </div>
  )
}

function getMarkdownTonePalette(tone: 'context' | 'current' | 'draft') {
  switch (tone) {
    case 'current':
      return {
        panelBackground: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
        headerBackground: 'color-mix(in srgb, #dc2626 10%, var(--bg-primary))',
        headerBorder: 'color-mix(in srgb, #dc2626 18%, var(--border))',
        rowDivider: 'color-mix(in srgb, #dc2626 14%, var(--border))',
        rowBackground: 'color-mix(in srgb, #dc2626 4%, var(--bg-primary))',
      }
    case 'draft':
      return {
        panelBackground: 'color-mix(in srgb, #16a34a 8%, var(--bg-primary))',
        headerBackground: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
        headerBorder: 'color-mix(in srgb, #16a34a 18%, var(--border))',
        rowDivider: 'color-mix(in srgb, #16a34a 16%, var(--border))',
        rowBackground: 'color-mix(in srgb, #16a34a 4%, var(--bg-primary))',
      }
    case 'context':
    default:
      return {
        panelBackground: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        headerBackground: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        headerBorder: 'color-mix(in srgb, var(--border) 82%, transparent)',
        rowDivider: 'color-mix(in srgb, var(--border) 78%, transparent)',
        rowBackground: 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
      }
  }
}

function getMarkdownKindPalette(
  kind: MarkdownPreviewLineKind,
  tone: 'context' | 'current' | 'draft'
) {
  const accent =
    tone === 'current'
      ? '#dc2626'
      : tone === 'draft'
        ? '#16a34a'
        : 'var(--accent)'

  switch (kind) {
    case 'heading':
      return {
        background: `color-mix(in srgb, ${accent} 12%, var(--bg-primary))`,
        border: `color-mix(in srgb, ${accent} 58%, var(--border))`,
        badgeBackground: `color-mix(in srgb, ${accent} 16%, transparent)`,
        badgeColor: accent,
        text: 'var(--text-primary)',
      }
    case 'list':
      return {
        background: `color-mix(in srgb, ${accent} 7%, var(--bg-primary))`,
        border: `color-mix(in srgb, ${accent} 32%, var(--border))`,
        badgeBackground: `color-mix(in srgb, ${accent} 12%, transparent)`,
        badgeColor: accent,
        text: 'var(--text-primary)',
      }
    case 'quote':
      return {
        background: 'color-mix(in srgb, #f59e0b 9%, var(--bg-primary))',
        border: 'color-mix(in srgb, #f59e0b 36%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #f59e0b 14%, transparent)',
        badgeColor: '#b45309',
        text: 'var(--text-primary)',
      }
    case 'table':
      return {
        background: 'color-mix(in srgb, #0f172a 10%, var(--bg-primary))',
        border: 'color-mix(in srgb, #334155 38%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 12%, transparent)',
        badgeColor: '#334155',
        text: 'var(--text-primary)',
      }
    case 'fence':
      return {
        background: 'color-mix(in srgb, #0f172a 18%, var(--bg-primary))',
        border: 'color-mix(in srgb, #475569 48%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 16%, transparent)',
        badgeColor: '#475569',
        text: 'var(--text-primary)',
      }
    case 'code':
      return {
        background: 'color-mix(in srgb, #0f172a 14%, var(--bg-primary))',
        border: 'color-mix(in srgb, #334155 34%, var(--border))',
        badgeBackground: 'color-mix(in srgb, #0f172a 14%, transparent)',
        badgeColor: '#334155',
        text: 'var(--text-primary)',
      }
    case 'empty':
      return {
        background: undefined,
        border: 'color-mix(in srgb, var(--border) 72%, transparent)',
        badgeBackground: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        badgeColor: 'var(--text-muted)',
        text: 'var(--text-muted)',
      }
    case 'paragraph':
    default:
      return {
        background: undefined,
        border: 'color-mix(in srgb, var(--border) 72%, transparent)',
        badgeBackground: `color-mix(in srgb, ${accent} 8%, transparent)`,
        badgeColor: tone === 'context' ? 'var(--text-muted)' : accent,
        text: 'var(--text-primary)',
      }
  }
}

function AIInsertionPreview({
  outputTarget,
  targetLabel,
  text,
  emptyLabel,
  typography,
}: {
  outputTarget: string
  targetLabel: string
  text: string
  emptyLabel: string
  typography: AIComposerContentTypography
}) {
  if (!text.trim()) {
    return <p className="text-sm" style={{ ...typography.text, color: 'var(--text-muted)' }}>{emptyLabel}</p>
  }

  return (
    <div className="space-y-3">
      <p
        className="text-xs uppercase tracking-[0.18em]"
        style={{ ...typography.meta, color: 'var(--text-muted)' }}
      >
        {targetLabel}
      </p>
      <pre
        className="whitespace-pre-wrap break-words rounded-xl border px-3 py-3 text-sm"
        style={{
          ...typography.code,
          borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
          background:
            outputTarget === 'chat-only'
              ? 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)'
              : 'color-mix(in srgb, #16a34a 8%, var(--bg-primary))',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      >
        {text}
      </pre>
    </div>
  )
}
