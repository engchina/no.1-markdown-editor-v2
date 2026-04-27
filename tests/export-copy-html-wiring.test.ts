import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('useExport keeps Copy Rich HTML on the rich clipboard path', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /const payload = await buildRichClipboardPayload\(activeTab\.content, mermaidTheme\)/)
  assert.match(source, /await writeClipboardPayload\(payload\)/)
  assert.match(source, /await navigator\.clipboard\.writeText\(payload\.html\)/)
  assert.match(source, /pushSuccessNotice\('notices\.copyHtmlSuccessTitle', 'notices\.copyHtmlSuccessMessage'\)/)
  assert.doesNotMatch(source, /buildMarkdownSafeClipboardPayload/)
})

test('useExport exposes Copy HTML Source as a plain text HTML source path', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /const copyHtmlSource = useCallback\(async \(\) => \{/)
  assert.match(source, /const html = await renderClipboardHtmlFromMarkdown\(activeTab\.content, mermaidTheme\)/)
  assert.match(source, /const copied = await copyPlainTextToClipboard\(html\)/)
  assert.match(source, /pushSuccessNotice\('notices\.copyHtmlSourceSuccessTitle', 'notices\.copyHtmlSourceSuccessMessage'\)/)
  assert.match(source, /return \{ exportHtml, exportPdf, exportMarkdown, copyAsHtml, copyHtmlSource \}/)
})

test('export menu and command palette separate rich HTML from HTML source copy', async () => {
  const [toolbar, commands, palette] = await Promise.all([
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(toolbar, /id: 'copy-rich-html'/)
  assert.match(toolbar, /t\('export\.copyRichHtml'\)/)
  assert.match(toolbar, /id: 'copy-html-source'/)
  assert.match(toolbar, /t\('export\.copyHtmlSource'\)/)

  assert.match(commands, /id: 'export\.copyHtml'/)
  assert.match(commands, /label: t\('commands\.copyRichHtml'\)/)
  assert.match(commands, /id: 'export\.copyHtmlSource'/)
  assert.match(commands, /label: t\('commands\.copyHtmlSource'\)/)

  assert.match(palette, /\['export\.copyHtmlSource', 314\]/)
  assert.match(palette, /case 'export\.copyHtmlSource':/)
})

test('copy HTML labels are explicit across en ja and zh locales', async () => {
  const [enSource, jaSource, zhSource] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enSource) as { export?: Record<string, string>, commands?: Record<string, string>, notices?: Record<string, string> }
  const ja = JSON.parse(jaSource) as { export?: Record<string, string>, commands?: Record<string, string>, notices?: Record<string, string> }
  const zh = JSON.parse(zhSource) as { export?: Record<string, string>, commands?: Record<string, string>, notices?: Record<string, string> }

  assert.equal(en.export?.copyRichHtml, 'Copy Rich HTML')
  assert.equal(en.export?.copyHtmlSource, 'Copy HTML Source')
  assert.equal(en.commands?.copyRichHtml, 'Copy Preview as Rich HTML')
  assert.equal(en.commands?.copyHtmlSource, 'Copy HTML Source')
  assert.equal(en.notices?.copyHtmlSourceSuccessTitle, 'HTML source copied')

  assert.equal(ja.export?.copyRichHtml, 'リッチ HTML をコピー')
  assert.equal(ja.export?.copyHtmlSource, 'HTML ソースをコピー')
  assert.equal(ja.commands?.copyRichHtml, 'プレビューをリッチ HTML としてコピー')
  assert.equal(ja.commands?.copyHtmlSource, 'HTML ソースをコピー')
  assert.equal(ja.notices?.copyHtmlSourceSuccessTitle, 'HTML ソースをコピーしました')

  assert.equal(zh.export?.copyRichHtml, '复制富文本 HTML')
  assert.equal(zh.export?.copyHtmlSource, '复制 HTML 源码')
  assert.equal(zh.commands?.copyRichHtml, '复制预览为富文本 HTML')
  assert.equal(zh.commands?.copyHtmlSource, '复制 HTML 源码')
  assert.equal(zh.notices?.copyHtmlSourceSuccessTitle, 'HTML 源码已复制')
})
