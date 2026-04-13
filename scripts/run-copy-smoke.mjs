import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/web-copy-smoke-failure.png')
const LOCAL_STORAGE_KEY = 'editor-settings'
const TEST_MARKDOWN = [
  '# Welcome',
  '',
  '一个具有注脚的文本。[^1]',
  '',
  '[Jump](#welcome)',
  '',
  '[Doc](./guide.md)',
  '',
  '[Site](https://example.com/docs)',
  '',
  '[^1]: 注脚的解释',
].join('\n')

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

function buildPersistedEditorState() {
  return {
    state: {
      viewMode: 'split',
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
      tabs: [
        {
          id: 'copy-smoke-tab',
          path: null,
          name: 'CopySmoke.md',
          content: TEST_MARKDOWN,
          savedContent: TEST_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: 'copy-smoke-tab',
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
    throw new Error('Copy smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the web copy smoke test.',
      ...failures.map((failure) => `- ${failure}`),
      'Install Playwright Chromium or ensure a Chrome/Edge channel is available.',
    ].join('\n')
  )
}

async function waitForCondition(predicate, description, timeoutMs = 15000, stepMs = 50) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, stepMs))
  }

  throw new Error(`Timed out waiting for ${description}`)
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
    'Clipboard diagnostics:',
    JSON.stringify(diagnostics, null, 2),
  ].join('\n')

  await writeFile(resolve('output/playwright/web-copy-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function armClipboardMonitor(page) {
  await page.evaluate(() => {
    if (window.__clipboardMonitorArmed === true) return

    window.__clipboardMonitorArmed = true
    window.__clipboardMonitor = {
      copyEvents: [],
      writes: [],
      writeTexts: [],
      execCommands: [],
    }

    document.addEventListener('copy', (event) => {
      const clipboardData = event.clipboardData
      window.__clipboardMonitor.copyEvents.push({
        plain: clipboardData?.getData('text/plain') ?? '',
        html: clipboardData?.getData('text/html') ?? '',
        defaultPrevented: event.defaultPrevented,
        selection: window.getSelection()?.toString() ?? '',
        target:
          event.target instanceof Element
            ? event.target.tagName
            : event.target instanceof Node
              ? event.target.nodeName
              : String(event.target),
      })
    })

    if (navigator.clipboard?.write) {
      Object.defineProperty(navigator.clipboard, 'write', {
        configurable: true,
        value: async (items) => {
          const serializedItems = []
          for (const item of items) {
            const serialized = {}
            if (item.types.includes('text/plain')) {
              serialized.text = await (await item.getType('text/plain')).text()
            }
            if (item.types.includes('text/html')) {
              serialized.html = await (await item.getType('text/html')).text()
            }
            serializedItems.push(serialized)
          }
          window.__clipboardMonitor.writes.push(serializedItems)
        },
      })
    }

    if (navigator.clipboard?.writeText) {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (text) => {
          window.__clipboardMonitor.writeTexts.push(String(text))
        },
      })
    }

    if (typeof document.execCommand === 'function') {
      const originalExecCommand = document.execCommand.bind(document)
      document.execCommand = (commandId, showUI, value) => {
        window.__clipboardMonitor.execCommands.push({
          commandId: String(commandId),
          value: value == null ? null : String(value),
        })
        if (String(commandId).toLowerCase() === 'copy') {
          return true
        }
        return originalExecCommand(commandId, showUI, value)
      }
    }
  })
}

async function resetClipboardMonitor(page) {
  await page.evaluate(() => {
    if (!window.__clipboardMonitor) return
    window.__clipboardMonitor.copyEvents = []
    window.__clipboardMonitor.writes = []
    window.__clipboardMonitor.writeTexts = []
    window.__clipboardMonitor.execCommands = []
  })
}

async function readClipboardMonitor(page) {
  return page.evaluate(() => window.__clipboardMonitor)
}

