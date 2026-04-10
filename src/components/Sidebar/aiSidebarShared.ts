import type { EditorAIOpenDetail } from '../../lib/ai/events.ts'
import { createAITemplateOpenDetail, type AITemplateId } from '../../lib/ai/templateLibrary.ts'
import type { AIComposerSource, AIRequestState } from '../../lib/ai/types.ts'
import type { IconName } from '../Icons/AppIcon'

type Translate = (key: string) => string

export type AISidebarPeekView = 'library' | 'session' | 'commands'

export interface SidebarAIAction {
  id: string
  icon: IconName
  label: string
  detail: string
  openDetail: EditorAIOpenDetail
}

export interface AISidebarStatus {
  icon: IconName
  accent: string
  label: string
  detail: string
}

export interface AISessionHistoryStatusMeta {
  icon: IconName
  accent: string
  label: string
}

export const SIDEBAR_TAB_SOURCE = 'sidebar-tab' as AIComposerSource

export function getAISidebarActions(t: Translate): SidebarAIAction[] {
  return [
    {
      id: 'ask',
      icon: 'sparkles',
      label: t('ai.sidebar.askAction'),
      detail: t('ai.sidebar.askDetail'),
      openDetail: createAITemplateOpenDetail('ask', t, SIDEBAR_TAB_SOURCE),
    },
    {
      id: 'continue',
      icon: 'edit',
      label: t('ai.sidebar.continueAction'),
      detail: t('ai.sidebar.continueDetail'),
      openDetail: createAITemplateOpenDetail('continueWriting', t, SIDEBAR_TAB_SOURCE),
    },
    {
      id: 'review',
      icon: 'infoCircle',
      label: t('ai.sidebar.reviewAction'),
      detail: t('ai.sidebar.reviewDetail'),
      openDetail: createAITemplateOpenDetail('review', t, SIDEBAR_TAB_SOURCE),
    },
    {
      id: 'insert-below',
      icon: 'filePlus',
      label: t('ai.sidebar.generateBelowAction'),
      detail: t('ai.sidebar.generateBelowDetail'),
      openDetail: createAITemplateOpenDetail('generateBelow', t, SIDEBAR_TAB_SOURCE),
    },
  ]
}

export function getAISidebarSourceLabel(source: AIComposerSource, t: Translate): string {
  switch (source) {
    case 'selection-bubble':
      return t('ai.sidebar.source.selectionBubble')
    case 'command-palette':
      return t('ai.sidebar.source.commandPalette')
    case 'slash-command':
      return t('ai.sidebar.source.slashCommand')
    case 'sidebar-tab':
      return t('ai.sidebar.source.sidebarTab')
    case 'shortcut':
    default:
      return t('ai.sidebar.source.shortcut')
  }
}

export function getAISessionHistoryStatusMeta(status: 'streaming' | 'done' | 'error' | 'canceled', t: Translate): AISessionHistoryStatusMeta {
  switch (status) {
    case 'streaming':
      return {
        icon: 'sparkles',
        accent: 'var(--accent)',
        label: t('ai.requestState.streaming'),
      }
    case 'done':
      return {
        icon: 'checkCircle',
        accent: '#16a34a',
        label: t('ai.requestState.done'),
      }
    case 'error':
      return {
        icon: 'alertCircle',
        accent: '#dc2626',
        label: t('ai.requestState.error'),
      }
    case 'canceled':
    default:
      return {
        icon: 'panel',
        accent: '#b45309',
        label: t('ai.sidebar.historyCanceled'),
      }
  }
}

export function getAISidebarStatus({
  composerOpen,
  draftText,
  errorMessage,
  requestState,
  maxDetailLength,
  t,
}: {
  composerOpen: boolean
  draftText: string
  errorMessage: string | null
  requestState: AIRequestState
  maxDetailLength: number
  t: Translate
}): AISidebarStatus {
  if (errorMessage) {
    return {
      icon: 'alertCircle',
      accent: '#dc2626',
      label: t('ai.sidebar.statusError'),
      detail: truncateSidebarCopy(errorMessage, maxDetailLength),
    }
  }

  if (requestState === 'streaming') {
    return {
      icon: 'sparkles',
      accent: 'var(--accent)',
      label: t('ai.sidebar.statusStreaming'),
      detail: t('ai.loading'),
    }
  }

  if (draftText.trim().length > 0) {
    return {
      icon: 'checkCircle',
      accent: '#16a34a',
      label: t('ai.sidebar.statusDraft'),
      detail: truncateSidebarCopy(draftText.trim(), maxDetailLength),
    }
  }

  if (composerOpen) {
    return {
      icon: 'panel',
      accent: 'var(--accent)',
      label: t('ai.sidebar.statusOpen'),
      detail: t('ai.sidebar.statusOpenDetail'),
    }
  }

  return {
    icon: 'checkCircle',
    accent: '#2563eb',
    label: t('ai.sidebar.statusReady'),
    detail: t('ai.sidebar.statusReadyDetail'),
  }
}

export function getAITemplateIcon(templateId: AITemplateId): IconName {
  switch (templateId) {
    case 'newNote':
      return 'filePlus'
    case 'translate':
      return 'globe'
    case 'rewrite':
      return 'edit'
    case 'summarize':
      return 'outline'
    case 'ask':
      return 'sparkles'
    case 'continueWriting':
      return 'edit'
    case 'review':
      return 'infoCircle'
    case 'generateBelow':
      return 'filePlus'
  }

  return 'sparkles'
}

export function truncateSidebarCopy(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}
