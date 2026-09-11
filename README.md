# Contador Tacta

### 👉 [Abrir a demo](https://robsonbaioco.github.io/tacta_counter/)

## Proposta

Contar os pontos no fim de uma partida de **Tacta** é chato e sujeito a erro: são mais de 100 cartas espalhadas e
centenas de pontinhos brancos. Este projeto resolve isso com uma foto. Você fotografa a mesa, e a página:

- descobre sozinha **quais cores estão jogando**;
- conta os **pontos visíveis de cada cor**;
- mostra o **placar ordenado**, do maior para o menor, com empates;
- deixa **conferir e corrigir**: tocar num ponto troca a cor ou remove, e tocar num ponto esquecido adiciona.

**Privacidade:** tudo roda no seu navegador, sem servidor. A foto não é enviada nem gravada (sem
localStorage/IndexedDB); ela fica só na memória da página e some ao recarregar. Por isso o projeto é um site estático
hospedado no GitHub Pages.

## Como o Tacta é pontuado

Quando todos jogam suas cartas, a partida acaba. Cada jogador soma os **pontos brancos visíveis** nas cartas da
**sua cor**; pontos cobertos não valem. Maior soma vence, e empate é vitória compartilhada. Como uma carta nova
precisa cobrir *exatamente* uma forma de outra carta, cada ponto fica totalmente visível ou totalmente coberto. Por
isso basta achar os pontos brancos visíveis na foto e ver a cor da área onde cada um está.

## Como funciona a detecção (`src/cv/`)

1. **Preparo** (`image.ts`): reduz para até 2400 px e faz o balanço de branco usando os próprios traços brancos das cartas.
2. **Candidatos** (`blobs.ts`): manchas claras e compactas por limiar local adaptativo (duas sensibilidades).
3. **Validação** (`detect.ts`, `classify.ts`), para cada candidato:
   - tamanho parecido com o do ponto típico da foto, que é estimado automaticamente;
   - contraste forte contra a cor em volta, o que elimina a textura da mesa, do carpete e da madeira;
   - anel em volta colorido e uniforme, e diferente do "preto" das cartas (a cor desse fundo é estimada em cada foto);
   - a área colorida em volta tem que ser grande, e não o ícone pequeno do centro com o número.
4. **Cores** (`palette.ts`): agrupa os pontos pela matiz (com peso pelo croma). Um grupo é dividido em dois quando
   são duas cores de matiz próxima mas saturação bem diferente, como roxo e rosa. Os grupos recebem os nomes
   Laranja, Amarelo, Verde, Azul, Roxo e Rosa.

A contagem roda num Web Worker. O resultado de referência nas fotos de teste fica a no máximo ±2 pontos por cor
da contagem manual.

## Desenvolvimento

```bash
npm install
npm run dev          # servidor local
npm test             # testes (inclui as fotos reais em tests/fixtures)
npm run eval         # compara com a contagem manual (tests/fixtures/expected.json)
npm run eval:robust  # mesma avaliação com fotos reescaladas e com cores/brilho alterados
npm run debug -- tests/fixtures/<foto>.jpeg saida.png [x y w h escala]   # desenha o que o detector viu
npm run build        # gera dist/
```

Para calibrar com mais fotos, coloque-as em `tests/fixtures/` e a pontuação real em `expected.json`.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy.yml` testa, compila e publica a cada push em `main`/`master`.
Na primeira vez, em *Settings → Pages*, escolha **Source: GitHub Actions**. A página fica em
`https://<usuario>.github.io/tacta_counter/`.
