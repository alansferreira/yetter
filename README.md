# yaml-setter

A TypeScript library for updating YAML content with:

- Support for multi-document YAML files (`---`)
- List of changes by simplified `jsonpath`
- Type coercion for new values (`string`, `number`, `boolean`, `null`, `array`, `object`)
- Focus on node updates and document selection by index/simple filter
- Compatibility with Node.js and browsers

## Installation

```bash
npm i yaml-setter
```

## API

```ts
import { setYamlValues, type YamlSetOperation } from 'yaml-setter'
```

### `setYamlValues(yamlContent, operations, options?)`

- `yamlContent: string`
- `operations: YamlSetOperation[]`
- `options?: { prettyErrors?: boolean }`
- Returns: `string` with updated YAML

### `YamlSetOperation`

```ts
type YamlValueType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'

interface YamlSetOperation {
  path: string
  value: unknown
  valueType: YamlValueType
}
```

- `path`: Simplified jsonpath always starting with `$`
- `path`: Also supports document selectors with `$doc[n]` and `$doc[?(...)]` for multi-document YAML
- `value`: New value
- `valueType`: Desired final type

## Supported Path Syntax

Node navigation only:

- `$.app.name`
- `$.services[0].image`
- `$["api"]["base-url"]`
- `$doc[1].app.name`
- `$doc[2]["api"]["base-url"]`
- `$doc[?(kind=='Component')].metadata.name`
- `$doc[?(metadata.name!='legacy')].metadata.name`
- `$.items[?(kind=='Component')].metadata.name`
- `$.spec.components[?(kind=='Component')].fields[?(enabled==true)].name`

When the `$doc[n]` selector is not provided, the operation is applied to all YAML documents.

In filter selectors (`$doc[?(...)]`), simple comparisons are supported:

- Operators: `==` and `!=`
- Left side: Node navigation (e.g., `kind`, `metadata.name`, `["kind"]`)
- Right side: `string`, `number`, `boolean`, or `null`

In node path filters (`[?(...)]`), the same comparisons are supported at any level.
The `@` symbol is also accepted to represent the current item (e.g., `$.items[?(@.enabled==true)].name`).

Not supported in this version:

- Wildcard (`[*]`)
- Slices
- Value expressions

## Basic Example

```ts
import { setYamlValues } from 'yaml-setter'

const input = `app:
  name: old-name
  replicas: 1
  enabled: false
`

const output = setYamlValues(input, [
  { path: '$.app.name', value: 'new-name', valueType: 'string' },
  { path: '$.app.replicas', value: '3', valueType: 'number' },
  { path: '$.app.enabled', value: 'true', valueType: 'boolean' },
])

console.log(output)
```

## Development

```bash
npm test
npm run build
```
