import { Document, parseAllDocuments } from 'yaml'

export type JsonPathSegment = string | number

export type YamlValueType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'

export interface YamlSetOperation {
  path: string
  value: unknown
  valueType: YamlValueType
}

export interface SetYamlValuesOptions {
  prettyErrors?: boolean
}

type FilterCondition = {
  path: JsonPathSegment[]
  operator: '==' | '!='
  value: string | number | boolean | null
}

type PathFilterSegment = {
  type: 'filter'
  condition: FilterCondition
}

type WildcardSegment = {
  type: 'wildcard'
}

type OperationPathSegment = JsonPathSegment | PathFilterSegment | WildcardSegment

type DocumentSelector =
  | { type: 'all' }
  | { type: 'index'; index: number }
  | { type: 'filter'; condition: FilterCondition }

interface ParsedDocumentSelector {
  selector: DocumentSelector
  nodePath: string
}

export function setYamlValues(
  yamlContent: string,
  operations: YamlSetOperation[],
  options: SetYamlValuesOptions = {},
): string {
  const { prettyErrors = true } = options

  const documents = parseAllDocuments(yamlContent, {
    prettyErrors,
    keepSourceTokens: true,
  })

  if (documents.length === 0) {
    throw new Error('No YAML document was found in the input content.')
  }

  validateDocumentErrors(documents)

  for (const operation of operations) {
    const { selector, nodePath } = extractDocumentSelector(operation.path)
    const operationPath = parseOperationPath(nodePath, operation.path)
    const typedValue = castValueByType(operation.value, operation.valueType)
    const targetDocs = selectTargetDocuments(documents, selector, operation.path)

    for (const document of targetDocs) {
      const concretePaths = resolveConcreteTargetPaths(document, operationPath, operation.path)
      for (const concretePath of concretePaths) {
        applyValueToDocument(document, concretePath, typedValue)
      }
    }
  }

  return stringifyDocuments(documents)
}

function extractDocumentSelector(path: string): ParsedDocumentSelector {
  if (path.startsWith('$doc[')) {
    const close = findMatchingBracket(path, 4)
    const rawSelector = path.slice(5, close).trim()
    const selector = parseDocumentSelector(rawSelector, path)

    const rest = path.slice(close + 1)
    const nodePath = normalizeNodePathFromSelector(path, rest)

    return {
      selector,
      nodePath,
    }
  }

  return {
    selector: { type: 'all' },
    nodePath: path,
  }
}

function parseDocumentSelector(rawSelector: string, fullPath: string): DocumentSelector {
  if (/^\d+$/.test(rawSelector)) {
    return {
      type: 'index',
      index: Number(rawSelector),
    }
  }

  const filterMatch = /^\?\((.*)\)$/.exec(rawSelector)
  if (filterMatch) {
    return {
      type: 'filter',
      condition: parseFilterCondition(filterMatch[1].trim(), fullPath, parseDocumentFilterPath),
    }
  }

  throw new Error(
    `Invalid path "${fullPath}". Document selector must be numeric like $doc[1] or filter like $doc[?(kind=='Component')].`,
  )
}

function parseFilterCondition(
  condition: string,
  fullPath: string,
  parseLeftPath: (pathExpression: string, fullPath: string) => JsonPathSegment[],
): FilterCondition {
  const { left, operator, right } = splitFilterCondition(condition, fullPath)

  if (left.trim() === '') {
    throw new Error(`Invalid path "${fullPath}". Missing left side in filter condition.`)
  }

  if (right.trim() === '') {
    throw new Error(`Invalid path "${fullPath}". Missing right side in filter condition.`)
  }

  return {
    path: parseLeftPath(left.trim(), fullPath),
    operator,
    value: parseFilterLiteral(right.trim(), fullPath),
  }
}

