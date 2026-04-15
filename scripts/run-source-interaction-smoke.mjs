import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const DIST_DIR = resolve('dist')
const HOST = '127.0.0.1'
const LOCAL_STORAGE_KEY = 'editor-settings'
const SOURCE_SMOKE_TAB_ID = 'source-smoke-tab'
const FAILURE_SCREENSHOT_PATH = resolve('output/playwright/source-interaction-smoke-failure.png')
const SOURCE_SMOKE_LINES = Array.from({ length: 90 }, (_unused, index) => `line ${String(index + 1).padStart(3, '0')}`)
const SOURCE_SMOKE_MARKDOWN = SOURCE_SMOKE_LINES.join('\n')
const TARGET_LINE_NUMBER = 72
const TARGET_LINE_TEXT = SOURCE_SMOKE_LINES[TARGET_LINE_NUMBER - 1]
const TERMINAL_BLANK_LINE_MARKDOWN = '# terminal heading\nplain tail'
const TERMINAL_BLANK_LINE_LAST_LINE = 'plain tail'
const TERMINAL_TABLE_MARKDOWN = ['| Left | Right |', '| --- | ---: |', '| tail | done |'].join('\n')
const ORDINARY_INSERTION = ' ordinary smoke'
const PASTE_INSERTION = ' paste smoke'
const AI_INSERTION = ' ai smoke'

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

function buildPersistedEditorState(options = {}) {
  const {
    content = SOURCE_SMOKE_MARKDOWN,
    name = 'SourceInteractionSmoke.md',
    wysiwygMode = false,
  } = options

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
      wysiwygMode,
      activeThemeId: 'default-light',
      tabs: [
        {
          id: SOURCE_SMOKE_TAB_ID,
          path: null,
          name,
          content,
          savedContent: content,
          isDirty: false,
        },
      ],
      activeTabId: SOURCE_SMOKE_TAB_ID,
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
    throw new Error('Source interaction smoke server did not expose a usable TCP port')
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
      'Unable to launch a browser for the source interaction smoke test.',
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
    'Diagnostics:',
    JSON.stringify(diagnostics, null, 2),
  ].join('\n')

  await writeFile(resolve('output/playwright/source-interaction-smoke-failure.txt'), diagnosticText, 'utf8')
}

async function resetEditor(page, options = {}) {
  await page.evaluate(({ persistedState, storageKey }) => {
    localStorage.clear()
    localStorage.setItem(storageKey, JSON.stringify(persistedState))
    localStorage.setItem('language', 'en')
  }, {
    persistedState: buildPersistedEditorState(options),
    storageKey: LOCAL_STORAGE_KEY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.cm-content')
}

async function readEditorSnapshot(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) return null

    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.head)
    const lineBlock = view.lineBlockAt(selection.head)
    const scroller = view.scrollDOM
    const editor = document.querySelector('.cm-editor')
    const activeElement = document.activeElement

    return {
      docText: view.state.doc.toString(),
      lineCount: view.state.doc.lines,
      lineNumber: line.number,
      lineText: line.text,
      column: selection.head - line.from + 1,
      selectionHead: selection.head,
      lastLineText: view.state.doc.line(view.state.doc.lines).text,
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      defaultLineHeight: view.defaultLineHeight,
      bottomGap: scroller.scrollTop + scroller.clientHeight - lineBlock.bottom,
      activeTagName: activeElement?.tagName ?? '',
      activeClassName: activeElement instanceof Element ? activeElement.className : '',
      activeIsInEditor: !!(activeElement && editor instanceof HTMLElement && editor.contains(activeElement)),
      hasWysiwygHeading: document.querySelector('.cm-wysiwyg-h1') !== null,
      hasWysiwygTable: document.querySelector('.cm-wysiwyg-table') !== null,
      hasTableInputFocus:
        activeElement instanceof HTMLInputElement &&
        activeElement.classList.contains('cm-wysiwyg-table__input'),
    }
  })
}

async function readActiveElementSnapshot(page) {
  return page.evaluate(() => {
    const activeElement = document.activeElement
    const editor = document.querySelector('.cm-editor')

    return {
      tagName: activeElement?.tagName ?? '',
      isInEditor: !!(activeElement && editor instanceof HTMLElement && editor.contains(activeElement)),
    }
  })
}

