import type { EditorAIOpenDetail } from './events.ts'
import type { AIComposerSource, AIIntent, AIOutputTarget, AIScope } from './types.ts'

export type AITemplateId =
  | 'ask'
  | 'continueWriting'
  | 'newNote'
  | 'translate'
  | 'rewrite'
  | 'summarize'
  | 'review'
  | 'generateBelow'

type Translate = (key: string) => string

export interface AITemplateDefinition {
  id: AITemplateId
  intent: AIIntent
  scope?: AIScope
  outputTarget: AIOutputTarget
  promptKey?: string
  labelKey: string
  detailKey: string
}

export interface AITemplateModel extends AITemplateDefinition {
  prompt: string
  label: string
  detail: string
}

const TEMPLATE_DEFINITIONS: AITemplateDefinition[] = [
  {
    id: 'ask',
    intent: 'ask',
    outputTarget: 'chat-only',
    labelKey: 'ai.templateLibrary.askLabel',
    detailKey: 'ai.templateLibrary.askDetail',
  },
  {
    id: 'continueWriting',
    intent: 'generate',
    outputTarget: 'at-cursor',
    promptKey: 'ai.templates.continueWritingPrompt',
    labelKey: 'ai.templateLibrary.continueLabel',
    detailKey: 'ai.templateLibrary.continueDetail',
  },
  {
    id: 'newNote',
    intent: 'generate',
    outputTarget: 'new-note',
    promptKey: 'ai.templates.newNotePrompt',
    labelKey: 'ai.templateLibrary.newNoteLabel',
    detailKey: 'ai.templateLibrary.newNoteDetail',
  },
  {
    id: 'translate',
    intent: 'edit',
    outputTarget: 'replace-selection',
    promptKey: 'ai.templates.translatePrompt',
    labelKey: 'ai.templateLibrary.translateLabel',
    detailKey: 'ai.templateLibrary.translateDetail',
  },
  {
    id: 'rewrite',
    intent: 'edit',
    outputTarget: 'replace-selection',
    promptKey: 'ai.templates.rewritePrompt',
    labelKey: 'ai.templateLibrary.rewriteLabel',
    detailKey: 'ai.templateLibrary.rewriteDetail',
  },
  {
    id: 'summarize',
    intent: 'edit',
    outputTarget: 'replace-selection',
    promptKey: 'ai.templates.summarizePrompt',
    labelKey: 'ai.templateLibrary.summarizeLabel',
    detailKey: 'ai.templateLibrary.summarizeDetail',
  },
  {
    id: 'review',
    intent: 'review',
    outputTarget: 'chat-only',
    promptKey: 'ai.templates.reviewPrompt',
    labelKey: 'ai.templateLibrary.reviewLabel',
    detailKey: 'ai.templateLibrary.reviewDetail',
  },
  {
    id: 'generateBelow',
    intent: 'generate',
    outputTarget: 'insert-below',
    promptKey: 'ai.templates.generateBelowPrompt',
    labelKey: 'ai.templateLibrary.generateBelowLabel',
    detailKey: 'ai.templateLibrary.generateBelowDetail',
  },
]

export function getAITemplateDefinitions(): readonly AITemplateDefinition[] {
  return TEMPLATE_DEFINITIONS
}

export function getAITemplateModels(t: Translate): AITemplateModel[] {
  return TEMPLATE_DEFINITIONS.map((definition) => ({
    ...definition,
    label: t(definition.labelKey),
    detail: t(definition.detailKey),
    prompt: definition.promptKey ? t(definition.promptKey) : '',
  }))
}

export function createAITemplateOpenDetail(
  templateId: AITemplateId,
  t: Translate,
  source: AIComposerSource
): EditorAIOpenDetail {
  const template = getAITemplateModels(t).find((entry) => entry.id === templateId)
  if (!template) {
    throw new Error(`Unknown AI template: ${templateId}`)
  }

  return {
    source,
    intent: template.intent,
    ...(template.scope ? { scope: template.scope } : {}),
    outputTarget: template.outputTarget,
    ...(template.prompt ? { prompt: template.prompt } : {}),
  }
}
