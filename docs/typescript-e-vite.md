# TypeScript e Vite para quem nunca usou

O mínimo para ler e alterar o Contador Tacta. Todos os exemplos são trechos do próprio código. Não há React nem outro framework: a interface é HTML comum manipulado por TypeScript.

## TypeScript em uma página

TypeScript é JavaScript com **tipos** escritos no código. O navegador não entende TypeScript: o Vite tira os tipos na hora de servir/compilar, e o `tsc` (o compilador) só confere se os tipos batem. Por isso o `npm run build` começa com `tsc --noEmit`: ele **não gera arquivo**, só reclama se algo estiver errado.

### Anotações de tipo

Depois do nome vem `: tipo`. Em funções, os parâmetros e o retorno:

```ts
// src/cv/color.ts
export function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
```

Variáveis com valor inicial não precisam de anotação: `const d = ...` já é `number`.

### Interfaces: o formato de um objeto

```ts
// src/cv/types.ts
export interface Dot {
  x: number;
  y: number;
  r: number;
  color: ColorName;
  /** 0..1, how sure the detector is this is a real dot of this color. */
  confidence: number;
}
```

Qualquer objeto com esses campos "é" um `Dot`. Se faltar um campo ou o tipo estiver errado, o `tsc` acusa. `extends` acrescenta campos a outra interface (`interface Candidate extends Blob { ... }` em detect.ts).

### Uniões: um valor entre poucos possíveis

```ts
export type ColorName = 'laranja' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'rosa';
```

Uma variável `ColorName` só aceita essas seis strings: escrever `'vermelho'` dá erro de compilação. O mesmo truque aparece em `show(section: 'intro' | 'busy' | 'result')` (main.ts) e no gesto do editor, que é `{ kind: 'pan'; ... } | { kind: 'pinch'; ... } | null`: depois de testar `g.kind === 'pan'`, o TypeScript sabe quais campos existem.

### `Record`, arrays e tuplas

```ts
export const PALETTE: Record<ColorName, PaletteEntry> = { laranja: {...}, amarelo: {...}, ... };
```

`Record<Chave, Valor>` é um objeto com uma entrada para **cada** chave: esquecer uma das seis cores dá erro. `number[]` é um array de números; `[number, number, number]` é uma tupla de exatamente três (usada para cores RGB).

### Arrays tipados

O detector trabalha com `Uint8Array`, `Uint16Array`, `Int32Array`, `Float32Array`, `Float64Array` e `Uint8ClampedArray`: arrays de tamanho fixo de um tipo numérico só, muito mais rápidos e econômicos que `number[]` para milhões de pixels. `Uint8ClampedArray` é o formato dos pixels do canvas: valores de 0 a 255, e o que passar disso é "grampeado" (300 vira 255), por isso `out[o] = data[o] * gr` em `whiteBalance` não precisa de `Math.min`.

### Genéricos

```ts
// src/main.ts
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const file = $<HTMLInputElement>('file');   // file.value, file.files... existem
```

`<T>` é um tipo passado como parâmetro. `as T` é uma **afirmação**: "confie em mim, é desse tipo" (o TypeScript não confere; se o id não existir, o erro aparece só na hora de rodar).

### `?.`, `??` e `!`

- `e.dot?.color`: se `e.dot` for nulo, o resultado é `undefined` em vez de erro.
- `process.env.BASE_PATH ?? '/tacta_counter/'`: usa o da direita se o da esquerda for nulo/indefinido.
- `t.dot!.id`: "garanto que não é nulo aqui".

### Módulos

Cada arquivo é um módulo: só o que tem `export` pode ser importado por outro.

```ts
import { countDots, type DetectionResult, type RGBAImage } from './cv';
```

`'./cv'` é a pasta: o import busca o `index.ts` dela. `type` marca imports que são só de tipo (somem no JavaScript final).

### Classes

`PhotoView` (editor.ts) é a única classe da interface. `private` deixa o campo/método visível só dentro da classe; `readonly`, que não pode ser trocado depois do construtor. No construtor, `private readonly host: HTMLElement` declara e preenche o campo de uma vez.

### Configuração (`tsconfig.json`)

`strict: true` liga todas as checagens rígidas (por exemplo, não deixa usar um valor que pode ser nulo sem testar). `noUnusedLocals`/`noUnusedParameters` acusam variáveis e parâmetros sem uso: se você remover o uso de algo, remova o algo também. `include` lista o que o `tsc` confere: `src`, `tests`, `scripts` e `vite.config.ts`.

## Vite

O Vite faz duas coisas:

- **`npm run dev`**: servidor local que entrega os `.ts` já convertidos e recarrega a página ao salvar.
- **`npm run build`**: junta e minifica tudo em `dist/`, pronto para publicar. `npm run preview` serve o `dist/` para testar o resultado.

Pontos que aparecem neste projeto:

- O `index.html` da raiz é a entrada: `<script type="module" src="/src/main.ts">` aponta para o TypeScript, e o Vite resolve o resto a partir dos imports.
- `import './styles.css'` em main.ts: o Vite injeta o CSS na página.
- `public/` é copiado como está para `dist/` (ícones).
- `base` (em `vite.config.ts`) é o caminho onde o site vai morar (`/tacta_counter/` no GitHub Pages); o Vite prefixa todos os endereços com ele.
- `process.env.BASE_PATH` em `vite.config.ts` lê uma variável de ambiente, que o workflow de deploy define.

## Web Worker

Um worker é um script que roda numa thread separada da página: pode fazer conta pesada sem travar a tela, mas não acessa o DOM. Página e worker conversam por mensagens:

```ts
// src/main.ts: cria o worker e envia a foto
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
worker.postMessage(msg, [photo.image.data.buffer]);   // o 2º argumento transfere o buffer em vez de copiar

// src/worker.ts: recebe, calcula e responde
self.onmessage = (e: MessageEvent<WorkerRequest>) => { ... postMessage(msg) };
```

O `new URL('./worker.ts', import.meta.url)` é a forma que o Vite reconhece para empacotar o worker como um arquivo próprio. `worker: { format: 'es' }` em `vite.config.ts` faz o worker usar `import` como o resto.

## Vitest (testes)

```ts
// tests/unit.test.ts
describe('colour helpers', () => {
  it('measures hue distance around the circle', () => {
    expect(hueDist(350, 10)).toBe(20);
  });
});
```

`describe` agrupa, `it` é um teste, `expect(valor).toBe(esperado)` confere. `npm test` roda todos os `*.test.ts`. Os testes de fotos reais demoram: `testTimeout: 60_000` em `vite.config.ts` dá até 60 s por teste. O `_` em `60_000` é só separador de milhar.

## Scripts em Node (`tsx`)

Os arquivos de `scripts/` rodam no Node, fora do navegador, com o `tsx` (que executa TypeScript direto): `npm run eval` é `tsx scripts/eval.ts`. Eles importam o mesmo detector de `src/cv/` e leem as fotos com `scripts/nodeImage.ts`. Argumentos depois de `--` vão para o script: `npm run debug -- foto.jpeg saida.png`.

## PWA (`vite-plugin-pwa`)

O plugin, configurado em `vite.config.ts`, gera no build o `manifest.webmanifest` (nome, ícones, cores) e o service worker (com Workbox), e injeta no HTML o script que registra o service worker (`injectRegister: 'script'`). No `npm run dev` o service worker fica desligado; para testar a parte offline use `npm run build && npm run preview`.
