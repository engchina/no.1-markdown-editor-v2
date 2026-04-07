import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/mermaid-smoke-failure.png')
const LOCAL_STORAGE_KEY = 'editor-settings'
const SAME_ORIGIN_WARM_PATTERNS = [
  /\/assets\/mermaid\.core-.*\.js$/u,
  /\/assets\/vendor-mermaid-parser-core-.*\.js$/u,
  /\/assets\/architectureDiagram-.*\.js$/u,
  /\/assets\/wardleyDiagram-.*\.js$/u,
  /\/assets\/cytoscape\.esm-.*\.js$/u,
]

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

const SMOKE_MARKDOWN = [
  '```mermaid',
  'architecture-beta',
  '  group api(cloud)[API]',
  '  service web(server)[Web] in api',
  '```',
  '',
  '```mermaid',
  'wardley-beta',
  '  title Value chain',
  '  component User [User]',
  '```',
].join('\n')

function buildPersistedEditorState() {
  return {
    state: {
      viewMode: 'preview',
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
          id: 'smoke-tab',
          path: null,
          name: 'Smoke.md',
          content: SMOKE_MARKDOWN,
          savedContent: SMOKE_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: 'smoke-tab',
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
    throw new Error('Static smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the Mermaid smoke test.',
      ...failures.map((failure) => `- ${failure}`),
      'Install Playwright Chromium or ensure a Chrome/Edge channel is available.',
    ].join('\n')
  )
}

function getWarmRequests(requestUrls, origin) {
  return requestUrls.filter(
    (url) => url.startsWith(origin) && SAME_ORIGIN_WARM_PATTERNS.some((pattern) => pattern.test(url))
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

async function saveFailureArtifacts(page, error, consoleMessages, pageErrors) {
  await mkdir(resolve('output/playwright'), { recursive: true })

  if (page) {
    try {
      await page.screenshot({ path: FAILURE_SCREENSHOT_PATH, fullPage: true })
    } catch {
      // Ignore secondary failures while persisting failure context.
    }
  }

  const diagnostics = [
    `Error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    '',
    'Console errors:',
    ...(consoleMessages.length > 0 ? consoleMessages : ['(none)']),
    '',
    'Page errors:',
    ...(pageErrors.length > 0 ? pageErrors : ['(none)']),
  ].join('\n')

  await writeFile(resolve('output/playwright/mermaid-smoke-failure.txt'), diagnostics, 'utf8')
}

async function main() {
  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  let context
  let page

  const requestUrls = []
  const consoleErrors = []
  const pageErrors = []

  try {
    const launchResult = await launchSmokeBrowser()
    browser = launchResult.browser
    console.log(`Smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//u, (route) => route.abort())

    page = await context.newPage()
    page.on('request', (request) => {
      requestUrls.push(request.url())
    })
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
    await page.waitForSelector('.preview-diagram-toolbar__button')
    await waitForCondition(
      async () => (await page.locator('.mermaid-shell').count()) === 2,
      'Mermaid preview shells'
    )

    const warmRequestsBeforeHover = getWarmRequests(requestUrls, staticServer.origin)
    assert.equal(
      warmRequestsBeforeHover.length,
      0,
      `Heavy Mermaid resources loaded before warm intent:\n${warmRequestsBeforeHover.join('\n')}`
    )

    const renderAllButton = page.locator('.preview-diagram-toolbar__button')
    await renderAllButton.hover()

    await waitForCondition(
      async () =>
        SAME_ORIGIN_WARM_PATTERNS.every((pattern) =>
          getWarmRequests(requestUrls, staticServer.origin).some((url) => pattern.test(url))
        ),
      'targeted Mermaid warm requests'
    )

    const warmRequestsBeforeClick = getWarmRequests(requestUrls, staticServer.origin)
    await renderAllButton.click()

    await waitForCondition(
      async () => (await page.locator('.mermaid-shell[data-mermaid-rendered="true"]').count()) === 2,
      'rendered Mermaid shells'
    )
    await waitForCondition(
      async () => (await page.locator('.mermaid-render-surface svg').count()) === 2,
      'rendered Mermaid SVG output'
    )

    const warmRequestsAfterClick = getWarmRequests(requestUrls, staticServer.origin)
    assert.equal(
      warmRequestsAfterClick.length,
      warmRequestsBeforeClick.length,
      [
        'Render click triggered additional heavy Mermaid requests after hover warm-up.',
        'Before click:',
        ...warmRequestsBeforeClick,
        '',
        'After click:',
        ...warmRequestsAfterClick,
      ].join('\n')
    )

    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)

    const mermaidConsoleErrors = consoleErrors.filter((message) =>
      /Mermaid error|Warm Mermaid error|Diagram could not be rendered/u.test(message)
    )
    assert.equal(
      mermaidConsoleErrors.length,
      0,
      `Unexpected Mermaid console errors:\n${mermaidConsoleErrors.join('\n')}`
    )

    console.log('Mermaid smoke test passed.')
  } catch (error) {
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

await main()
