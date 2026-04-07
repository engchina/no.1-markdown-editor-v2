import { useCallback } from 'react'
import { useActiveTab } from '../store/editor'
import { pushErrorNotice, pushSuccessNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

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

  frame.onload = () => {
    setTimeout(() => {
      const printWindow = frame.contentWindow
      if (!printWindow) {
        cleanup()
        return
      }

      printWindow.focus()
      printWindow.print()
      setTimeout(cleanup, 1000)
    }, 300)
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

async function buildExportHtml(markdown: string, title: string, mermaidTheme: 'default' | 'dark' = 'default') {
  const { buildStandaloneHtml, containsLikelyMath, renderMarkdown } = await import('../lib/markdown')

  let bodyHtml = await renderMarkdown(markdown)
  if (bodyHtml.includes('language-mermaid')) {
    const { renderMermaidInHtml } = await import('../lib/mermaid')
    bodyHtml = await renderMermaidInHtml(bodyHtml, mermaidTheme)
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

export function useExport() {
  const activeTab = useActiveTab()

  const exportHtml = useCallback(async () => {
    if (!activeTab) return

    try {
      const fileName = activeTab.name.replace(/\.(md|markdown|mdx)$/i, '') + '.html'
      const { fullHtml } = await buildExportHtml(activeTab.content, activeTab.name, 'default')
      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'HTML', extensions: ['html'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await writeTextFile(path, fullHtml)
        return
      }

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
    } catch (error) {
      console.error('Export HTML error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const exportPdf = useCallback(async () => {
    if (!activeTab) return

    try {
      const { fullHtml } = await buildExportHtml(activeTab.content, activeTab.name, 'default')
      printHtmlDocument(fullHtml)
    } catch (error) {
      console.error('Export PDF error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const exportMarkdown = useCallback(async () => {
    if (!activeTab) return

    try {
      const fileName = activeTab.name.endsWith('.md') ? activeTab.name : `${activeTab.name}.md`
      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await writeTextFile(path, activeTab.content)
        return
      }

      downloadBlob(new Blob([activeTab.content], { type: 'text/markdown' }), fileName)
    } catch (error) {
      console.error('Export Markdown error:', error)
      pushErrorNotice('notices.exportErrorTitle', 'notices.exportErrorMessage')
    }
  }, [activeTab])

  const copyAsHtml = useCallback(async () => {
    if (!activeTab) return

    try {
      const mermaidTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'default'
      const { bodyHtml } = await buildExportHtml(activeTab.content, activeTab.name, mermaidTheme)

      let copied = false
      try {
        if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([bodyHtml], { type: 'text/html' }),
              'text/plain': new Blob([activeTab.content], { type: 'text/plain' }),
            }),
          ])
          copied = true
        } else {
          await navigator.clipboard.writeText(bodyHtml)
          copied = true
        }
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = bodyHtml
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
