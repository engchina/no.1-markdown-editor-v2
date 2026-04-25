import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('wysiwyg inline media uses remark-driven media ranges and rendered fragment widgets', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ collectInlineMediaRanges \} from '\.\/wysiwygInlineMedia\.ts'/u)
  assert.match(source, /import \{ collectReferenceDefinitionMarkdown \} from '\.\/wysiwygReferenceLinks\.ts'/u)
  assert.match(source, /class InlineRenderedFragmentWidget extends WidgetType/u)
  assert.match(source, /referenceDefinitionsMarkdown: collectReferenceDefinitionMarkdown\(body\)/u)
  assert.match(source, /const inlineMediaRanges = collectInlineMediaRanges\(text, \{\s*referenceDefinitionsMarkdown: documentContext\.referenceDefinitionsMarkdown,\s*\}\)/u)
  assert.match(source, /new InlineRenderedFragmentWidget\(/u)
  assert.match(source, /activateInlineRenderedFragmentTarget/u)
  assert.doesNotMatch(source, /const imgRe = \/!\\\[/u)
  assert.doesNotMatch(source, /const linkRe = \/\(\?<!!\)\\\[/u)
})
