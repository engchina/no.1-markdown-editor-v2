import { useEffect, useRef, useState } from 'react'
import { containsLikelyMath } from '../lib/markdownMath'
import type { MarkdownRenderResponse } from '../workers/markdownMessages'

async function renderMarkdownOnMainThread(markdown: string, syntaxHighlightEngine?: 'highlightjs' | 'shiki'): Promise<string> {
  const { renderMarkdown } = await import('../lib/markdown')
  return renderMarkdown(markdown, syntaxHighlightEngine)
}

import { useEditorStore } from '../store/editor'

function stripFrontMatterBody(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return markdown
  return markdown.slice(match[0].length).replace(/^\r?\n/, '')
}

export function useMarkdown(markdown: string) {
  const syntaxHighlightEngine = useEditorStore((s) => s.syntaxHighlightEngine)
  const [html, setHtml] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const workerRef = useRef<Worker | null>(null)
  const workerUnavailableRef = useRef(false)
  const latestMarkdownRef = useRef(markdown)
  const latestEngineRef = useRef(syntaxHighlightEngine)

  useEffect(() => {
    latestMarkdownRef.current = markdown
    latestEngineRef.current = syntaxHighlightEngine
  }, [markdown, syntaxHighlightEngine])

  useEffect(() => {
    if (import.meta.env.DEV || typeof Worker === 'undefined') {
      workerUnavailableRef.current = true
      return
    }

    try {
      const worker = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
        type: 'module',
        name: 'markdown-renderer',
      })

      const fallbackToMainThread = async (requestId: number) => {
        const fallbackHtml = await renderMarkdownOnMainThread(latestMarkdownRef.current, latestEngineRef.current)
        if (requestIdRef.current === requestId) setHtml(fallbackHtml)
      }

      worker.onmessage = async (event: MessageEvent<MarkdownRenderResponse>) => {
        const { id, html: renderedHtml, error } = event.data
        if (id !== requestIdRef.current) return

        if (error) {
          workerUnavailableRef.current = true
          console.error('Markdown worker error:', error)
          worker.terminate()
          workerRef.current = null
          await fallbackToMainThread(id)
          return
        }

        setHtml(renderedHtml ?? '')
      }

      worker.onerror = async (event) => {
        workerUnavailableRef.current = true
        console.error('Markdown worker crashed:', event.message)
        worker.terminate()
        workerRef.current = null
        await fallbackToMainThread(requestIdRef.current)
      }

      workerRef.current = worker
    } catch (error) {
      workerUnavailableRef.current = true
      console.error('Markdown worker init failed:', error)
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    timerRef.current = setTimeout(async () => {
      try {
        const body = stripFrontMatterBody(markdown)
        if (workerRef.current && !workerUnavailableRef.current && !containsLikelyMath(body)) {
          workerRef.current.postMessage({ id: requestId, markdown, syntaxHighlightEngine })
          return
        }

        const nextHtml = await renderMarkdownOnMainThread(markdown, syntaxHighlightEngine)
        if (requestIdRef.current === requestId) setHtml(nextHtml)
      } catch (error) {
        console.error('Markdown processing error:', error)
      }
    }, 80)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [markdown, syntaxHighlightEngine])

  return html
}
