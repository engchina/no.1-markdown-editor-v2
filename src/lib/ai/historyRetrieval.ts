import type { AIDocumentSessionHistoryEntry } from './types.ts'

export interface AIHistoryRetrievalCandidate extends AIDocumentSessionHistoryEntry {
  documentKey: string
}

export interface AIHistoryRetrievalMatch<T extends AIHistoryRetrievalCandidate = AIHistoryRetrievalCandidate> {
  candidate: T
  score: number
  matchKind: 'semantic' | 'lexical' | 'fuzzy' | 'recency' | 'provider'
  matchedTerms: string[]
  explanation?: string
}

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu
const CJK_SEGMENT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]{2,}/gu
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'your',
  'have',
  'will',
  'then',
  'note',
  'draft',
  'document',
  'markdown',
  'current',
  'about',
  'using',
  'used',
  'into',
  'from',
  'with',
  '以及',
  '这个',
  '当前',
  'する',
  'して',
])

const SEMANTIC_GROUPS = [
  {
    id: 'translate',
    terms: ['translate', 'translation', 'translated', 'localize', 'localise', '翻译', '翻訳', '訳す', '訳', '訳文'],
  },
  {
    id: 'summarize',
    terms: ['summarize', 'summary', 'summarise', 'recap', 'gist', 'overview', '总结', '摘要', '要约', '要点', '要約', '要旨'],
  },
  {
    id: 'rewrite',
    terms: ['rewrite', 'rephrase', 'polish', 'clarity', 'improve', 'revise', 'refine', '重写', '改写', '润色', '言い換え', '推敲'],
  },
  {
    id: 'review',
    terms: ['review', 'feedback', 'critique', 'audit', 'inspect', '审阅', '检查', '复核', 'レビュー', '確認', '見直し'],
  },
  {
    id: 'continue',
    terms: ['continue', 'continuation', 'next', 'follow-up', '续写', '继续', '延续', '続き', '継続'],
  },
  {
    id: 'release',
    terms: ['release', 'ship', 'launch', 'deploy', '发布', '上线', '交付', 'リリース', '出荷'],
  },
  {
    id: 'roadmap',
    terms: ['roadmap', 'plan', 'milestone', 'timeline', '路线图', '计划', '里程碑', 'ロードマップ', '計画'],
  },
  {
    id: 'checklist',
    terms: ['checklist', 'todo', 'todos', 'task', 'tasks', '清单', '待办', 'チェックリスト', 'タスク'],
  },
  {
    id: 'japanese',
    terms: ['japanese', '日本語', '日文', 'にほんご'],
  },
  {
    id: 'chinese',
    terms: ['chinese', '中文', '汉语', '漢語', '中国語'],
  },
  {
    id: 'english',
    terms: ['english', '英文', '英语', '英語'],
  },
  {
    id: 'note',
    terms: ['note', 'notes', 'doc', 'docs', 'document', 'documents', '笔记', 'ノート', '文書'],
  },
  {
    id: 'workspace',
    terms: ['workspace', 'workflow', 'phase', 'execution', 'orchestration', 'handoff', '工作区', '工作流', '阶段', '执行', 'ワークスペース', 'ワークフロー', 'フェーズ', '実行'],
  },
] as const

const TERM_TO_CONCEPT = new Map<string, string>(
  SEMANTIC_GROUPS.flatMap((group) =>
    group.terms.map((term) => [normalizeToken(term), group.id] as const)
  )
)

interface HistorySemanticIndex {
  promptText: string
  resultText: string
  errorText: string
  documentText: string
  documentKeyText: string
  metaText: string
  workspaceText: string
  promptTerms: Set<string>
  resultTerms: Set<string>
  errorTerms: Set<string>
  documentTerms: Set<string>
  metaTerms: Set<string>
  workspaceTerms: Set<string>
  concepts: Set<string>
  ngrams: Set<string>
  corpusTerms: Set<string>
}

