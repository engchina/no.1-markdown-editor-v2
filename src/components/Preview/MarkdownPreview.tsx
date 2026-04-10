import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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
import { loadLocalPreviewImage } from '../../lib/previewLocalImage'
import { buildLocalPreviewImageKey, rewritePreviewHtmlLocalImages } from '../../lib/previewLocalImages'
import { buildExternalPreviewImageKey, rewritePreviewHtmlExternalImages } from '../../lib/previewExternalImages'
import { getPreviewExternalLink } from '../../lib/previewLinks'
import { loadExternalPreviewImage } from '../../lib/previewRemoteImage'
import { wasDynamicImportRecoveryTriggered } from '../../lib/vitePreloadRecovery'
import { resolveActiveHeadingId, updateVisibleHeadingIds } from '../../lib/previewScrollSpy'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useActiveTab, useEditorStore } from '../../store/editor'

export default function MarkdownPreview() {
  const { t, i18n } = useTranslation()
  const activeTab = useActiveTab()
  const activeThemeId = useEditorStore((state) => state.activeThemeId)
  const fontSize = useEditorStore((state) => state.fontSize)
  const content = activeTab?.content ?? ''
  const documentPath = activeTab?.path ?? null
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const deferredContent = useDeferredValue(content)
  const html = useMarkdown(deferredContent)
  const [resolvedLocalImages, setResolvedLocalImages] = useState<Record<string, string>>({})
  const [resolvedExternalImages, setResolvedExternalImages] = useState<Record<string, string>>({})
  const previewOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const previewLocationHref = typeof window === 'undefined' ? 'http://localhost/' : window.location.href
  const previewHtml = useMemo(
    () =>
      rewritePreviewHtmlExternalImages(
        rewritePreviewHtmlLocalImages(html, {
          documentPath,
          resolvedImages: resolvedLocalImages,
        }),
        {
          blockedLabel: t('preview.externalImageBlocked'),
          clickLabel: t('preview.externalImageClickToLoad'),
        },
        previewOrigin,
        {
          enableDirectExternalImageFallback: isTauri,
          resolvedImages: resolvedExternalImages,
        }
      ),
    [documentPath, html, i18n.language, isTauri, previewOrigin, resolvedExternalImages, resolvedLocalImages, t]
  )
  const previewRef = useRef<HTMLDivElement>(null)
  const pendingExternalFallbacksRef = useRef(new Set<string>())
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
      if (wasDynamicImportRecoveryTriggered(error)) return
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

  const openExternalPreviewLink = useCallback(
    async (href: string, label: string) => {
      const messageText = t('dialog.openExternalMessage', { target: label })

      try {
        if (isTauri) {
          const { confirm } = await import('@tauri-apps/plugin-dialog')
          const approved = await confirm(messageText, {
            title: t('dialog.openExternalTitle'),
            kind: 'warning',
            okLabel: t('dialog.openExternal'),
            cancelLabel: t('dialog.stayInEditor'),
          })

          if (!approved) return

          const { openUrl } = await import('@tauri-apps/plugin-opener')
          await openUrl(href)
          return
        }

        if (typeof window === 'undefined' || !window.confirm(messageText)) return
        window.open(href, '_blank', 'noopener,noreferrer')
      } catch (error) {
        console.error('Open external preview link error:', error)
        pushErrorNotice('notices.openExternalErrorTitle', 'notices.openExternalErrorMessage', {
          values: { target: label },
        })
      }
    },
    [isTauri, t]
  )

  const activateExternalImage = (image: HTMLImageElement) => {
    const externalSource = image.dataset.externalSrc
    if (!externalSource || image.dataset.externalImage === 'loading') return

    const placeholderSource = image.dataset.externalPlaceholder ?? image.src
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

        if (!resolvedSource) {
          resetToBlocked()
          return
        }

        image.src = resolvedSource
      })
      .catch(() => {
        resetToBlocked()
      })
  }

  const activateExternalImageFallback = useCallback((image: HTMLImageElement) => {
    const externalSource = image.dataset.externalFallbackSrc
    if (!externalSource) return

    const key = buildExternalPreviewImageKey(externalSource)
    if (pendingExternalFallbacksRef.current.has(key)) return

    pendingExternalFallbacksRef.current.add(key)
    image.dataset.externalFallbackState = 'loading'

    void loadExternalPreviewImage(externalSource)
      .then((resolvedSource) => {
        pendingExternalFallbacksRef.current.delete(key)

        if (!image.isConnected) return

        if (!resolvedSource) {
          image.dataset.externalFallbackState = 'failed'
          return
        }

        image.dataset.externalFallbackState = 'bridged'
        setResolvedExternalImages((current) =>
          current[key] === resolvedSource ? current : { ...current, [key]: resolvedSource }
        )
      })
      .catch(() => {
        pendingExternalFallbacksRef.current.delete(key)
        if (image.isConnected) {
          image.dataset.externalFallbackState = 'failed'
        }
      })
  }, [])

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

      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]')
      if (anchor) {
        const externalLink = getPreviewExternalLink(anchor.getAttribute('href'), previewLocationHref)
        if (externalLink) {
          event.preventDefault()
          event.stopPropagation()
          void openExternalPreviewLink(externalLink.href, externalLink.label)
          return
        }
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
  }, [openExternalPreviewLink, previewLocationHref])

  useEffect(() => {
    if (!isTauri) return

    const preview = previewRef.current
    if (!preview) return

    const pendingExternalImages = Array.from(
      preview.querySelectorAll<HTMLImageElement>('img[data-external-src]')
    )
    for (const image of pendingExternalImages) {
      const externalSource = image.dataset.externalSrc
      if (!externalSource) continue

      const key = buildExternalPreviewImageKey(externalSource)
      if (resolvedExternalImages[key]) continue

      void loadExternalPreviewImage(externalSource)
        .then((resolvedSource) => {
          if (!resolvedSource) return
          setResolvedExternalImages((current) =>
            current[key] === resolvedSource ? current : { ...current, [key]: resolvedSource }
          )
        })
    }
  }, [isTauri, previewHtml, resolvedExternalImages])

  useEffect(() => {
    if (!isTauri) return

    const preview = previewRef.current
    if (!preview) return

    const onImageError = (event: Event) => {
      const image = event.target as HTMLImageElement | null
      if (!image || image.tagName !== 'IMG') return
      if (image.dataset.externalSrc) return
      if (!image.dataset.externalFallbackSrc) return
      if (image.dataset.externalFallbackState === 'loading') return

      activateExternalImageFallback(image)
    }

    preview.addEventListener('error', onImageError, true)
    return () => preview.removeEventListener('error', onImageError, true)
  }, [activateExternalImageFallback, isTauri, previewHtml])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const pendingLocalImages = Array.from(
      preview.querySelectorAll<HTMLImageElement>('img[data-local-src][data-local-image="pending"]')
    )
    for (const image of pendingLocalImages) {
      const localSource = image.dataset.localSrc
      if (!localSource) continue

      const key = buildLocalPreviewImageKey(localSource, documentPath)
      if (resolvedLocalImages[key]) continue

      void loadLocalPreviewImage(localSource, documentPath)
        .then((resolvedSource) => {
          if (!resolvedSource) return
          setResolvedLocalImages((current) =>
            current[key] === resolvedSource ? current : { ...current, [key]: resolvedSource }
          )
        })
    }
  }, [documentPath, previewHtml, resolvedLocalImages])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const onKeyDown = (event: KeyboardEvent) => {
      const externalImage = (event.target as HTMLElement | null)?.closest('img[data-external-src]') as HTMLImageElement | null
      if ((event.key === 'Enter' || event.key === ' ') && externalImage) {
        event.preventDefault()
        event.stopPropagation()
        activateExternalImage(externalImage)
        return
      }

      if (event.key !== 'Enter') return

      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!anchor) return

      const externalLink = getPreviewExternalLink(anchor.getAttribute('href'), previewLocationHref)
      if (!externalLink) return

      event.preventDefault()
      event.stopPropagation()
      void openExternalPreviewLink(externalLink.href, externalLink.label)
    }

    preview.addEventListener('keydown', onKeyDown)
    return () => preview.removeEventListener('keydown', onKeyDown)
  }, [openExternalPreviewLink, previewLocationHref])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const headings = Array.from(preview.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
    if (headings.length === 0) return

    const orderedHeadingIds = headings
      .map((heading) => heading.id)
      .filter((id) => id.length > 0)
    const visibleHeadingIds = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        updateVisibleHeadingIds(
          visibleHeadingIds,
          entries.map((entry) => ({
            id: (entry.target as HTMLElement).id,
            isIntersecting: entry.isIntersecting,
          }))
        )

        const id = resolveActiveHeadingId(orderedHeadingIds, visibleHeadingIds)
        if (!id) return
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
