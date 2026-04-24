import { useCallback } from 'react'
import i18n from '../i18n'
import { useActiveTab } from '../store/editor'
import { useExportStatusStore, type ExportActivityKind } from '../store/exportStatus'
import { buildRichClipboardPayload, writeClipboardPayload } from '../lib/clipboardHtml'
import { ensureFsPathAccess } from '../lib/fsAccess'
import { pushErrorNotice, pushSuccessNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function sanitizeBaseName(name: string): string {
  const trimmed = (name ?? '').toString().trim()
  const withoutExt = trimmed.replace(/\.(md|markdown|mdx)$/i, '')
  const sanitized = withoutExt.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  return sanitized || 'Untitled'
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()

  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(anchor)
  }, 1000)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.trim()
    if (message) return message
  }

  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') return serialized
    } catch {
      // ignore serialization errors and fall through to String(...)
    }
  }

  const text = String(error ?? '').trim()
  return text === '[object Object]' ? '' : text
}

async function waitForPrintableAssets(frameDocument: Document) {
  const fontsReady =
    (frameDocument as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready ??
    Promise.resolve()

  const images = Array.from(frameDocument.images)
  const imagesReady = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => {
        img.removeEventListener('load', done)
        img.removeEventListener('error', done)
        resolve()
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
  })

  await Promise.race([
    Promise.all([fontsReady, ...imagesReady]),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ])
}

function printHtmlDocument(html: string) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const cleanup = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame)
  }

  frame.onload = async () => {
    const printWindow = frame.contentWindow
    const frameDocument = frame.contentDocument
    if (!printWindow || !frameDocument) {
      cleanup()
      return
    }

    try {
      await waitForPrintableAssets(frameDocument)
    } catch {
      // ignore and continue — fall back to best-effort print
    }

    printWindow.focus()
    printWindow.print()
    setTimeout(cleanup, 1000)
  }

  const frameDocument = frame.contentDocument
  if (!frameDocument) {
    cleanup()
    return
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()
}

async function buildExportHtml(
  markdown: string,
  title: string,
  documentPath: string | null,
  mermaidTheme: 'default' | 'dark' = 'default'
) {
  const { buildStandaloneHtml, containsLikelyMath, renderMarkdown } = await import('../lib/markdown')

  let bodyHtml = await renderMarkdown(markdown)
  if (bodyHtml.includes('language-mermaid')) {
    const { renderMermaidInHtml } = await import('../lib/mermaid')
    bodyHtml = await renderMermaidInHtml(bodyHtml, mermaidTheme)
  }

  if (bodyHtml.includes('<img')) {
    const { inlineLocalImagesForExport } = await import('../lib/exportLocalImages')
    bodyHtml = await inlineLocalImagesForExport(bodyHtml, { documentPath })
  }

  const inlineKatexCss =
    containsLikelyMath(markdown) && bodyHtml.includes('class="katex"')
      ? await (await import('../lib/katexInlineCss')).getInlineKatexCss()
      : undefined

  return {
    bodyHtml,
    fullHtml: buildStandaloneHtml(title, bodyHtml, { inlineKatexCss }),
  }
}

async function runWithExportStatus<T>(
  kind: ExportActivityKind,
  task: () => Promise<T> | T
): Promise<T> {
  const { startExport, finishExportSuccess, clearExportStatus } = useExportStatusStore.getState()
  startExport(kind)

  try {
    const result = await task()
    finishExportSuccess(kind)
    return result
  } catch (error) {
    clearExportStatus()
    throw error
  }
}

export function useExport() {
  const activeTab = useActiveTab()

  const exportHtml = useCallback(async () => {
    if (!activeTab) return

    try {
      const baseName = sanitizeBaseName(activeTab.name)
      const fileName = `${baseName}.html`
      const { fullHtml } = await buildExportHtml(activeTab.content, baseName, activeTab.path, 'default')
      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'HTML', extensions: ['html'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await runWithExportStatus('html', async () => {
          await ensureFsPathAccess(path)
          await writeTextFile(path, fullHtml)
        })
        return
      }

      await runWithExportStatus('html', async () => {
        const anchor = document.createElement('a')
        anchor.style.display = 'none'
        document.body.appendChild(anchor)

        const url = URL.createObjectURL(new Blob([fullHtml], { type: 'text/html' }))
        anchor.href = url
        anchor.download = fileName
        anchor.click()

        setTimeout(() => {
          URL.revokeObjectURL(url)
          document.body.removeChild(anchor)
        }, 1000)
      })
    } catch (error) {
      console.error('Export HTML error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const exportPdf = useCallback(async () => {
    if (!activeTab) return

    try {
      const baseName = sanitizeBaseName(activeTab.name)
      const { fullHtml } = await buildExportHtml(activeTab.content, baseName, activeTab.path, 'default')

      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const targetPath = await save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: `${baseName}.pdf`,
        })
        if (!targetPath) return

        try {
          await runWithExportStatus('pdf', async () => {
            await ensureFsPathAccess(targetPath)
            await invoke('export_pdf_to_file', { html: fullHtml, outputPath: targetPath })
          })
          return
        } catch (nativeError) {
          const reason = getErrorMessage(nativeError) || i18n.t('notices.exportPdfErrorReasonFallback')
          console.error('Silent PDF export failed:', nativeError)
          pushErrorNotice('notices.exportPdfErrorTitle', 'notices.exportPdfErrorMessage', {
            values: { reason },
            timeoutMs: 12_000,
          })
          return
        }
      }

      printHtmlDocument(fullHtml)
    } catch (error) {
      console.error('Export PDF error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const exportMarkdown = useCallback(async () => {
    if (!activeTab) return

    try {
      const fileName = `${sanitizeBaseName(activeTab.name)}.md`
      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await runWithExportStatus('markdown', async () => {
          await ensureFsPathAccess(path)
          await writeTextFile(path, activeTab.content)
        })
        return
      }

      await runWithExportStatus('markdown', async () => {
        downloadBlob(new Blob([activeTab.content], { type: 'text/markdown' }), fileName)
      })
    } catch (error) {
      console.error('Export Markdown error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const copyAsHtml = useCallback(async () => {
    if (!activeTab) return

    try {
      const mermaidTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'default'
      const payload = await buildRichClipboardPayload(activeTab.content, mermaidTheme)

      let copied = false
      try {
        if (typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined') {
          await writeClipboardPayload(payload)
          copied = true
        } else {
          await navigator.clipboard.writeText(payload.html)
          copied = true
        }
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = payload.html
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        copied = document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      if (!copied) {
        throw new Error('Clipboard copy failed')
      }

      pushSuccessNotice('notices.copyHtmlSuccessTitle', 'notices.copyHtmlSuccessMessage')
    } catch (error) {
      console.error('Copy HTML error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  return { exportHtml, exportPdf, exportMarkdown, copyAsHtml }
}