function splitFilterCondition(
  condition: string,
  fullPath: string,
): { left: string; operator: '==' | '!='; right: string } {
  let quote: '"' | "'" | null = null
  let bracketDepth = 0

  for (let index = 0; index < condition.length - 1; index += 1) {
    const char = condition[index]
    const next = condition[index + 1]

    if (quote) {
      if (char === quote && condition[index - 1] !== '\\') {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '[') {
      bracketDepth += 1
      continue
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      continue
    }

    if (bracketDepth === 0 && (char === '=' || char === '!') && next === '=') {
      const operator = `${char}=` as '==' | '!='
      return {
        left: condition.slice(0, index),
        operator,
        right: condition.slice(index + 2),
      }
    }
  }

  throw new Error(`Invalid path "${fullPath}". Filter supports only '==' or '!=' conditions.`)
}

function parseDocumentFilterPath(pathExpression: string, fullPath: string): JsonPathSegment[] {
  const normalizedPath =
    pathExpression.startsWith('[') || pathExpression.startsWith('.')
      ? `$${pathExpression}`
      : `$.${pathExpression}`

  try {
    return parseNodeJsonPath(normalizedPath)
  } catch {
    throw new Error(
      `Invalid path "${fullPath}". Document filter path "${pathExpression}" is not valid node navigation.`,
    )
  }
}

function parseNodeFilterPath(pathExpression: string, fullPath: string): JsonPathSegment[] {
  const trimmed = pathExpression.trim()
  if (trimmed === '@') {
    return []
  }

  const normalizedPath =
    trimmed.startsWith('@.') || trimmed.startsWith('@[')
      ? `$${trimmed.slice(1)}`
      : trimmed.startsWith('.') || trimmed.startsWith('[')
        ? `$${trimmed}`
        : trimmed.startsWith('$')
          ? trimmed
          : `$.${trimmed}`

  try {
    return parseNodeJsonPath(normalizedPath)
  } catch {
    throw new Error(
      `Invalid path "${fullPath}". Filter path "${pathExpression}" is not valid node navigation.`,
    )
  }
}

function parseFilterLiteral(rawLiteral: string, fullPath: string): string | number | boolean | null {
  const quoted = /^("([^"\\]|\\.)*"|'([^'\\]|\\.)*')$/.exec(rawLiteral)
  if (quoted) {
    return rawLiteral.slice(1, -1).replace(/\\([\\'"nrt])/g, (_full, escaped: string) => {
      if (escaped === 'n') return '\n'
      if (escaped === 'r') return '\r'
      if (escaped === 't') return '\t'
      return escaped
    })
  }

  if (rawLiteral === 'true') {
    return true
  }

  if (rawLiteral === 'false') {
    return false
  }

  if (rawLiteral === 'null') {
    return null
  }

  if (/^-?\d+(\.\d+)?$/.test(rawLiteral)) {
    return Number(rawLiteral)
  }

  throw new Error(
    `Invalid path "${fullPath}". Filter literal "${rawLiteral}" must be string, number, boolean or null.`,
  )
}

function normalizeNodePathFromSelector(originalPath: string, rest: string): string {
  if (rest === '') {
    return '$'
  }

  if (rest.startsWith('.') || rest.startsWith('[')) {
    return `$${rest}`
  }

  throw new Error(
    `Invalid path "${originalPath}". After $doc[n] or $doc[?(...)], use node navigation like .name or ["name"].`,
  )
}

function selectTargetDocuments(
  documents: Document.Parsed[],
  selector: DocumentSelector,
  originalPath: string,
): Document.Parsed[] {
  if (selector.type === 'all') {
    return documents
  }

  if (selector.type === 'index') {
    const selected = [documents[selector.index]].filter((doc): doc is Document.Parsed => Boolean(doc))
    if (selected.length === 0) {
      throw new Error(`Document index ${selector.index} does not exist.`)
    }

    return selected
  }

  const selected = documents.filter((document) => matchesFilterCondition(document.toJS(), selector.condition))
  if (selected.length === 0) {
    throw new Error(`No YAML documents matched selector in path "${originalPath}".`)
  }

  return selected
}

function parseOperationPath(path: string, fullPath: string): OperationPathSegment[] {
  if (!path||path[0]!=='$'){
    throw new Error(`Invalid path "${path}". A path must start with '$'.`)
  }

  if (path === '$') {
    return []
  }

  const segments: OperationPathSegment[] = []
  let cursor = 1

  while (cursor < path.length) {
    const char = path[cursor]

    if (char === '.') {
      cursor += 1

      if (cursor >= path.length) {
        throw new Error(`Invalid path "${path}". Missing node name after '.'.`)
      }

      const identifierMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(path.slice(cursor))
      if (!identifierMatch){
        throw new Error(
          `Invalid path "${path}". Dot notation only supports node names like $.node or $.node_name.`,
        )
      }

      segments.push(identifierMatch[0])
      cursor += identifierMatch[0].length
      continue
    }

    if (char === '[') {
      const bracketEnd = findMatchingBracket(path, cursor)
      const content = path.slice(cursor + 1, bracketEnd).trim()

      // Empty bracket [] is wildcard
      if (!content) {
        segments.push({
          type: 'wildcard',
        })
      } else {
        const filterMatch = /^\?\((.*)\)$/.exec(content)
        if (filterMatch) {
          segments.push({
            type: 'filter',
            condition: parseFilterCondition(filterMatch[1].trim(), fullPath, parseNodeFilterPath),
          })
        } else if (content === '*') {
          segments.push({
            type: 'wildcard',
          })
        } else {
          const quoted = /^("|')(.*)\1$/.exec(content)
          if (quoted) {
            segments.push(quoted[2])
          } else if (/^\d+$/.test(content)) {
            segments.push(Number(content))
          } else {
            throw new Error(
              `Invalid path "${path}". Bracket notation supports numeric indexes, quoted node names, filters like [?()] or wildcard [*].`,
            )
          }
        }
      }

      cursor = bracketEnd + 1
      continue
    }

    throw new Error(
      `Invalid path "${path}". Only node navigation with '.' and '[index|"key"|?()|*]' is supported.`,
    )
  }

  return segments
}

function resolveConcreteTargetPaths(
  document: Document.Parsed,
  pathSegments: OperationPathSegment[],
  originalPath: string,
): JsonPathSegment[][] {
  let candidates: JsonPathSegment[][] = [[]]
  const rootValue = document.toJS()

  for (const segment of pathSegments) {
    if (typeof segment === 'string' || typeof segment === 'number') {
      candidates = candidates.map((candidate) => [...candidate, segment])
      continue
    }

    const nextCandidates: JsonPathSegment[][] = []

    for (const candidate of candidates) {
      const currentValue = readValueAtPath(rootValue, candidate)
      if (!Array.isArray(currentValue)){
        const segmentType = segment.type === 'wildcard' ? 'Wildcard' : 'Filter'
        throw new Error(`Invalid path "${originalPath}". ${segmentType} segments can only be applied to arrays.`)
      }

      if (segment.type === 'wildcard') {
        for (let index = 0; index < currentValue.length; index += 1) {
          nextCandidates.push([...candidate, index])
        }
      } else {
        for (let index = 0; index < currentValue.length; index += 1) {
          if (matchesFilterCondition(currentValue[index], segment.condition)) {
            nextCandidates.push([...candidate, index])
          }
        }
      }
    }

    if (nextCandidates.length === 0) {
      const segmentType = segment.type === 'wildcard' ? 'No elements matched wildcard' : 'No nodes matched filter'
      throw new Error(`${segmentType} in path "${originalPath}".`)
    }

    candidates = nextCandidates
  }

  return candidates
}

function matchesFilterCondition(rootValue: unknown, condition: FilterCondition): boolean {
  const currentValue = readValueAtPath(rootValue, condition.path)

  if (condition.operator === '==') {
    return currentValue === condition.value
  }

  return currentValue !== condition.value
}

function readValueAtPath(rootValue: unknown, path: JsonPathSegment[]): unknown {
  let current: unknown = rootValue

  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)||segment<0||segment>=current.length){
        return undefined
      }

      current = current[segment]
      continue
    }

    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

