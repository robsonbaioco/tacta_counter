# Arquitetura

> Nunca mexeu com TypeScript ou Vite? Leia antes [TypeScript e Vite](typescript-e-vite.md).

Página única em **TypeScript + Vite**, sem framework de interface (o DOM é manipulado direto) e sem backend. A contagem roda num **Web Worker**, para a página não travar. É publicada como site estático no GitHub Pages e pode ser instalada como app (PWA).

```
Navegador
├── index.html + src/main.ts ── estado da tela (pontos, histórico, popover)
│     ├── ui/photo.ts ──────── decodifica a foto e reduz para 2400 px
│     ├── ui/editor.ts ─────── canvas com a foto e as marcações (arrastar, zoom, toques)
│     ├── ui/scoreboard.ts ─── placar
│     └── ui/install.ts ────── cartão "Instalar"
├── worker.ts (Web Worker) ── src/cv/ (detector: pontos + cores + placar)
└── service worker (gerado pelo vite-plugin-pwa) ── cópia offline dos arquivos do app, nunca das fotos
```

## Pastas

```
index.html              página única: seções intro / busy / result, popover, cartão de instalação; carrega src/main.ts
src/
  main.ts               ponto de entrada: liga HTML, worker, editor e placar; guarda os pontos e o histórico
  worker.ts             Web Worker que chama countDots e devolve o resultado
  styles.css            todo o visual (tema escuro, layout do resultado, popover, placar)
  cv/                   o detector (não depende do navegador; ver algoritmo.md)
    index.ts            countDots(): detectCandidates + assignColors; reexporta o que a interface usa
    types.ts            tipos compartilhados (RGBAImage, Dot, ColorName, DetectionResult...)
    image.ts            redução de tamanho, balanço de branco, planos por pixel, média local
    blobs.ts            manchas claras por limiar adaptativo + rotulagem
    classify.ts         fundo preto das cartas, anel em volta do ponto, área colorida em volta
    detect.ts           as duas passadas, o julgamento de cada candidato e os limiares (THRESHOLDS)
    palette.ts          agrupamento por matiz, divisão de grupos, nomes das cores, placar (scoresOf)
    color.ts            RGB -> HSV, distância e média de matizes
  ui/
    photo.ts            arquivo -> canvas + pixels (respeita a rotação EXIF)
    editor.ts           classe PhotoView: desenho, gestos e toques
    scoreboard.ts       lista do placar com empates
    install.ts          botão de instalação do PWA
public/                 ícones (copiados como estão para dist/)
scripts/                ferramentas de calibração em Node (tsx): eval, debug, probe, list, crop
tests/                  Vitest: unit.test.ts (sintético) e detect.test.ts (fotos reais em fixtures/)
vite.config.ts          base, worker em módulo ES, PWA (manifest + workbox) e configuração do Vitest
pwa-assets.config.ts    geração dos ícones PNG a partir de public/icon.svg (npm run icons)
.github/workflows/      deploy.yml: testa, compila e publica no GitHub Pages
iniciar.bat             atalho do Windows para npm install + npm run dev
```

## Caminho da foto até o placar

1. A pessoa escolhe/tira a foto (`<input type="file">`) ou arrasta uma imagem para a página. `main.ts` chama `handleFile`.
2. `photo.ts` decodifica com `createImageBitmap` (com `imageOrientation: 'from-image'`, para fotos de celular deitadas), reduz para no máximo `WORK_MAX_SIDE` (2400 px) num canvas e lê os pixels.
3. `main.ts` envia os pixels ao worker com `postMessage(msg, [buffer])`: o buffer é **transferido**, não copiado (fica inutilizável na página, que guarda só o canvas para exibir).
4. `worker.ts` roda `countDots` e devolve `{ id, result }` ou `{ id, error }`. O `id` permite ignorar a resposta de um pedido antigo (a pessoa trocou de foto ou clicou em "Nova foto" no meio).
5. `start` converte os pontos em `EditorDot` (com `id` próprio), entrega a foto e os pontos ao `PhotoView` e chama `update`, que recalcula o placar com `scoresOf` e desenha tudo.
6. Cada correção (trocar cor, remover, adicionar) passa por `edit`, que guarda uma cópia para o Desfazer e chama `update` de novo. O placar sempre é recalculado a partir da lista de pontos atual: não existe contador separado.

As coordenadas dos pontos são sempre as da **imagem de trabalho** (a reduzida). Como `photo.ts` reduz a foto com o mesmo limite que o detector, a imagem exibida e a analisada têm o mesmo tamanho, e o editor não precisa converter nada.

## Estado

Tudo em variáveis de módulo de `main.ts`, só na memória:

| Variável | O que guarda |
|---|---|
| `dots` | pontos atuais (`{ id, x, y, color }`) |
| `history` | cópias de `dots` antes de cada edição (até 200) |
| `nextId` | próximo id de ponto |
| `showMarks` | se as marcações estão visíveis |
| `popTarget` | ponto tocado (ou lugar vazio) enquanto o popover está aberto |
| `requestId` / `waiting` | pedido atual ao worker e as promessas à espera de resposta |

O estado de visualização (zoom, posição, gesto em andamento, seleção) fica dentro do `PhotoView`.

## Dados, privacidade e PWA

- **Nada é gravado nem enviado.** Não há `localStorage`, IndexedDB, cookies nem chamadas de rede: a foto vive no canvas e some ao recarregar. O texto do rodapé e o README prometem isso.
- **Service worker**: gerado no build pelo `vite-plugin-pwa` (Workbox), guarda só os arquivos do próprio app (`**/*.{js,css,html,svg,png,ico}`) para abrir sem internet. `registerType: 'autoUpdate'`: uma versão nova é baixada em segundo plano e entra na próxima vez que o app é aberto, nunca recarregando uma página com foto em andamento. `cleanupOutdatedCaches` apaga os caches antigos.
- **Manifest**: também gerado pelo plugin, a partir de `vite.config.ts` (nome, cores `#121216`, ícones de `public/`).
- **Endereço**: `base` é `/tacta_counter/` (ou o `BASE_PATH` que o workflow passa, `/<nome do repositório>/`). O `npm run dev` também serve em `/tacta_counter/`.

## Dependências

Só de desenvolvimento (a página publicada não carrega biblioteca nenhuma):

| Pacote | Para quê |
|---|---|
| `typescript` | checagem de tipos (`tsc --noEmit` no build) |
| `vite` | servidor de desenvolvimento e build |
| `vite-plugin-pwa` | manifest e service worker |
| `@vite-pwa/assets-generator` | `npm run icons` |
| `vitest` | testes |
| `tsx` | roda os scripts `.ts` de `scripts/` no Node |
| `jpeg-js`, `pngjs` | ler JPEG e gravar PNG no Node (testes e scripts) |
