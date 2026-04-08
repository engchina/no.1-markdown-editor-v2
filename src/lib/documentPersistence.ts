import { materializeEmbeddedMarkdownImages } from './embeddedImages.ts'
import {
  buildRelativeMarkdownImagePath,
  DEFAULT_MARKDOWN_IMAGE_DIRECTORY,
  getImageAltText,
  getImageFileExtension,
} from './fileTypes.ts'

export interface FilePersistence {
  dirname(path: string): Promise<string>
  join(...paths: string[]): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>
}

export interface PersistOptions {
  batchId?: number
  imageDirectory?: string
}

export interface PersistableImageFile {
  name: string
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

let tauriFilePersistencePromise: Promise<FilePersistence> | null = null

export async function getTauriFilePersistence(): Promise<FilePersistence> {
  tauriFilePersistencePromise ??= createTauriFilePersistence()
  return tauriFilePersistencePromise
}

export async function saveMarkdownDocumentWithAssets(
  markdown: string,
  savePath: string,
  persistence: FilePersistence,
  options: PersistOptions = {}
): Promise<string> {
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const imageDir = await persistence.join(await persistence.dirname(savePath), imageDirectory)
  const nextContent = await materializeEmbeddedMarkdownImages(markdown, {
    batchId: options.batchId,
    imageDirectory,
    persistImage: async (fileName, bytes) => {
      await persistence.writeBinaryFile(await persistence.join(imageDir, fileName), bytes)
    },
  })

  await persistence.writeTextFile(savePath, nextContent)
  return nextContent
}

export async function persistImageFilesAsMarkdown(
  files: PersistableImageFile[],
  activeTabPath: string,
  persistence: Pick<FilePersistence, 'dirname' | 'join' | 'writeBinaryFile'>,
  options: PersistOptions = {}
): Promise<string> {
  const batchId = options.batchId ?? Date.now()
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const imageDir = await persistence.join(await persistence.dirname(activeTabPath), imageDirectory)
  const snippets = await Promise.all(
    files.map(async (file, index) => {
      const extension = getImageFileExtension(file.name, file.type)
      const altText = getImageAltText(file.name)
      const suffix = files.length > 1 ? `-${index + 1}` : ''
      const fileName = `image-${batchId}${suffix}.${extension}`

      await persistence.writeBinaryFile(await persistence.join(imageDir, fileName), new Uint8Array(await file.arrayBuffer()))
      return `![${altText}](${buildRelativeMarkdownImagePath(fileName, imageDirectory)})`
    })
  )

  return snippets.join('\n')
}

async function createTauriFilePersistence(): Promise<FilePersistence> {
  const [{ dirname, join }, { invoke }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/api/core'),
  ])

  return {
    dirname,
    join,
    writeTextFile: async (path, content) => {
      await invoke('write_file', { path, content })
    },
    writeBinaryFile: async (path, bytes) => {
      await invoke('write_binary_file', { path, bytes: Array.from(bytes) })
    },
  }
}
