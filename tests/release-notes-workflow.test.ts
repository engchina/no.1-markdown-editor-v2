import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  assertChangelogSectionExists,
  buildReleaseBody,
  extractChangelogSection,
  extractReleaseNotesDraftBody,
} from '../scripts/build-release-body.mjs'
import {
  assertReleaseVersionMatches,
  extractCargoVersion,
  validateRelease,
} from '../scripts/validate-release.mjs'
import {
  buildSuggestedUnreleasedScaffold,
  extractUnreleasedChangelogSection,
  finalizeUnreleasedChangelog,
  hasMeaningfulUnreleasedContent,
  prepareRelease,
  replaceUnreleasedChangelogSection,
  replaceCargoPackageVersion,
  stripUnreleasedScaffoldHints,
} from '../scripts/prepare-release.mjs'
import {
  advanceReleaseDraft,
  buildReleaseNotesDraftTemplate,
  extractReleaseNotesDraftBaselineVersion,
} from '../scripts/advance-release-draft.mjs'

async function withTempReleaseFixture(
  files: Record<string, string>,
  callback: (cwd: string) => Promise<void>
) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'no1-release-'))

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(cwd, relativePath)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf8')
    }

    await callback(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

test('build-release-body extracts the suggested GitHub release body section', () => {
  const draft = [
    '# Draft',
    '',
    '## Suggested Release Title',
    '',
    'Ignore this',
    '',
    '## Suggested GitHub Release Body',
    '',
    '### Highlights',
    '',
    '- Item A',
    '',
    '## Packaging Checklist Before Release',
    '',
    '- Ignore this too',
  ].join('\n')

  assert.equal(
    extractReleaseNotesDraftBody(draft),
    ['### Highlights', '', '- Item A'].join('\n')
  )
})

test('build-release-body appends matching changelog content to the release draft body', () => {
  const body = buildReleaseBody({
    version: '0.17.9',
    releaseNotesDraftSource: [
      '# Draft',
      '',
      '## Suggested GitHub Release Body',
      '',
      '### Highlights',
      '',
      '- Workspace surfaces',
      '',
      '## Packaging Checklist Before Release',
      '',
      '- Checklist',
    ].join('\n'),
    changelogSource: [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '- Ignore unreleased',
      '',
      '## 0.17.9 - 2026-04-25',
      '',
      '### Added',
      '',
      '- Dedicated AI setup panel',
      '',
      '## 0.17.8 - 2026-04-20',
      '',
      '### Changed',
      '',
      '- Older change',
    ].join('\n'),
  })

  assert.match(body, /### Highlights/)
  assert.match(body, /Workspace surfaces/)
  assert.match(body, /## Changelog Summary/)
  assert.match(body, /Dedicated AI setup panel/)
  assert.doesNotMatch(body, /Ignore unreleased/)
})

test('extractChangelogSection returns only the requested version block', () => {
  const changelog = [
    '# Changelog',
    '',
    '## 0.18.0 - 2026-05-01',
    '',
    '### Added',
    '',
    '- New release',
    '',
    '## 0.17.9 - 2026-04-25',
    '',
    '### Added',
    '',
    '- Dedicated AI setup panel',
    '',
    '## 0.17.8 - 2026-04-20',
    '',
    '### Changed',
    '',
    '- Older change',
  ].join('\n')

  assert.equal(
    extractChangelogSection(changelog, '0.17.9'),
    ['### Added', '', '- Dedicated AI setup panel'].join('\n')
  )
})

test('build-release-body can require a matching changelog version block', () => {
  assert.throws(
    () =>
      buildReleaseBody({
        version: '0.18.0',
        requireChangelogSection: true,
        releaseNotesDraftSource: [
          '# Draft',
          '',
          '## Suggested GitHub Release Body',
          '',
          '### Highlights',
          '',
          '- Workspace surfaces',
        ].join('\n'),
        changelogSource: [
          '# Changelog',
          '',
          '## 0.17.9 - 2026-04-25',
          '',
          '### Added',
          '',
          '- Older version',
        ].join('\n'),
      }),
    /Missing CHANGELOG entry for v0\.18\.0/u
  )

  assert.equal(
    assertChangelogSectionExists(
      [
        '# Changelog',
        '',
        '## 0.18.0 - 2026-05-01',
        '',
        '### Added',
        '',
        '- Release body',
      ].join('\n'),
      '0.18.0'
    ),
    ['### Added', '', '- Release body'].join('\n')
  )
})

test('extractCargoVersion reads the package version instead of dependency versions', () => {
  const cargo = [
    '[package]',
    'name = "no1-markdown-editor"',
    'version = "0.18.0"',
    '',
    '[dependencies]',
    'tauri = { version = "2" }',
  ].join('\n')

  assert.equal(extractCargoVersion(cargo), '0.18.0')
})

test('replaceCargoPackageVersion updates only the package version line', () => {
  const cargo = [
    '[package]',
    'name = "no1-markdown-editor"',
    'version = "0.17.9"',
    '',
    '[dependencies]',
    'tauri = { version = "2" }',
  ].join('\n')

  const next = replaceCargoPackageVersion(cargo, '0.18.0')

  assert.match(next, /^\[package\]\nname = "no1-markdown-editor"\nversion = "0\.18\.0"/u)
  assert.match(next, /tauri = \{ version = "2" \}/u)
})

test('buildSuggestedUnreleasedScaffold creates a reusable next-cycle template that does not count as real release notes', () => {
  const scaffold = buildSuggestedUnreleasedScaffold()

  assert.match(scaffold, /### Added/u)
  assert.match(scaffold, /### Fixed/u)
  assert.match(scaffold, /Markdown editing, workspace, export, or AI improvements/u)
  assert.equal(hasMeaningfulUnreleasedContent(scaffold), false)
})

test('stripUnreleasedScaffoldHints removes template comments before a real release section is cut', () => {
  const section = [
    '### Added',
    '',
    '<!-- New capability hint -->',
    '',
    '- New command palette action',
    '',
    '### Fixed',
    '',
    '<!-- Fix hint -->',
    '',
    '- Prevent broken preview links',
  ].join('\n')

  assert.equal(
    stripUnreleasedScaffoldHints(section),
    [
      '### Added',
      '',
      '- New command palette action',
      '',
      '### Fixed',
      '',
      '- Prevent broken preview links',
    ].join('\n')
  )
})

test('finalizeUnreleasedChangelog promotes unreleased notes into a dated release block', () => {
  const next = finalizeUnreleasedChangelog({
    version: '0.18.0',
    date: '2026-05-01',
    source: [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '### Added',
      '',
      '<!-- New capability hint -->',
      '',
      '- New links workspace',
      '',
      '### Changed',
      '',
      '- Faster search index',
      '',
      '## 0.17.9 - 2026-04-25',
      '',
      '### Added',
      '',
      '- Older change',
    ].join('\n'),
  })

  assert.match(next, /## Unreleased/u)
  assert.match(next, /### Added\n\n<!--/u)
  assert.match(next, /### Fixed/u)
  assert.match(next, /## 0\.18\.0 - 2026-05-01\n\n### Added\n\n- New links workspace/u)
  assert.match(next, /### Changed\n\n- Faster search index/u)
  assert.doesNotMatch(next, /## 0\.18\.0 - 2026-05-01[\s\S]*<!-- New capability hint -->/u)
  assert.equal(extractUnreleasedChangelogSection(next), buildSuggestedUnreleasedScaffold())
})

test('prepareRelease updates version files and CHANGELOG together in a temp fixture', async () => {
  await withTempReleaseFixture(
    {
      'package.json': JSON.stringify({
        name: 'no1-markdown-editor',
        version: '0.17.9',
        private: true,
      }, null, 2),
      'src-tauri/tauri.conf.json': JSON.stringify({ version: '0.17.9' }, null, 2),
      'src-tauri/Cargo.toml': [
        '[package]',
        'name = "no1-markdown-editor"',
        'version = "0.17.9"',
        '',
        '[dependencies]',
        'tauri = { version = "2" }',
      ].join('\n'),
      'CHANGELOG.md': [
        '# Changelog',
        '',
        '## Unreleased',
        '',
        '### Added',
        '',
        '- Local release validation',
        '',
        '### Changed',
        '',
        '- Better release docs',
        '',
        '## 0.17.9 - 2026-04-25',
        '',
        '### Added',
        '',
        '- Older release',
      ].join('\n'),
    },
    async (cwd) => {
      const prepared = await prepareRelease({
        cwd,
        version: '0.18.0',
        date: '2026-05-01',
      })

      assert.deepEqual(prepared, {
        version: '0.18.0',
        previousVersion: '0.17.9',
        date: '2026-05-01',
      })

      const [packageSource, tauriSource, cargoSource, changelogSource] = await Promise.all([
        readFile(path.join(cwd, 'package.json'), 'utf8'),
        readFile(path.join(cwd, 'src-tauri/tauri.conf.json'), 'utf8'),
        readFile(path.join(cwd, 'src-tauri/Cargo.toml'), 'utf8'),
        readFile(path.join(cwd, 'CHANGELOG.md'), 'utf8'),
      ])

      assert.match(packageSource, /"version": "0\.18\.0"/u)
      assert.match(tauriSource, /"version": "0\.18\.0"/u)
      assert.match(cargoSource, /^version = "0\.18\.0"/mu)
      assert.match(changelogSource, /## 0\.18\.0 - 2026-05-01/u)
      assert.equal(extractUnreleasedChangelogSection(changelogSource), buildSuggestedUnreleasedScaffold())
    }
  )
})

test('replaceUnreleasedChangelogSection can normalize an empty next-cycle section to the suggested scaffold', () => {
  const next = replaceUnreleasedChangelogSection(
    [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '### Added',
      '',
      '### Changed',
      '',
      '## 0.17.9 - 2026-04-25',
      '',
      '### Added',
      '',
      '- Older release',
    ].join('\n'),
    buildSuggestedUnreleasedScaffold()
  )

  assert.equal(extractUnreleasedChangelogSection(next), buildSuggestedUnreleasedScaffold())
})

test('buildReleaseNotesDraftTemplate resets the draft body for the next release cycle', () => {
  const draft = buildReleaseNotesDraftTemplate({
    releasedVersion: '0.18.0',
  })

  assert.match(draft, /next public release after `v0\.18\.0`/u)
  assert.match(draft, /Highest-impact user-visible change/u)
  assert.match(draft, /npm run release:prepare -- <next-version>/u)
  assert.match(draft, /npm run release:draft:advance -- 0\.18\.0/u)
  assert.equal(extractReleaseNotesDraftBaselineVersion(draft), '0.18.0')
})

test('advanceReleaseDraft rewrites docs/release-notes-draft.md to a clean next-cycle template', async () => {
  await withTempReleaseFixture(
    {
      'docs/release-notes-draft.md': [
        '# Upcoming Release Notes Draft',
        '',
        'This document is a draft for the next public release after `v0.17.9`.',
        '',
        'It is intentionally written in release-note language rather than implementation language.',
        '',
        '## Suggested GitHub Release Body',
        '',
        '### Highlights',
        '',
        '- Links workspace surface',
      ].join('\n'),
      'CHANGELOG.md': [
        '# Changelog',
        '',
        '## Unreleased',
        '',
        '### Added',
        '',
        '### Changed',
        '',
        '## 0.18.0 - 2026-05-01',
        '',
        '### Added',
        '',
        '- Older release',
      ].join('\n'),
    },
    async (cwd) => {
      const advanced = await advanceReleaseDraft({
        cwd,
        releasedVersion: '0.18.0',
      })

      assert.deepEqual(advanced, {
        releasedVersion: '0.18.0',
        previousBaselineVersion: '0.17.9',
        changelogScaffoldUpdated: true,
      })

      const [draftSource, changelogSource] = await Promise.all([
        readFile(path.join(cwd, 'docs/release-notes-draft.md'), 'utf8'),
        readFile(path.join(cwd, 'CHANGELOG.md'), 'utf8'),
      ])
      assert.match(draftSource, /next public release after `v0\.18\.0`/u)
      assert.match(draftSource, /Highest-impact user-visible change/u)
      assert.doesNotMatch(draftSource, /Links workspace surface/u)
      assert.equal(extractUnreleasedChangelogSection(changelogSource), buildSuggestedUnreleasedScaffold())
    }
  )
})

test('advanceReleaseDraft preserves CHANGELOG unreleased notes when the next cycle already started', async () => {
  await withTempReleaseFixture(
    {
      'docs/release-notes-draft.md': [
        '# Upcoming Release Notes Draft',
        '',
        'This document is a draft for the next public release after `v0.17.9`.',
      ].join('\n'),
      'CHANGELOG.md': [
        '# Changelog',
        '',
        '## Unreleased',
        '',
        '### Added',
        '',
        '- New editor command',
        '',
        '## 0.18.0 - 2026-05-01',
        '',
        '### Added',
        '',
        '- Older release',
      ].join('\n'),
    },
    async (cwd) => {
      const advanced = await advanceReleaseDraft({
        cwd,
        releasedVersion: '0.18.0',
      })

      assert.equal(advanced.changelogScaffoldUpdated, false)

      const changelogSource = await readFile(path.join(cwd, 'CHANGELOG.md'), 'utf8')
      assert.match(changelogSource, /- New editor command/u)
      assert.doesNotMatch(changelogSource, /### Fixed/u)
    }
  )
})

test('validateRelease falls back to package.json version and requires a matching changelog block', async () => {
  await withTempReleaseFixture(
    {
      'package.json': JSON.stringify({ version: '0.18.0' }),
      'src-tauri/tauri.conf.json': JSON.stringify({ version: '0.18.0' }),
      'src-tauri/Cargo.toml': [
        '[package]',
        'name = "no1-markdown-editor"',
        'version = "0.18.0"',
      ].join('\n'),
      'CHANGELOG.md': [
        '# Changelog',
        '',
        '## 0.18.0 - 2026-05-01',
        '',
        '### Added',
        '',
        '- Local release validation',
      ].join('\n'),
    },
    async (cwd) => {
      const validated = await validateRelease({
        cwd,
        requireChangelogSection: true,
      })

      assert.deepEqual(validated, {
        version: '0.18.0',
        packageVersion: '0.18.0',
        tauriVersion: '0.18.0',
        cargoVersion: '0.18.0',
      })
    }
  )
})

test('validateRelease reports version drift clearly', () => {
  assert.throws(
    () =>
      assertReleaseVersionMatches({
        version: '0.18.0',
        packageVersion: '0.18.0',
        tauriVersion: '0.17.9',
        cargoVersion: '0.18.0',
      }),
    /Release version mismatch\. target=0\.18\.0 package=0\.18\.0 tauri=0\.17\.9 cargo=0\.18\.0/u
  )
})

test('release workflow builds releaseBody from repository docs before invoking tauri-action', async () => {
  const [workflow, readme, changelog, draft, packageJson] = await Promise.all([
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/release-notes-draft.md', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ])
  const pkg = JSON.parse(packageJson)

  assert.match(workflow, /name: Validate release metadata/)
  assert.match(workflow, /node scripts\/validate-release\.mjs "\$\{GITHUB_REF_NAME#v\}" --require-changelog/)
  assert.match(workflow, /name: Build release body from repository docs/)
  assert.match(workflow, /id: release_notes/)
  assert.match(workflow, /node scripts\/build-release-body\.mjs "\$\{GITHUB_REF_NAME#v\}" > release-body\.md/)
  assert.match(workflow, /delimiter="release-body-\$\(node -e 'process\.stdout\.write\(require\(/)
  assert.match(workflow, /randomUUID\(\)\)'\)"/)
  assert.match(workflow, /printf 'body<<%s\\n' "\$delimiter"/)
  assert.match(workflow, /printf '\\n%s\\n' "\$delimiter"/)
  assert.doesNotMatch(workflow, /body<<EOF/)
  assert.match(workflow, /releaseBody: \$\{\{ steps\.release_notes\.outputs\.body \}\}/)
  assert.match(workflow, /generateReleaseNotes: true/)

  assert.match(readme, /User-facing change history lives in `CHANGELOG\.md`\./)
  assert.match(readme, /The next public release summary draft lives in `docs\/release-notes-draft\.md`\./)
  assert.match(readme, /npm run release:prepare -- 0\.18\.0/)
  assert.match(readme, /npm run release:validate/)
  assert.match(readme, /npm run release:draft:advance -- 0\.18\.0/)
  assert.match(readme, /npm run release:notes:preview -- 0\.18\.0/)
  assert.match(changelog, /## Unreleased/)
  assert.match(draft, /## Suggested GitHub Release Body/)
  assert.match(draft, /npm run release:prepare -- 0\.18\.0/)
  assert.match(draft, /npm run release:validate/)
  assert.match(draft, /npm run release:draft:advance -- 0\.18\.0/)
  assert.match(draft, /CHANGELOG\.md` `## Unreleased`/u)
  assert.equal(pkg.scripts['release:prepare'], 'node scripts/prepare-release.mjs')
  assert.equal(pkg.scripts['release:draft:advance'], 'node scripts/advance-release-draft.mjs')
  assert.equal(pkg.scripts['release:notes:preview'], 'node scripts/build-release-body.mjs')
  assert.equal(pkg.scripts['release:validate'], 'node scripts/validate-release.mjs --require-changelog')
})