async function placeCursorAtLineEnd(page, targetLineText) {
  await page.evaluate(({ lineText }) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const docText = view.state.doc.toString()
    const lineIndex = docText.indexOf(lineText)
    if (lineIndex < 0) {
      throw new Error(`Unable to find target line in the editor document: ${lineText}`)
    }

    const anchor = lineIndex + lineText.length
    view.focus()
    const scrollIntoView = view.constructor?.scrollIntoView
    view.dispatch({
      selection: { anchor },
      effects:
        typeof scrollIntoView === 'function'
          ? scrollIntoView(anchor, { y: 'center' })
          : undefined,
    })
  }, { lineText: targetLineText })

  await waitForCondition(
    async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
    'editor focus after moving the CodeMirror cursor'
  )

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.lineText === targetLineText,
    'editor cursor to land on the target line'
  )

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot) return false
    const minimumMeaningfulScroll = Math.max(snapshot.defaultLineHeight * 8, 80)
    return snapshot.scrollTop >= minimumMeaningfulScroll
  }, 'editor viewport to settle around the moved cursor')
}

async function placeCursorAtDocumentEnd(page) {
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const anchor = view.state.doc.length
    view.focus()
    const scrollIntoView = view.constructor?.scrollIntoView
    view.dispatch({
      selection: { anchor },
      effects:
        typeof scrollIntoView === 'function'
          ? scrollIntoView(anchor, { y: 'end', yMargin: Math.round(view.defaultLineHeight * 2) })
          : undefined,
    })
  })

  await waitForCondition(
    async () => (await readActiveElementSnapshot(page))?.isInEditor === true,
    'editor focus after moving the CodeMirror cursor to EOF'
  )

  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return !!snapshot && snapshot.selectionHead === snapshot.docText.length
  }, 'editor cursor to land on EOF')
}

async function waitForWysiwygHeading(page, description) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return snapshot?.hasWysiwygHeading === true
  }, description)
}

async function resolveBelowDocumentEndClickPoint(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const endCoords = view.coordsAtPos(view.state.doc.length)
    if (!endCoords) {
      throw new Error('Unable to resolve EOF coordinates from the CodeMirror editor view')
    }

    const scrollerRect = view.scrollDOM.getBoundingClientRect()
    const lineHeight = Math.max(view.defaultLineHeight, 18)
    const clickY = Math.min(scrollerRect.bottom - 4, endCoords.bottom + Math.round(lineHeight * 1.35))
    const clickX = Math.round(
      Math.max(scrollerRect.left + 96, Math.min(endCoords.left + 12, scrollerRect.right - 40))
    )

    return {
      x: clickX,
      y: Math.round(clickY),
      documentEndBottom: endCoords.bottom,
      scrollerBottom: scrollerRect.bottom,
    }
  })
}

async function seedClipboardWithText(page, text) {
  await page.evaluate(async (clipboardText) => {
    await navigator.clipboard.writeText(clipboardText)
  }, text)
}

async function dispatchPlainTextPaste(page, text) {
  await page.evaluate((clipboardText) => {
    const content = document.querySelector('.cm-content')
    if (!(content instanceof HTMLElement)) {
      throw new Error('Unable to resolve the CodeMirror content DOM for the paste scenario')
    }

    const data = new DataTransfer()
    data.setData('text/plain', clipboardText)

    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      value: data,
    })

    content.dispatchEvent(pasteEvent)
  }, text)
}

async function dispatchAIApplyAtCursor(page, text) {
  await page.evaluate(({ insertionText, tabId }) => {
    const content = document.querySelector('.cm-content')
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('Unable to resolve the CodeMirror editor view from the DOM')

    const selection = view.state.selection.main
    const docText = view.state.doc.toString()
    const anchorOffset = selection.head

    document.dispatchEvent(
      new CustomEvent('editor:ai-apply', {
        detail: {
          tabId,
          outputTarget: 'at-cursor',
          text: insertionText,
          snapshot: {
            tabId,
            selectionFrom: selection.from,
            selectionTo: selection.to,
            anchorOffset,
            blockFrom: anchorOffset,
            blockTo: anchorOffset,
            docText,
          },
        },
      })
    )
  }, { insertionText: text, tabId: SOURCE_SMOKE_TAB_ID })
}

