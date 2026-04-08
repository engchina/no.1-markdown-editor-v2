export interface LineDiffBlock {
  id: string
  type: 'equal' | 'change'
  localLines: string[]
  diskLines: string[]
}

export type LineDiffChoice = 'local' | 'disk'

interface RawOperation {
  kind: 'equal' | 'delete' | 'insert'
  line: string
}

const DIFF_COMPLEXITY_FALLBACK_THRESHOLD = 2_000_000

export function diffTextByLine(localText: string, diskText: string): LineDiffBlock[] {
  const localLines = tokenizeLines(localText)
  const diskLines = tokenizeLines(diskText)

  if (localLines.length === 0 && diskLines.length === 0) return []
  if (localText === diskText) {
    return [{ id: 'equal-0', type: 'equal', localLines, diskLines }]
  }

  const prefixLength = countCommonPrefix(localLines, diskLines)
  const suffixLength = countCommonSuffix(localLines, diskLines, prefixLength)

  const prefixLocal = localLines.slice(0, prefixLength)
  const prefixDisk = diskLines.slice(0, prefixLength)
  const suffixLocal = suffixLength > 0 ? localLines.slice(localLines.length - suffixLength) : []
  const suffixDisk = suffixLength > 0 ? diskLines.slice(diskLines.length - suffixLength) : []
  const middleLocal = localLines.slice(prefixLength, localLines.length - suffixLength)
  const middleDisk = diskLines.slice(prefixLength, diskLines.length - suffixLength)

  const blocks: LineDiffBlock[] = []
  if (prefixLocal.length > 0) {
    blocks.push({ id: 'equal-prefix', type: 'equal', localLines: prefixLocal, diskLines: prefixDisk })
  }

  const middleBlocks = buildMiddleDiffBlocks(middleLocal, middleDisk)
  if (middleBlocks.length > 0) blocks.push(...middleBlocks)

  if (suffixLocal.length > 0) {
    blocks.push({ id: 'equal-suffix', type: 'equal', localLines: suffixLocal, diskLines: suffixDisk })
  }

  return blocks
}

export function buildMergedTextFromLineDiff(
  blocks: readonly LineDiffBlock[],
  choices: ReadonlyMap<string, LineDiffChoice>
): string {
  return blocks
    .flatMap((block) => {
      if (block.type === 'equal') return block.localLines
      return (choices.get(block.id) ?? 'local') === 'disk' ? block.diskLines : block.localLines
    })
    .join('')
}

function buildMiddleDiffBlocks(localLines: string[], diskLines: string[]): LineDiffBlock[] {
  const operations = buildLineDiffOperations(localLines, diskLines)
  const blocks: LineDiffBlock[] = []
  let pendingEqualLocal: string[] = []
  let pendingEqualDisk: string[] = []
  let pendingChangeLocal: string[] = []
  let pendingChangeDisk: string[] = []
  let equalCount = 0
  let changeCount = 0

  const flushEqual = () => {
    if (pendingEqualLocal.length === 0 && pendingEqualDisk.length === 0) return
    blocks.push({
      id: `equal-${equalCount++}`,
      type: 'equal',
      localLines: pendingEqualLocal,
      diskLines: pendingEqualDisk,
    })
    pendingEqualLocal = []
    pendingEqualDisk = []
  }

  const flushChange = () => {
    if (pendingChangeLocal.length === 0 && pendingChangeDisk.length === 0) return
    blocks.push({
      id: `change-${changeCount++}`,
      type: 'change',
      localLines: pendingChangeLocal,
      diskLines: pendingChangeDisk,
    })
    pendingChangeLocal = []
    pendingChangeDisk = []
  }

  for (const operation of operations) {
    if (operation.kind === 'equal') {
      flushChange()
      pendingEqualLocal.push(operation.line)
      pendingEqualDisk.push(operation.line)
      continue
    }

    flushEqual()
    if (operation.kind === 'delete') {
      pendingChangeLocal.push(operation.line)
    } else {
      pendingChangeDisk.push(operation.line)
    }
  }

  flushChange()
  flushEqual()
  return blocks
}

function buildLineDiffOperations(localLines: string[], diskLines: string[]): RawOperation[] {
  const complexity = localLines.length * diskLines.length
  if (complexity > DIFF_COMPLEXITY_FALLBACK_THRESHOLD) {
    return [
      ...localLines.map<RawOperation>((line) => ({ kind: 'delete', line })),
      ...diskLines.map<RawOperation>((line) => ({ kind: 'insert', line })),
    ]
  }

  const table = buildLcsTable(localLines, diskLines)
  const operations: RawOperation[] = []
  let localIndex = localLines.length
  let diskIndex = diskLines.length

  while (localIndex > 0 && diskIndex > 0) {
    if (localLines[localIndex - 1] === diskLines[diskIndex - 1]) {
      operations.push({ kind: 'equal', line: localLines[localIndex - 1] })
      localIndex -= 1
      diskIndex -= 1
      continue
    }

    if (table[localIndex - 1][diskIndex] >= table[localIndex][diskIndex - 1]) {
      operations.push({ kind: 'delete', line: localLines[localIndex - 1] })
      localIndex -= 1
    } else {
      operations.push({ kind: 'insert', line: diskLines[diskIndex - 1] })
      diskIndex -= 1
    }
  }

  while (localIndex > 0) {
    operations.push({ kind: 'delete', line: localLines[localIndex - 1] })
    localIndex -= 1
  }

  while (diskIndex > 0) {
    operations.push({ kind: 'insert', line: diskLines[diskIndex - 1] })
    diskIndex -= 1
  }

  operations.reverse()
  return operations
}

function buildLcsTable(localLines: string[], diskLines: string[]): number[][] {
  const table = Array.from({ length: localLines.length + 1 }, () =>
    Array.from<number>({ length: diskLines.length + 1 }).fill(0)
  )

  for (let localIndex = 1; localIndex <= localLines.length; localIndex += 1) {
    for (let diskIndex = 1; diskIndex <= diskLines.length; diskIndex += 1) {
      table[localIndex][diskIndex] =
        localLines[localIndex - 1] === diskLines[diskIndex - 1]
          ? table[localIndex - 1][diskIndex - 1] + 1
          : Math.max(table[localIndex - 1][diskIndex], table[localIndex][diskIndex - 1])
    }
  }

  return table
}

function tokenizeLines(text: string): string[] {
  const matches = text.match(/.*?(?:\r\n|\n|$)/g) ?? []
  return matches.filter((line, index) => {
    if (line.length > 0) return true
    return index === 0 && text.length === 0
  })
}

function countCommonPrefix(localLines: string[], diskLines: string[]): number {
  const limit = Math.min(localLines.length, diskLines.length)
  let index = 0
  while (index < limit && localLines[index] === diskLines[index]) {
    index += 1
  }
  return index
}

function countCommonSuffix(localLines: string[], diskLines: string[], prefixLength: number): number {
  const maxLocal = localLines.length - prefixLength
  const maxDisk = diskLines.length - prefixLength
  const limit = Math.min(maxLocal, maxDisk)
  let count = 0
  while (
    count < limit &&
    localLines[localLines.length - 1 - count] === diskLines[diskLines.length - 1 - count]
  ) {
    count += 1
  }
  return count
}
