# Algoritmo de visão (`src/cv/`)

O problema: numa foto de cima da mesa no fim da partida, achar **cada ponto branco visível** e dizer **a cor da área da carta onde ele está**. A soma por cor é o placar. Como no Tacta uma carta nova cobre exatamente uma forma de outra, cada ponto fica totalmente visível ou totalmente coberto: não há meio-ponto.

Não há aprendizado de máquina nem lista de cores em jogo: tudo é processamento de imagem clássico, com os parâmetros **estimados a partir da própria foto** (tamanho do ponto, brilho do branco, cor do fundo das cartas). Isso deixa o detector tolerante a resolução, distância da câmera e luz.

```
foto (RGBA)
  │  image.ts     limitSize (≤ 2400 px) → whiteBalance → computePlanes
  ▼
planos por pixel: white = min(R,G,B), hue, chroma = max − min, val = max
  │  blobs.ts     passada 1 (frouxa) → manchas claras
  ▼
estimativas da foto: raio típico do ponto, brilho típico, cor do "preto" das cartas
  │  blobs.ts     passada 2 (estrita) → mais manchas
  ▼
candidatos das duas passadas
  │  detect.ts    julgamento: tamanho, forma, anel, contraste, uniformidade, área em volta
  │               + remoção de duplicatas
  ▼
pontos aceitos (com a cor do anel em volta)
  │  palette.ts   histograma de matiz → picos → grupos → divisão roxo/rosa → nomes
  ▼
DetectionResult: pontos com cor, cores em jogo, placar ordenado
```

A entrada é `countDots(image)` em `index.ts`, que só encadeia `detectCandidates` (detect.ts) e `assignColors` (palette.ts).

## 1. Preparo da foto (`image.ts`)

**Redução** (`limitSize`): se o maior lado passar de `WORK_MAX_SIDE` (2400 px), a imagem é reduzida pela média de cada bloco de pixels (média de área, que não cria serrilhado). Nunca amplia.

**Balanço de branco** (`whiteBalance`): as marcas brancas das cartas (pontos, contornos, ícones) servem de referência de branco.
1. Faz o histograma do menor canal de cada pixel (`min(R,G,B)`): só pixels quase brancos têm esse valor alto.
2. Pega o limiar do 1% mais claro e tira a média de R, G e B desses pixels, descartando os estourados (algum canal em 255, que já perderam a cor).
3. Multiplica cada canal pelo ganho que deixa essa média neutra (cinza): `ganho = maior média / média do canal`.

Com menos de 50 pixels de referência, a foto fica como está. Isso tira o tom amarelado de luz quente e o azulado de luz fria antes de qualquer decisão de cor.

**Planos** (`computePlanes`): calcula uma vez, para cada pixel:

| Plano | Valor | Para quê |
|---|---|---|
| `white` | `min(R,G,B)` | alto só em branco/cinza claro: é o "quanto é branco" |
| `hue` | matiz HSV, 0–359° | a cor da carta |
| `chroma` | `max − min` | quanto de cor; ao contrário da saturação HSV, fica baixo em pixels escuros meio tingidos |
| `val` | `max(R,G,B)` | brilho |

## 2. Candidatos: manchas claras (`blobs.ts`)

`findBrightBlobs` marca um pixel se ele for **ao mesmo tempo**:
- branco o bastante: `white ≥ minWhite`;
- bem mais branco que a vizinhança: `white > média local + delta`. A média local é a de uma janela quadrada de lado `2·win + 1`, calculada para todos os pixels de uma vez com uma **imagem integral** (`boxMean` em image.ts). Comparar com a vizinhança, e não com um valor fixo, tolera sombra e luz desigual na mesa.

Os pixels marcados são agrupados em manchas por vizinhança de 8 (incluindo diagonais), com uma pilha (sem recursão). Manchas maiores que `maxArea` são descartadas (contornos longos, reflexos). Para cada mancha restante:

| Medida | O que é |
|---|---|
| `x`, `y` | centro de massa |
| `area`, `r` | número de pixels e raio de um disco com a mesma área |
| `elong` | alongamento: raiz da razão entre os autovalores da covariância dos pixels (1 = disco; traços dão valores altos) |
| `fill` | área / área do retângulo envolvente (um disco pequeno dá ~0,7–0,8) |
| `peak` | maior valor de `white` dentro da mancha |

## 3. Estimativas da foto (`detect.ts`, passada 1)

Os tamanhos são pensados para fotos de ~1600 px e multiplicados por `scale = maior lado / 1600`.

