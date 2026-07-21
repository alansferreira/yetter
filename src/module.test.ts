import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import { castValueByType, parseNodeJsonPath, setYamlValues } from './module'

describe('parseNodeJsonPath', () => {
  test('parses dot and bracket paths', () => {
    expect(parseNodeJsonPath('$.service.name')).toEqual(['service', 'name'])
    expect(parseNodeJsonPath('$.services[0].name')).toEqual(['services', 0, 'name'])
    expect(parseNodeJsonPath('$["api"]["base-url"]')).toEqual(['api', 'base-url'])
  })

  test('rejects unsupported syntax', () => {
    expect(() => parseNodeJsonPath('service.name')).toThrow(/must start with '\$'/)
    expect(() => parseNodeJsonPath('$.items[*]')).toThrow(/only supports numeric indexes or quoted node names/i)
    expect(() => parseNodeJsonPath('$.items[?(@.enabled)]')).toThrow(/only supports numeric indexes or quoted node names/i)
  })
})

describe('castValueByType', () => {
  test('casts scalar values', () => {
    expect(castValueByType('42', 'number')).toBe(42)
    expect(castValueByType('TRUE', 'boolean')).toBe(true)
    expect(castValueByType(100, 'string')).toBe('100')
    expect(castValueByType('anything', 'null')).toBeNull()
  })

  test('casts array and object from JSON strings', () => {
    expect(castValueByType('[1,2,3]', 'array')).toEqual([1, 2, 3])
    expect(castValueByType('{"a":1}', 'object')).toEqual({ a: 1 })
  })

  test('throws for invalid casts', () => {
    expect(() => castValueByType('abc', 'number')).toThrow(/Cannot cast value/i)
    expect(() => castValueByType('yes', 'boolean')).toThrow(/Cannot cast value/i)
    expect(() => castValueByType('{"a":1}', 'array')).toThrow(/Cannot cast value/i)
  })
})

