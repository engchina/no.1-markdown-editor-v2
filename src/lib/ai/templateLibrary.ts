import type { EditorAIOpenDetail } from './events.ts'
import type { AIComposerSource, AIIntent, AIOutputTarget, AIScope } from './types.ts'

export type AITemplateId =
  | 'ask'
  | 'continueWriting'
  | 'translate'
  | 'summarize'
  | 'explain'
  | 'rewrite'

type Translate = (key: string, options?: Record<string, unknown>) => string

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
    id: 'translate',
    intent: 'edit',
    outputTarget: 'replace-selection',
    promptKey: 'ai.templates.translatePrompt',
    labelKey: 'ai.templateLibrary.translateLabel',
    detailKey: 'ai.templateLibrary.translateDetail',
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
    id: 'explain',
    intent: 'ask',
    outputTarget: 'chat-only',
    promptKey: 'ai.templates.explainPrompt',
    labelKey: 'ai.templateLibrary.explainLabel',
    detailKey: 'ai.templateLibrary.explainDetail',
  },
  {
    id: 'rewrite',
    intent: 'edit',
    outputTarget: 'replace-selection',
    promptKey: 'ai.templates.rewritePrompt',
    labelKey: 'ai.templateLibrary.rewriteLabel',
    detailKey: 'ai.templateLibrary.rewriteDetail',
  },
]

export const AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER = ['translate', 'summarize', 'explain', 'rewrite'] as const

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

export function buildAIComposerPromptPlaceholder(
  t: Translate
): string {
  const labelById = new Map(getAITemplateModels(t).map((model) => [model.id, model.label]))

  return t('ai.promptPlaceholder', {
    first: labelById.get('translate') ?? '',
    second: labelById.get('summarize') ?? '',
    third: labelById.get('explain') ?? '',
    fourth: labelById.get('rewrite') ?? '',
  })
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
