import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import {
  EditorState,
  StateEffect,
  StateField,
  type ChangeDesc,
  type Extension,
  type Transaction,
} from '@codemirror/state'
import type { AIProvenanceMark } from './types.ts'
import { buildSortedRangeSet } from '../../components/Editor/sortedRangeSet.ts'

const setAIProvenanceMarksEffect = StateEffect.define<AIProvenanceMark[]>()
const addAIProvenanceMarkEffect = StateEffect.define<AIProvenanceMark>()
const clearAIProvenanceMarksEffect = StateEffect.define<void>()

const aiProvenanceField = StateField.define<AIProvenanceMark[]>({
  create() {
    return []
  },
  update(value, transaction) {
    let nextValue = transaction.docChanged
      ? mapAIProvenanceMarks(value, transaction.changes)
      : value

    for (const effect of transaction.effects) {
      if (effect.is(setAIProvenanceMarksEffect)) {
        nextValue = effect.value
      }

      if (effect.is(addAIProvenanceMarkEffect)) {
        nextValue = mergeAIProvenanceMarks(nextValue, [effect.value])
      }

      if (effect.is(clearAIProvenanceMarksEffect)) {
        nextValue = []
      }
    }

    return nextValue
  },
  provide: (field) =>
    EditorView.decorations.from(field, (marks): DecorationSet => {
      if (marks.length === 0) return Decoration.none

      const ranges: Array<{ from: number; to: number; value: Decoration }> = []
      for (const mark of marks) {
        if (mark.to <= mark.from) continue

        ranges.push({
          from: mark.from,
          to: mark.to,
          value: Decoration.mark({
            class: 'cm-ai-provenance-range',
            attributes: {
              'data-ai-provenance-mark': mark.kind,
              title: mark.detail,
            },
          }),
        })
      }

      return buildSortedRangeSet(ranges)
    }),
})

export function createAIProvenanceExtensions(): Extension[] {
  return [
    aiProvenanceField,
    invertedEffects.of((transaction) => invertAIProvenanceEffects(transaction)),
  ]
}

export function readAIProvenanceMarksFromState(state: EditorState): AIProvenanceMark[] {
  return state.field(aiProvenanceField, false) ?? []
}

export function readAIProvenanceMarks(view: EditorView): AIProvenanceMark[] {
  return readAIProvenanceMarksFromState(view.state)
}

export function setAIProvenanceMarks(view: EditorView, marks: AIProvenanceMark[]): void {
  view.dispatch({
    effects: setAIProvenanceMarksEffect.of(marks),
  })
}

export function addAIProvenanceMark(view: EditorView, mark: AIProvenanceMark): void {
  view.dispatch({
    effects: addAIProvenanceMarkEffect.of(mark),
  })
}

export function clearAIProvenanceMarks(view: EditorView): void {
  view.dispatch({
    effects: clearAIProvenanceMarksEffect.of(),
  })
}

export function createAIProvenanceAddEffect(mark: AIProvenanceMark): StateEffect<AIProvenanceMark> {
  return addAIProvenanceMarkEffect.of(mark)
}

export function createAIProvenanceSetEffect(marks: AIProvenanceMark[]): StateEffect<AIProvenanceMark[]> {
  return setAIProvenanceMarksEffect.of(marks)
}

export function createAIProvenanceMark(options: {
  from: number
  to: number
  badge: string
  detail: string
  kind: AIProvenanceMark['kind']
  createdAt?: number
}): AIProvenanceMark {
  return {
    id: `${options.kind}:${options.from}:${options.to}:${options.createdAt ?? Date.now()}`,
    from: options.from,
    to: options.to,
    badge: options.badge,
    detail: options.detail,
    kind: options.kind,
    createdAt: options.createdAt ?? Date.now(),
  }
}

function mergeAIProvenanceMarks(
  existing: AIProvenanceMark[],
  incoming: AIProvenanceMark[]
): AIProvenanceMark[] {
  const byId = new Map<string, AIProvenanceMark>()

  for (const mark of existing) {
    byId.set(mark.id, mark)
  }

  for (const mark of incoming) {
    if (mark.to <= mark.from) continue
    byId.set(mark.id, mark)
  }

  return Array.from(byId.values()).sort((left, right) => left.from - right.from || left.to - right.to)
}

function mapAIProvenanceMarks(
  marks: AIProvenanceMark[],
  changes: ChangeDesc
): AIProvenanceMark[] {
  const nextMarks: AIProvenanceMark[] = []

  for (const mark of marks) {
    const from = changes.mapPos(mark.from, -1)
    const to = changes.mapPos(mark.to, 1)
    if (to <= from) continue

    nextMarks.push({
      ...mark,
      from,
      to,
    })
  }

  return nextMarks
}

function invertAIProvenanceEffects(transaction: Transaction): readonly StateEffect<AIProvenanceMark[]>[] {
  let shouldRestore = false

  for (const effect of transaction.effects) {
    if (
      effect.is(setAIProvenanceMarksEffect) ||
      effect.is(addAIProvenanceMarkEffect) ||
      effect.is(clearAIProvenanceMarksEffect)
    ) {
      shouldRestore = true
      break
    }
  }

  return shouldRestore
    ? [setAIProvenanceMarksEffect.of(readAIProvenanceMarksFromState(transaction.startState))]
    : []
}
