import type { EditorAIOpenDetail } from './events.ts'
import type { AIComposerSource } from './types.ts'
import { createAITemplateOpenDetail, type AITemplateId } from './templateLibrary.ts'

export type AIQuickAction = 'ask' | 'translate' | 'summarize' | 'explain' | 'rewrite' | 'continueWriting'

type Translate = (key: string) => string

const QUICK_ACTION_TEMPLATE_IDS: Record<AIQuickAction, AITemplateId> = {
  ask: 'ask',
  translate: 'translate',
  summarize: 'summarize',
  explain: 'explain',
  rewrite: 'rewrite',
  continueWriting: 'continueWriting',
}

export function createAIQuickActionOpenDetail(
  action: AIQuickAction,
  t: Translate,
  source: AIComposerSource = 'selection-bubble'
): EditorAIOpenDetail {
  return createAITemplateOpenDetail(QUICK_ACTION_TEMPLATE_IDS[action], t, source)
}
