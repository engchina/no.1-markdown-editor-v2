import { EditorState, type Extension } from '@codemirror/state'
import { history, historyField, isolateHistory } from '@codemirror/commands'

const snapshotFields = {
  history: historyField,
} as const

const snapshotExtensions = [
  history(),
  EditorState.allowMultipleSelections.of(true),
]

const editorStateSnapshotByTabId = new Map<string, unknown>()

export function saveEditorStateSnapshot(tabId: string, state: EditorState): void {
  editorStateSnapshotByTabId.set(tabId, state.toJSON(snapshotFields))
}

export function clearEditorStateSnapshot(tabId: string): void {
  editorStateSnapshotByTabId.delete(tabId)
}

export function restoreEditorStateSnapshot(options: {
  tabId: string
  content: string
  extensions: Extension[]
}): EditorState | null {
  const json = editorStateSnapshotByTabId.get(options.tabId)
  if (!json) return null

  try {
    const state = EditorState.fromJSON(
      json,
      { extensions: options.extensions },
      snapshotFields
    )

    if (state.doc.toString() !== options.content) {
      clearEditorStateSnapshot(options.tabId)
      return null
    }

    return state
  } catch {
    clearEditorStateSnapshot(options.tabId)
    return null
  }
}

export function primeAIUndoHistorySnapshot(options: {
  tabId: string
  beforeContent: string
  afterContent: string
  selectionAnchor?: number
}): void {
  let state = createSnapshotBaseState(options.tabId, options.beforeContent)

  if (options.beforeContent !== options.afterContent) {
    state = state.update({
      changes: {
        from: 0,
        to: state.doc.length,
        insert: options.afterContent,
      },
      selection: {
        anchor: options.selectionAnchor ?? options.afterContent.length,
      },
      annotations: isolateHistory.of('full'),
      userEvent: 'input.ai',
    }).state
  } else if (typeof options.selectionAnchor === 'number') {
    state = state.update({
      selection: {
        anchor: options.selectionAnchor,
      },
    }).state
  }

  saveEditorStateSnapshot(options.tabId, state)
}

function createSnapshotBaseState(tabId: string, content: string): EditorState {
  const json = editorStateSnapshotByTabId.get(tabId)
  if (json) {
    try {
      const state = EditorState.fromJSON(
        json,
        { extensions: snapshotExtensions },
        snapshotFields
      )
      if (state.doc.toString() === content) {
        return state
      }
    } catch {
      // Fall through to a clean state below.
    }
  }

  return EditorState.create({
    doc: content,
    extensions: snapshotExtensions,
  })
}
