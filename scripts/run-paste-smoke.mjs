import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/web-paste-smoke-failure.png')
const LOCAL_STORAGE_KEY = 'editor-settings'

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
      tabs: [
        {
          id: 'paste-smoke-tab',
          path: null,
          name: 'PasteSmoke.md',
          content: '',
          savedContent: '',
          isDirty: false,
        },
      ],
      activeTabId: 'paste-smoke-tab',
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
    throw new Error('Paste smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the web paste smoke test.',
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
    'Clipboard html:',
    diagnostics.clipboardHtml ? String(diagnostics.clipboardHtml) : '(unavailable)',
    '',
    'Clipboard plain text:',
    diagnostics.clipboardText ? String(diagnostics.clipboardText) : '(unavailable)',
    '',
    'Editor markdown:',
    diagnostics.editorMarkdown ? String(diagnostics.editorMarkdown) : '(unavailable)',
  ].join('\n')

  await writeFile(resolve('output/playwright/web-paste-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function seedClipboardWithHtml(page, html, text) {
  await page.evaluate(async ({ htmlContent, plainText }) => {
    const item = new ClipboardItem({
      'text/html': new Blob([htmlContent], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    })

    await navigator.clipboard.write([item])
  }, { htmlContent: html, plainText: text })
}

async function readClipboardPayload(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    const htmlParts = []
    const textParts = []

    for (const item of items) {
      if (item.types.includes('text/html')) {
        htmlParts.push(await (await item.getType('text/html')).text())
      }
      if (item.types.includes('text/plain')) {
        textParts.push(await (await item.getType('text/plain')).text())
      }
    }

    return {
      html: htmlParts.join('\n'),
      text: textParts.join('\n'),
    }
  })
}

async function readEditorMarkdown(page) {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-line'))
    return lines.map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' ')).join('\n').trim()
  })
}

async function resetEditor(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.cm-content')
}

async function selectAllEditor(page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${modifier}+A`)
}

async function main() {
  const staticServer = await createStaticDistServer(DIST_DIR)
  let browser
  let context
  let page
  const consoleErrors = []
  const pageErrors = []
  const failureDiagnostics = {
    clipboardHtml: '',
    clipboardText: '',
    editorMarkdown: '',
  }

  try {
    const launchResult = await launchSmokeBrowser()
    browser = launchResult.browser
    console.log(`Paste smoke browser: ${launchResult.browserLabel}`)

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

    await page.locator('.cm-content').click()
    await seedClipboardWithHtml(page, 'Markdown Reference<h1>Markdown Reference</h1>', 'Markdown Reference')
    const clipboardPayload = await readClipboardPayload(page)
    failureDiagnostics.clipboardHtml = clipboardPayload.html
    failureDiagnostics.clipboardText = clipboardPayload.text
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')

    await waitForCondition(async () => {
      const markdown = await readEditorMarkdown(page)
      failureDiagnostics.editorMarkdown = markdown
      return markdown === '# Markdown Reference'
    }, 'Typora-style semantic heading paste')

    const markdown = await readEditorMarkdown(page)
    failureDiagnostics.editorMarkdown = markdown
    assert.equal(markdown, '# Markdown Reference')

    await resetEditor(page)
    await selectAllEditor(page)

    await seedClipboardWithHtml(
      page,
      '<div data-logly-image="true"><div><a href="https://qiita.com/yushibats"><div><img src="https://example.com/avatar.png" /></div>@yushibats</a><span><span>in</span><a href="https://qiita.com/organizations/oracle"><img src="https://example.com/org.png" alt="" /><span>日本オラクル株式会社</span></a></span></div></div>',
      '@yushibats in 日本オラクル株式会社'
    )
    const chipClipboardPayload = await readClipboardPayload(page)
    failureDiagnostics.clipboardHtml = chipClipboardPayload.html
    failureDiagnostics.clipboardText = chipClipboardPayload.text
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')

    const expectedChipMarkdown = [
      '![img](https://example.com/avatar.png)',
      '',
      '@yushibats',
      '',
      'in[![img](https://example.com/org.png)日本オラクル株式会社](https://qiita.com/organizations/oracle)',
    ].join('\n')

    await waitForCondition(async () => {
      const nextMarkdown = await readEditorMarkdown(page)
      failureDiagnostics.editorMarkdown = nextMarkdown
      return nextMarkdown === expectedChipMarkdown
    }, 'Typora-style block descendant link paste')

    const chipMarkdown = await readEditorMarkdown(page)
    failureDiagnostics.editorMarkdown = chipMarkdown
    assert.equal(chipMarkdown, expectedChipMarkdown)
    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)

    console.log('Web paste smoke test passed.')
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
