import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  FOCUS_WIDTH_CUSTOM_MAX,
  FOCUS_WIDTH_CUSTOM_MIN,
  FOCUS_WIDTH_CUSTOM_STEP,
  FOCUS_WIDTH_PRESET_VALUES,
  resolveFocusWidthPx,
  type FocusWidthMode,
} from '../../lib/focusWidth'
import { THEMES, applyTheme, getThemeById } from '../../themes'
import { useAnchoredOverlayStyle } from '../../hooks/useAnchoredOverlayStyle'
import { useEditorStore } from '../../store/editor'

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
    showInvisibleCharacters,
    setShowInvisibleCharacters,
    spellcheckMode,
    setSpellcheckMode,
    wysiwygMode,
    setWysiwygMode,
    typewriterMode,
    setTypewriterMode,
    syntaxHighlightEngine,
    setSyntaxHighlightEngine,
    previewLineBreakMode,
    setPreviewLineBreakMode,
    previewAutoRenderMermaid,
    setPreviewAutoRenderMermaid,
    zoom,
  } = useEditorStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayStyle = useAnchoredOverlayStyle(triggerRef, { align: 'right', width: 420, zoom })
  const resolvedThemeId = getThemeById(activeThemeId).id
  const resolvedFocusWidthPx = resolveFocusWidthPx(focusWidthMode, focusWidthCustomPx)
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

  function selectTheme(id: string) {
    setActiveThemeId(id)
    applyTheme(getThemeById(id))
  }

  if (typeof document === 'undefined' || overlayStyle === null) return null

  return createPortal(
    <div
      ref={panelRef}
      data-theme-panel="true"
      className="fixed z-[80] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-in glass-panel"
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
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
              {
                label: t('themePanel.showInvisibleCharacters'),
                value: showInvisibleCharacters,
                set: setShowInvisibleCharacters,
              },
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
          <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
            {t('themePanel.showInvisibleCharactersHint')}
          </div>

          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.spellcheck')}
            </p>
            <div className="flex gap-2">
              {([
                { mode: 'document-language', label: t('themePanel.spellcheckModes.document-language') },
                { mode: 'system', label: t('themePanel.spellcheckModes.system') },
                { mode: 'off', label: t('themePanel.spellcheckModes.off') },
              ] as const).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSpellcheckMode(mode)}
                  className="flex-1 text-[11px] px-2 py-1.5 rounded transition-all hover-scale"
                  style={{
                    background: spellcheckMode === mode ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: spellcheckMode === mode ? 'white' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
              {spellcheckMode === 'off'
                ? t('themePanel.spellcheckHintOff')
                : spellcheckMode === 'system'
                  ? t('themePanel.spellcheckHintSystem')
                  : t('themePanel.spellcheckHintDocumentLanguage')}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.previewOptions')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="flex items-center justify-between cursor-pointer gap-3">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('themePanel.previewAutoRenderMermaid')}
                  </span>
                  <button
                    type="button"
                    aria-pressed={previewAutoRenderMermaid}
                    onClick={() => setPreviewAutoRenderMermaid(!previewAutoRenderMermaid)}
                    className="relative rounded-full transition-colors flex-shrink-0"
                    style={{
                      width: '36px',
                      height: '20px',
                      background: previewAutoRenderMermaid ? 'var(--accent)' : 'var(--bg-tertiary)',
                    }}
                  >
                    <span
                      className="absolute top-0.5 rounded-full transition-transform"
                      style={{
                        width: '16px',
                        height: '16px',
                        background: 'white',
                        left: previewAutoRenderMermaid ? '18px' : '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </label>
                <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
                  {t('themePanel.previewAutoRenderMermaidHint')}
                </div>
              </div>

              <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('themePanel.previewLineBreaks')}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {([
                  { mode: 'visual-soft-breaks', label: t('themePanel.previewLineBreakModes.visualSoftBreaks') },
                  { mode: 'strict', label: t('themePanel.previewLineBreakModes.strict') },
                ] as const).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewLineBreakMode(mode)}
                    className="flex-1 text-[11px] px-2 py-1.5 rounded transition-all hover-scale"
                    style={{
                      background: previewLineBreakMode === mode ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: previewLineBreakMode === mode ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
                {previewLineBreakMode === 'strict'
                  ? t('themePanel.previewLineBreakHintStrict')
                  : t('themePanel.previewLineBreakHintVisualSoftBreaks')}
              </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('themePanel.syntaxHighlighter') ?? 'Syntax Highlighting'}
            </p>
            <div className="flex gap-2">
              {(['highlightjs', 'shiki'] as const).map((engine) => (
                <button
                  key={engine}
                  type="button"
                  onClick={() => setSyntaxHighlightEngine(engine)}
                  className="flex-1 text-[11px] px-2 py-1.5 rounded transition-all hover-scale"
                  style={{
                    background: syntaxHighlightEngine === engine ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: syntaxHighlightEngine === engine ? 'white' : 'var(--text-muted)',
                  }}
                >
                  {engine === 'highlightjs' ? 'Highlight.js' : 'Shiki'}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-secondary)' }}>
              {syntaxHighlightEngine === 'highlightjs' 
                ? (t('themePanel.highlightjsHint') ?? 'High performance, low memory footprint. Recommended for most users.') 
                : (t('themePanel.shikiHint') ?? 'VS Code quality parsing with exact colors. Slower to load and uses more memory.')
              }
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