export function retrieveAIHistoryCandidates<T extends AIHistoryRetrievalCandidate>(
  candidates: readonly T[],
  query: string
): AIHistoryRetrievalMatch<T>[] {
  const queryProfile = createHistoryQueryProfile(query)
  if (queryProfile.terms.size === 0 && queryProfile.concepts.size === 0 && queryProfile.ngrams.size === 0) {
    return sortHistoryCandidates(candidates).map((candidate) => ({
      candidate,
      score: 0,
      matchKind: 'recency',
      matchedTerms: [],
      explanation: undefined,
    }))
  }

  const indexed = candidates.map((candidate) => ({
    candidate,
    index: buildHistorySemanticIndex(candidate),
  }))
  const documentFrequencies = buildDocumentFrequencies(indexed.map((entry) => entry.index))

  return indexed
    .map(({ candidate, index }) => scoreHistoryCandidate(candidate, index, queryProfile, documentFrequencies, candidates.length))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.candidate.pinned !== right.candidate.pinned) return left.candidate.pinned ? -1 : 1
      const workspaceDelta =
        getAIHistoryWorkspaceExecutionStrength(right.candidate) -
        getAIHistoryWorkspaceExecutionStrength(left.candidate)
      if (workspaceDelta !== 0) return workspaceDelta
      return right.candidate.updatedAt - left.candidate.updatedAt
    })
}

export function rankAIHistoryCandidates<T extends AIHistoryRetrievalCandidate>(
  candidates: readonly T[],
  query: string
): T[] {
  return retrieveAIHistoryCandidates(candidates, query).map((match) => match.candidate)
}

export function tokenizeHistoryQuery(query: string): string[] {
  return [...collectNormalizedTerms(query)]
}

export function sortHistoryCandidates<T extends AIHistoryRetrievalCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
    const workspaceDelta = getAIHistoryWorkspaceExecutionStrength(right) - getAIHistoryWorkspaceExecutionStrength(left)
    if (workspaceDelta !== 0) return workspaceDelta
    return right.updatedAt - left.updatedAt
  })
}

export function getAIHistoryWorkspaceExecutionStrength(
  candidate: Pick<AIHistoryRetrievalCandidate, 'workspaceExecution'>
) {
  const record = candidate.workspaceExecution
  if (!record || record.taskCount <= 0) return 0

  const completedScore = Math.min(record.completedCount, 6) * 1.4
  const failedScore = Math.min(record.failedCount, 3) * 0.7
  const waitingScore = Math.min(record.waitingCount, 3) * 0.35
  const activeTaskCount = record.tasks.filter((task) => task.status !== 'idle').length
  const activityScore = Math.min(activeTaskCount, 5) * 0.4
  const summaryScore = record.summary?.trim() ? 0.8 : 0

  return completedScore + failedScore + waitingScore + activityScore + summaryScore
}

function scoreHistoryCandidate<T extends AIHistoryRetrievalCandidate>(
  candidate: T,
  index: HistorySemanticIndex,
  queryProfile: ReturnType<typeof createHistoryQueryProfile>,
  documentFrequencies: Map<string, number>,
  candidateCount: number
): AIHistoryRetrievalMatch<T> {
  let lexicalScore = 0
  let semanticScore = 0
  let fuzzyScore = 0
  const matchedTerms = new Set<string>()
  const matchedConcepts = new Set<string>()

  if (queryProfile.normalized.length > 1) {
    if (index.promptText.includes(queryProfile.normalized)) lexicalScore += 18
    if (index.resultText.includes(queryProfile.normalized)) lexicalScore += 15
    if (index.documentText.includes(queryProfile.normalized)) lexicalScore += 10
    if (index.documentKeyText.includes(queryProfile.normalized)) lexicalScore += 6
  }

  for (const term of queryProfile.terms) {
    const idf = computeIdf(documentFrequencies, term, candidateCount)
    let matched = false

    matched ||= addWeightedTermMatch(term, index.promptTerms, 8, idf, (delta) => { lexicalScore += delta })
    matched ||= addWeightedSubstringMatch(term, index.promptText, 4, idf, (delta) => { lexicalScore += delta })

    matched ||= addWeightedTermMatch(term, index.resultTerms, 6, idf, (delta) => { lexicalScore += delta })
    matched ||= addWeightedSubstringMatch(term, index.resultText, 3, idf, (delta) => { lexicalScore += delta })

    matched ||= addWeightedTermMatch(term, index.documentTerms, 5, idf, (delta) => { lexicalScore += delta })
    matched ||= addWeightedSubstringMatch(term, index.documentText, 2.5, idf, (delta) => { lexicalScore += delta })

    matched ||= addWeightedTermMatch(term, index.metaTerms, 4, idf, (delta) => { semanticScore += delta })
    matched ||= addWeightedSubstringMatch(term, index.documentKeyText, 1.8, idf, (delta) => { semanticScore += delta })
    matched ||= addWeightedTermMatch(term, index.workspaceTerms, 5, idf, (delta) => { semanticScore += delta })
    matched ||= addWeightedSubstringMatch(term, index.workspaceText, 2.4, idf, (delta) => { semanticScore += delta })

    if (matched) matchedTerms.add(term)
  }

  for (const concept of queryProfile.concepts) {
    if (!index.concepts.has(concept)) continue
    semanticScore += 7 + computeIdf(documentFrequencies, `concept:${concept}`, candidateCount) * 4
    matchedConcepts.add(concept)
  }

  const ngramSimilarity = computeDiceCoefficient(queryProfile.ngrams, index.ngrams)
  if (ngramSimilarity > 0.08) {
    fuzzyScore += ngramSimilarity * 18
  }

  const coverageDenominator = queryProfile.terms.size + queryProfile.concepts.size
  const coverageRatio =
    coverageDenominator > 0
      ? (matchedTerms.size + matchedConcepts.size) / coverageDenominator
      : 0
  semanticScore += coverageRatio * 8

  const workspaceExecutionStrength = getAIHistoryWorkspaceExecutionStrength(candidate)
  if ((lexicalScore > 0 || semanticScore > 0 || fuzzyScore > 0) && workspaceExecutionStrength > 0) {
    semanticScore += workspaceExecutionStrength
  }

  const recencyHours = Math.max(0, (Date.now() - candidate.updatedAt) / (1000 * 60 * 60))
  const recencyScore = Math.max(0, 4 - recencyHours / 24)
  const pinScore = candidate.pinned ? 4 : 0

  const score = lexicalScore + semanticScore + fuzzyScore + recencyScore + pinScore
  const matchKind = resolveMatchKind({ lexicalScore, semanticScore, fuzzyScore })

  return {
    candidate,
    score,
    matchKind,
    matchedTerms: [...matchedTerms].slice(0, 4),
    explanation: undefined,
  }
}

