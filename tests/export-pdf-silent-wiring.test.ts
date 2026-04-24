import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('useExport uses the silent Tauri PDF command and reports native failures without falling back to system print', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /await invoke\('export_pdf_to_file', \{ html: fullHtml, outputPath: targetPath \}\)/,
  )
  assert.match(
    source,
    /pushErrorNotice\('notices\.exportPdfErrorTitle', 'notices\.exportPdfErrorMessage'/,
  )
  assert.doesNotMatch(source, /falling back to system print/)
  assert.doesNotMatch(source, /silent_pdf_unsupported_platform/)
})

test('useExport still stages the save dialog and fs scope before invoking the PDF command', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  const saveDialogIndex = source.search(/const targetPath = await save\(/)
  const ensureAccessIndex = source.search(/await ensureFsPathAccess\(targetPath\)/)
  const invokeIndex = source.search(/await invoke\('export_pdf_to_file'/)

  assert.ok(saveDialogIndex >= 0, 'save dialog should be called')
  assert.ok(ensureAccessIndex > saveDialogIndex, 'fs scope must be granted after the path is chosen')
  assert.ok(invokeIndex > ensureAccessIndex, 'invoke must run after fs scope is granted')
})

test('useExport builds export html with the active document path so local images can be inlined', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /buildExportHtml\(activeTab\.content, baseName, activeTab\.path, 'default'\)/)
})

test('useExport waits for fonts and images before triggering window.print', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /fonts\?: \{ ready\?: Promise<unknown> \}/)
  assert.match(source, /waitForPrintableAssets\(frameDocument\)/)
})

test('pdf export backend waits for the hidden webview page-load event instead of a page-side invoke handshake', async () => {
  const source = await readFile(new URL('../src-tauri/src/pdf_export.rs', import.meta.url), 'utf8')

  assert.match(source, /\.on_page_load\(/)
  assert.match(source, /PageLoadEvent::Finished/)
  assert.doesNotMatch(source, /pdf_webview_ready/)
  assert.doesNotMatch(source, /__TAURI_INTERNALS__/)
})

test('export pdf command copy no longer mentions the system print dialog', async () => {
  const [enSource, jaSource, zhSource] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enSource) as { commands?: { exportPdf?: string } }
  const ja = JSON.parse(jaSource) as { commands?: { exportPdf?: string } }
  const zh = JSON.parse(zhSource) as { commands?: { exportPdf?: string } }

  assert.equal(en.commands?.exportPdf, 'Export as PDF')
  assert.equal(ja.commands?.exportPdf, 'PDF として書き出し')
  assert.equal(zh.commands?.exportPdf, '导出为 PDF')
})
