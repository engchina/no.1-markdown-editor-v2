import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App exposes a dedicated overlay boundary that stops floating panels before the status bar', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /data-overlay-boundary="true"/)
})

test('toolbar menus render through a portal so scroll shells cannot clip them', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /import \{ createPortal \} from 'react-dom'/)
  assert.match(toolbar, /useAnchoredOverlayStyle/)
  assert.match(toolbar, /return createPortal\(/)
  assert.match(toolbar, /useAnchoredOverlayStyle\(triggerRef, \{ align, width, zoom \}\)/)
})

test('toolbar menus expose keyboard menu semantics and restore trigger focus on escape', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /role="menu"/)
  assert.match(toolbar, /role="menuitem"/)
  assert.match(toolbar, /aria-haspopup=\{hasPopup\}/)
  assert.match(toolbar, /aria-expanded=\{expanded === undefined \? undefined : expanded\}/)
  assert.match(toolbar, /data-toolbar-menu="true"/)
  assert.match(toolbar, /data-toolbar-menu-item="true"/)
  assert.match(toolbar, /event\.key === 'Escape'[\s\S]*closeAndRestoreFocus\(\)/)
  assert.match(toolbar, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowRight'/)
  assert.match(toolbar, /event\.key === 'ArrowUp' \|\| event\.key === 'ArrowLeft'/)
  assert.match(toolbar, /event\.key === 'Home'/)
  assert.match(toolbar, /event\.key === 'End'/)
  assert.match(toolbar, /triggerRef\.current\?\.focus\(\)/)
})

