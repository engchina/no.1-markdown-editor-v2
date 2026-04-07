import { useCallback } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import { useActiveTab } from '../store/editor'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeStringify)

function buildStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.75;
      color: #1a1a1a;
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      line-height: 1.3;
      margin-top: 2em;
      margin-bottom: 0.5em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid #e5e7eb;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    p { margin: 1em 0; }
    code {
      font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 0.875em;
      background: #f4f4f5;
      border-radius: 4px;
      padding: 0.15em 0.4em;
    }
    pre {
      background: #18181b;
      color: #d4d4d8;
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
      margin: 1.5em 0;
    }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote {
      border-left: 4px solid #3b82f6;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #6b7280;
      font-style: italic;
    }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 16px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) td { background: #f9fafb; }
    img { max-width: 100%; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
    input[type="checkbox"] { margin-right: 6px; }
    @media print {
      body { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export function useExport() {
  const activeTab = useActiveTab()

  const exportHtml = useCallback(async () => {
    if (!activeTab) return

    const result = await processor.process(activeTab.content)
    const bodyHtml = String(result)
    const fullHtml = buildStandaloneHtml(activeTab.name, bodyHtml)
    const fileName = activeTab.name.replace(/\.(md|markdown)$/i, '') + '.html'

    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'HTML', extensions: ['html'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await writeTextFile(path, fullHtml)
      } catch (e) {
        console.error('Export HTML error:', e)
      }
    } else {
      const blob = new Blob([fullHtml], { type: 'text/html' })
      downloadBlob(blob, fileName)
    }
  }, [activeTab])

  const exportPdf = useCallback(async () => {
    if (!activeTab) return

    // Generate preview HTML in a hidden iframe, then print it
    const result = await processor.process(activeTab.content)
    const bodyHtml = String(result)
    const fullHtml = buildStandaloneHtml(activeTab.name, bodyHtml)

    // Open in a new window optimized for print
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(fullHtml)
    win.document.close()
    win.focus()
    // Slight delay to allow fonts/images to load
    setTimeout(() => {
      win.print()
      win.close()
    }, 500)
  }, [activeTab])

  const exportMarkdown = useCallback(async () => {
    if (!activeTab) return
    const fileName = activeTab.name.endsWith('.md') ? activeTab.name : activeTab.name + '.md'

    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
          defaultPath: fileName,
        })
        if (!path) return
        await writeTextFile(path, activeTab.content)
      } catch (e) {
        console.error('Export Markdown error:', e)
      }
    } else {
      const blob = new Blob([activeTab.content], { type: 'text/markdown' })
      downloadBlob(blob, fileName)
    }
  }, [activeTab])

  return { exportHtml, exportPdf, exportMarkdown }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
