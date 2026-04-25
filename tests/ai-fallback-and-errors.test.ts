import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AI rust backend normalizes timeout, auth, rate limit, and malformed response paths', async () => {
  const rust = await readFile(new URL('../src-tauri/src/ai.rs', import.meta.url), 'utf8')

  assert.match(rust, /AI request timed out/)
  assert.match(rust, /Unable to reach the AI service\. Check your network connection/)
  assert.match(rust, /AI authentication failed\. Check your API key and project settings/)
  assert.match(rust, /AI rate limit reached\. Try again in a moment/)
  assert.match(rust, /AI service returned a malformed response/)
  assert.match(rust, /"stream": true/)
  assert.match(rust, /AI_COMPLETION_STREAM_EVENT/)
  assert.match(rust, /"tool_choice"/)
  assert.match(rust, /file_search_call\.results/)
  assert.match(rust, /must call the file_search tool before answering/)
  assert.match(rust, /Selected document store did not execute retrieval/)
})

test('AIComposer avoids desktop provider loading in web mode and shows desktop-only fallback messaging', async () => {
  const [runtime, coreView] = await Promise.all([
    readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(runtime, /const desktopOnlyMode = !isAIRuntimeAvailable\(\)/)
  assert.match(runtime, /if \(desktopOnlyMode\) \{\s*setConnectionLoading\(false\)/)
  assert.match(runtime, /pushInfoNotice\('notices\.aiDesktopOnlyTitle', 'notices\.aiDesktopOnlyMessage'\)/)
  assert.match(runtime, /desktopOnlyMode\s*\?\s*t\('notices\.aiDesktopOnlyMessage'\)/)
  assert.match(coreView, /data-ai-setup-hint="true"/)
  assert.match(coreView, /\{connectionHintMessage\}/)
})

test('AI client listens for streamed completion chunks and browser mock emits chunked draft updates', async () => {
  const client = await readFile(new URL('../src/lib/ai/client.ts', import.meta.url), 'utf8')

  assert.match(client, /AI_COMPLETION_STREAM_EVENT = 'ai:completion-stream'/)
  assert.match(client, /currentWindow\.listen<AICompletionStreamChunk>\(/)
  assert.match(client, /options\.onChunk\?\.\(payload\.chunk\)/)
  assert.match(client, /const chunks = buildBrowserMockChunks\(response\.text\)/)
  assert.match(client, /options\.onChunk\?\.\(nextChunk\)/)
  assert.match(client, /retrievalExecuted:/)
  assert.match(client, /retrievalQuery:/)
  assert.match(client, /retrievalResults:/)
  assert.match(client, /retrievalResultCount:/)
})
