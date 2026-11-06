# Documentação do Contador Tacta

Guia para quem vai dar manutenção no Contador Tacta. O [README da raiz](../README.md) diz o que a página faz e como o Tacta é pontuado; aqui está **como ela funciona por dentro** e **como mexer nela sem quebrar a contagem**.

| Documento | Para que serve |
|---|---|
| [TypeScript e Vite](typescript-e-vite.md) | Para quem nunca usou: o necessário para ler e alterar este código (TypeScript, Vite, Web Worker, Vitest), com exemplos dele |
| [Arquitetura](arquitetura.md) | Visão geral, pastas, papel de cada arquivo, caminho da foto até o placar, privacidade e PWA |
| [Algoritmo de visão](algoritmo.md) | Passo a passo da detecção: preparo da foto, candidatos, julgamento de cada ponto, agrupamento por cor e nomes |
| [Funcionalidades](funcionalidades.md) | Como cada parte da tela funciona: foto, placar, editor (tocar, arrastar, zoom, desfazer), instalação |
| [Manutenção](manutencao.md) | Receitas passo a passo (calibrar com fotos novas, mudar um limiar, investigar um ponto, publicar) e pontos frágeis conhecidos |

## Começo rápido

```sh
npm install
npm run dev          # servidor local
npm test             # testes (inclui as fotos reais de tests/fixtures/; leva uns 15 s)
npm run eval         # erro da contagem em cada foto, comparado com a contagem manual
npm run eval:robust  # a mesma avaliação com fotos reescaladas e com cor/brilho alterados
npm run build        # tsc (checagem de tipos) + vite build em dist/
```

No Windows, o `iniciar.bat` faz `npm install` (quando o `package-lock.json` muda) e abre o `npm run dev` com dois cliques.

Não há script de deploy: o GitHub Actions publica sozinho a cada push em `main` (ver [Manutenção](manutencao.md#publicar)).

## Onde estão os comentários

Todo arquivo de código começa com um comentário dizendo o papel dele e com quem ele conversa. Toda função, classe, método e tipo tem um `/** ... */` explicando o que faz. Comentários de linha aparecem só onde a lógica não é óbvia (o *porquê*, não o *quê*). Ao mudar o código, atualize o comentário junto.

Os comentários mais antigos estão em inglês (o código nasceu assim) e ficaram como estavam; os novos estão em português.

## Convenções

- Textos da interface em português do Brasil; nomes no código (variáveis, funções) em inglês, como já eram. Os ids das cores são em português (`laranja`, `amarelo`...).
- Sem backend e sem armazenamento: a foto fica só na memória da página (nada de `localStorage`/IndexedDB). Não acrescente gravação de foto sem decidir isso com o usuário: a promessa de privacidade está no rodapé da página e no README.
- O detector (`src/cv/`) não usa nada do navegador além de arrays: roda igual no Web Worker, nos testes e nos scripts de Node. Mantenha assim.
- `dist/` e `node_modules/` são gerados e ficam fora do git.