describe('setYamlValues', () => {
  test('updates one document and keeps unrelated data', () => {
    const input = `app:\n  name: old-name\n  replicas: 1\n  enabled: false\nnotes:\n  - untouched\n`

    const output = setYamlValues(input, [
      { path: '$.app.name', value: 'new-name', valueType: 'string' },
      { path: '$.app.replicas', value: '3', valueType: 'number' },
      { path: '$.app.enabled', value: 'true', valueType: 'boolean' },
    ])

    expect(output).toContain('name: new-name')
    expect(output).toContain('replicas: 3')
    expect(output).toContain('enabled: true')
    expect(output).toContain('- untouched')
  })

  test('updates only the selected document index', () => {
    const input = `service:\n  name: first\n---\nservice:\n  name: second\n`

    const output = setYamlValues(input, [
      { path: '$doc[1].service.name', value: 'changed', valueType: 'string' },
    ])

    expect(output).toContain('name: first')
    expect(output).toContain('---\nservice:\n  name: changed')
  })

  test('updates only documents matched by filter selector', () => {
    const input = `kind: Component\nmetadata:\n  name: first\n---\nkind: Config\nmetadata:\n  name: second\n---\nkind: Component\nmetadata:\n  name: third\n`

    const output = setYamlValues(input, [
      { path: "$doc[?(kind=='Component')].metadata.name", value: 'renamed', valueType: 'string' },
    ])

    const docs = output.split('\n---\n')

    expect(docs[0]).toContain('name: renamed')
    expect(docs[1]).toContain('name: second')
    expect(docs[2]).toContain('name: renamed')
  })

  test('updates all documents when $doc[n] selector is not provided', () => {
    const input = `service:\n  name: first\n---\nservice:\n  name: second\n`

    const output = setYamlValues(input, [
      { path: '$.service.name', value: 'shared-name', valueType: 'string' },
    ])

    const docs = output.split('\n---\n')

    expect(docs).toHaveLength(2)
    expect(docs[0]).toContain('name: shared-name')
    expect(docs[1]).toContain('name: shared-name')
  })

  test('preserves comments and separators in multi-document updates', () => {
    const input = `# doc 1 header\napp:\n  name: first # first name\n---\n# doc 2 header\napp:\n  name: second # second name\n`

    const output = setYamlValues(input, [
      { path: '$doc[1].app.name', value: 'changed-second', valueType: 'string' },
    ])

    expect(output).toContain('# doc 1 header')
    expect(output).toContain('name: first # first name')
    expect(output).toContain('---\n# doc 2 header')
    expect(output).toContain('name: changed-second # second name')
  })

  test('rejects invalid document selector expressions', () => {
    const input = `service:\n  name: first\n---\nservice:\n  name: second\n`

    expect(() =>
      setYamlValues(input, [{ path: '$doc[abc].service.name', value: 'x', valueType: 'string' }]),
    ).toThrow(/Document selector must be numeric/i)

    expect(() =>
      setYamlValues(input, [{ path: '$doc[1]service.name', value: 'x', valueType: 'string' }]),
    ).toThrow(/After \$doc\[n\] or \$doc\[\?\(\.\.\.\)\], use node navigation/i)

    expect(() =>
      setYamlValues(input, [
        { path: '$doc[?(kind~=\'Component\')].service.name', value: 'x', valueType: 'string' },
      ]),
    ).toThrow(/Filter supports only '==' or '!=' conditions/i)

    expect(() =>
      setYamlValues(input, [
        { path: '$doc[?(kind==Component)].service.name', value: 'x', valueType: 'string' },
      ]),
    ).toThrow(/must be string, number, boolean or null/i)
  })

  test('throws when document filter matches no documents', () => {
    const input = `kind: Service\nmetadata:\n  name: app-a\n---\nkind: Config\nmetadata:\n  name: app-b\n`

    expect(() =>
      setYamlValues(input, [
        { path: "$doc[?(kind=='Component')].metadata.name", value: 'x', valueType: 'string' },
      ]),
    ).toThrow(/No YAML documents matched selector/i)
  })

  test('updates array items selected by filter at node level', () => {
    const input = `items:\n  - kind: Component\n    metadata:\n      name: first\n  - kind: Config\n    metadata:\n      name: second\n  - kind: Component\n    metadata:\n      name: third\n`

    const output = setYamlValues(input, [
      { path: "$.items[?(kind=='Component')].metadata.name", value: 'renamed', valueType: 'string' },
    ])

    const parsed = parse(output) as {
      items: Array<{ kind: string; metadata: { name: string } }>
    }

    expect(parsed.items[0].metadata.name).toBe('renamed')
    expect(parsed.items[1].metadata.name).toBe('second')
    expect(parsed.items[2].metadata.name).toBe('renamed')
  })

  test('supports nested filters at different levels', () => {
    const input = `spec:\n  components:\n    - kind: Component\n      fields:\n        - enabled: true\n          name: a\n        - enabled: false\n          name: b\n    - kind: Config\n      fields:\n        - enabled: true\n          name: c\n`

    const output = setYamlValues(input, [
      {
        path: "$.spec.components[?(kind=='Component')].fields[?(enabled==true)].name",
        value: 'updated',
        valueType: 'string',
      },
    ])

    const parsed = parse(output) as {
      spec: {
        components: Array<{ kind: string; fields: Array<{ enabled: boolean; name: string }> }>
      }
    }

    expect(parsed.spec.components[0].fields[0].name).toBe('updated')
    expect(parsed.spec.components[0].fields[1].name).toBe('b')
    expect(parsed.spec.components[1].fields[0].name).toBe('c')
  })

  test('supports @ path in node-level filter expressions', () => {
    const input = `items:\n  - metadata:\n      enabled: true\n      name: one\n  - metadata:\n      enabled: false\n      name: two\n`

    const output = setYamlValues(input, [
      {
        path: "$.items[?(@.metadata.enabled==true)].metadata.name",
        value: 'active',
        valueType: 'string',
      },
    ])

    const parsed = parse(output) as {
      items: Array<{ metadata: { enabled: boolean; name: string } }>
    }

    expect(parsed.items[0].metadata.name).toBe('active')
    expect(parsed.items[1].metadata.name).toBe('two')
  })

  test('throws when filter is used on non-array node path', () => {
    const input = `app:\n  name: service\n`

    expect(() =>
      setYamlValues(input, [
        { path: "$.app[?(name=='service')].name", value: 'x', valueType: 'string' },
      ]),
    ).toThrow(/Filter segments can only be applied to arrays/i)
  })

  test('throws when node-level filter matches no items', () => {
    const input = `items:\n  - kind: Service\n    name: a\n`

    expect(() =>
      setYamlValues(input, [
        { path: "$.items[?(kind=='Component')].name", value: 'x', valueType: 'string' },
      ]),
    ).toThrow(/No nodes matched filter/i)
  })

  test('creates intermediate nodes when path does not exist', () => {
    const input = '{}\n'

    const output = setYamlValues(input, [
      { path: '$.env.production.replicas', value: 2, valueType: 'number' },
      { path: '$.env.production.labels', value: ['web', 'api'], valueType: 'array' },
    ])

    const parsed = parse(output) as { env?: { production?: { replicas?: number; labels?: string[] } } }

    expect(parsed.env?.production?.replicas).toBe(2)
    expect(parsed.env?.production?.labels).toEqual(['web', 'api'])
  })

  test('preserves existing comments and core formatting around untouched nodes', () => {
    const input = `# deploy config
app:
  # primary app name
  name: old-name # app name comment
  image: repo/app:v1 # image comment

metadata: { team: core } # metadata comment
list:
  - one # first item
  - two
`

    const output = setYamlValues(input, [
      { path: '$.app.image', value: 'repo/app:v2', valueType: 'string' },
    ])

    expect(output).toContain('# deploy config')
    expect(output).toContain('# primary app name')
    expect(output).toContain('# app name comment')
    expect(output).toContain('# image comment')
    expect(output).toContain('# metadata comment')
    expect(output).toContain('- one # first item')
    expect(output).toContain('image: repo/app:v2')
    expect(output).toContain('image: repo/app:v2 # image comment\n\nmetadata:')
  })
})
