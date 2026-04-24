import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { useExportStatusStore } from '../src/store/exportStatus.ts'

test('export status store transitions through generic export running success and clear states', () => {
  const store = useExportStatusStore.getState()

  store.clearExportStatus()
  store.startExport('html')
  assert.equal(useExportStatusStore.getState().activity?.kind, 'html')
  assert.equal(useExportStatusStore.getState().activity?.phase, 'running')

  store.finishExportSuccess('markdown')
  assert.equal(useExportStatusStore.getState().activity?.kind, 'markdown')
  assert.equal(useExportStatusStore.getState().activity?.phase, 'success')

  store.clearExportStatus()
  assert.equal(useExportStatusStore.getState().activity, null)
})

test('useExport wires html pdf and markdown export lifecycles into the shared export status store', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ useExportStatusStore, type ExportActivityKind \} from '\.\.\/store\/exportStatus'/)
  assert.match(source, /async function runWithExportStatus<T>\(/)
  assert.match(source, /const \{ startExport, finishExportSuccess, clearExportStatus \} = useExportStatusStore\.getState\(\)/)
  assert.match(source, /startExport\(kind\)/)
  assert.match(source, /finishExportSuccess\(kind\)/)
  assert.match(source, /await runWithExportStatus\('html'/)
  assert.match(source, /await runWithExportStatus\('pdf'/)
  assert.match(source, /await runWithExportStatus\('markdown'/)
})

test('StatusBar maps shared export activity kinds to html pdf and markdown labels', async () => {
  const source = await readFile(new URL('../src/components/StatusBar/StatusBar.tsx', import.meta.url), 'utf8')

  assert.match(source, /useExportStatusStore/)
  assert.match(source, /statusbar\.exportingHtml/)
  assert.match(source, /statusbar\.exportingPdf/)
  assert.match(source, /statusbar\.exportingMarkdown/)
  assert.match(source, /statusbar\.exportHtmlDone/)
  assert.match(source, /statusbar\.exportPdfDone/)
  assert.match(source, /statusbar\.exportMarkdownDone/)
  assert.match(source, /AppIcon name="checkCircle"/)
})

test('export statusbar copy exists across en ja and zh locales for html pdf and markdown', async () => {
  const [enSource, jaSource, zhSource] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enSource) as { statusbar?: Record<string, string> }
  const ja = JSON.parse(jaSource) as { statusbar?: Record<string, string> }
  const zh = JSON.parse(zhSource) as { statusbar?: Record<string, string> }

  assert.equal(en.statusbar?.exportingHtml, 'Exporting HTML...')
  assert.equal(en.statusbar?.exportingPdf, 'Exporting PDF...')
  assert.equal(en.statusbar?.exportingMarkdown, 'Exporting Markdown...')
  assert.equal(en.statusbar?.exportHtmlDone, 'HTML exported')
  assert.equal(en.statusbar?.exportPdfDone, 'PDF exported')
  assert.equal(en.statusbar?.exportMarkdownDone, 'Markdown exported')

  assert.equal(ja.statusbar?.exportingHtml, 'HTML を書き出し中...')
  assert.equal(ja.statusbar?.exportingPdf, 'PDF を書き出し中...')
  assert.equal(ja.statusbar?.exportingMarkdown, 'Markdown を書き出し中...')
  assert.equal(ja.statusbar?.exportHtmlDone, 'HTML を書き出しました')
  assert.equal(ja.statusbar?.exportPdfDone, 'PDF を書き出しました')
  assert.equal(ja.statusbar?.exportMarkdownDone, 'Markdown を書き出しました')

  assert.equal(zh.statusbar?.exportingHtml, '正在导出 HTML...')
  assert.equal(zh.statusbar?.exportingPdf, '正在导出 PDF...')
  assert.equal(zh.statusbar?.exportingMarkdown, '正在导出 Markdown...')
  assert.equal(zh.statusbar?.exportHtmlDone, 'HTML 已导出')
  assert.equal(zh.statusbar?.exportPdfDone, 'PDF 已导出')
  assert.equal(zh.statusbar?.exportMarkdownDone, 'Markdown 已导出')
})
