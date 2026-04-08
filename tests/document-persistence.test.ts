import assert from 'node:assert/strict'
import test from 'node:test'
import {
  persistImageFilesAsMarkdown,
  saveMarkdownDocumentWithAssets,
  type FilePersistence,
  type PersistableImageFile,
} from '../src/lib/documentPersistence.ts'

function createPersistenceRecorder(): {
  persistence: FilePersistence
  textWrites: Map<string, string>
  binaryWrites: Map<string, number[]>
} {
  const textWrites = new Map<string, string>()
  const binaryWrites = new Map<string, number[]>()

  return {
    persistence: {
      dirname: async (path) => path.slice(0, path.lastIndexOf('/')),
      join: async (...paths) => paths.filter(Boolean).join('/').replace(/\/+/g, '/'),
      writeTextFile: async (path, content) => {
        textWrites.set(path, content)
      },
      writeBinaryFile: async (path, bytes) => {
        binaryWrites.set(path, Array.from(bytes))
      },
    },
    textWrites,
    binaryWrites,
  }
}

function createImageFile(name: string, type: string, bytes: number[]): PersistableImageFile {
  return {
    name,
    type,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  }
}

test('saveMarkdownDocumentWithAssets writes sibling image assets outside plugin-fs scope', async () => {
  const { persistence, textWrites, binaryWrites } = createPersistenceRecorder()
  const markdown = [
    '# Draft',
    '',
    '![clipboard image](data:image/png;base64,AQID)',
  ].join('\n')

  const result = await saveMarkdownDocumentWithAssets(markdown, '/docs/post.md', persistence, {
    batchId: 7,
  })

  assert.equal(
    result,
    [
      '# Draft',
      '',
      '![clipboard image](./images/image-7.png)',
    ].join('\n')
  )
  assert.equal(textWrites.get('/docs/post.md'), result)
  assert.deepEqual([...binaryWrites.entries()], [['/docs/images/image-7.png', [1, 2, 3]]])
})

test('persistImageFilesAsMarkdown stores pasted images beside the active document', async () => {
  const { persistence, binaryWrites } = createPersistenceRecorder()
  const markdown = await persistImageFilesAsMarkdown(
    [
      createImageFile('hero-image_v2.png', 'image/png', [1, 2, 3]),
      createImageFile('diagram', 'image/webp', [4, 5, 6]),
    ],
    '/docs/post.md',
    persistence,
    { batchId: 11 }
  )

  assert.equal(
    markdown,
    [
      '![hero image v2](./images/image-11-1.png)',
      '![diagram](./images/image-11-2.webp)',
    ].join('\n')
  )
  assert.deepEqual(
    [...binaryWrites.entries()],
    [
      ['/docs/images/image-11-1.png', [1, 2, 3]],
      ['/docs/images/image-11-2.webp', [4, 5, 6]],
    ]
  )
})
