import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  countPendingMermaidShells,
  warmMermaid,
  warmMermaidForSource,
  warmMermaidForSources,
  hasRenderedMermaidShells,
  prepareMermaidShells,
  renderMermaidShells,
  updateMermaidShellLabels,
} from '../../lib/mermaid'
import { ensureKatexStylesheet } from '../../lib/katexStylesheet'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useActiveTab, useEditorStore } from '../../store/editor'

export default function MarkdownPreview() {
  const { t, i18n } = useTranslation()
  const activeTab = useActiveTab()
  const activeThemeId = useEditorStore((state) => state.activeThemeId)
  const fontSize = useEditorStore((state) => state.fontSize)
  const content = activeTab?.content ?? ''
  const deferredContent = useDeferredValue(content)
  const html = useMarkdown(deferredContent)
  const previewRef = useRef<HTMLDivElement>(null)
  const [pendingMermaidCount, setPendingMermaidCount] = useState(0)
  const [renderingAll, setRenderingAll] = useState(false)

  const mermaidLabels = useMemo(
    () => ({
      label: t('preview.mermaidLabel'),
      render: t('preview.renderDiagram'),
      refresh: t('preview.refreshDiagram'),
      error: t('preview.diagramError'),
    }),
    [i18n.language, t]
  )

  const getMermaidTheme = () =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'default'

  const warmMermaidTask = (task: Promise<void>) => {
    void task.catch((error) => {
      console.error('Warm Mermaid error:', error)
    })
  }

  const getShellSource = (shell: HTMLElement): string | null => {
    const encodedSource = shell.dataset.mermaidSource
    if (!encodedSource) return null

    try {
      return decodeURIComponent(encodedSource)
    } catch {
      return null
    }
  }

  const warmMermaidShell = (shell: HTMLElement) => {
    const source = getShellSource(shell)
    warmMermaidTask(source ? warmMermaidForSource(source) : warmMermaid())
  }

  const getPendingMermaidSources = (preview: HTMLElement): string[] =>
    Array.from(preview.querySelectorAll<HTMLElement>('.mermaid-shell[data-mermaid-rendered="false"]'))
      .map(getShellSource)
      .filter((source): source is string => source !== null)

  const warmPendingMermaidSources = (preview: HTMLElement) => {
    warmMermaidTask(warmMermaidForSources(getPendingMermaidSources(preview)))
  }

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    prepareMermaidShells(preview, mermaidLabels, getMermaidTheme())
    updateMermaidShellLabels(preview, mermaidLabels)
    setPendingMermaidCount(countPendingMermaidShells(preview))
  }, [html, mermaidLabels])

  useEffect(() => {
    if (!html.includes('class="katex"')) return
    void ensureKatexStylesheet().catch((error) => {
      console.error('Load KaTeX stylesheet error:', error)
    })
  }, [html])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !hasRenderedMermaidShells(preview)) return

    let cancelled = false
    const mermaidTheme = getMermaidTheme()
    void renderMermaidShells(preview, mermaidTheme, {
      isCancelled: () => cancelled,
      renderedOnly: true,
    })

    return () => {
      cancelled = true
    }
  }, [activeThemeId, html])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const onWarmIntent = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-mermaid-action="render"]')) return

      const shell = target.closest<HTMLElement>('.mermaid-shell')
      if (!shell) return
      warmMermaidShell(shell)
    }

    preview.addEventListener('pointerover', onWarmIntent)
    preview.addEventListener('focusin', onWarmIntent)
    return () => {
      preview.removeEventListener('pointerover', onWarmIntent)
      preview.removeEventListener('focusin', onWarmIntent)
    }
  }, [])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-mermaid-action="render"]')
      if (!button) return

      const shell = button.closest<HTMLElement>('.mermaid-shell')
      if (!shell) return

      button.disabled = true
      warmMermaidShell(shell)
      const mermaidTheme = getMermaidTheme()
      void renderMermaidShells(preview, mermaidTheme, { targets: [shell] }).finally(() => {
        button.disabled = false
        setPendingMermaidCount(countPendingMermaidShells(preview))
      })
    }

    preview.addEventListener('click', onClick)
    return () => preview.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visibleEntries.length === 0) return
        const id = (visibleEntries[0].target as HTMLElement).id
        document.dispatchEvent(new CustomEvent('preview:activeHeading', { detail: id }))
      },
      { root: preview, rootMargin: '0px 0px -60% 0px', threshold: 0 }
    )

    headings.forEach((heading) => observer.observe(heading))
    return () => observer.disconnect()
  }, [html])

  const renderAllDiagrams = () => {
    const preview = previewRef.current
    if (!preview || pendingMermaidCount === 0) return

    warmPendingMermaidSources(preview)
    const mermaidTheme = getMermaidTheme()
    setRenderingAll(true)
    void renderMermaidShells(preview, mermaidTheme).finally(() => {
      setRenderingAll(false)
      setPendingMermaidCount(countPendingMermaidShells(preview))
    })
  }

  return (
    <div className="relative h-full">
      {pendingMermaidCount > 0 && (
        <div className="preview-diagram-toolbar">
          <span className="preview-diagram-toolbar__text">
            {t('preview.diagramsPending', { count: pendingMermaidCount })}
          </span>
          <button
            type="button"
            className="preview-diagram-toolbar__button"
            onClick={renderAllDiagrams}
            onPointerEnter={() => {
              if (previewRef.current) warmPendingMermaidSources(previewRef.current)
            }}
            onFocus={() => {
              if (previewRef.current) warmPendingMermaidSources(previewRef.current)
            }}
            disabled={renderingAll}
          >
            {renderingAll ? t('preview.renderingDiagrams') : t('preview.renderAllDiagrams')}
          </button>
        </div>
      )}
      <div
        ref={previewRef}
        className="markdown-preview animate-in"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          background: 'var(--preview-bg)',
          color: 'var(--preview-text)',
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  )
}
