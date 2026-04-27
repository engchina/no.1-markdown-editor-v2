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
import {
  buildMarkdownSafeClipboardPayload,
  writeClipboardEventPayload,
  writeClipboardPayload,
} from '../../lib/clipboardHtml'
import { pushErrorNotice } from '../../lib/notices'
import { loadLocalPreviewImage } from '../../lib/previewLocalImage'
import { convertPreviewSelectionHtmlToMarkdown, extractPreviewSelectionFragment } from '../../lib/previewClipboard'
import { buildLocalPreviewImageKey, rewritePreviewHtmlLocalImages } from '../../lib/previewLocalImages'
import { buildExternalPreviewImageKey, rewritePreviewHtmlExternalImages } from '../../lib/previewExternalImages'
import { getPreviewExternalLink } from '../../lib/previewLinks'
import { flashPreviewTarget, getPreviewInternalAnchorId, resolvePreviewAnchorTarget, scrollPreviewToTarget } from '../../lib/previewNavigation'
import { loadExternalPreviewImage } from '../../lib/previewRemoteImage'
import { wasDynamicImportRecoveryTriggered } from '../../lib/vitePreloadRecovery'
import { resolveActiveHeadingId, updateVisibleHeadingIds } from '../../lib/previewScrollSpy'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useActiveTab, useEditorStore } from '../../store/editor'

const MERMAID_AUTO_RENDER_DELAY_MS = 650
const MERMAID_AUTO_RENDER_ROOT_MARGIN = '240px 0px'

