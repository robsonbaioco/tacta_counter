# Manutenção

Receitas para as mudanças mais comuns e a lista de pontos frágeis conhecidos.

Antes de terminar qualquer mudança: `npm test` e `npm run build` (faz a checagem de tipos). Se mexeu no detector, rode também `npm run eval` e `npm run eval:robust` e compare com o resultado de antes.

## Publicar

Não há comando de deploy. O workflow `.github/workflows/deploy.yml` roda a cada push em `main` (ou `master`), ou manualmente na aba Actions:

1. `npm ci` e `npm test` (se algum teste falhar, nada é publicado);
2. `npm run build` com `BASE_PATH=/<nome do repositório>/`;
3. envia o `dist/` para o GitHub Pages.

O site fica em <https://robsonbaioco.github.io/tacta_counter/>. Quem tem o app instalado recebe a versão nova na próxima vez que abrir.

## Calibrar com fotos novas

O detector foi ajustado com as fotos de `tests/fixtures/`. Para melhorar com mais exemplos:

1. Coloque a foto (JPEG, original da câmera) em `tests/fixtures/`. Não use fotos com pessoas ou outros dados que não devam ir para o repositório.
2. Conte os pontos à mão e acrescente em `tests/fixtures/expected.json`: `"arquivo.jpeg": { "laranja": 40, "azul": 38 }`. Sem contagem, use `null`: a foto entra no `eval` só para mostrar o resultado.
3. `npm run eval` mostra, por foto, `cor obtido/esperado (diferença)`, o raio típico estimado (`r=`), a cor de fundo estimada (`bg=`) e os grupos de matiz (`[laranja@9 ...]`), e no fim o erro total.
4. Uma foto com contagem entra sozinha no `detect.test.ts` (tolerância de ±3 por cor e também nos testes de mudança de cor). Se ela for difícil demais, o teste vai falhar: decida se ajusta o detector ou se a foto fica só no `eval` (com `null`).

Os scripts leem só JPEG (`jpeg-js`). Fotos HEIC ou PNG precisam ser convertidas antes.

## Investigar um ponto errado

```sh
npm run debug -- tests/fixtures/<foto>.jpeg saida.png              # imagem inteira
npm run debug -- tests/fixtures/<foto>.jpeg saida.png 800 600 300 200 4   # recorte x y largura altura, ampliado 4x
```

Gera um PNG com o que o detector viu: círculo grosso na cor atribuída = ponto aceito; fino **cinza** = recusado pela forma; **vermelho escuro** = recusado pelo anel (`ring` ou `uniform`); **ciano** = recusado pela área em volta (`region`). No console: contagem de cada `reason`, grupos de cor e placar. As coordenadas são as da imagem de trabalho (já reduzida para 2400 px).

Depois, com as coordenadas do ponto suspeito:

```sh
npx tsx scripts/probe.ts tests/fixtures/<foto>.jpeg 1234,567 1300,610
```

mostra as medidas dos dois candidatos mais próximos de cada coordenada (motivo, área, raio, alongamento, `fill`, `peak`, `colored`, `uniform`, cor, matiz, croma, área em volta). Para achar vários exemplos de uma vez:

```sh
npx tsx scripts/list.ts tests/fixtures/<foto>.jpeg "c.reason === 'region' && c.region > 3"
```

E para olhar a foto original de perto: `npx tsx scripts/crop.ts <foto.jpg> x y w h escala saida.png` (coordenadas da foto original, sem redução).

## Mudar um limiar

1. Ache o teste certo na tabela de [julgamento](algoritmo.md#6-julgamento-de-cada-candidato-detectts): `THRESHOLDS` em `src/cv/detect.ts` para pontos, `SPLIT` em `src/cv/palette.ts` para a divisão de cores, `PALETTE` para os nomes.
2. Anote o `npm run eval` e o `npm run eval:robust` de antes.
3. Mude **um** valor e rode os dois de novo. Um ajuste que melhora uma foto e piora outra costuma ser ajuste fino demais para as fotos de teste; prefira entender o caso com `debug`/`probe`.
4. `npm test`.

## Uma cor que o detector nomeia errado

Os nomes vêm de `PALETTE` (`hue` e `spread`). Se, com uma câmera ou luz, uma cor sai com matiz fora do esperado (o `eval` mostra a matiz de cada grupo, como `roxo@287`), ajuste o `hue` ou aumente o `spread` dela. O `spread` também é a tolerância que a divisão de grupos exige (2,2× o `spread`), então aumentar demais pode deixar passar divisões falsas.

## Ícones

Edite `public/icon.svg` e rode `npm run icons`: regera os PNG de `public/` (64, 192, 512, maskable e apple-touch) com fundo `#121216`. O favicon da aba é um SVG embutido no `index.html` (separado).

## Pontos frágeis conhecidos

- **Calibração com poucas fotos**: são duas fotos com contagem e uma sem. Os limiares podem estar ajustados demais para essas mesas e câmeras; foto nova que falha é material para `tests/fixtures/`.
- **Os scripts e o app decodificam o JPEG de jeitos diferentes** (`jpeg-js` no Node, o navegador na página, que ainda reduz a foto com `drawImage` em vez de `limitSize`). As cores podem variar um pouco: é para isso que existem os testes de mudança de cor e o `eval:robust`. Um resultado do `eval` não é garantia do mesmo número exato no celular.
- **Máximo de 6 cores**: com mais picos, os mais próximos são fundidos. Um objeto colorido grande sobre a mesa pode virar um "pico" e tomar um nome; o teste de área (`background`) só pega os acinzentados.
- **Nomes só pela matiz**: se só houver cores vizinhas (por exemplo laranja e rosa), uma delas pode receber o nome da outra numa luz muito diferente. A pessoa corrige pela troca de cor, mas a troca é ponto a ponto.
- **`confidence`** é calculada mas não é usada pela interface.
- **Buffer transferido**: depois do `postMessage` em `handleFile`, `photo.image.data` fica vazio na página. Qualquer código novo que precise dos pixels na página deve usar o canvas (`photo.canvas`) ou copiar os dados antes de enviar.
- **Memória**: uma foto de 2400 px ocupa dezenas de MB entre RGBA, planos e buffers do `RegionMeter`. Aumentar `WORK_MAX_SIDE` pode estourar a memória em celulares simples.
- **Versão nova só na próxima abertura**: por causa do `autoUpdate` sem recarregar a página, quem acabou de publicar e abriu o app pode ver a versão anterior uma vez.