function assertViewportStayedNearCursor(before, after, label) {
  const minimumMeaningfulScroll = Math.max(before.defaultLineHeight * 8, 80)
  assert.ok(
    before.scrollTop >= minimumMeaningfulScroll,
    `${label} precondition should start away from the top (before: ${JSON.stringify(before)})`
  )
  assert.ok(
    after.scrollTop >= minimumMeaningfulScroll,
    `${label} should not jump back to the top (after: ${JSON.stringify(after)})`
  )
  assert.ok(
    after.scrollTop >= before.scrollTop - before.defaultLineHeight * 4,
    `${label} should stay near the previous viewport (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)})`
  )
  assert.ok(
    Math.abs(after.scrollLeft - before.scrollLeft) <= 2,
    `${label} should not shift horizontally (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)})`
  )
}

function assertCursorBottomGap(snapshot, label) {
  const minimumBottomGap = snapshot.defaultLineHeight * 3 - 8
  assert.ok(
    snapshot.bottomGap >= minimumBottomGap,
    `${label} should keep about three lines below the cursor (snapshot: ${JSON.stringify(snapshot)})`
  )
}

async function waitForViewportStability(page, expectedLineText, before, label) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    if (!snapshot || snapshot.lineText !== expectedLineText) return false

    const minimumMeaningfulScroll = Math.max(before.defaultLineHeight * 8, 80)
    const minimumBottomGap = snapshot.defaultLineHeight * 3 - 8

    return (
      snapshot.scrollTop >= minimumMeaningfulScroll &&
      snapshot.scrollTop >= before.scrollTop - before.defaultLineHeight * 4 &&
      Math.abs(snapshot.scrollLeft - before.scrollLeft) <= 2 &&
      snapshot.bottomGap >= minimumBottomGap
    )
  }, `${label} viewport stability`)
}

function assertTerminalBlankLineInserted(snapshot, expectedDocText, label) {
  assert.ok(snapshot, `${label} should produce an editor snapshot`)
  assert.equal(snapshot.docText, expectedDocText, `${label} should append exactly one trailing newline`)
  assert.equal(snapshot.lineText, '', `${label} should land on the new blank line`)
  assert.equal(snapshot.lastLineText, '', `${label} should expose a terminal blank line`)
  assert.equal(snapshot.lineNumber, snapshot.lineCount, `${label} should land on the final line`)
  assert.equal(snapshot.column, 1, `${label} should place the caret at column 1 of the blank line`)
  assert.equal(snapshot.selectionHead, expectedDocText.length, `${label} should keep the caret at EOF`)
  assert.equal(snapshot.activeIsInEditor, true, `${label} should keep focus inside the editor`)
}

async function waitForTerminalBlankLineState(page, expectedDocText, label) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === expectedDocText &&
      snapshot.lineText === '' &&
      snapshot.lastLineText === '' &&
      snapshot.column === 1 &&
      snapshot.lineNumber === snapshot.lineCount &&
      snapshot.selectionHead === expectedDocText.length &&
      snapshot.activeIsInEditor === true
    )
  }, `${label} terminal blank line state`)
}

async function waitForTableInput(page, description) {
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return snapshot?.hasTableInputFocus === true
  }, description)
}

async function runOrdinaryInputScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.ordinaryBefore = before

  await page.keyboard.type(ORDINARY_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${ORDINARY_INSERTION}`, before, 'ordinary typing')

  const after = await readEditorSnapshot(page)
  diagnostics.ordinaryAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${ORDINARY_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'Ordinary typing')
  assertCursorBottomGap(after, 'Ordinary typing')
}

async function runPasteScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.pasteBefore = before
  await dispatchPlainTextPaste(page, PASTE_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${PASTE_INSERTION}`, before, 'paste')

  const after = await readEditorSnapshot(page)
  diagnostics.pasteAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${PASTE_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'Paste')
  assertCursorBottomGap(after, 'Paste')
}