export default function MarkdownPreview() {
  const { t, i18n } = useTranslation()
  const activeTab = useActiveTab()
  const activeThemeId = useEditorStore((state) => state.activeThemeId)
  const fontSize = useEditorStore((state) => state.fontSize)
  const previewLineBreakMode = useEditorStore((state) => state.previewLineBreakMode)
  const previewAutoRenderMermaid = useEditorStore((state) => state.previewAutoRenderMermaid)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is keyed off `i18n.language`; depending on its identity would re-run unnecessarily.
    [documentPath, html, i18n.language, isTauri, previewOrigin, resolvedExternalImages, resolvedLocalImages]
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
      packetPlaceholderError: t('preview.packetPlaceholderError'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is keyed off `i18n.language`.
    [i18n.language]
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

  const updatePendingMermaidCount = (preview = previewRef.current) => {
    setPendingMermaidCount(preview ? countPendingMermaidShells(preview) : 0)
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

  const navigateInternalPreviewAnchor = useCallback(
    (anchor: HTMLAnchorElement) => {
      const preview = previewRef.current
      if (!preview) return false

      const anchorId = getPreviewInternalAnchorId(anchor.getAttribute('href'), previewLocationHref)
      if (!anchorId) return false

      const target = resolvePreviewAnchorTarget(preview, anchorId)
      if (!target) return false

      scrollPreviewToTarget(preview, target)
      flashPreviewTarget(target)
      return true
    },
    [previewLocationHref]
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
    updatePendingMermaidCount(preview)
  }, [previewHtml, mermaidLabels])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !previewAutoRenderMermaid) return

    let cancelled = false
    let observer: IntersectionObserver | null = null
    const renderingShells = new WeakSet<HTMLElement>()

    const renderVisibleShell = (shell: HTMLElement) => {
      if (
        cancelled ||
        !shell.isConnected ||
        shell.dataset.mermaidRendered === 'true' ||
        shell.dataset.mermaidRendering === 'true' ||
        renderingShells.has(shell)
      ) {
        return
      }

      renderingShells.add(shell)
      warmMermaidShell(shell)
      const mermaidTheme = getMermaidTheme()
      void renderMermaidShells(preview, mermaidTheme, {
        targets: [shell],
        isCancelled: () => cancelled,
      }).finally(() => {
        renderingShells.delete(shell)
        if (!cancelled) updatePendingMermaidCount(preview)
      })
    }

    const startAutoRender = () => {
      if (cancelled || !preview.isConnected) return

      const pendingShells = Array.from(
        preview.querySelectorAll<HTMLElement>('.mermaid-shell[data-mermaid-rendered="false"]')
      )
      if (pendingShells.length === 0) return

      if (typeof IntersectionObserver === 'undefined') {
        pendingShells.forEach(renderVisibleShell)
        return
      }

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const shell = entry.target as HTMLElement
            observer?.unobserve(shell)
            renderVisibleShell(shell)
          }
        },
        { root: preview, rootMargin: MERMAID_AUTO_RENDER_ROOT_MARGIN, threshold: 0 }
      )

      pendingShells.forEach((shell) => observer?.observe(shell))
    }

    const timer = window.setTimeout(startAutoRender, MERMAID_AUTO_RENDER_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [previewAutoRenderMermaid, previewHtml])

  useEffect(() => {
    if (!previewHtml.includes('class="katex"')) return

    let cancelled = false
    void import('../../lib/katexStylesheet')
      .then(({ ensureKatexStylesheet }) => ensureKatexStylesheet())
      .catch((error) => {
        if (!cancelled) {
          console.error('Load KaTeX stylesheet error:', error)
        }
      })

    return () => {
      cancelled = true
    }
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

    const copyLabel = t('preview.copyCode')
    const doneLabel = t('preview.copyCodeDone')

    const blocks = Array.from(preview.querySelectorAll<HTMLElement>('pre'))
    const controllers: AbortController[] = []

    for (const pre of blocks) {
      if (pre.querySelector('.preview-code-copy')) continue

      const wrapper = document.createElement('div')
      wrapper.className = 'preview-code-copy'

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'preview-code-copy__btn'
      btn.textContent = copyLabel

      const ac = new AbortController()
      controllers.push(ac)

      btn.addEventListener(
        'click',
        () => {
          const code = pre.querySelector('code')
          const text = (code ?? pre).innerText
          void navigator.clipboard.writeText(text).then(() => {
            btn.textContent = doneLabel
            btn.classList.add('preview-code-copy__btn--done')
            setTimeout(() => {
              btn.textContent = copyLabel
              btn.classList.remove('preview-code-copy__btn--done')
            }, 2000)
          })
        },
        { signal: ac.signal }
      )

      wrapper.appendChild(btn)
      pre.appendChild(wrapper)
    }

    return () => {
      for (const ac of controllers) ac.abort()
    }
  }, [previewHtml, t])

  useEffect(() => {
    // Preview selections do not reliably focus the preview container, so intercept copy at the document level.
    const onCopy = (event: ClipboardEvent) => {
      const preview = previewRef.current
      if (!preview || typeof window === 'undefined') return

      const selection = window.getSelection()
      if (!selection) return

      const fragment = extractPreviewSelectionFragment(selection, preview)
      if (!fragment) return

      const markdownText = convertPreviewSelectionHtmlToMarkdown(fragment.html, fragment.plainText)
      if (!markdownText.trim()) return

      const payload = buildMarkdownSafeClipboardPayload(markdownText)
      const fallbackCopied = writeClipboardEventPayload(event, payload)
      const canWriteClipboard =
        typeof navigator !== 'undefined' && typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined'

      if (!fallbackCopied && !canWriteClipboard) return

      event.preventDefault()

      if (fallbackCopied) return
      if (!canWriteClipboard) return

      void writeClipboardPayload(payload).catch((error) => {
        console.error('Preview copy clipboard write error:', error)
      })
    }

    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
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

        if (navigateInternalPreviewAnchor(anchor)) {
          event.preventDefault()
          event.stopPropagation()
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
        updatePendingMermaidCount(preview)
      })
    }

    preview.addEventListener('click', onClick)
    return () => preview.removeEventListener('click', onClick)
  }, [navigateInternalPreviewAnchor, openExternalPreviewLink, previewLocationHref])

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
      if (externalLink) {
        event.preventDefault()
        event.stopPropagation()
        void openExternalPreviewLink(externalLink.href, externalLink.label)
        return
      }

      if (!navigateInternalPreviewAnchor(anchor)) return

      event.preventDefault()
      event.stopPropagation()
    }

    preview.addEventListener('keydown', onKeyDown)
    return () => preview.removeEventListener('keydown', onKeyDown)
  }, [navigateInternalPreviewAnchor, openExternalPreviewLink, previewLocationHref])

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
      updatePendingMermaidCount(preview)
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
        className={`markdown-preview animate-in${previewLineBreakMode === 'visual-soft-breaks' ? ' markdown-preview--visual-soft-breaks' : ''}`}
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
