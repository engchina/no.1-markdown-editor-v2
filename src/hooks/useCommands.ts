import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { useFileOps } from './useFileOps'
import { useExport } from './useExport'
import { useRecentFiles } from './useRecentFiles'
import { applyTheme, getThemeById, THEMES } from '../themes'
import { dispatchEditorAIGhostText, dispatchEditorAIOpen } from '../lib/ai/events'
import { createAIQuickActionOpenDetail } from '../lib/ai/quickActions'
import { getFormatShortcutLabel } from '../components/Editor/formatShortcuts'
import type { Language } from '../i18n'
import { formatPrimaryShortcut } from '../lib/platform'
import { runManualUpdateCheck } from '../lib/updateActions'
import { dispatchKeyboardShortcutsOpen, getKeyboardShortcutsShortcutLabel } from '../lib/keyboardShortcuts'
import {
  SIDEBAR_SURFACE_META,
  getSidebarSurfaceCommandId,
} from '../lib/sidebarSurfaces'
import {
  dispatchEditorHistory,
  getEditorRedoShortcutLabel,
  getEditorUndoShortcutLabel,
} from '../lib/editorHistory.ts'

export interface Command {
  id: string
  label: string
  description?: string
  icon?: string
  category: 'file' | 'edit' | 'ai' | 'view' | 'theme' | 'export' | 'language' | 'help'
  shortcut?: string
  action: () => void
}

function emitFormat(action: string) {
  document.dispatchEvent(new CustomEvent('editor:format', { detail: action }))
}