async function selectAllEditor(page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${modifier}+A`)
}

async function selectAllPreview(page) {
  await page.evaluate(() => {
    const preview = document.querySelector('.markdown-preview')
    const selection = window.getSelection()
    if (!preview || !selection) return

    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(preview)
    selection.addRange(range)
  })
}

function assertMarkdownSafePayload(record) {
  assert(record, 'Expected a copy event record')
  assert.equal(record.plain, TEST_MARKDOWN)
  assert.match(record.html, /# Welcome/)
  assert.match(record.html, /\[Jump]\(#welcome\)/)
  assert.match(record.html, /\[Doc]\(\.\/guide\.md\)/)
  assert.match(record.html, /\[Site]\(https:\/\/example\.com\/docs\)/)
  assert.match(record.html, /\[\^1]: 注脚的解释/)
  assert.doesNotMatch(record.html, /<a href=/)
  assert.doesNotMatch(record.html, /data-footnote-ref/)
  assert.doesNotMatch(record.html, /http:\/\/127\.0\.0\.1:1420/)
}

function assertRichHtmlPayload(writeRecord) {
  assert(writeRecord, 'Expected a navigator.clipboard.write record')
  assert.equal(writeRecord.text, TEST_MARKDOWN)
  assert.match(writeRecord.html, /<h1 id="welcome">Welcome<\/h1>/)
  assert.match(writeRecord.html, /data-footnote-ref/)
  assert.match(writeRecord.html, /<a href="#welcome">Jump<\/a>/)
  assert.match(writeRecord.html, /<a href="\.\/guide\.md">Doc<\/a>/)
  assert.match(writeRecord.html, /<a href="https:\/\/example\.com\/docs">Site<\/a>/)
  assert.doesNotMatch(writeRecord.html, /\[Jump]\(#welcome\)/)
  assert.doesNotMatch(writeRecord.html, /http:\/\/127\.0\.0\.1:1420/)
}

async function main() {
  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  let context
  let page
  const consoleErrors = []
  const pageErrors = []
  const failureDiagnostics = {
    sourceCopy: null,
    previewCopy: null,
    copyHtml: null,
  }

  try {
    const launchResult = await launchSmokeBrowser()
    browser = launchResult.browser
    console.log(`Copy smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: staticServer.origin })
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
    await waitForCondition(
      () => page.evaluate(() => !!document.querySelector('.markdown-preview')?.textContent?.includes('Footnotes')),
      'split preview to render'
    )

    await armClipboardMonitor(page)

    await resetClipboardMonitor(page)
    await selectAllEditor(page)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C')
    const sourceMonitor = await readClipboardMonitor(page)
    failureDiagnostics.sourceCopy = sourceMonitor
    assert.equal(sourceMonitor.writes.length, 0, 'Normal source copy should not write rich HTML to navigator.clipboard')
    assert.equal(sourceMonitor.writeTexts.length, 0, 'Normal source copy should not fall back to writeText')
    assert.equal(sourceMonitor.copyEvents.length, 1, 'Expected one source copy event')
    assertMarkdownSafePayload(sourceMonitor.copyEvents[0])

    await resetClipboardMonitor(page)
    await selectAllPreview(page)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C')
    const previewMonitor = await readClipboardMonitor(page)
    failureDiagnostics.previewCopy = previewMonitor
    assert.equal(previewMonitor.writes.length, 0, 'Normal preview copy should not write rich HTML to navigator.clipboard')
    assert.equal(previewMonitor.writeTexts.length, 0, 'Normal preview copy should not fall back to writeText')
    assert.equal(previewMonitor.copyEvents.length, 1, 'Expected one preview copy event')
    assertMarkdownSafePayload(previewMonitor.copyEvents[0])

    await resetClipboardMonitor(page)
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('button', { name: 'Copy as HTML' }).click()
    await waitForCondition(async () => {
      const monitor = await readClipboardMonitor(page)
      return (
        monitor.writes.length > 0 ||
        monitor.writeTexts.length > 0 ||
        monitor.execCommands.length > 0
      )
    }, 'Copy as HTML clipboard path to resolve')
    const copyHtmlMonitor = await readClipboardMonitor(page)
    failureDiagnostics.copyHtml = copyHtmlMonitor
    assert.equal(copyHtmlMonitor.copyEvents.length, 0, 'Copy as HTML should not rely on the normal copy event path')
    assert.equal(copyHtmlMonitor.writeTexts.length, 0, 'Copy as HTML should stay on navigator.clipboard.write in modern browsers')
    assert.equal(copyHtmlMonitor.execCommands.length, 0, 'Copy as HTML should not fall back to document.execCommand in modern browsers')
    assert.equal(copyHtmlMonitor.writes.length, 1, 'Copy as HTML should issue one rich clipboard write')
    assertRichHtmlPayload(copyHtmlMonitor.writes[0]?.[0])

    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)
    console.log('Web copy smoke test passed.')
  } catch (error) {
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, failureDiagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

await main()
