import assert from 'node:assert/strict'
import test from 'node:test'
import { inlineLocalImagesForExport } from '../src/lib/exportLocalImages.ts'

test('inlineLocalImagesForExport resolves relative local images against the current document path', async () => {
  const calls: Array<{ source: string; documentPath: string | null }> = []
  const html = [
    '<p><img src="./images/hero.png" alt="Hero"></p>',
    '<p><img src="https://example.com/remote.png" alt="Remote"></p>',
  ].join('')

  const exportedHtml = await inlineLocalImagesForExport(html, {
    documentPath: 'D:\\docs\\draft.md',
    resolveLocalImage: async (source, documentPath) => {
      calls.push({ source, documentPath })
      return source === './images/hero.png' ? 'data:image/png;base64,abc' : null
    },
  })

  assert.match(exportedHtml, /src="data:image\/png;base64,abc"/)
  assert.match(exportedHtml, /src="https:\/\/example\.com\/remote\.png"/)
  assert.deepEqual(calls, [{ source: './images/hero.png', documentPath: 'D:\\docs\\draft.md' }])
})

test('inlineLocalImagesForExport reuses one resolution for normalized duplicate local paths', async () => {
  const calls: string[] = []
  const html = '<img src="./images/hero.png"><img src="images/hero.png">'

  const exportedHtml = await inlineLocalImagesForExport(html, {
    documentPath: 'D:\\docs\\draft.md',
    resolveLocalImage: async (source) => {
      calls.push(source)
      return 'data:image/png;base64,abc'
    },
  })

  assert.deepEqual(calls, ['./images/hero.png'])
  assert.equal((exportedHtml.match(/src="data:image\/png;base64,abc"/g) ?? []).length, 2)
})

test('inlineLocalImagesForExport keeps unresolved local images unchanged', async () => {
  const html = '<p><img src="file:///C:/docs/hero.png" alt="Hero"></p>'

  const exportedHtml = await inlineLocalImagesForExport(html, {
    resolveLocalImage: async () => null,
  })

  assert.match(exportedHtml, /src="file:\/\/\/C:\/docs\/hero\.png"/)
})
