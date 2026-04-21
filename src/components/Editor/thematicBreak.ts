const THEMATIC_BREAK_PATTERN =
  /^[ ]{0,3}(?:(?:\*(?:[ \t]*\*){2,})|(?:-(?:[ \t]*-){2,})|(?:_(?:[ \t]*_){2,}))[ \t]*$/

export function isThematicBreakLine(text: string): boolean {
  return THEMATIC_BREAK_PATTERN.test(text)
}
