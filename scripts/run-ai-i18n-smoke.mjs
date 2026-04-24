import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/ai-i18n-smoke-failure.png')

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
  '# AI Locale Smoke',
  '',
  'A sentence for localized AI actions.',
].join('\n')

const LOCALES = [
  {
    code: 'en',
    quickAction: 'Translate',
    connectionLabel: 'Connection',
    hiddenWriteTargetLabel: 'Default Write Target',
    hiddenRoleLabel: 'Selected Text Role',
  },
  {
    code: 'ja',
    quickAction: '翻訳',
    connectionLabel: '接続',
    hiddenWriteTargetLabel: '既定の書き込み先',
    hiddenRoleLabel: '選択テキストの役割',
  },
  {
    code: 'zh',
    quickAction: '翻译',
    connectionLabel: '连接',
    hiddenWriteTargetLabel: '默认写入目标',
    hiddenRoleLabel: '选中文本角色',
  },
]

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
          id: 'ai-i18n-smoke-tab',
          path: null,
          name: 'AILocaleSmoke.md',
          content: AI_SMOKE_MARKDOWN,
          savedContent: AI_SMOKE_MARKDOWN,
          isDirty: false,
        },
      ],
      activeTabId: 'ai-i18n-smoke-tab',
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
    throw new Error('AI i18n smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the AI i18n smoke test.',
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

  await writeFile(resolve('output/playwright/ai-i18n-smoke-failure.txt'), diagnosticText, 'utf8')
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
    console.log(`AI i18n smoke browser: ${launchResult.browserLabel}`)

    context = await browser.newContext()
    page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
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
    const languageSelect = page.locator('select').last()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    for (const locale of LOCALES) {
      await languageSelect.selectOption(locale.code)
      await waitForCondition(
        async () => (await page.evaluate(() => localStorage.getItem('language'))) === locale.code,
        `language ${locale.code} to persist`
      )

      await page.locator('.cm-content').click()
      await page.keyboard.press(`${modifier}+A`)
      await expectText(page, 'body', locale.quickAction)
      await page.getByText(locale.quickAction, { exact: true }).click()

      const composer = page.getByRole('dialog', { name: 'AI Composer' })
      await composer.waitFor()
      await expectLocatorText(composer, locale.connectionLabel)
      await waitForNoHorizontalOverflow(page, '[data-ai-composer="true"]')
      await page.keyboard.press('Escape')
      await waitForCondition(
        async () => (await page.getByRole('dialog', { name: 'AI Composer' }).count()) === 0,
        `AI composer to close for locale ${locale.code}`
      )

      await page.locator('[data-toolbar-action="ai-setup"]').click()
      await expectText(page, '[data-ai-setup-panel="true"]', locale.connectionLabel)
      await waitForNoHorizontalOverflow(page, '[data-ai-setup-panel="true"]')
      await page.mouse.click(1200, 900)

      await page.locator('[data-toolbar-action="settings"]').click()
      await expectNoText(page, '[data-theme-panel="true"]', locale.connectionLabel)
      await expectNoText(page, 'body', locale.hiddenWriteTargetLabel)
      await expectNoText(page, 'body', locale.hiddenRoleLabel)
      await waitForNoHorizontalOverflow(page, '[data-theme-panel="true"]')
      await page.mouse.click(1200, 900)
    }

    console.log('AI i18n smoke test passed.')
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

async function waitForNoHorizontalOverflow(page, selector) {
  await waitForCondition(
    async () =>
      page.evaluate((targetSelector) => {
        const element = document.querySelector(targetSelector)
        if (!(element instanceof HTMLElement)) return false
        return element.scrollWidth <= element.clientWidth + 1
      }, selector),
    `no horizontal overflow for ${selector}`
  )
}

await main()
