import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('editor history routes command palette actions and global shortcuts through one event path', async () => {
  const [historyModule, editor, commands, palette] = await Promise.all([
    readFile(new URL('../src/lib/editorHistory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(historyModule, /export const EDITOR_HISTORY_EVENT = 'editor:history'/)
  assert.match(historyModule, /export function dispatchEditorHistory\(action: EditorHistoryAction\): boolean/)
  assert.match(editor, /document\.addEventListener\(EDITOR_HISTORY_EVENT, onHistoryRequested\)/)
  assert.match(editor, /document\.addEventListener\('keydown', onGlobalHistoryShortcut\)/)
  assert.match(editor, /matchesEditorUndoShortcut\(event\)/)
  assert.match(editor, /matchesEditorRedoShortcut\(event\)/)
  assert.match(editor, /if \(target instanceof Node && view\.dom\.contains\(target\)\) return/)
  assert.match(editor, /if \(isTextInputLikeTarget\(target\)\) return/)
  assert.match(commands, /id: 'edit\.undo'/)
  assert.match(commands, /dispatchEditorHistory\('undo'\)/)
  assert.match(commands, /id: 'edit\.redo'/)
  assert.match(commands, /dispatchEditorHistory\('redo'\)/)
  assert.match(palette, /\['edit\.undo', 100]/)
  assert.match(palette, /\['edit\.redo', 101]/)
  assert.match(palette, /case 'edit\.undo':\s+return <SvgBadge name="undo" \/>/)
  assert.match(palette, /case 'edit\.redo':\s+return <SvgBadge name="redo" \/>/)
})