async function runAIApplyScenario(page, diagnostics) {
  await resetEditor(page)
  await placeCursorAtLineEnd(page, TARGET_LINE_TEXT)

  const before = await readEditorSnapshot(page)
  diagnostics.aiBefore = before

  await dispatchAIApplyAtCursor(page, AI_INSERTION)

  await waitForViewportStability(page, `${TARGET_LINE_TEXT}${AI_INSERTION}`, before, 'AI Apply')

  const after = await readEditorSnapshot(page)
  diagnostics.aiAfter = after

  assert.equal(after?.lineText, `${TARGET_LINE_TEXT}${AI_INSERTION}`)
  assertViewportStayedNearCursor(before, after, 'AI Apply')
  assertCursorBottomGap(after, 'AI Apply')
}

async function runTerminalBlankLineArrowScenario(page, diagnostics, options) {
  const { wysiwygMode } = options
  const scenarioName = wysiwygMode ? 'WYSIWYG ArrowDown' : 'Source ArrowDown'
  const diagnosticPrefix = wysiwygMode ? 'wysiwygArrowTerminalBlankLine' : 'sourceArrowTerminalBlankLine'
  const expectedDocText = `${TERMINAL_BLANK_LINE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_BLANK_LINE_MARKDOWN,
    name: `${diagnosticPrefix}.md`,
    wysiwygMode,
  })
  await placeCursorAtDocumentEnd(page)

  if (wysiwygMode) {
    await waitForWysiwygHeading(page, `${scenarioName} heading decoration`)
  }

  const before = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}Before`] = before

  assert.equal(before?.docText, TERMINAL_BLANK_LINE_MARKDOWN)
  assert.equal(before?.lineText, TERMINAL_BLANK_LINE_LAST_LINE)
  assert.equal(before?.lastLineText, TERMINAL_BLANK_LINE_LAST_LINE)
  assert.equal(before?.selectionHead, TERMINAL_BLANK_LINE_MARKDOWN.length)
  assert.equal(before?.lineNumber, 2)
  assert.equal(before?.column, TERMINAL_BLANK_LINE_LAST_LINE.length + 1)
  if (wysiwygMode) {
    assert.equal(before?.hasWysiwygHeading, true, `${scenarioName} should run with WYSIWYG decorations enabled`)
  }

  await page.keyboard.press('ArrowDown')
  await waitForTerminalBlankLineState(page, expectedDocText, scenarioName)

  const after = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}After`] = after
  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  if (wysiwygMode) {
    assert.equal(after?.hasWysiwygHeading, true, `${scenarioName} should preserve WYSIWYG decorations`)
  }

  await page.keyboard.press('ArrowDown')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return !!snapshot && snapshot.docText === expectedDocText
  }, `${scenarioName} duplicate newline guard`)

  const afterSecondArrow = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}AfterSecondArrow`] = afterSecondArrow

  assert.equal(
    afterSecondArrow?.docText,
    expectedDocText,
    `${scenarioName} should not append a second trailing newline`
  )
}

