# yaml-setter

Biblioteca TypeScript para atualizar conteudo YAML com:

- suporte a mais de um documento YAML (`---`)
- lista de alteracoes por `jsonpath` simplificado
- coercao de tipo do novo valor (`string`, `number`, `boolean`, `null`, `array`, `object`)
- foco em atualizacao de nos e selecao de documento por indice/filtro simples
- compatibilidade com Node.js e navegador

## Instalacao

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
- retorno: `string` com YAML atualizado

### `YamlSetOperation`

```ts
type YamlValueType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'

interface YamlSetOperation {
  path: string
  value: unknown
  valueType: YamlValueType
}
```

- `path`: jsonpath simplificado sempre iniciando com `$`
- `path`: tambem aceita seletor de documento com `$doc[n]` e `$doc[?(...)]` para YAML multi-documento
- `value`: novo valor
- `valueType`: tipo final desejado

## Sintaxe de Path Suportada

Somente navegacao por nos:

- `$.app.name`
- `$.services[0].image`
- `$["api"]["base-url"]`
- `$doc[1].app.name`
- `$doc[2]["api"]["base-url"]`
- `$doc[?(kind=='Component')].metadata.name`
- `$doc[?(metadata.name!='legacy')].metadata.name`
- `$.items[?(kind=='Component')].metadata.name`
- `$.spec.components[?(kind=='Component')].fields[?(enabled==true)].name`

Quando o seletor `$doc[n]` nao e informado, a operacao e aplicada em todos os documentos do YAML.

No seletor de filtro (`$doc[?(...)]`), sao suportadas comparacoes simples:

- operadores: `==` e `!=`
- lado esquerdo: navegacao por nos (ex.: `kind`, `metadata.name`, `["kind"]`)
- lado direito: `string`, `number`, `boolean` ou `null`

Em filtros de path de nos (`[?(...)]`), as mesmas comparacoes sao suportadas em qualquer nivel.
Tambem e aceito `@` para representar o item atual (ex.: `$.items[?(@.enabled==true)].name`).

Nao suportado nesta versao:

- wildcard (`[*]`)
- slices
- expressoes por valor

## Exemplo Basico

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

## Desenvolvimento

```bash
npm test
npm run build
```