export function useCommands(): Command[] {
  const { t } = useTranslation()
  const store = useEditorStore()
  const { newFile, openFile, saveFile, saveFileAs, closeActiveFile } = useFileOps()
  const { exportHtml, exportPdf, exportMarkdown, copyAsHtml, copyHtmlSource } = useExport()
  const { recentFiles, openRecent, clearRecent } = useRecentFiles()
  const newShortcut = formatPrimaryShortcut('N')
  const openShortcut = formatPrimaryShortcut('O')
  const saveShortcut = formatPrimaryShortcut('S')
  const saveAsShortcut = formatPrimaryShortcut('S', { shift: true })
  const sidebarShortcut = formatPrimaryShortcut('\\')
  const increaseFontShortcut = formatPrimaryShortcut('+')
  const decreaseFontShortcut = formatPrimaryShortcut('-')
  const resetFontShortcut = formatPrimaryShortcut('0')
  const findShortcut = formatPrimaryShortcut('F')
  const replaceShortcut = formatPrimaryShortcut('H')
  const aiShortcut = formatPrimaryShortcut('J')
  const closeFileShortcut = formatPrimaryShortcut('W')
  const keyboardShortcutsShortcut = getKeyboardShortcutsShortcutLabel()
  const undoShortcut = getEditorUndoShortcutLabel()
  const redoShortcut = getEditorRedoShortcutLabel()

  return useMemo<Command[]>(() => {
    const recentCommands = recentFiles.slice(0, 5).map((file) => ({
      id: `file.recent.${file.path}`,
      label: t('commands.recentFile', { name: file.name }),
      description: file.path,
      icon: '🕐',
      category: 'file' as const,
      action: () => {
        void openRecent(file)
        },
      }))

    const sidebarSurfaceCommands: Command[] = SIDEBAR_SURFACE_META.map((surface) => ({
      id: getSidebarSurfaceCommandId(surface.id),
      label: t('commands.openSidebarSurface', { name: t(surface.titleKey) }),
      category: 'view',
      action: () => {
        store.setSidebarOpen(true)
        store.setSidebarTab(surface.id)
      },
    }))

    const commands: Command[] = [
      {
        id: 'file.new',
        label: t('menu.newFile'),
        icon: '📄',
        category: 'file',
        shortcut: newShortcut,
        action: newFile,
      },
      {
        id: 'file.open',
        label: t('menu.openFile'),
        icon: '📂',
        category: 'file',
        shortcut: openShortcut,
        action: () => {
          void openFile()
        },
      },
      {
        id: 'file.save',
        label: t('menu.saveFile'),
        icon: '💾',
        category: 'file',
        shortcut: saveShortcut,
        action: () => {
          void saveFile()
        },
      },
      {
        id: 'file.saveAs',
        label: t('menu.saveAs'),
        icon: '📝',
        category: 'file',
        shortcut: saveAsShortcut,
        action: () => {
          void saveFileAs()
        },
      },
      {
        id: 'file.close',
        label: t('menu.closeFile'),
        category: 'file',
        shortcut: closeFileShortcut,
        action: () => {
          void closeActiveFile()
        },
      },
      {
        id: 'file.checkUpdates',
        label: t('commands.checkForUpdates'),
        icon: '⬇',
        category: 'file',
        action: () => {
          void runManualUpdateCheck()
        },
      },
      ...recentCommands,
      {
        id: 'file.recent.clear',
        label: t('commands.clearRecentFiles'),
        icon: '🧹',
        category: 'file',
        action: clearRecent,
      },
      {
        id: 'view.source',
        label: t('commands.viewSourceMode'),
        icon: '⌨',
        category: 'view',
        action: () => store.setViewMode('source'),
      },
      {
        id: 'view.split',
        label: t('commands.viewSplitMode'),
        icon: '⬛',
        category: 'view',
        action: () => store.setViewMode('split'),
      },
      {
        id: 'view.preview',
        label: t('commands.viewPreviewMode'),
        icon: '👁',
        category: 'view',
        action: () => store.setViewMode('preview'),
      },
      {
        id: 'view.focus',
        label: t('commands.viewFocusMode'),
        icon: '🎯',
        category: 'view',
        shortcut: 'F11',
        action: () => store.setFocusMode(!store.focusMode),
      },
      {
        id: 'view.wysiwyg',
        label: store.wysiwygMode ? t('commands.disableWysiwyg') : t('commands.enableWysiwyg'),
        icon: '✨',
        category: 'view',
        action: () => store.setWysiwygMode(!store.wysiwygMode),
      },
      {
        id: 'view.sidebar',
        label: store.sidebarOpen ? t('commands.hideSidebar') : t('commands.showSidebar'),
        icon: '📋',
        category: 'view',
        shortcut: sidebarShortcut,
        action: () => store.setSidebarOpen(!store.sidebarOpen),
      },
      ...sidebarSurfaceCommands,
      {
        id: 'view.lineNumbers',
        label: store.lineNumbers ? t('commands.hideLineNumbers') : t('commands.showLineNumbers'),
        icon: '🔢',
        category: 'view',
        action: () => store.setLineNumbers(!store.lineNumbers),
      },
      {
        id: 'view.wordWrap',
        label: store.wordWrap ? t('commands.disableWordWrap') : t('commands.enableWordWrap'),
        icon: '↩',
        category: 'view',
        action: () => store.setWordWrap(!store.wordWrap),
      },
      {
        id: 'view.typewriter',
        label: store.typewriterMode ? t('commands.disableTypewriterMode') : t('commands.enableTypewriterMode'),
        icon: '🖊',
        category: 'view',
        action: () => store.setTypewriterMode(!store.typewriterMode),
      },
      {
        id: 'view.zoomIn',
        label: t('commands.zoomIn'),
        icon: '🔍+',
        category: 'view',
        shortcut: increaseFontShortcut,
        action: () => store.setZoom(Math.min(store.zoom + 10, 300)),
      },
      {
        id: 'view.zoomOut',
        label: t('commands.zoomOut'),
        icon: '🔍-',
        category: 'view',
        shortcut: decreaseFontShortcut,
        action: () => store.setZoom(Math.max(store.zoom - 10, 50)),
      },
      {
        id: 'view.zoomReset',
        label: t('commands.zoomReset'),
        icon: '🔍',
        category: 'view',
        shortcut: resetFontShortcut,
        action: () => store.setZoom(100),
      },
      {
        id: 'help.keyboardShortcuts',
        label: t('shortcuts.open'),
        icon: 'keyboard',
        category: 'help',
        shortcut: keyboardShortcutsShortcut,
        action: () => {
          dispatchKeyboardShortcutsOpen()
        },
      },
      {
        id: 'view.fontSizeIncrease',
        label: t('commands.increaseFontSize'),
        icon: 'A+',
        category: 'view',
        action: () => store.setFontSize(Math.min(store.fontSize + 1, 24)),
      },
      {
        id: 'view.fontSizeDecrease',
        label: t('commands.decreaseFontSize'),
        icon: 'A-',
        category: 'view',
        action: () => store.setFontSize(Math.max(store.fontSize - 1, 11)),
      },
      {
        id: 'view.fontSizeReset',
        label: t('commands.resetFontSize'),
        icon: 'A',
        category: 'view',
        action: () => store.setFontSize(14),
      },
      {
        id: 'edit.undo',
        label: t('commands.undo'),
        category: 'edit',
        shortcut: undoShortcut,
        action: () => {
          dispatchEditorHistory('undo')
        },
      },
      {
        id: 'edit.redo',
        label: t('commands.redo'),
        category: 'edit',
        shortcut: redoShortcut,
        action: () => {
          dispatchEditorHistory('redo')
        },
      },
      {
        id: 'edit.find',
        label: t('commands.findInDocument'),
        icon: '🔍',
        category: 'edit',
        shortcut: findShortcut,
        action: () => document.dispatchEvent(new CustomEvent('editor:search', { detail: { replace: false } })),
      },
      {
        id: 'edit.replace',
        label: t('commands.findReplace'),
        icon: '🔄',
        category: 'edit',
        shortcut: replaceShortcut,
        action: () => document.dispatchEvent(new CustomEvent('editor:search', { detail: { replace: true } })),
      },
      {
        id: 'ai.ask',
        label: t('commands.aiAsk'),
        icon: '✨',
        category: 'ai',
        shortcut: aiShortcut,
        action: () => {
          dispatchEditorAIOpen({ ...createAIQuickActionOpenDetail('ask', t), source: 'command-palette' })
        },
      },
      {
        id: 'ai.editSelection',
        label: t('commands.aiEditSelection'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIOpen({ source: 'command-palette', intent: 'edit', outputTarget: 'replace-selection' })
        },
      },
      {
        id: 'ai.continueWriting',
        label: t('commands.aiContinueWriting'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIOpen({ ...createAIQuickActionOpenDetail('continueWriting', t), source: 'command-palette' })
        },
      },
      {
        id: 'ai.ghostTextContinuation',
        label: t('commands.aiGhostTextContinuation'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIGhostText({ source: 'command-palette' })
        },
      },
      {
        id: 'ai.newNote',
        label: t('commands.aiDraftNewNote'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIOpen({
            source: 'command-palette',
            intent: 'generate',
            outputTarget: 'new-note',
            prompt: t('ai.templates.newNotePrompt'),
          })
        },
      },
      {
        id: 'ai.summarizeSelection',
        label: t('commands.aiSummarizeSelection'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIOpen({ ...createAIQuickActionOpenDetail('summarize', t), source: 'command-palette' })
        },
      },
      {
        id: 'ai.translateSelection',
        label: t('commands.aiTranslateSelection'),
        icon: '✨',
        category: 'ai',
        action: () => {
          dispatchEditorAIOpen({ ...createAIQuickActionOpenDetail('translate', t), source: 'command-palette' })
        },
      },
      {
        id: 'edit.bold',
        label: t('toolbar.bold'),
        icon: '𝐁',
        category: 'edit',
        shortcut: getFormatShortcutLabel('bold'),
        action: () => emitFormat('bold'),
      },
      {
        id: 'edit.italic',
        label: t('toolbar.italic'),
        icon: '𝘐',
        category: 'edit',
        shortcut: getFormatShortcutLabel('italic'),
        action: () => emitFormat('italic'),
      },
      {
        id: 'edit.underline',
        label: t('toolbar.underline'),
        icon: 'U̲',
        category: 'edit',
        shortcut: getFormatShortcutLabel('underline'),
        action: () => emitFormat('underline'),
      },
      {
        id: 'edit.strikethrough',
        label: t('toolbar.strikethrough'),
        icon: 'S̶',
        category: 'edit',
        shortcut: getFormatShortcutLabel('strikethrough'),
        action: () => emitFormat('strikethrough'),
      },
      {
        id: 'edit.heading',
        label: t('toolbar.headings'),
        icon: 'H',
        category: 'edit',
        shortcut: getFormatShortcutLabel('heading'),
        action: () => emitFormat('heading'),
      },
      {
        id: 'edit.highlight',
        label: t('toolbar.highlight'),
        icon: 'highlight',
        category: 'edit',
        action: () => emitFormat('highlight'),
      },
      {
        id: 'edit.code',
        label: t('toolbar.code'),
        icon: '</>',
        category: 'edit',
        shortcut: getFormatShortcutLabel('code'),
        action: () => emitFormat('code'),
      },
      {
        id: 'edit.codeBlock',
        label: t('toolbar.codeBlock'),
        icon: '```',
        category: 'edit',
        shortcut: getFormatShortcutLabel('codeblock'),
        action: () => emitFormat('codeblock'),
      },
      {
        id: 'edit.quote',
        label: t('toolbar.quote'),
        icon: '❝',
        category: 'edit',
        action: () => emitFormat('quote'),
      },
      {
        id: 'edit.ul',
        label: t('toolbar.ul'),
        icon: '•',
        category: 'edit',
        shortcut: getFormatShortcutLabel('ul'),
        action: () => emitFormat('ul'),
      },
      {
        id: 'edit.ol',
        label: t('toolbar.ol'),
        icon: '1.',
        category: 'edit',
        shortcut: getFormatShortcutLabel('ol'),
        action: () => emitFormat('ol'),
      },
      {
        id: 'edit.task',
        label: t('toolbar.task'),
        icon: '☐',
        category: 'edit',
        shortcut: getFormatShortcutLabel('task'),
        action: () => emitFormat('task'),
      },
      {
        id: 'edit.hr',
        label: t('toolbar.hr'),
        icon: '—',
        category: 'edit',
        action: () => emitFormat('hr'),
      },
      {
        id: 'edit.table',
        label: t('toolbar.table'),
        icon: '▦',
        category: 'edit',
        action: () => emitFormat('table'),
      },
      {
        id: 'edit.link',
        label: t('toolbar.link'),
        icon: '🔗',
        category: 'edit',
        shortcut: getFormatShortcutLabel('link'),
        action: () => emitFormat('link'),
      },
      {
        id: 'edit.image',
        label: t('toolbar.image'),
        icon: '🖼',
        category: 'edit',
        shortcut: getFormatShortcutLabel('image'),
        action: () => emitFormat('image'),
      },
      {
        id: 'edit.h1',
        label: t('toolbar.h1'),
        icon: 'H1',
        category: 'edit',
        action: () => emitFormat('h1'),
      },
      {
        id: 'edit.h2',
        label: t('toolbar.h2'),
        icon: 'H2',
        category: 'edit',
        action: () => emitFormat('h2'),
      },
      {
        id: 'edit.h3',
        label: t('toolbar.h3'),
        icon: 'H3',
        category: 'edit',
        action: () => emitFormat('h3'),
      },
      {
        id: 'edit.h4',
        label: t('toolbar.h4'),
        icon: 'H4',
        category: 'edit',
        action: () => emitFormat('h4'),
      },
      {
        id: 'edit.h5',
        label: t('toolbar.h5'),
        icon: 'H5',
        category: 'edit',
        action: () => emitFormat('h5'),
      },
      {
        id: 'edit.h6',
        label: t('toolbar.h6'),
        icon: 'H6',
        category: 'edit',
        action: () => emitFormat('h6'),
      },
      {
        id: 'export.html',
        label: t('commands.exportHtml'),
        icon: '🌐',
        category: 'export',
        action: () => {
          void exportHtml()
        },
      },
      {
        id: 'export.pdf',
        label: t('commands.exportPdf'),
        icon: '📄',
        category: 'export',
        action: () => {
          void exportPdf()
        },
      },
      {
        id: 'export.markdown',
        label: t('commands.exportMarkdown'),
        icon: '📝',
        category: 'export',
        action: () => {
          void exportMarkdown()
        },
      },
      {
        id: 'export.copyHtml',
        label: t('commands.copyRichHtml'),
        icon: '📋',
        category: 'export',
        action: () => {
          void copyAsHtml()
        },
      },
      {
        id: 'export.copyHtmlSource',
        label: t('commands.copyHtmlSource'),
        icon: '<>',
        category: 'export',
        action: () => {
          void copyHtmlSource()
        },
      },
      ...THEMES.map((theme) => ({
        id: `theme.${theme.id}`,
        label: t('commands.theme', { name: theme.name }),
        icon: theme.dark ? '🌙' : '☀️',
        category: 'theme' as const,
        action: () => {
          store.setActiveThemeId(theme.id)
          applyTheme(getThemeById(theme.id))
        },
      })),
      {
        id: 'lang.en',
        label: t('commands.languageEnglish'),
        icon: '🇬🇧',
        category: 'language',
        action: () => store.setLanguage('en' as Language),
      },
      {
        id: 'lang.ja',
        label: t('commands.languageJapanese'),
        icon: '🇯🇵',
        category: 'language',
        action: () => store.setLanguage('ja' as Language),
      },
      {
        id: 'lang.zh',
        label: t('commands.languageChinese'),
        icon: '🇨🇳',
        category: 'language',
        action: () => store.setLanguage('zh' as Language),
      },
    ]

    if (recentCommands.length === 0) {
      return commands.filter((command) => command.id !== 'file.recent.clear')
    }

    return commands
  }, [
    clearRecent,
    closeActiveFile,
    closeFileShortcut,
    copyAsHtml,
    copyHtmlSource,
    exportHtml,
    exportMarkdown,
    exportPdf,
    aiShortcut,
    findShortcut,
    decreaseFontShortcut,
    increaseFontShortcut,
    keyboardShortcutsShortcut,
    newFile,
    newShortcut,
    openShortcut,
    openFile,
    openRecent,
    replaceShortcut,
    resetFontShortcut,
    recentFiles,
    redoShortcut,
    saveFile,
    saveShortcut,
    saveFileAs,
    saveAsShortcut,
    sidebarShortcut,
    store.focusMode,
    store.fontSize,
    store.zoom,
    store.lineNumbers,
    store.sidebarOpen,
    store.typewriterMode,
    store.wysiwygMode,
    undoShortcut,
    store.wordWrap,
    t,
  ])
}