function resolveMatchKind(scores: {
  lexicalScore: number
  semanticScore: number
  fuzzyScore: number
}): AIHistoryRetrievalMatch['matchKind'] {
  if (scores.semanticScore >= scores.lexicalScore && scores.semanticScore >= scores.fuzzyScore) {
    return 'semantic'
  }
  if (scores.lexicalScore >= scores.fuzzyScore) return 'lexical'
  return 'fuzzy'
}

function createHistoryQueryProfile(query: string) {
  const normalized = normalizeText(query)
  const terms = collectNormalizedTerms(query)
  const concepts = collectSemanticConcepts(terms)
  const ngrams = createTextNgrams(normalized)

  return {
    normalized,
    terms,
    concepts,
    ngrams,
  }
}

function buildHistorySemanticIndex(candidate: AIHistoryRetrievalCandidate): HistorySemanticIndex {
  const promptText = normalizeText(candidate.prompt)
  const resultText = normalizeText(candidate.resultPreview ?? '')
  const errorText = normalizeText(candidate.errorMessage ?? '')
  const documentText = normalizeText(candidate.documentName)
  const documentKeyText = normalizeText(candidate.documentKey)
  const workspaceText = normalizeText(buildHistoryWorkspaceExecutionText(candidate))
  const metaText = normalizeText([
    candidate.intent,
    candidate.outputTarget.replace(/-/g, ' '),
    candidate.source.replace(/-/g, ' '),
    candidate.status,
  ].join(' '))

  const promptTerms = collectNormalizedTerms(promptText)
  const resultTerms = collectNormalizedTerms(resultText)
  const errorTerms = collectNormalizedTerms(errorText)
  const documentTerms = collectNormalizedTerms(documentText)
  const metaTerms = collectNormalizedTerms(metaText)
  const workspaceTerms = collectNormalizedTerms(workspaceText)
  const corpusTerms = new Set([
    ...promptTerms,
    ...resultTerms,
    ...errorTerms,
    ...documentTerms,
    ...metaTerms,
    ...workspaceTerms,
  ])
  const concepts = collectSemanticConcepts(corpusTerms)
  const ngrams = createTextNgrams([promptText, resultText, errorText, documentText, metaText, workspaceText].join(' '))

  return {
    promptText,
    resultText,
    errorText,
    documentText,
    documentKeyText,
    metaText,
    workspaceText,
    promptTerms,
    resultTerms,
    errorTerms,
    documentTerms,
    metaTerms,
    workspaceTerms,
    concepts,
    ngrams,
    corpusTerms,
  }
}