async function runTerminalBlankLineClickScenario(page, diagnostics, options) {
  const { wysiwygMode } = options
  const scenarioName = wysiwygMode ? 'WYSIWYG below-EOF click' : 'Source below-EOF click'
  const diagnosticPrefix = wysiwygMode ? 'wysiwygClickTerminalBlankLine' : 'sourceClickTerminalBlankLine'
  const expectedDocText = `${TERMINAL_BLANK_LINE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_BLANK_LINE_MARKDOWN,
    name: `${diagnosticPrefix}.md`,
    wysiwygMode,
  })
  await placeCursorAtDocumentEnd(page)

  if (wysiwygMode) {
    await waitForWysiwygHeading(page, `${scenarioName} heading decoration`)
  }

  const before = await readEditorSnapshot(page)
  const clickPoint = await resolveBelowDocumentEndClickPoint(page)
  diagnostics[`${diagnosticPrefix}Before`] = before
  diagnostics[`${diagnosticPrefix}ClickPoint`] = clickPoint

  assert.ok(
    clickPoint.y > clickPoint.documentEndBottom + 1,
    `${scenarioName} should click below the rendered document end`
  )
  assert.ok(
    clickPoint.y < clickPoint.scrollerBottom,
    `${scenarioName} click should stay inside the scrollable editor area`
  )

  await page.mouse.click(clickPoint.x, clickPoint.y)
  await waitForTerminalBlankLineState(page, expectedDocText, scenarioName)

  const after = await readEditorSnapshot(page)
  diagnostics[`${diagnosticPrefix}After`] = after
  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  if (wysiwygMode) {
    assert.equal(after?.hasWysiwygHeading, true, `${scenarioName} should preserve WYSIWYG decorations`)
  }
}

async function runWysiwygTerminalBlankLineTableScenario(page, diagnostics) {
  const scenarioName = 'WYSIWYG table EOF ArrowDown'
  const expectedDocText = `${TERMINAL_TABLE_MARKDOWN}\n`

  await resetEditor(page, {
    content: TERMINAL_TABLE_MARKDOWN,
    name: 'wysiwyg-table-terminal-blank-line.md',
    wysiwygMode: true,
  })

  await waitForCondition(
    async () => (await readEditorSnapshot(page))?.hasWysiwygTable === true,
    `${scenarioName} rendered table`
  )

  await page.locator('.cm-wysiwyg-table__cell[data-table-section="body"][data-table-row-index="0"][data-table-column-index="0"]').click()
  await waitForTableInput(page, `${scenarioName} inline table input`)

  const before = await readEditorSnapshot(page)
  diagnostics.wysiwygTableTerminalBlankLineBefore = before

  assert.equal(before?.docText, TERMINAL_TABLE_MARKDOWN)
  assert.equal(before?.hasTableInputFocus, true, `${scenarioName} should start from the active table input`)

  await page.keyboard.press('ArrowDown')
  await waitForCondition(async () => {
    const snapshot = await readEditorSnapshot(page)
    return (
      !!snapshot &&
      snapshot.docText === expectedDocText &&
      snapshot.lineText === '' &&
      snapshot.lastLineText === '' &&
      snapshot.column === 1 &&
      snapshot.activeIsInEditor === true &&
      snapshot.hasTableInputFocus === false
    )
  }, `${scenarioName} table exit`)

  const after = await readEditorSnapshot(page)
  const activeElement = await readActiveElementSnapshot(page)
  diagnostics.wysiwygTableTerminalBlankLineAfter = after
  diagnostics.wysiwygTableTerminalBlankLineActiveElement = activeElement

  assertTerminalBlankLineInserted(after, expectedDocText, scenarioName)
  assert.equal(after?.hasTableInputFocus, false, `${scenarioName} should leave table input focus behind`)
  assert.equal(activeElement?.tagName, 'DIV', `${scenarioName} should restore focus to the editor surface`)
  assert.equal(activeElement?.isInEditor, true, `${scenarioName} should keep focus inside the editor`)
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
    console.log(`Source interaction smoke browser: ${launchResult.browserLabel}`)

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

    await page.goto(staticServer.origin, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cm-content')

    await runOrdinaryInputScenario(page, diagnostics)
    await runAIApplyScenario(page, diagnostics)
    await runPasteScenario(page, diagnostics)
    await runTerminalBlankLineArrowScenario(page, diagnostics, { wysiwygMode: false })
    await runTerminalBlankLineClickScenario(page, diagnostics, { wysiwygMode: false })
    await runTerminalBlankLineArrowScenario(page, diagnostics, { wysiwygMode: true })
    await runTerminalBlankLineClickScenario(page, diagnostics, { wysiwygMode: true })
    await runWysiwygTerminalBlankLineTableScenario(page, diagnostics)

    assert.equal(pageErrors.length, 0, `Unexpected page errors:\n${pageErrors.join('\n')}`)
    console.log('Source interaction smoke test passed.')
  } catch (error) {
    diagnostics.lastUrl = page?.url() ?? ''
    diagnostics.failureSnapshot = page ? await readEditorSnapshot(page).catch(() => null) : null
    await saveFailureArtifacts(page, error, consoleErrors, pageErrors, diagnostics)
    throw error
  } finally {
    await context?.close()
    await browser?.close()
    await staticServer.close()
  }
}

await main()