1. **Passada frouxa**: `win = 10·scale`, `delta = 25`, `minWhite = 100`, `maxArea = 600·scale²`.
2. **Manchas compactas**: área ≥ 3, `elong ≤ 1,8`, `fill ≥ 0,5`.
3. **Brilho de referência** (`roughPeak`): percentil 90 do `peak` das compactas. Pontos e contornos são as coisas mais brancas da foto; a textura da mesa gera muitas manchas, mas mais apagadas.
4. **Cor do "preto" das cartas** (`estimateCardBackground` em classify.ts): o fundo das cartas raramente sai preto na foto (fica marrom ou cinza com luz quente e reflexo). Como toda marca branca de uma carta é impressa sobre esse fundo, e a mesa nunca encosta direto numa marca branca, a cor mais comum num anel estreito (raio `r+1` a `r+3`) em volta das manchas claras é a do fundo. Só entram pixels escuros (`val` entre 15 e `0,65·roughPeak`) e pouco coloridos (`chroma ≤ 80`). As cores vão para um histograma 3D de 16×16×16 caixas; vence a caixa cuja vizinhança 3×3×3 soma mais (robusto a cores na borda entre caixas), e o resultado é a média das cores dessa caixa.
5. **Limiar de branco impresso**: `ctx.white = 0,8·roughPeak` (acima disso um pixel do anel conta como branco, não como cor).
6. **Ponto típico**: entre as compactas com `peak ≥ 0,6·roughPeak`, ficam as que têm o anel em volta bem colorido e uniforme (`colored > 0,7`, `uniform > 0,7`) e contraste ≥ 65. A **mediana** do raio delas vira `dotRadius` (raio típico do ponto nesta foto) e a do `peak`, `dotPeak`. Se não sobrar nenhuma, usa `2·scale` e 200.

## 4. Passada 2 (estrita)

Sobre amarelo (cor clara), a passada frouxa às vezes funde um ponto com um contorno branco vizinho numa mancha só, que é recusada pelo formato. Uma segunda passada com `delta = 50` e `minWhite = 0,8·dotPeak` separa os dois. As manchas das **duas** passadas são julgadas; as duplicatas saem no fim.

## 5. O anel em volta (`classify.ts`)

Para cada candidato, `ringPixels` amostra pixels em circunferências entre os raios `r0 = r + max(1; 0,35r)` e `r1 = r + max(2; 0,9r)` do raio típico (fora do ponto, ainda dentro da área colorida). `ringStats` resume o anel:

| Campo | Cálculo |
|---|---|
| `colored` | fração das amostras que são "cor de carta": `chroma ≥ 14`, `chroma ≥ 8%` do brilho, não branca (`white < ctx.white`) e a mais de 32 (no maior canal) da cor do fundo |
| `rgb` | cor dominante: mediana de R, G e B das amostras coloridas |
| `uniform` | fração das amostras a até `colorTolerance(rgb)` da dominante (`max(30; 22%` do maior canal`)`) |
| `hue`, `chroma`, `val` | da cor dominante |
| `bgDist` | distância da dominante até a cor do fundo |

## 6. Julgamento de cada candidato (`detect.ts`)

Candidatos com área < 2 ou raio > 2,5× o típico nem entram na lista. Os demais passam pelos testes **nesta ordem**; o primeiro que falha vira o `reason`:

| `reason` | Recusa quando | Por quê |
|---|---|---|
| `small` | raio < 0,55× o típico | sujeira, textura |
| `big` | raio > 1,7× o típico | reflexo, ícone |
| `elong` | alongamento > 1,9 | pedaço de contorno |
| `fill` | `fill < 0,45` | forma irregular |
| `ring` | `colored < 0,4` | não está sobre área colorida (mesa, fundo preto) |
| `dim` | `peak < 0,5·dotPeak` ou contraste (`peak` menos o menor canal da cor do anel) < 65 | pontos impressos se destacam muito da cor em volta; textura de carpete ou madeira, pouco. Brilho absoluto não serve: o JPEG "vaza" o amarelo para dentro dos pontos |
| `uniform` | `uniform < 0,4`, ou `< 0,85` se o anel for "apagado" (perto do fundo, `bgDist < 60`, ou croma < 75) | um anel apagado se confunde com o fundo preto da carta, então precisa ser bem mais uniforme |
| `region` | área da mesma cor em volta < 4 áreas de ponto, ou alcance < 4 raios | ver abaixo |
| `background` | anel acinzentado (croma < 45 ou perto do fundo) e área ≥ 200 áreas de ponto | cor apagada espalhada por uma área enorme é a mesa ou um objeto, não uma carta |
| `ok` | passou em tudo | aceito |

