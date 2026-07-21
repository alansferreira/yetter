<div align="center">
  <h1>yetter</h1>
  <p>A JavaScript library to update YAML content safely using simplified JSONPath operations.</p>
  <a href="https://www.npmjs.com/package/yetter"><img alt="npm version" src="https://img.shields.io/npm/v/yetter"></a>
  <a href="https://www.npmjs.com/package/yetter"><img alt="npm downloads" src="https://img.shields.io/npm/dm/yetter"></a>
  <a href="https://www.npmjs.com/package/yetter"><img alt="npm license" src="https://img.shields.io/npm/l/yetter"></a>
  <a href="https://www.npmjs.com/package/yetter"><img alt="types" src="https://img.shields.io/npm/types/yetter"></a>
</div>

A JavaScript library for updating YAML content with:

- Support for multi-document YAML files (`---`)
- List of changes by simplified `jsonpath`
- Type coercion for new values (`string`, `number`, `boolean`, `null`, `array`, `object`)
- Focus on node updates and document selection by index/simple filter
- Compatibility with Node.js and browsers

## Installation

```bash
npm i yetter
```

### Installation Shortcuts

```bash
# npm
npm i yetter

# pnpm
pnpm add yetter

# yarn
yarn add yetter

# bun
bun add yetter
```

## API

```ts
import { setYamlValues, type YamlSetOperation } from 'yetter'
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

Node navigation and array iteration:

- `$.app.name`
- `$.services[0].image`
- `$["api"]["base-url"]`
- `$doc[1].app.name`
- `$doc[2]["api"]["base-url"]`
- `$doc[?(kind=='Component')].metadata.name`
- `$doc[?(metadata.name!='legacy')].metadata.name`
- `$.items[].name` - Wildcard: updates all array items
- `$.items[?(kind=='Component')].metadata.name`
- `$.spec.components[?(kind=='Component')].fields[?(enabled==true)].name`
- `$.apps[?(name=='app1')].versions[].replicas` - Filter then wildcard

When the `$doc[n]` selector is not provided, the operation is applied to all YAML documents.

### Array Iteration with Wildcard `[]` or `[*]`

Use `[]` or `[*]` to iterate and update all elements in an array:

```ts
// Update all items (using empty brackets)
const output = setYamlValues(input, [
  { path: '$.items[].enabled', value: 'true', valueType: 'boolean' },
])

// Or use [*] (same behavior)
const output = setYamlValues(input, [
  { path: '$.items[*].enabled', value: 'true', valueType: 'boolean' },
])

// Combine with property navigation
const output = setYamlValues(input, [
  { path: '$.services[].metadata.replicas', value: '3', valueType: 'number' },
])

// Combine filter and wildcard
const output = setYamlValues(input, [
  { path: "$.apps[?(name=='web')].versions[].ready", value: 'false', valueType: 'boolean' },
])
```

### Filter Selectors

In filter selectors (`$doc[?(...)]` and `[?(...)]`), simple comparisons are supported:

- Operators: `==` and `!=`
- Left side: Node navigation (e.g., `kind`, `metadata.name`, `["kind"]`)
- Right side: `string`, `number`, `boolean`, or `null`

In node path filters (`[?(...)]`), the same comparisons are supported at any level.
The `@` symbol is also accepted to represent the current item (e.g., `$.items[?(@.enabled==true)].name`).

Not supported in this version:

- Slices (`[1:3]`)
- Value expressions
- Complex boolean logic in filters

## Basic Example

```ts
import { setYamlValues } from 'yetter'

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
