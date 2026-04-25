import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { assertChangelogSectionExists } from './build-release-body.mjs'

const PACKAGE_JSON_PATH = 'package.json'
const TAURI_CONFIG_PATH = 'src-tauri/tauri.conf.json'
const CARGO_TOML_PATH = 'src-tauri/Cargo.toml'
const CHANGELOG_PATH = 'CHANGELOG.md'

export function normalizeVersion(value) {
  return String(value ?? '').replace(/^v/u, '').trim()
}

export function extractHtmlCommentLines(source) {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^<!--.*-->$/u.test(line))
}

export function assertNoReleaseScaffoldComments(section, version) {
  const commentLines = extractHtmlCommentLines(section)

  if (commentLines.length > 0) {
    throw new Error(
      `CHANGELOG entry for v${normalizeVersion(version)} still contains HTML comment placeholders. Remove scaffold hints before release.`
    )
  }

  return section
}

export function extractCargoVersion(source) {
  const lines = source.split(/\r?\n/u)
  let inPackageSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '[package]') {
      inPackageSection = true
      continue
    }

    if (inPackageSection && /^\[.+\]$/u.test(trimmed)) {
      break
    }

    if (!inPackageSection) {
      continue
    }

    const match = trimmed.match(/^version\s*=\s*"([^"]+)"/u)
    if (match) {
      return normalizeVersion(match[1])
    }
  }

  throw new Error('Unable to read version from src-tauri/Cargo.toml.')
}

export function assertReleaseVersionMatches({
  version,
  packageVersion,
  tauriVersion,
  cargoVersion,
}) {
  const normalized = {
    version: normalizeVersion(version),
    packageVersion: normalizeVersion(packageVersion),
    tauriVersion: normalizeVersion(tauriVersion),
    cargoVersion: normalizeVersion(cargoVersion),
  }

  if (!normalized.version) {
    throw new Error('Expected a version argument such as "0.18.0" or GITHUB_REF_NAME like "v0.18.0".')
  }

  if (
    normalized.packageVersion !== normalized.version ||
    normalized.tauriVersion !== normalized.version ||
    normalized.cargoVersion !== normalized.version
  ) {
    throw new Error(
      `Release version mismatch. target=${normalized.version} package=${normalized.packageVersion || '(missing)'} tauri=${normalized.tauriVersion || '(missing)'} cargo=${normalized.cargoVersion || '(missing)'}`
    )
  }

  return normalized
}

export async function loadReleaseVersions({
  cwd = process.cwd(),
} = {}) {
  const [packageSource, tauriSource, cargoSource] = await Promise.all([
    readFile(path.join(cwd, PACKAGE_JSON_PATH), 'utf8'),
    readFile(path.join(cwd, TAURI_CONFIG_PATH), 'utf8'),
    readFile(path.join(cwd, CARGO_TOML_PATH), 'utf8'),
  ])

  return {
    packageVersion: normalizeVersion(JSON.parse(packageSource).version),
    tauriVersion: normalizeVersion(JSON.parse(tauriSource).version),
    cargoVersion: extractCargoVersion(cargoSource),
  }
}

export async function validateRelease({
  version,
  cwd = process.cwd(),
  requireChangelogSection = false,
} = {}) {
  const versions = await loadReleaseVersions({ cwd })
  const targetVersion = normalizeVersion(version) || versions.packageVersion
  const validatedVersions = assertReleaseVersionMatches({
    version: targetVersion,
    ...versions,
  })

  if (requireChangelogSection) {
    const changelogSource = await readFile(path.join(cwd, CHANGELOG_PATH), 'utf8')
    const section = assertChangelogSectionExists(changelogSource, validatedVersions.version)
    assertNoReleaseScaffoldComments(section, validatedVersions.version)
  }

  return validatedVersions
}

export function formatReleaseValidationSummary(
  {
    version,
    packageVersion,
    tauriVersion,
    cargoVersion,
  },
  {
    requireChangelogSection = false,
  } = {}
) {
  const lines = [
    `Release validation passed for v${version}.`,
    `- package.json: ${packageVersion}`,
    `- src-tauri/tauri.conf.json: ${tauriVersion}`,
    `- src-tauri/Cargo.toml: ${cargoVersion}`,
  ]

  if (requireChangelogSection) {
    lines.push(`- CHANGELOG.md: found matching v${version} section with no scaffold placeholders`)
  }

  return lines.join('\n')
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isDirectExecution()) {
  const args = process.argv.slice(2)
  const rawVersion = args.find((value) => !value.startsWith('--')) ?? process.env.GITHUB_REF_NAME ?? ''
  const requireChangelogSection = args.includes('--require-changelog')

  try {
    const validated = await validateRelease({
      version: rawVersion,
      requireChangelogSection,
    })
    process.stdout.write(
      `${formatReleaseValidationSummary(validated, { requireChangelogSection })}\n`
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
