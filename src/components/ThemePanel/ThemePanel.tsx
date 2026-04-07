import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { THEMES, applyTheme, getThemeById } from '../../themes'
import { useEditorStore } from '../../store/editor'

interface Props {
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement>
}

export default function ThemePanel({ onClose, triggerRef }: Props) {
  const { t } = useTranslation()
  const {
    activeThemeId,
    setActiveThemeId,
    fontSize,
    setFontSize,
    lineNumbers,
    setLineNumbers,
    wordWrap,
    setWordWrap,
    wysiwygMode,
    setWysiwygMode,
    typewriterMode,
    setTypewriterMode,
  } = useEditorStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const resolvedThemeId = getThemeById(activeThemeId).id

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

  return (
    <div
      ref={panelRef}
      className="absolute right-2 top-12 z-50 rounded-xl shadow-2xl overflow-hidden animate-in glass-panel"
      style={{
        width: '320px',
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
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
      </div>
    </div>
  )
}
