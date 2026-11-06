# Funcionalidades

A página tem três estados, que são seções do `index.html` mostradas uma de cada vez por `show()` em `main.ts`: **início** (`#intro`), **contando** (`#busy`) e **resultado** (`#result`). A mensagem de erro (`#error`) aparece por cima de qualquer um.

## Início

- **Tirar ou escolher foto**: um `<label>` em volta do `<input type="file" accept="image/*">`. No celular, o sistema oferece a câmera ou a galeria.
- **Arrastar e soltar**: em qualquer lugar da janela; a área de soltar ganha a classe `over` enquanto há algo sendo arrastado. Só o primeiro arquivo de imagem é usado.
- **Dicas** e o resumo das regras ("Como o Tacta é pontuado?", num `<details>`) são texto fixo do HTML.
- Se a foto não abre (formato que o navegador não decodifica, como HEIC em alguns navegadores), volta ao início com "Não consegui abrir essa imagem...".

## Contando

Mostra o spinner enquanto `photo.ts` decodifica e o worker conta. O botão "Nova foto" já aparece; clicar nele descarta a resposta que ainda vai chegar (`requestId`).

## Resultado

À esquerda (ou em cima, no celular) o painel do placar; ao lado, a foto com as marcações.

### Placar (`ui/scoreboard.ts`)

- Uma linha por cor que tem pelo menos um ponto, do maior para o menor.
- **Empates dividem a posição**: a posição é a do primeiro com a mesma pontuação mais 1 (1º, 1º, 3º). Todas as cores em 1º ganham a classe `winner`.
- A barra de fundo de cada linha é proporcional ao maior placar.
- A animação de entrada (classe `animate`, com atraso de 60 ms por linha) roda só quando o resultado abre, não a cada correção.
- Abaixo: total de pontos visíveis e de cores, e os botões **Desfazer** e **Ocultar/Mostrar marcações**.

Se nenhum ponto for achado, o resultado abre mesmo assim, com o aviso para marcar à mão ou tentar outra foto.

### Foto e marcações (`ui/editor.ts`, classe `PhotoView`)

- Cada ponto é um círculo com contorno escuro e a cor do jogador por cima; o ponto selecionado ganha contorno branco. O raio do círculo acompanha o zoom (no mínimo 3,5 px).
- **Arrastar** move a foto (o arrasto só começa depois de 6 px, para um toque com o dedo tremendo não virar arrasto).
- **Zoom**: roda do mouse (em volta do cursor), pinça com dois dedos (em volta do ponto médio) e os botões +, − e ⤢ (enquadrar). O zoom vai de 80% do enquadramento até o ponto ficar com uns 40 px de raio.
- Ao redimensionar a janela, a foto é reenquadrada, a não ser que a pessoa já tenha mexido no zoom.
- O canvas usa o `devicePixelRatio`, para ficar nítido em telas de alta densidade.

### Corrigir a contagem

Tocar na foto (sem arrastar) abre o **popover** perto do toque:

- **Num ponto marcado** (área de toque generosa: 2,2× o raio do ponto, ou 16 px de tela, o que for maior): título "Ponto <cor>", botões das seis cores (a atual marcada) e **Remover ponto**. Escolher outra cor troca a cor do ponto.
- **Num lugar sem marcação**: "Adicionar ponto"; o lugar fica marcado com um círculo tracejado e escolher uma cor cria o ponto ali.
- Tocar de novo na foto com o popover aberto só fecha o popover. **Esc** também fecha.
- **Desfazer** (ou Ctrl/Cmd+Z) volta uma edição; o histórico guarda até 200.
- Com as marcações ocultas, tocar sempre abre "Adicionar ponto" (não há marcação para selecionar).

O placar é recalculado a cada correção. Uma cor nova adicionada à mão entra no placar; uma cor sem nenhum ponto sai dele.

## Instalar como app (`ui/install.ts`)

Quando o navegador avisa que o app é instalável (evento `beforeinstallprompt`, do Chrome), aparece o cartão "Instalar o Contador Tacta". **Instalar** abre o diálogo nativo (só pode ser aberto uma vez por evento); **Agora não** esconde o cartão até a próxima visita (nada é gravado). Depois de instalado (`appinstalled`), o cartão some. Em navegadores sem esse evento (Safari, Firefox), o cartão nunca aparece e a instalação é pelo menu do navegador.

## Offline

Depois da primeira visita, o service worker serve a página sem internet (ver [Arquitetura](arquitetura.md#dados-privacidade-e-pwa)). Como não há chamada de rede nenhuma, a contagem funciona igual offline.
