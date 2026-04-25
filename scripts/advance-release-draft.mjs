import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { normalizeVersion } from './validate-release.mjs'
import {
  buildSuggestedUnreleasedScaffold,
  extractUnreleasedChangelogSection,
  hasMeaningfulUnreleasedContent,
  replaceUnreleasedChangelogSection,
} from './prepare-release.mjs'

const RELEASE_NOTES_DRAFT_PATH = 'docs/release-notes-draft.md'
const CHANGELOG_PATH = 'CHANGELOG.md'

export function extractReleaseNotesDraftBaselineVersion(source) {
  const match = source.match(/next public release after `v([^`]+)`\./u)
  return match ? normalizeVersion(match[1]) : null
}

export function buildReleaseNotesDraftTemplate({
  releasedVersion,
}) {
  const baselineVersion = normalizeVersion(releasedVersion)
  if (!baselineVersion) {
    throw new Error('Expected a released version argument such as "0.18.0" or "v0.18.0".')
  }

  return [
    '# Upcoming Release Notes Draft',
    '',
    `This document is a draft for the next public release after \`v${baselineVersion}\`.`,
    '',
    'It is intentionally written in release-note language rather than implementation language.',
    '',
    'Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.',
    '',
    '## Suggested Release Title',
    '',
    '`No.1 Markdown Editor vNext`',
    '',
    '## Short Summary',
    '',
    'Describe this release in 2-3 sentences:',
    '',
    '- what changed for users',
    '- why it matters',
    '- what kind of Markdown workflow it improves',
    '',
    '## Suggested GitHub Release Body',
    '',
    '### Highlights',
    '',
    '- Highest-impact user-visible change',
    '- Second most important change',
    '- Third most important change',
    '',
    '### Why This Release Matters',
    '',
    'Explain the problem this release solves in product language rather than implementation language.',
    '',
    '### User-Facing Improvements',
    '',
    '#### Writing and Editing',
    '',
    '- Key editing improvement',
    '- Source / preview / WYSIWYG improvement',
    '',
    '#### Markdown Workspace',
    '',
    '- Cross-note / links / assets / project integrity improvement',
    '',
    '#### Performance and Reliability',
    '',
    '- Speed, fidelity, or stability improvement',
    '',
    '#### AI and Writing Quality',
    '',
    '- AI scope, setup, or writing-quality improvement',
    '',
    '### Recommended Screenshots For Release Page',
    '',
    '- Most important UI change',
    '- Best side-by-side workflow shot',
    '- Any repair, inspect, or before/after flow worth showing',
    '',
    '### Suggested “Upgrade Notes” Section',
    '',
    '- Anything users should notice immediately after updating',
    '- Any changed default or new workflow worth calling out',
    '',
    '### Suggested “Who Should Update” Section',
    '',
    'This release is especially relevant for users who:',
    '',
    '- maintain multi-note Markdown projects',
    '- care about source fidelity and desktop reliability',
    '- want editor-first AI rather than chat-first workflow',
    '',
    '## Packaging Checklist Before Release',
    '',
    '- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.',
    '- Run `npm run release:prepare -- <next-version>` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.',
    '- Confirm the final version in:',
    '  - `package.json`',
    '  - `src-tauri/tauri.conf.json`',
    '  - `src-tauri/Cargo.toml`',
    '- Run `npm run release:validate` after the version bump so local metadata and changelog checks fail before CI does.',
    '- Run `npm run release:notes:preview -- <next-version>` if you want to inspect the generated GitHub release body before pushing the tag.',
    '- Replace `vNext` in release copy with the real version tag.',
    '- Capture fresh screenshots for the product surfaces this release highlights.',
    `- After the release is published, run \`npm run release:draft:advance -- ${baselineVersion}\` to reset this file and refresh \`CHANGELOG.md\` \`## Unreleased\` for the next release cycle.`,
    '',
  ].join('\n')
}

export async function advanceReleaseDraft({
  releasedVersion,
  cwd = process.cwd(),
} = {}) {
  const nextBaselineVersion = normalizeVersion(releasedVersion)
  if (!nextBaselineVersion) {
    throw new Error('Expected a released version argument such as "0.18.0" or "v0.18.0".')
  }

  const draftPath = path.join(cwd, RELEASE_NOTES_DRAFT_PATH)
  const changelogPath = path.join(cwd, CHANGELOG_PATH)
  const [currentDraftSource, currentChangelogSource] = await Promise.all([
    readFile(draftPath, 'utf8'),
    readFile(changelogPath, 'utf8'),
  ])
  const previousBaselineVersion = extractReleaseNotesDraftBaselineVersion(currentDraftSource)
  const eol = detectEol(currentDraftSource)
  const nextSource = buildReleaseNotesDraftTemplate({
    releasedVersion: nextBaselineVersion,
  })
  const normalizedDraftSource = eol === '\n' ? nextSource : nextSource.replace(/\n/gu, eol)
  const unreleasedSection = extractUnreleasedChangelogSection(currentChangelogSource)
  let nextChangelogSource = currentChangelogSource
  let changelogScaffoldUpdated = false

  if (!unreleasedSection) {
    throw new Error('CHANGELOG.md is missing the required "## Unreleased" section.')
  }

  if (!hasMeaningfulUnreleasedContent(unreleasedSection)) {
    nextChangelogSource = replaceUnreleasedChangelogSection(
      currentChangelogSource,
      buildSuggestedUnreleasedScaffold()
    )
    changelogScaffoldUpdated = nextChangelogSource !== currentChangelogSource
  }

  await Promise.all([
    writeFile(draftPath, normalizedDraftSource, 'utf8'),
    writeFile(changelogPath, nextChangelogSource, 'utf8'),
  ])

  return {
    releasedVersion: nextBaselineVersion,
    previousBaselineVersion,
    changelogScaffoldUpdated,
  }
}

export function formatAdvancedReleaseDraftSummary({
  releasedVersion,
  previousBaselineVersion,
  changelogScaffoldUpdated,
}) {
  return [
    `Advanced release draft baseline to v${releasedVersion}.`,
    `- Previous draft baseline: ${previousBaselineVersion ? `v${previousBaselineVersion}` : '(unknown)'}`,
    `- docs/release-notes-draft.md now targets the release after v${releasedVersion}.`,
    '- The draft body was reset to a clean template so the next cycle starts without stale copy.',
    changelogScaffoldUpdated
      ? '- CHANGELOG.md `## Unreleased` was refreshed to the suggested next-cycle scaffold.'
      : '- CHANGELOG.md `## Unreleased` already had real notes, so it was left untouched.',
  ].join('\n')
}

function detectEol(source) {
  return source.includes('\r\n') ? '\r\n' : '\n'
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isDirectExecution()) {
  const args = process.argv.slice(2)
  const rawVersion = args.find((value) => !value.startsWith('--')) ?? ''

  try {
    const advanced = await advanceReleaseDraft({
      releasedVersion: rawVersion,
    })
    process.stdout.write(`${formatAdvancedReleaseDraftSummary(advanced)}\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
