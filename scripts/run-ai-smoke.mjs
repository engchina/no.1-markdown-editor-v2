import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const AI_MOCK_PROVIDER_KEY = 'no1-ai-mock-provider'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/ai-smoke-failure.png')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const AI_SMOKE_MARKDOWN = [
  '# AI Smoke',
  '',
  'The quick brown fox jumps over the lazy dog.',
  '',
  'Second paragraph for insertion previews.',
  '',
  '## Follow-up',
  '',
  'Trailing paragraph for section boundaries.',
].join('\n')
const AI_SMOKE_TAB_ID = 'ai-smoke-tab'
const AI_SMOKE_SELECTED_SENTENCE = 'The quick brown fox jumps over the lazy dog.'
const AI_SMOKE_NEXT_HEADING = '## Follow-up'

function buildPersistedEditorState() {
  return {
    state: {
      viewMode: 'source',
      sidebarWidth: 220,
      sidebarOpen: true,
      sidebarTab: 'outline',
      editorRatio: 0.5,
      lineNumbers: true,
      wordWrap: true,
      fontSize: 14,
      typewriterMode: false,
      wysiwygMode: false,
      activeThemeId: 'default-light',
      aiDefaultWriteTarget: 'at-cursor',
      aiDefaultSelectedTextRole: 'transform-target',
      tabs: [
        {
          id: AI_SMOKE_TAB_ID,
          path: null,
          name: 'AISmoke.md',
          content: AI_SMOKE_MARKDOWN,
          savedContent: AI_SMOKE_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: AI_SMOKE_TAB_ID,
    },
    version: 0,
  }
}

function isWithinRoot(rootDir, candidatePath) {
  const normalizedRoot = normalize(rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`)
  const normalizedCandidate = normalize(candidatePath)
  return normalizedCandidate.startsWith(normalizedRoot) || normalizedCandidate === normalize(rootDir)
}

async function createStaticDistServer(rootDir) {
  await stat(join(rootDir, 'index.html'))

  const server = createServer(async (request, response) => {
    try {
      const requestedPath = decodeURIComponent((request.url ?? '/').split('?')[0] || '/')
      const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/u, '')
      const absolutePath = resolve(rootDir, relativePath)

      if (!isWithinRoot(rootDir, absolutePath)) {
        response.writeHead(403).end('Forbidden')
        return
      }

      const fileInfo = await stat(absolutePath)
      const finalPath = fileInfo.isDirectory() ? join(absolutePath, 'index.html') : absolutePath
      const body = await readFile(finalPath)
      const contentType = MIME_TYPES[extname(finalPath)] ?? 'application/octet-stream'

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentType,
      })
      response.end(body)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })

  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer)
    server.listen(0, HOST, () => resolveServer())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('AI smoke server did not expose a usable TCP port')
  }

  return {
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error)
          else resolveClose()
        })
      }),
    origin: `http://${HOST}:${address.port}`,
  }
}

async function launchSmokeBrowser() {
  const launchAttempts = [
    { label: 'bundled Chromium', options: { headless: true } },
    ...(process.platform === 'win32' ? [{ label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } }] : []),
    { label: 'Google Chrome', options: { channel: 'chrome', headless: true } },
    ...(process.platform !== 'win32' ? [{ label: 'Microsoft Edge', options: { channel: 'msedge', headless: true } }] : []),
  ]

  const failures = []
  for (const attempt of launchAttempts) {
    try {
      const browser = await chromium.launch(attempt.options)
      return { browser, browserLabel: attempt.label }
    } catch (error) {
      failures.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(
    [
      'Unable to launch a browser for the AI smoke test.',
      ...failures.map((failure) => `- ${failure}`),
      'Install Playwright Chromium or ensure a Chrome/Edge channel is available.',
    ].join('\n')
  )
}

async function saveFailureArtifacts(page, error, consoleMessages, pageErrors, diagnostics = {}) {
  await mkdir(resolve('output/playwright'), { recursive: true })

  if (page) {
    try {
      await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true })
    } catch {
      // Ignore secondary failures while persisting failure context.
    }
  }

  const diagnosticText = [
    `Error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    '',
    'Console errors:',
    ...(consoleMessages.length > 0 ? consoleMessages : ['(none)']),
    '',
    'Page errors:',
    ...(pageErrors.length > 0 ? pageErrors : ['(none)']),
    '',
    'Diagnostics:',
    JSON.stringify(diagnostics, null, 2),
  ].join('\n')

  await writeFile(resolve('output/playwright/ai-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function waitForCondition(predicate, description, timeoutMs = 15000, stepMs = 50) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, stepMs))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function main() {
  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  let context
  let page
  const consoleErrors = []
  const pageErrors = []
  const diagnostics = {}

  try {
    const launchResult = await launchSmokeBrowser()
    browser = launchResult.browser
    console.log(`AI smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message)
    })

    await page.addInitScript(({ persistedState, storageKey }) => {
      localStorage.clear()
      localStorage.setItem(storageKey, JSON.stringify(persistedState))
      localStorage.setItem('language', 'en')
    }, { persistedState: buildPersistedEditorState(), storageKey: LOCAL_STORAGE_KEY })

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    await page.locator('button[title^="Command Palette"]').click()
    await page.waitForSelector('[role="dialog"][aria-label="Command Palette"]')
    const commandPaletteInput = page.locator('[placeholder="Type a command..."]')
    await commandPaletteInput.fill('AI:')
    await expectText(page, 'body', 'AI: Ask')
    await expectText(page, 'body', 'AI: Translate Selection')
    await expectText(page, 'body', 'AI: Continue Writing')
    await expectText(page, 'body', 'AI: Ghost Text Continuation')
    await expectText(page, 'body', 'AI: Draft New Note')
    await commandPaletteInput.fill('AI: Continue Writing')
    await page.keyboard.press('Enter')
    const paletteComposer = page.getByRole('dialog', { name: 'AI Composer' })
    await paletteComposer.waitFor()
    const palettePromptValue = await paletteComposer.locator('textarea').inputValue()
    assert.match(palettePromptValue, /Continue writing/u)
    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close after command palette action')

    await page.locator('[data-sidebar-tab="ai"]').click()
    await expectText(page, 'body', 'Open Composer')
    await page.locator('[data-ai-sidebar-action="ask"]').click()
    const sidebarComposer = page.getByRole('dialog', { name: 'AI Composer' })
    await sidebarComposer.waitFor()
    assert.equal(await sidebarComposer.locator('textarea').inputValue(), '')
    await waitForCondition(
      async () => (await sidebarComposer.locator('[data-ai-template="continueWriting"]').count()) > 0,
      'composer template library to render'
    )
    await sidebarComposer.locator('[data-ai-template="continueWriting"]').click()
    assert.match(await sidebarComposer.locator('textarea').inputValue(), /Continue writing/u)
    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close after sidebar AI action')
    await page.locator('[data-sidebar-tab="outline"]').click()

    await page.locator('.cm-content').click()
    await page.keyboard.press(`${modifier}+A`)
    await expectText(page, 'body', 'Translate')
    await page.getByText('Translate', { exact: true }).click()
    const composer = page.getByRole('dialog', { name: 'AI Composer' })
    await composer.waitFor()
    await expectLocatorText(composer, 'AI provider secrets can only be configured in the desktop app right now.')
    await expectLocatorText(composer, 'Selection')
    await expectLocatorText(composer, 'Chat Only')
    await expectLocatorText(composer, 'Replace Selection')
    await expectLocatorText(composer, 'At Cursor')
    await expectLocatorText(composer, 'Insert Below')
    await expectNoText(page, 'body', 'Insert Under Heading')
    await expectLocatorText(composer, 'New Note')
    const promptValue = await composer.locator('textarea').inputValue()
    assert.match(promptValue, /Translate the selected content/u)

    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close after bubble action')

    await page.locator('button[title="Appearance"]').click()
    await expectText(page, 'body', 'Appearance')
    await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('.p-4.space-y-5'))
      for (const container of containers) {
        if (container instanceof HTMLElement) {
          container.scrollTop = container.scrollHeight
        }
      }
    })
    await expectNoText(page, 'body', 'Default Write Target')
    await expectNoText(page, 'body', 'Selected Text Role')
    await expectNoText(page, 'body', 'Provider History Ranking')
    await expectText(page, 'body', 'AI provider secrets can only be configured in the desktop app right now.')

    await page.locator('label').filter({ hasText: 'WYSIWYG (Live Preview)' }).locator('button').click()
    const storedState = await page.evaluate((storageKey) => {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw).state : null
    }, LOCAL_STORAGE_KEY)
    assert.equal(storedState?.aiDefaultWriteTarget, undefined)
    assert.equal(storedState?.aiDefaultSelectedTextRole, undefined)
    assert.equal(storedState?.aiHistoryProviderRerankEnabled, undefined)
    assert.equal(storedState?.aiHistoryProviderRerankBudget, undefined)
    assert.equal(storedState?.wysiwygMode, true)

    await page.mouse.click(1200, 900)

    await page.locator('button[title="Preview"]').click()
    if (await page.getByText('Load Preview', { exact: true }).count()) {
      try {
        await page.getByText('Load Preview', { exact: true }).click({ timeout: 3000 })
      } catch {
        // The preview may auto-activate and replace the button before the click settles.
      }
    }
    await waitForCondition(
      async () => (await page.locator('.cm-content').count()) === 0,
      'editor surface to hide in preview mode'
    )
    await page.evaluate(() => {
      document.dispatchEvent(
        new CustomEvent('editor:ai-open', {
          detail: { source: 'command-palette', intent: 'ask', outputTarget: 'chat-only' },
          cancelable: true,
        })
      )
    })
    const previewComposer = page.getByRole('dialog', { name: 'AI Composer' })
    await previewComposer.waitFor()
    assert.equal(await previewComposer.locator('[data-ai-action="apply"]').count(), 0)
    assert.equal(await previewComposer.locator('[data-ai-action="insert-at-cursor"]').count(), 0)
    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close in preview mode')

    await page.locator('button[title="Split"]').click()
    await waitForCondition(
      async () => (await page.locator('.cm-content').count()) > 0,
      'editor surface to reappear in split mode'
    )
    assert.ok((await page.locator('.markdown-preview').count()) > 0 || (await page.getByText('Load Preview', { exact: true }).count()) > 0)

    await page.locator('button[title="Focus Mode"]').click()
    await expectText(page, 'body', 'Focus Mode')
    await page.evaluate(() => {
      document.dispatchEvent(
        new CustomEvent('editor:ai-open', {
          detail: { source: 'command-palette', intent: 'ask', outputTarget: 'chat-only' },
          cancelable: true,
        })
      )
    })
    const focusComposer = page.getByRole('dialog', { name: 'AI Composer' })
    await focusComposer.waitFor()
    await expectLocatorText(focusComposer, 'AI Composer')
    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close in focus mode')

    await resetEditor(page)
    await page.evaluate((mockKey) => {
      localStorage.setItem(mockKey, '1')
    }, AI_MOCK_PROVIDER_KEY)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    await page.locator('button[title^="Command Palette"]').click()
    await page.waitForSelector('[role="dialog"][aria-label="Command Palette"]')
    await commandPaletteInput.fill('AI: Ghost Text Continuation')
    await page.keyboard.press('Enter')
    await waitForCondition(
      async () => (await page.locator('[data-ai-ghost-text="ready"]').count()) === 1,
      'AI ghost text suggestion to appear inline'
    )
    await expectText(page, '[data-ai-ghost-text="ready"]', 'Mock continuation paragraph.')
    assert.equal(await readEditorMarkdown(page), AI_SMOKE_MARKDOWN)
    await page.locator('.cm-content').press('Tab')
    await waitForCondition(
      async () => (await page.locator('[data-ai-provenance-mark]').count()) >= 1,
      'AI provenance marker to appear after accepting ghost text'
    )
    await waitForCondition(
      async () => (await readEditorMarkdown(page)).includes('Mock continuation paragraph.'),
      'AI ghost text acceptance to insert the suggestion'
    )
    await undoEditor(page, modifier)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)
    await waitForCondition(
      async () => (await page.locator('[data-ai-provenance-mark]').count()) === 0,
      'AI provenance marker to clear after undo'
    )

    await page.keyboard.press(`${modifier}+J`)
    const cancelComposer = page.getByRole('dialog', { name: 'AI Composer' })
    await cancelComposer.waitFor()
    await expectNoText(page, 'body', 'Workspace Context')
    await cancelComposer.locator('textarea').fill('Continue writing the next paragraph in a concise style.')
    await waitForCondition(
      async () => await cancelComposer.locator('[data-ai-action="run"]').isEnabled(),
      'AI run button to become enabled before cancellation test'
    )
    await cancelComposer.locator('[data-ai-action="run"]').click()
    await waitForCondition(
      async () => (await cancelComposer.locator('[data-ai-action="cancel-request"]').count()) === 1,
      'cancel button to appear during streaming request'
    )
    assert.equal(await readEditorMarkdown(page), AI_SMOKE_MARKDOWN)
    await cancelComposer.locator('[data-ai-action="cancel-request"]').click()
    await waitForCondition(
      async () => (await cancelComposer.locator('[data-ai-action="cancel-request"]').count()) === 0,
      'cancel button to disappear after cancellation'
    )
    await waitForCondition(
      async () => (await cancelComposer.locator('pre').count()) === 0,
      'draft preview to clear after cancellation'
    )
    assert.equal(await readEditorMarkdown(page), AI_SMOKE_MARKDOWN)
    await page.keyboard.press('Escape')
    await waitForCondition(async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0, 'AI composer to close after cancellation')

    await resetEditor(page)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    await dispatchAIApply(page, {
      tabId: AI_SMOKE_TAB_ID,
      outputTarget: 'at-cursor',
      text: 'Opening insertion.',
      snapshot: {
        tabId: AI_SMOKE_TAB_ID,
        selectionFrom: 0,
        selectionTo: 0,
        anchorOffset: 0,
        blockFrom: 0,
        blockTo: 0,
        docText: AI_SMOKE_MARKDOWN,
      },
      provenance: {
        badge: 'AI',
        detail: 'AI-applied content',
        kind: 'apply',
        createdAt: 1,
      },
    })
    await waitForCondition(
      async () => (await page.locator('[data-ai-provenance-mark]').count()) >= 1,
      'AI provenance marker to appear after explicit apply'
    )
    await expectEditorContent(page, `Opening insertion.${AI_SMOKE_MARKDOWN}`)
    await undoEditor(page, modifier)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    const replaceFrom = AI_SMOKE_MARKDOWN.indexOf(AI_SMOKE_SELECTED_SENTENCE)
    const replaceTo = replaceFrom + AI_SMOKE_SELECTED_SENTENCE.length
    await dispatchAIApply(page, {
      tabId: AI_SMOKE_TAB_ID,
      outputTarget: 'replace-selection',
      text: 'Translated replacement sentence.',
      snapshot: {
        tabId: AI_SMOKE_TAB_ID,
        selectionFrom: replaceFrom,
        selectionTo: replaceTo,
        anchorOffset: replaceTo,
        blockFrom: replaceFrom,
        blockTo: replaceTo,
        docText: AI_SMOKE_MARKDOWN,
      },
    })
    await expectText(page, '.cm-content', 'Translated replacement sentence.')
    await undoEditor(page, modifier)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    await dispatchAIApply(page, {
      tabId: AI_SMOKE_TAB_ID,
      outputTarget: 'at-cursor',
      text: '\n\nAt cursor addition.',
      snapshot: {
        tabId: AI_SMOKE_TAB_ID,
        selectionFrom: AI_SMOKE_MARKDOWN.length,
        selectionTo: AI_SMOKE_MARKDOWN.length,
        anchorOffset: AI_SMOKE_MARKDOWN.length,
        blockFrom: AI_SMOKE_MARKDOWN.length,
        blockTo: AI_SMOKE_MARKDOWN.length,
        docText: AI_SMOKE_MARKDOWN,
      },
    })
    await expectEditorContent(page, `${AI_SMOKE_MARKDOWN}\n\nAt cursor addition.`)
    await undoEditor(page, modifier)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    const paragraphEnd = replaceTo
    await dispatchAIApply(page, {
      tabId: AI_SMOKE_TAB_ID,
      outputTarget: 'insert-below',
      text: 'Inserted below paragraph.',
      snapshot: {
        tabId: AI_SMOKE_TAB_ID,
        selectionFrom: paragraphEnd,
        selectionTo: paragraphEnd,
        anchorOffset: paragraphEnd,
        blockFrom: replaceFrom,
        blockTo: paragraphEnd,
        docText: AI_SMOKE_MARKDOWN,
      },
    })
    await expectEditorContent(
      page,
      [
        '# AI Smoke',
        '',
        'The quick brown fox jumps over the lazy dog.',
        '',
        'Inserted below paragraph.',
        '',
        'Second paragraph for insertion previews.',
        '',
        '## Follow-up',
        '',
        'Trailing paragraph for section boundaries.',
      ].join('\n')
    )
    await undoEditor(page, modifier)
    await expectEditorContent(page, AI_SMOKE_MARKDOWN)

    const newNoteDraft = ['# AI Draft Note', '', 'Standalone summary from AI.'].join('\n')
    await dispatchAIApply(page, {
      tabId: AI_SMOKE_TAB_ID,
      outputTarget: 'new-note',
      text: newNoteDraft,
      snapshot: {
        tabId: AI_SMOKE_TAB_ID,
        selectionFrom: replaceTo,
        selectionTo: replaceTo,
        anchorOffset: replaceTo,
        blockFrom: replaceFrom,
        blockTo: replaceTo,
        docText: AI_SMOKE_MARKDOWN,
      },
    })
    await expectEditorContent(page, newNoteDraft)
    await waitForCondition(
      async () => {
        const state = await page.evaluate((storageKey) => {
          const raw = localStorage.getItem(storageKey)
          return raw ? JSON.parse(raw).state : null
        }, LOCAL_STORAGE_KEY)

        return (
          Array.isArray(state?.tabs) &&
          state.tabs.length === 2 &&
          state.activeTabId !== AI_SMOKE_TAB_ID &&
          state.tabs.some((tab) => tab.content === newNoteDraft && tab.savedContent === '' && tab.isDirty === true)
        )
      },
      'AI new-note apply to create a separate dirty draft tab'
    )

    console.log('AI smoke test passed.')
  } catch (error) {
    diagnostics.lastUrl = page?.url() ?? ''
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, diagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

async function expectText(page, selector, text) {
  await waitForCondition(
    async () => {
      const content = await page.locator(selector).textContent()
      return (content ?? '').includes(text)
    },
    `text "${text}" in ${selector}`
  )
}

async function expectLocatorText(locator, text) {
  await waitForCondition(
    async () => {
      const content = await locator.textContent()
      return (content ?? '').includes(text)
    },
    `text "${text}" in locator`
  )
}

async function expectNoText(page, selector, text) {
  await waitForCondition(
    async () => {
      const content = await page.locator(selector).textContent()
      return !(content ?? '').includes(text)
    },
    `text "${text}" to stay absent in ${selector}`
  )
}

async function resetEditor(page, options = {}) {
  await page.evaluate(({ persistedState, storageKey, mockKey, mockProvider }) => {
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', 'en')
    if (mockProvider) {
      localStorage.setItem(mockKey, '1')
    } else {
      localStorage.removeItem(mockKey)
    }
  }, {
    persistedState: options.persistedState ?? buildPersistedEditorState(),
    storageKey: LOCAL_STORAGE_KEY,
    mockKey: AI_MOCK_PROVIDER_KEY,
    mockProvider: options.mockProvider === true,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.cm-content')
}

async function readEditorMarkdown(page) {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-line'))
    return lines
      .map((line) =>
        Array.from(line.childNodes)
          .filter(
            (node) =>
              !(
                node instanceof HTMLElement &&
                node.matches('.cm-ai-ghost-text, .cm-ai-provenance-badge')
              )
          )
          .map((node) => (node.textContent ?? '').replace(/\u00a0/g, ' '))
          .join('')
      )
      .join('\n')
      .trim()
  })
}

async function expectEditorContent(page, expectedMarkdown) {
  await waitForCondition(
    async () => (await readEditorMarkdown(page)) === expectedMarkdown,
    `editor content to equal:\n${expectedMarkdown}`
  )
}

async function dispatchAIApply(page, detail) {
  await page.evaluate((applyDetail) => {
    document.dispatchEvent(new CustomEvent('editor:ai-apply', { detail: applyDetail }))
  }, detail)
}

async function undoEditor(page, modifier) {
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${modifier}+Z`)
}

async function readComposerDraftText(composer) {
  const content = await composer.locator('pre').first().textContent()
  return (content ?? '').trim()
}

await main()
