import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  CODEMIRROR_MARKDOWN_COMMENT_SHORTCUTS,
  openKeyboardShortcutsFromEditor,
  sourceEditorDefaultKeymap,
} from '../src/components/Editor/extensions.ts'
import { KEYBOARD_SHORTCUTS_OPEN_EVENT } from '../src/lib/keyboardShortcuts.ts'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('keyboard shortcuts dialog is reachable from toolbar, command palette, and Ctrl/Cmd+slash', async () => {
  const [app, toolbar, commands, palette, shortcutsLib] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/keyboardShortcuts.ts', import.meta.url), 'utf8'),
  ])

  assert.match(shortcutsLib, /export const KEYBOARD_SHORTCUTS_OPEN_EVENT = 'app:keyboard-shortcuts-open'/)
  assert.match(shortcutsLib, /export function getKeyboardShortcutsShortcutLabel\(\): string/)
  assert.match(shortcutsLib, /formatPrimaryShortcut\('\/'\)/)
  assert.match(shortcutsLib, /export function dispatchKeyboardShortcutsOpen\(\): boolean/)

  assert.match(app, /const KeyboardShortcutsDialog = lazy\(\(\) => import\('\.\/components\/KeyboardShortcuts\/KeyboardShortcutsDialog'\)\)/)
  assert.match(app, /const \[keyboardShortcutsOpen, setKeyboardShortcutsOpen\] = useState\(false\)/)
  assert.match(app, /matchesPrimaryShortcut\(event, \{ key: '\/' \}\)/)
  assert.match(app, /document\.addEventListener\(KEYBOARD_SHORTCUTS_OPEN_EVENT, openKeyboardShortcuts\)/)
  assert.match(app, /<KeyboardShortcutsDialog onClose=\{\(\) => setKeyboardShortcutsOpen\(false\)\} \/>/)
  assert.match(app, /onOpenShortcuts=\{\(\) => setKeyboardShortcutsOpen\(true\)\}/)

  assert.match(toolbar, /import \{ getKeyboardShortcutsShortcutLabel \} from '..\/..\/lib\/keyboardShortcuts'/)
  assert.match(toolbar, /onOpenShortcuts\?: \(\) => void/)
  assert.match(toolbar, /shortcutsOpen\?: boolean/)
  assert.match(toolbar, /const shortcutsShortcut = getKeyboardShortcutsShortcutLabel\(\)/)
  assert.match(toolbar, /data-toolbar-action="keyboard-shortcuts"/)
  assert.match(toolbar, /active=\{shortcutsOpen\}/)
  assert.match(toolbar, /pressed=\{shortcutsOpen\}/)
  assert.match(toolbar, /<AppIcon name="shortcuts" size=\{17\} \/>/)
  assert.match(toolbar, /title=\{`\$\{t\('shortcuts\.open'\)\} \(\$\{shortcutsShortcut\}\)`\}/)

  assert.match(commands, /dispatchKeyboardShortcutsOpen, getKeyboardShortcutsShortcutLabel/)
  assert.match(commands, /category: 'file' \| 'edit' \| 'ai' \| 'view' \| 'theme' \| 'export' \| 'language' \| 'help'/)
  assert.match(commands, /const closeFileShortcut = formatPrimaryShortcut\('W'\)/)
  assert.match(commands, /id: 'file\.close'[\s\S]*shortcut: closeFileShortcut[\s\S]*void closeActiveFile\(\)/)
  assert.match(commands, /id: 'help\.keyboardShortcuts'[\s\S]*shortcut: keyboardShortcutsShortcut[\s\S]*dispatchKeyboardShortcutsOpen\(\)/)

  assert.match(palette, /const CATEGORY_ORDER = \['file', 'edit', 'ai', 'view', 'help', 'export', 'theme', 'language'\] as const/)
  assert.match(palette, /\['help\.keyboardShortcuts', 240]/)
  assert.match(palette, /command\.id\.startsWith\('help\.'\)\) return <SvgBadge name="shortcuts" \/>/)
})

