import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const RELEASE_NOTES_DRAFT_PATH = 'docs/release-notes-draft.md'
const CHANGELOG_PATH = 'CHANGELOG.md'

export function extractReleaseNotesDraftBody(source) {
  return extractMarkdownSection(source, 'Suggested GitHub Release Body')
}

export function extractChangelogSection(source, version) {
  const lines = source.split(/\r?\n/u)
  const headerPattern = new RegExp(`^##\\s+${escapeRegExp(version)}(?:\\s+-.*)?$`, 'u')
  const startIndex = lines.findIndex((line) => headerPattern.test(line.trim()))
  if (startIndex === -1) return null

  const bodyLines = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/u.test(line)) break
    bodyLines.push(line)
  }

  const section = bodyLines.join('\n').trim()
  return section.length > 0 ? section : null
}

export function assertChangelogSectionExists(source, version) {
  const section = extractChangelogSection(source, version)
  if (section) return section

  throw new Error(`Missing CHANGELOG entry for v${version}. Add a dedicated version section before tagging the release.`)
}

export function buildReleaseBody({
  version,
  changelogSource,
  releaseNotesDraftSource,
  requireChangelogSection = false,
}) {
  const sections = []
  const draftBody = extractReleaseNotesDraftBody(releaseNotesDraftSource)
  const changelogBody = requireChangelogSection
    ? assertChangelogSectionExists(changelogSource, version)
    : extractChangelogSection(changelogSource, version)

  if (draftBody) {
    sections.push(draftBody)
  }

  if (changelogBody) {
    sections.push(['## Changelog Summary', '', changelogBody].join('\n'))
  }

  if (sections.length === 0) {
    throw new Error(`No release body content found for v${version}.`)
  }

  return sections.join('\n\n---\n\n').replace(/\bvNext\b/gu, `v${version}`).trim()
}

export async function loadReleaseBody({
  version,
  cwd = process.cwd(),
  requireChangelogSection = false,
}) {
  const [changelogSource, releaseNotesDraftSource] = await Promise.all([
    readFile(path.join(cwd, CHANGELOG_PATH), 'utf8'),
    readFile(path.join(cwd, RELEASE_NOTES_DRAFT_PATH), 'utf8'),
  ])

  return buildReleaseBody({
    version,
    changelogSource,
    releaseNotesDraftSource,
    requireChangelogSection,
  })
}

function extractMarkdownSection(source, heading) {
  const lines = source.split(/\r?\n/u)
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (startIndex === -1) return null

  const sectionLines = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/u.test(line)) break
    sectionLines.push(line)
  }

  const section = sectionLines.join('\n').trim()
  return section.length > 0 ? section : null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isDirectExecution()) {
  const args = process.argv.slice(2)
  const rawVersion = args.find((value) => !value.startsWith('--')) ?? process.env.GITHUB_REF_NAME ?? ''
  const version = rawVersion.replace(/^v/u, '').trim()
  const requireChangelogSection = args.includes('--require-changelog')

  if (!version) {
    console.error('Expected a version argument such as "0.18.0" or GITHUB_REF_NAME like "v0.18.0".')
    process.exitCode = 1
  } else {
    try {
      const body = await loadReleaseBody({ version, requireChangelogSection })
      process.stdout.write(body)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
