import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('workspace index separates content analysis from diagnostics rules', async () => {
  const [analysis, diagnostics] = await Promise.all([
    readFile(new URL('../src/lib/workspaceIndex/analysis.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/workspaceIndex/diagnostics.ts', import.meta.url), 'utf8'),
  ])

  assert.match(analysis, /import \{ buildWorkspaceDiagnostics \} from '\.\/diagnostics\.ts'/)
  assert.match(analysis, /const diagnostics = buildWorkspaceDiagnostics\(content, headings, assets, frontMatter\)/)
  assert.doesNotMatch(analysis, /function buildWorkspaceFootnoteDiagnostics/)
  assert.doesNotMatch(analysis, /function buildWorkspacePublishDiagnostics/)

  assert.match(diagnostics, /export function buildWorkspaceDiagnostics/)
  assert.match(diagnostics, /function buildWorkspaceHeadingDiagnostics/)
  assert.match(diagnostics, /function buildWorkspaceAssetDiagnostics/)
  assert.match(diagnostics, /function buildWorkspaceFootnoteDiagnostics/)
  assert.match(diagnostics, /function buildWorkspaceFrontMatterDiagnostics/)
  assert.match(diagnostics, /function buildWorkspacePublishDiagnostics/)
})
