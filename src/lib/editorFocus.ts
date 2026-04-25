export const EDITOR_RETURN_TO_WRITING_EVENT = 'editor:return-to-writing'

export function dispatchEditorReturnToWriting(): boolean {
  if (typeof document === 'undefined') return false
  document.dispatchEvent(new CustomEvent(EDITOR_RETURN_TO_WRITING_EVENT))
  return true
}
