import { useEffect, useRef } from 'react'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useActiveTab } from '../../store/editor'
import 'katex/dist/katex.min.css'

export default function MarkdownPreview() {
  const activeTab = useActiveTab()
  const content = activeTab?.content ?? ''
  const html = useMarkdown(content)
  const previewRef = useRef<HTMLDivElement>(null)

  // Initialize Mermaid diagrams after render
  useEffect(() => {
    if (!previewRef.current) return
    const mermaidBlocks = previewRef.current.querySelectorAll('code.language-mermaid')
    if (mermaidBlocks.length === 0) return

    import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })
      mermaidBlocks.forEach(async (block, i) => {
        const code = block.textContent ?? ''
        const pre = block.parentElement
        if (!pre) return
        const id = `mermaid-${Date.now()}-${i}`
        try {
          const { svg } = await m.default.render(id, code)
          const container = document.createElement('div')
          container.className = 'mermaid'
          container.innerHTML = svg
          pre.replaceWith(container)
        } catch (e) {
          console.error('Mermaid error:', e)
        }
      })
    })
  }, [html])

  return (
    <div
      ref={previewRef}
      className="markdown-preview animate-in"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ background: 'var(--preview-bg)', color: 'var(--preview-text)' }}
    />
  )
}
