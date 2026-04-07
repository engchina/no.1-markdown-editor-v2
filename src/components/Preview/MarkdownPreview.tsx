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
import { pushErrorNotice } from '../../lib/notices'
import { rewritePreviewHtmlExternalImages } from '../../lib/previewExternalImages'
import { loadExternalPreviewImage } from '../../lib/previewRemoteImage'
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
  const previewHtml = useMemo(
    () =>
      rewritePreviewHtmlExternalImages(
        html,
        {
          blockedLabel: t('preview.externalImageBlocked'),
          clickLabel: t('preview.externalImageClickToLoad'),
        },
        typeof window === 'undefined' ? 'http://localhost' : window.location.origin
      ),
    [html, i18n.language, t]
  )
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

  const activateExternalImage = (image: HTMLImageElement) => {
    const externalSource = image.dataset.externalSrc
    if (!externalSource || image.dataset.externalImage === 'loading') return

    const placeholderSource = image.dataset.externalPlaceholder ?? image.src
    const host = image.dataset.externalHost ?? 'external source'
    image.dataset.externalImage = 'loading'
    image.setAttribute('aria-busy', 'true')

    const cleanup = () => {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
    }

    const resetToBlocked = () => {
      cleanup()
      image.src = placeholderSource
      image.dataset.externalImage = 'blocked'
      image.removeAttribute('aria-busy')
    }

    const onLoad = () => {
      cleanup()
      image.classList.remove('preview-external-image')
      image.removeAttribute('data-external-src')
      image.removeAttribute('data-external-host')
      image.removeAttribute('data-external-image')
      image.removeAttribute('data-external-placeholder')
      image.removeAttribute('tabindex')
      image.removeAttribute('role')
      image.removeAttribute('aria-label')
      image.removeAttribute('aria-busy')
    }

    const onError = () => {
      resetToBlocked()
    }

    image.addEventListener('load', onLoad)
    image.addEventListener('error', onError)

    void loadExternalPreviewImage(externalSource)
      .then((resolvedSource) => {
        if (!image.isConnected || image.dataset.externalSrc !== externalSource) {
          cleanup()
          return
        }

        image.src = resolvedSource
      })
      .catch(() => {
        resetToBlocked()
        pushErrorNotice('notices.externalImageLoadErrorTitle', 'notices.externalImageLoadErrorMessage', {
          values: { host },
        })
      })
  }

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    prepareMermaidShells(preview, mermaidLabels, getMermaidTheme())
    updateMermaidShellLabels(preview, mermaidLabels)
    setPendingMermaidCount(countPendingMermaidShells(preview))
  }, [previewHtml, mermaidLabels])

  useEffect(() => {
    if (!previewHtml.includes('class="katex"')) return
    void ensureKatexStylesheet().catch((error) => {
      console.error('Load KaTeX stylesheet error:', error)
    })
  }, [previewHtml])

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
  }, [activeThemeId, previewHtml])

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
      const externalImage = (event.target as HTMLElement | null)?.closest('img[data-external-src]') as HTMLImageElement | null
      if (externalImage) {
        event.preventDefault()
        event.stopPropagation()
        activateExternalImage(externalImage)
        return
      }

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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return

      const externalImage = (event.target as HTMLElement | null)?.closest('img[data-external-src]') as HTMLImageElement | null
      if (!externalImage) return

      event.preventDefault()
      event.stopPropagation()
      activateExternalImage(externalImage)
    }

    preview.addEventListener('keydown', onKeyDown)
    return () => preview.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const blockedImages = Array.from(
      preview.querySelectorAll<HTMLImageElement>('img[data-external-src][data-external-image="blocked"]')
    )
    for (const image of blockedImages) {
      activateExternalImage(image)
    }
  }, [previewHtml])

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
  }, [previewHtml])

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
        dangerouslySetInnerHTML={{ __html: previewHtml }}
        style={{
          background: 'var(--preview-bg)',
          color: 'var(--preview-text)',
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  )
}