export function parseNodeJsonPath(path: string): JsonPathSegment[] {
  if (!path||path[0]!=='$'){
    throw new Error(`Invalid path "${path}". A path must start with '$'.`)
  }

  if (path === '$') {
    return []
  }

  const segments: JsonPathSegment[] = []
  let cursor = 1

  while (cursor < path.length) {
    const char = path[cursor]

    if (char === '.') {
      cursor += 1

      if (cursor >= path.length) {
        throw new Error(`Invalid path "${path}". Missing node name after '.'.`)
      }

      const identifierMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(path.slice(cursor))
      if (!identifierMatch){
        throw new Error(
          `Invalid path "${path}". Dot notation only supports node names like $.node or $.node_name.`,
        )
      }

      segments.push(identifierMatch[0])
      cursor += identifierMatch[0].length
      continue
    }

    if (char === '[') {
      const bracketEnd = findMatchingBracket(path, cursor)
      const content = path.slice(cursor + 1, bracketEnd).trim()

      if (!content) {
        throw new Error(`Invalid path "${path}". Empty bracket segment is not allowed.`)
      }

      const quoted = /^("|')(.*)\1$/.exec(content)
      if (quoted) {
        segments.push(quoted[2])
      } else if (/^\d+$/.test(content)) {
        segments.push(Number(content))
      } else {
        throw new Error(
          `Invalid path "${path}". Bracket notation only supports numeric indexes or quoted node names.`,
        )
      }

      cursor = bracketEnd + 1
      continue
    }

    throw new Error(
      `Invalid path "${path}". Only node navigation with '.' and '[index|"key"]' is supported.`,
    )
  }

  return segments
}

export function castValueByType(value: unknown, valueType: YamlValueType): unknown {
  switch (valueType) {
    case 'string':
      return typeof value === 'string' ? value : String(value)
    case 'number':
      return castNumber(value)
    case 'boolean':
      return castBoolean(value)
    case 'null':
      return null
    case 'array':
      return castArray(value)
    case 'object':
      return castObject(value)
    default:
      throw new Error(`Unsupported value type: ${valueType satisfies never}`)
  }
}

function validateDocumentErrors(documents: Document.Parsed[]): void {
  for (const [index, document] of documents.entries()) {
    if (document.errors.length > 0) {
      const message = document.errors.map((error) => error.message).join('; ')
      throw new Error(`Invalid YAML document at index ${index}: ${message}`)
    }
  }
}

function applyValueToDocument(document: Document.Parsed, path: JsonPathSegment[], value: unknown): void {
  if (path.length === 0) {
    document.contents = document.createNode(value) as Document.Parsed['contents']
    return
  }

  if (document.contents === null) {
    document.contents = document.createNode(
      typeof path[0] === 'number' ? [] : {},
    ) as Document.Parsed['contents']
  }

  document.setIn(path, value)
}

function stringifyDocuments(documents: Document.Parsed[]): string {
  return documents
    .map((document, index) => {
      const body = ensureTrailingLineBreak(document.toString())
      return index === 0 ? body : `---\n${body}`
    })
    .join('')
}

function ensureTrailingLineBreak(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function findMatchingBracket(path: string, openIndex: number): number {
  if (path[openIndex] !== '[') {
    throw new Error(`Invalid path "${path}". Expected '[' at index ${openIndex}.`)
  }

  let depth = 0
  let quote: '"' | "'" | null = null

  for (let index = openIndex; index < path.length; index += 1) {
    const char = path[index]

    if (quote) {
      if (char === quote && path[index - 1] !== '\\') {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '[') {
      depth += 1
      continue
    }

    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  throw new Error(`Invalid path "${path}". Missing closing bracket ']'.`)
}

function castNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  throw new Error(`Cannot cast value "${String(value)}" to number.`)
}

function castBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  throw new Error(`Cannot cast value "${String(value)}" to boolean.`)
}

function castArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseJson(value)
    if (Array.isArray(parsed)) {
      return parsed
    }
  }

  throw new Error(`Cannot cast value "${String(value)}" to array.`)
}

function castObject(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseJson(value)
    if (isPlainObject(parsed)) {
      return parsed
    }
  }

  throw new Error(`Cannot cast value "${String(value)}" to object.`)
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