test('toolbar consolidates lower frequency markdown formatting into one menu', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')
  const toolbarRender = toolbar.slice(toolbar.indexOf('return ('), toolbar.indexOf('<div className="flex-1" />'))

  assert.match(toolbarRender, /<ToolbarGroup label=\{t\('toolbar\.format'\)\}>/)
  assert.match(toolbar, /import \{ getFormatShortcutLabel \} from '..\/Editor\/formatShortcuts'/)
  assert.match(toolbar, /shortcut\?: string/)
  assert.match(toolbar, /items\.map\(\(\{ id, label: itemLabel, icon, textIcon, shortcut, action \}, index\) =>/)
  assert.match(toolbar, /\{shortcut && \([\s\S]*\{shortcut\}/)
  assert.match(toolbar, /const headingShortcut = getFormatShortcutLabel\('heading'\)/)
  assert.match(toolbar, /const boldShortcut = getFormatShortcutLabel\('bold'\)/)
  assert.match(toolbar, /const italicShortcut = getFormatShortcutLabel\('italic'\)/)
  assert.match(toolbar, /import \{ formatPrimaryShortcut, matchesPrimaryShortcut \} from '..\/..\/lib\/platform'/)
  assert.match(toolbar, /matchesPrimaryShortcut\(event, \{ key: 'n' \}\)/)
  assert.match(toolbar, /matchesPrimaryShortcut\(event, \{ key: 'o' \}\)/)
  assert.match(toolbar, /matchesPrimaryShortcut\(event, \{ key: 's', shift: true \}\)/)
  assert.match(toolbar, /matchesPrimaryShortcut\(event, \{ key: 's' \}\)/)
  assert.doesNotMatch(toolbar, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(toolbarRender, /title=\{`\$\{t\('toolbar\.headings'\)\} \(\$\{headingShortcut\}\)`\}/)
  assert.match(toolbarRender, /<ToolbarBtn title=\{`\$\{t\('toolbar\.bold'\)\} \(\$\{boldShortcut\}\)`\}/)
  assert.match(toolbarRender, /<ToolbarBtn title=\{`\$\{t\('toolbar\.italic'\)\} \(\$\{italicShortcut\}\)`\}/)
  assert.match(toolbar, /const formatItems: ToolbarMenuItem\[\] = \[[\s\S]*id: 'quote'[\s\S]*id: 'ul'[\s\S]*id: 'ol'[\s\S]*id: 'task'/)
  assert.match(toolbar, /const formatItems: ToolbarMenuItem\[\] = \[[\s\S]*id: 'underline'[\s\S]*id: 'strikethrough'[\s\S]*id: 'highlight'/)
  assert.match(toolbar, /const formatItems: ToolbarMenuItem\[\] = \[[\s\S]*id: 'link'[\s\S]*id: 'code'[\s\S]*id: 'codeblock'[\s\S]*id: 'table'[\s\S]*id: 'hr'[\s\S]*id: 'image'/)
  assert.match(toolbar, /id: 'ul'[\s\S]*shortcut: getFormatShortcutLabel\('ul'\)[\s\S]*id: 'ol'[\s\S]*shortcut: getFormatShortcutLabel\('ol'\)[\s\S]*id: 'task'[\s\S]*shortcut: getFormatShortcutLabel\('task'\)/)
  assert.match(toolbar, /id: 'underline'[\s\S]*shortcut: getFormatShortcutLabel\('underline'\)[\s\S]*id: 'strikethrough'[\s\S]*shortcut: getFormatShortcutLabel\('strikethrough'\)/)
  assert.match(toolbar, /id: 'link'[\s\S]*shortcut: getFormatShortcutLabel\('link'\)[\s\S]*id: 'code'[\s\S]*shortcut: getFormatShortcutLabel\('code'\)[\s\S]*id: 'codeblock'[\s\S]*shortcut: getFormatShortcutLabel\('codeblock'\)[\s\S]*id: 'image'[\s\S]*shortcut: getFormatShortcutLabel\('image'\)/)
  assert.doesNotMatch(toolbarRender, /<ToolbarBtn title=\{t\('toolbar\.quote'\)\}/)
  assert.doesNotMatch(toolbarRender, /<ToolbarBtn title=\{t\('toolbar\.underline'\)\}/)
  assert.doesNotMatch(toolbarRender, /<ToolbarBtn title=\{t\('toolbar\.highlight'\)\}/)
})

test('toolbar and command palette use semantically distinct icons', async () => {
  const [toolbar, palette, icons] = await Promise.all([
    readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Icons/AppIcon.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(icons, /\| 'command'/)
  assert.match(icons, /\| 'format'/)
  assert.match(icons, /\| 'shortcuts'/)
  assert.match(icons, /command: '[^']+'/)
  assert.match(icons, /format: '[^']+'/)
  assert.match(icons, /shortcuts: '[^']+'/)
  assert.match(icons, /wysiwyg: '[^']*M4 5h16v14H4z/)
  assert.match(icons, /outline: '[^']*M21 6H8/)

  assert.match(toolbar, /<AppIcon name="format" size=\{16\} \/>/)
  assert.match(toolbar, /<AppIcon name="command" size=\{16\} \/>/)
  assert.match(toolbar, /<AppIcon name="shortcuts" size=\{17\} \/>/)
  assert.match(toolbar, /<AppIcon name="wysiwyg" size=\{16\} \/>/)
  assert.match(toolbar, /data-toolbar-action="command-palette"[\s\S]{0,120}<AppIcon name="command" size=\{16\} \/>/)
  assert.match(toolbar, /data-toolbar-action="keyboard-shortcuts"[\s\S]{0,120}<AppIcon name="shortcuts" size=\{17\} \/>/)
  assert.doesNotMatch(toolbar, /data-toolbar-action="command-palette"[\s\S]{0,120}<AppIcon name="keyboard"/)

  assert.match(palette, /case 'view\.wysiwyg':\s*return <SvgBadge name="wysiwyg" \/>/)
  assert.match(palette, /command\.id\.startsWith\('help\.'\)\) return <SvgBadge name="shortcuts" \/>/)
  assert.match(palette, /mode === 'file' \? <AppIcon name="file" size=\{16\} \/> : <AppIcon name="command" size=\{16\} \/>/)
  assert.doesNotMatch(palette, /case 'view\.wysiwyg':[\s\S]{0,80}sparkles/)
})

test('global chrome styling stays quiet for a desktop writing tool', async () => {
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /\.glass-panel \{[\s\S]*blur\(10px\) saturate\(120%\)/)
  assert.match(css, /\.sidebar-surface \{[\s\S]*border-radius: 12px;/)
  assert.match(css, /\.hover-scale:hover \{[\s\S]*box-shadow:/)
  assert.doesNotMatch(css, /blur\(28px\) saturate\(190%\)/)
  assert.doesNotMatch(css, /border-radius: 28px;/)
  assert.doesNotMatch(css, /transform: scale\(1\.04\);/)
  assert.doesNotMatch(css, /transform: scale\(0\.96\);/)
})

test('theme panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /const \{[\s\S]*zoom,[\s\S]*\} = useEditorStore\(\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 420, zoom \}\)/)
})

test('AI setup panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/AI/AISetupPanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /useEditorStore\(\(state\) => state\.zoom\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 420, zoom \}\)/)
})

test('about panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/Updates/AboutPanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /useEditorStore\(\(state\) => state\.zoom\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 344, zoom \}\)/)
})
