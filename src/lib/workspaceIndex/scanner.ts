import { ensureFsPathAccess } from '../fsAccess.ts'
import { isSupportedDocumentName } from '../fileTypes.ts'
import { buildWorkspaceIndexDocument } from './analysis.ts'
import type { WorkspaceIndexDocument, WorkspaceIndexFile, WorkspaceIndexSnapshot } from './types.ts'

export async function scanWorkspaceSnapshot(rootPath: string): Promise<WorkspaceIndexSnapshot> {
  await ensureFsPathAccess(rootPath, { kind: 'dir', recursive: true })

  const [{ readDir, readTextFile }, { join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])

  const documents: WorkspaceIndexDocument[] = []
  const files: WorkspaceIndexFile[] = []
  const queue = [rootPath]

  while (queue.length > 0) {
    const currentDir = queue.shift()
    if (!currentDir) break

    let entries: Awaited<ReturnType<typeof readDir>>
    try {
      entries = await readDir(currentDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue

      const childPath = await join(currentDir, entry.name)
      if (entry.isDirectory) {
        queue.push(childPath)
        continue
      }

      if (entry.isFile) {
        files.push({
          path: childPath.replace(/\\/gu, '/'),
          name: entry.name,
        })
      }

      if (!entry.isFile || !isSupportedDocumentName(entry.name)) continue

      let content = ''
      try {
        content = await readTextFile(childPath)
      } catch {
        continue
      }

      documents.push(buildWorkspaceIndexDocument(childPath, content))
    }
  }

  return {
    rootPath: rootPath.replace(/\\/gu, '/'),
    generatedAt: Date.now(),
    documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

export async function readWorkspaceDocument(path: string): Promise<string> {
  await ensureFsPathAccess(path)

  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  return readTextFile(path)
}

export async function workspaceDocumentExists(path: string): Promise<boolean> {
  await ensureFsPathAccess(path).catch(() => undefined)

  const { exists } = await import('@tauri-apps/plugin-fs')
  return exists(path)
}
