/// <reference lib="webworker" />

import type { MarkdownRenderRequest, MarkdownRenderResponse } from './markdownMessages'

declare const self: DedicatedWorkerGlobalScope

let markdownRendererPromise: Promise<typeof import('../lib/markdownWorker')> | null = null

async function loadMarkdownRenderer() {
  markdownRendererPromise ??= import('../lib/markdownWorker').catch((error) => {
    markdownRendererPromise = null
    throw error
  })

  return markdownRendererPromise
}

self.onmessage = async (event: MessageEvent<MarkdownRenderRequest>) => {
  const { id, markdown, syntaxHighlightEngine } = event.data

  try {
    const { renderMarkdownInWorker } = await loadMarkdownRenderer()
    const html = await renderMarkdownInWorker(markdown, syntaxHighlightEngine)
    const response: MarkdownRenderResponse = { id, html }
    self.postMessage(response)
  } catch (error) {
    const response: MarkdownRenderResponse = {
      id,
      error: error instanceof Error ? error.message : 'Unknown markdown rendering error',
    }
    self.postMessage(response)
  }
}

export {}