test('keyboard shortcuts dialog groups only actual shortcuts from the command registry plus app navigation shortcuts', async () => {
  const dialog = await readFile(new URL('../src/components/KeyboardShortcuts/KeyboardShortcutsDialog.tsx', import.meta.url), 'utf8')

  assert.match(dialog, /data-keyboard-shortcuts-dialog="true"/)
  assert.match(dialog, /role="dialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /aria-describedby="keyboard-shortcuts-description"/)
  assert.match(dialog, /KEYBOARD_SHORTCUTS_SOURCE_SURFACE_SELECTOR = '\[data-source-editor-surface="true"\], \.cm-editor'/)
  assert.match(dialog, /KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX = 16/)
  assert.match(dialog, /resolveKeyboardShortcutsSourceFrameBounds\(\)/)
  assert.match(dialog, /useLayoutEffect\(\(\) => \{/)
  assert.match(dialog, /new ResizeObserver\(scheduleFrameBoundsUpdate\)/)
  assert.match(dialog, /data-keyboard-shortcuts-frame="source-editor"/)
  assert.match(dialog, /top: `\$\{dialogFrameBounds\.top\}px`/)
  assert.match(dialog, /bottom: `\$\{dialogFrameBounds\.bottom\}px`/)
  assert.match(dialog, /paddingTop: `\$\{KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX\}px`/)
  assert.match(dialog, /paddingBottom: `\$\{KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX\}px`/)
  assert.match(dialog, /className="pointer-events-none fixed inset-x-0 flex items-center justify-center px-4 sm:px-6"/)
  assert.match(dialog, /maxHeight: '100%'/)
  assert.match(dialog, /useCommands\(\)/)
  assert.match(dialog, /if \(!command\.shortcut\) return null/)
  assert.match(dialog, /if \(command\.id\.startsWith\('file\.recent\.'\)\) return null/)
  assert.match(dialog, /id: 'file\.switchOpen'[\s\S]*shortcut: formatPrimaryShortcut\('P'\)/)
  assert.match(dialog, /id: 'view\.commandPalette'[\s\S]*shortcut: formatPrimaryShortcut\('P', \{ shift: true \}\)/)
  assert.match(dialog, /id: 'edit\.findNextMatch'[\s\S]*shortcut: `\$\{formatPrimaryShortcut\('G'\)\} \/ F3`/)
  assert.match(dialog, /id: 'edit\.findPreviousMatch'[\s\S]*shortcut: `\$\{formatPrimaryShortcut\('G', \{ shift: true \}\)\} \/ \$\{formatShiftShortcut\('F3'\)\}`/)
  assert.match(dialog, /id: 'edit\.selectNextMatch'[\s\S]*shortcut: formatPrimaryShortcut\('D'\)/)
  assert.match(dialog, /id: 'edit\.goToLine'[\s\S]*shortcut: formatPrimaryShortcut\('G', \{ alt: true \}\)/)
  assert.match(dialog, /id: 'edit\.indentLess'[\s\S]*shortcut: formatPrimaryShortcut\('\['\)/)
  assert.match(dialog, /id: 'edit\.indentMore'[\s\S]*shortcut: formatPrimaryShortcut\('\]'\)/)
  assert.match(dialog, /id: 'edit\.insertBlankLine'[\s\S]*shortcut: formatPrimaryShortcut\('Enter'\)/)
  assert.match(dialog, /id: 'edit\.moveLineUp'[\s\S]*shortcut: formatAltShortcut\('ArrowUp'\)/)
  assert.match(dialog, /id: 'edit\.moveLineDown'[\s\S]*shortcut: formatAltShortcut\('ArrowDown'\)/)
  assert.match(dialog, /id: 'edit\.copyLineUp'[\s\S]*shortcut: formatShiftAltShortcut\('ArrowUp'\)/)
  assert.match(dialog, /id: 'edit\.copyLineDown'[\s\S]*shortcut: formatShiftAltShortcut\('ArrowDown'\)/)
  assert.match(dialog, /const LEFT_SHORTCUT_SECTION_CATEGORIES: Command\['category'\]\[\] = \['file', 'view', 'ai', 'help'\]/)
  assert.match(dialog, /const RIGHT_SHORTCUT_SECTION_CATEGORIES: Command\['category'\]\[\] = \['edit', 'export', 'theme', 'language'\]/)
  assert.match(dialog, /const CATEGORY_ORDER: Command\['category'\]\[\] = \[\s*\.\.\.LEFT_SHORTCUT_SECTION_CATEGORIES,\s*\.\.\.RIGHT_SHORTCUT_SECTION_CATEGORIES,\s*\]/)
  assert.match(dialog, /sections\.filter\(\(section\) => LEFT_SHORTCUT_SECTION_CATEGORIES\.includes\(section\.category\)\)/)
  assert.match(dialog, /sections\.filter\(\(section\) => RIGHT_SHORTCUT_SECTION_CATEGORIES\.includes\(section\.category\)\)/)
  assert.match(dialog, /function getShortcutCategoryIcon\(category: Command\['category'\]\): IconName/)
  assert.match(dialog, /case 'help':\s*return 'shortcuts'/)
  assert.match(dialog, /icon: getShortcutCategoryIcon\(category\)/)
  assert.match(dialog, /const totalShortcutCount = sectionColumns\.reduce\(/)
  assert.match(dialog, /t\('shortcuts\.subtitle'\)/)
  assert.match(dialog, /t\('shortcuts\.count', \{ count: totalShortcutCount \}\)/)
  assert.match(dialog, /<AppIcon name="shortcuts" size=\{20\} \/>/)
  assert.match(dialog, /<AppIcon name=\{section\.icon\} size=\{14\} \/>/)
  assert.match(dialog, /\{section\.items\.length\}/)
  assert.match(dialog, /<kbd[\s\S]*\{item\.shortcut\}/)
  assert.match(dialog, /<div className="grid items-start gap-3 lg:grid-cols-2">/)
  assert.match(dialog, /sectionColumns\.map\(\(column, columnIndex\) => \(/)
  assert.match(dialog, /<div key=\{columnIndex\} className="grid min-w-0 gap-3">/)
  assert.match(dialog, /useDialogFocusRestore\(closeButtonRef\)/)
  assert.match(dialog, /event\.key !== 'Escape'/)
  assert.match(dialog, /event\.key !== 'Tab'/)
})

test('source editor Ctrl/Cmd+slash opens keyboard shortcuts instead of inserting markdown comments', async () => {
  const source = await readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ dispatchKeyboardShortcutsOpen \} from '..\/..\/lib\/keyboardShortcuts\.ts'/)
  assert.match(source, /export const CODEMIRROR_MARKDOWN_COMMENT_SHORTCUTS = new Set\(\['Mod-\/', 'Alt-A'\]\)/)
  assert.match(source, /export const sourceEditorDefaultKeymap = defaultKeymap\.filter\(/)
  assert.match(source, /\[binding\.key, binding\.mac, binding\.win, binding\.linux\]/)
  assert.match(source, /\.\.\.sourceEditorDefaultKeymap/)
  assert.match(source, /export function openKeyboardShortcutsFromEditor\(\): boolean/)
  assert.match(source, /dispatchKeyboardShortcutsOpen\(\)\s*\n\s*return true/)
  assert.match(source, /Prec\.highest\(\s*keymap\.of\(\[/)
  assert.match(source, /key: 'Mod-\/'/)
  assert.match(source, /run: openKeyboardShortcutsFromEditor/)
  assert.match(source, /preventDefault: true/)
  assert.match(source, /Prec\.highest\([\s\S]*key: 'Mod-\/'[\s\S]*\)\s*,\s*\n\s*keymap\.of\(\[/)

  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const fakeDocument = new EventTarget()
  let opened = false
  fakeDocument.addEventListener(KEYBOARD_SHORTCUTS_OPEN_EVENT, () => {
    opened = true
  })

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  })

  try {
    assert.equal(openKeyboardShortcutsFromEditor(), true)
    assert.equal(opened, true)
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, 'document', previousDocument)
    } else {
      delete (globalThis as { document?: unknown }).document
    }
  }
})

test('source editor default keymap disables CodeMirror markdown comment commands', () => {
  const reservedKeys = Array.from(CODEMIRROR_MARKDOWN_COMMENT_SHORTCUTS)
  const sourceKeys = sourceEditorDefaultKeymap.flatMap((binding) =>
    [binding.key, binding.mac, binding.win, binding.linux].filter((key): key is string => Boolean(key))
  )

  assert.deepEqual(reservedKeys, ['Mod-/', 'Alt-A'])
  for (const key of reservedKeys) {
    assert.equal(sourceKeys.includes(key), false, key)
  }
})

test('source editor search shortcuts use strict platform primary modifier matching', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /import \{ matchesPrimaryShortcut \} from '..\/..\/lib\/platform\.ts'/)
  assert.match(source, /matchesPrimaryShortcut\(event, \{ key: 'f' \}\)/)
  assert.match(source, /matchesPrimaryShortcut\(event, \{ key: 'h' \}\)/)
  assert.doesNotMatch(source, /const mod = event\.ctrlKey \|\| event\.metaKey/)
})

test('keyboard shortcuts locale copy exists across en ja and zh', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'shortcuts.title',
    'shortcuts.open',
    'shortcuts.subtitle',
    'shortcuts.count',
    'shortcuts.switchFile',
    'shortcuts.editor.findNextMatch',
    'shortcuts.editor.findPreviousMatch',
    'shortcuts.editor.selectNextMatch',
    'shortcuts.editor.goToLine',
    'shortcuts.editor.indentLess',
    'shortcuts.editor.indentMore',
    'shortcuts.editor.insertBlankLine',
    'shortcuts.editor.moveLineUp',
    'shortcuts.editor.moveLineDown',
    'shortcuts.editor.copyLineUp',
    'shortcuts.editor.copyLineDown',
    'shortcuts.categories.file',
    'shortcuts.categories.edit',
    'shortcuts.categories.view',
    'shortcuts.categories.ai',
    'shortcuts.categories.help',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})