function buildHistoryWorkspaceExecutionText(candidate: Pick<AIHistoryRetrievalCandidate, 'workspaceExecution'>) {
  const record = candidate.workspaceExecution
  if (!record) return ''

  const taskParts = record.tasks.flatMap((task) => [
    task.title,
    task.target,
    task.phase ?? '',
    task.action.replace(/-/gu, ' '),
    task.status,
    task.message ?? '',
    task.completionSource ?? '',
    typeof task.originRunId === 'number' ? `run ${task.originRunId}` : '',
  ])

  return [
    record.summary ?? '',
    `${record.taskCount} tasks`,
    `${record.completedCount} completed`,
    `${record.failedCount} failed`,
    `${record.waitingCount} waiting`,
    ...taskParts,
  ].join(' ')
}

function buildDocumentFrequencies(indexes: readonly HistorySemanticIndex[]) {
  const frequencies = new Map<string, number>()

  for (const index of indexes) {
    const terms = new Set<string>([
      ...index.corpusTerms,
      ...[...index.concepts].map((concept) => `concept:${concept}`),
    ])

    for (const term of terms) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
    }
  }

  return frequencies
}

function computeIdf(documentFrequencies: Map<string, number>, term: string, candidateCount: number) {
  const documentFrequency = documentFrequencies.get(term) ?? 0
  return 1 + Math.log((candidateCount + 1) / (documentFrequency + 1))
}

function addWeightedTermMatch(
  term: string,
  haystack: Set<string>,
  weight: number,
  idf: number,
  apply: (delta: number) => void
) {
  if (!haystack.has(term)) return false
  apply(weight * idf)
  return true
}

function addWeightedSubstringMatch(
  term: string,
  haystack: string,
  weight: number,
  idf: number,
  apply: (delta: number) => void
) {
  if (!haystack.includes(term)) return false
  apply(weight * idf)
  return true
}

function collectNormalizedTerms(value: string) {
  const normalized = normalizeText(value)
  const terms = new Set<string>()

  for (const match of normalized.match(WORD_PATTERN) ?? []) {
    const token = normalizeToken(match)
    if (!token || token.length < 2 || STOP_WORDS.has(token)) continue
    terms.add(token)
  }

  for (const segment of normalized.match(CJK_SEGMENT_PATTERN) ?? []) {
    for (const ngram of createCjkBigrams(segment)) {
      if (!ngram || STOP_WORDS.has(ngram)) continue
      terms.add(ngram)
    }
  }

  return terms
}

function collectSemanticConcepts(terms: Iterable<string>) {
  const concepts = new Set<string>()
  for (const term of terms) {
    const concept = TERM_TO_CONCEPT.get(term)
    if (concept) concepts.add(concept)
  }
  return concepts
}

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeToken(value: string) {
  let token = value.normalize('NFKC').toLowerCase().replace(/^[^-\p{L}\p{N}]+|[^-\p{L}\p{N}]+$/gu, '')
  if (!token) return ''

  if (/^[a-z][a-z0-9-]+$/u.test(token)) {
    if (token.length > 5 && token.endsWith('ing')) token = token.slice(0, -3)
    else if (token.length > 4 && token.endsWith('ed')) token = token.slice(0, -2)
    else if (token.length > 4 && token.endsWith('es')) token = token.slice(0, -2)
    else if (token.length > 4 && token.endsWith('s')) token = token.slice(0, -1)
  }

  return token
}

function createCjkBigrams(segment: string) {
  const compact = segment.replace(/\s+/gu, '')
  if (compact.length <= 2) return [compact]

  const ngrams: string[] = []
  for (let index = 0; index < compact.length - 1; index += 1) {
    ngrams.push(compact.slice(index, index + 2))
  }
  return ngrams
}

function createTextNgrams(text: string) {
  const compact = normalizeText(text).replace(/\s+/gu, '')
  if (!compact) return new Set<string>()

  const windowSize = compact.length < 5 ? 2 : 3
  const ngrams = new Set<string>()
  if (compact.length <= windowSize) {
    ngrams.add(compact)
    return ngrams
  }

  for (let index = 0; index <= compact.length - windowSize; index += 1) {
    ngrams.add(compact.slice(index, index + windowSize))
  }

  return ngrams
}

function computeDiceCoefficient(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size === 0 || right.size === 0) return 0

  let overlap = 0
  for (const value of left) {
    if (right.has(value)) overlap += 1
  }

  return (2 * overlap) / (left.size + right.size)
}