**Área em volta** (`RegionMeter.measure`): um "balde de tinta" (busca em largura, 4 vizinhos) a partir dos pixels do anel, que se espalha por pixels a até `colorTolerance` da cor do anel, limitado a `regionCap` (400 áreas de ponto). Mede a área preenchida e a maior distância alcançada a partir do centro. É o teste que separa o ponto do **ícone central** da carta: o número branco do ícone fica numa área colorida pequena, que alcança só 2–3 raios; um ponto de verdade sempre está numa área que vai além, até no menor triângulo de um ponto só. O array `stamp` guarda o id da medição em cada pixel visitado, para não precisar zerar nada entre um candidato e outro.

**Duplicatas** (`suppressDuplicates`): entre os aceitos, ordenados do mais redondo e cheio (`fill / elong`) para o menos, um ponto a menos de 2 raios típicos de outro já mantido é recusado como `duplicate`.

Os limiares ficam todos em `THRESHOLDS` (e `SPLIT`, em palette.ts). O motivo de cada recusa aparece no `npm run debug` (ver [Manutenção](manutencao.md#investigar-um-ponto-errado)).

## 7. Cores (`palette.ts`)

O detector não sabe quantas pessoas jogaram nem com que cores: descobre pela foto.

1. **Peso pela confiança da matiz** (`hueWeight`): `(croma − 20) / 60`, limitado entre 0,05 e 1. Cores lavadas (reflexo, roxo fraco) têm matiz que muda muito com um pequeno erro de balanço de branco; elas quase não influenciam *quais* cores existem e só são encaixadas na mais próxima depois.
2. **Histograma circular** de 360 caixas das matizes dos anéis dos pontos aceitos, cada uma espalhada por uma gaussiana de desvio 5° (`BIN_SIGMA`), com o peso acima. Circular: 359° e 0° são vizinhos.
3. **Picos** (`findPeaks`): máximos locais numa janela de ±6°. A "massa" de cada pico é a soma das caixas mais próximas dele que de outro pico; picos com massa abaixo de `max(4; 3%` do peso total`)` são ignorados. Com mais de 6 picos, o par mais próximo é fundido até sobrar 6.
4. **Grupos**: cada ponto vai para o pico de matiz mais próxima.
5. **Divisão** (`trySplit`): duas cores podem ter matiz parecida e saturação muito diferente (roxo puxando para magenta ao lado do rosa) e cair num pico só. Para cada grupo, enquanto houver menos de 6, tenta um **2-means no plano de croma** (cada ponto vira um vetor com ângulo = matiz e comprimento = croma), começando pelo eixo principal da nuvem, por até 20 iterações. Aceita a divisão só se:
   - cada metade tem ≥ 8 pontos (grupo com ≥ 16);
   - a distância entre os centros é ≥ 3× o espalhamento dentro das metades;
   - as matizes das metades diferem ≥ 7° (o reflexo baixa o croma sem mudar a matiz e não pode criar uma cor falsa);
   - as duas metades têm croma médio ≥ 60;
   - depois de dar nomes, todos os grupos ficam a até 2,2× a tolerância (`spread`) da matiz típica da cor que receberam (um realce estourado do laranja não pode virar "amarelo").
6. **Nomes** (`namePeaks`): a matiz média de cada grupo é casada com uma cor de `PALETTE`, sem repetir nome, minimizando a soma de `(distância de matiz / spread)²`. Com no máximo 6 grupos e 6 nomes, a busca é exaustiva (com poda).

| Cor | Matiz típica | `spread` |
|---|---|---|
| Laranja | 8° | 15° |
| Amarelo | 38° | 12° |
| Verde | 85° | 20° |
| Azul | 210° | 20° |
| Roxo | 265° | 35° (a câmera mostra o roxo de violeta a magenta) |
| Rosa | 338° | 15° |

O `rgb` de cada cor em `PALETTE` é só a cor desenhada na interface; não entra na detecção.

7. **Resultado**: cada ponto recebe o nome do seu grupo e uma `confidence` (`colored × uniform` do anel, até 1; hoje a interface não usa). `scoresOf` conta os pontos por cor e ordena do maior para o menor (empate: ordem de `COLOR_ORDER`).

## Desempenho

Tudo é feito com arrays tipados (`Uint8Array`, `Float32Array`...) e laços simples, sem bibliotecas. Uma foto de celular leva poucos segundos no worker; nos testes do Node, cada foto de referência leva alguns segundos (o `npm run eval` mostra o tempo de cada uma).

## Qualidade medida

Nas duas fotos com contagem manual (`tests/fixtures/expected.json`), o resultado fica a até ±2 pontos por cor (o teste aceita ±3, porque a própria contagem manual de pontos pequenos pode errar). Os testes também exigem as mesmas cores e erro ≤ 5 com a foto mais quente, mais fria ou mais escura. A foto da mesa de vidro não tem gabarito: só precisa dar as 5 cores certas com placares plausíveis (entre 26 e 69).
