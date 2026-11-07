# MultiPoke Autocaptura

Extensão local para o Google Chrome que clica em **Capturar** no MultiPoke Idle e adiciona o painel **Auto Loja** para repor suprimentos, vender loot e vender Pokémon por qualidade e IV total.

A versão atual é a **1.5.6**, disponível na branch principal [`main`](https://github.com/AntonioF2/multipoke-autocaptura/tree/main).

## Instalação no Chrome

1. Entre no GitHub com uma conta que tenha acesso ao repositório privado.
2. Abra a [branch principal](https://github.com/AntonioF2/multipoke-autocaptura/tree/main) e clique em **Code → Download ZIP**. Extraia o arquivo para uma pasta de sua escolha.
3. No mesmo perfil do Chrome que você usa para jogar, abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém o arquivo `manifest.json`.
5. Confira se **MultiPoke Autocaptura** aparece na lista. Se quiser deixar o ícone à mão, abra o menu de extensões do Chrome e fixe a extensão na barra.

Se preferir clonar o repositório, use o comando abaixo e selecione a pasta clonada no passo 4.

```bash
git clone https://github.com/AntonioF2/multipoke-autocaptura.git
```

[Guia do Chrome para carregar extensões locais](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Guia do GitHub para baixar um ZIP](https://docs.github.com/pt/repositories/working-with-files/using-files/downloading-source-code-archives)

## Como ativar

1. Abra [multipoke.io/jogar](https://multipoke.io/jogar) e entre no jogo.
2. Ao abrir ou recarregar a página, a Autocaptura inicia e o painel **Auto Loja**, com o Dragonite no cabeçalho, aparece automaticamente.
3. Clique na **seta** para expandir ou recolher o painel. Segure e arraste a **faixa vermelha** para mover a janela. Com o cabeçalho em foco, as setas do teclado também movem o painel. A posição fica salva no navegador.
4. Configure as compras e vendas desejadas e clique em **Iniciar Auto Loja**. **Pausar Auto Loja** interrompe as operações e libera os campos para edição.

Para ativar manualmente, use o ícone **MultiPoke Autocaptura** com a aba do jogo selecionada. No Windows, você também pode executar `Ativar Autocaptura.bat` depois de instalar a extensão.

## Autocaptura

A extensão procura o botão **Capturar** nos painéis normal e de economia e aciona o clique quando o botão está visível e habilitado. O próprio jogo processa a tentativa com a Poké Bola selecionada nele.

Se você selecionar uma Poké Bola para reposição, a Autocaptura acompanha o estoque dessa bola mesmo com a Auto Loja pausada ou com o painel recolhido. Ela aguarda quando o estoque chega a zero e retoma assim que a mochila volta a ter pelo menos uma unidade. Para capturar sem esse controle de estoque, escolha **Sem reposição** no campo **Poké Bola**.

Use o botão roxo **Autocaptura ligada** no painel Auto Loja para desligar só a captura. Clique em **Autocaptura desligada** para ligar de novo. Esse botão funciona independentemente das compras e vendas. O ícone da extensão também liga a captura, e o comando `multiPokeCaptura.parar()` no console pode desligá-la. Ao recarregar a página, a Autocaptura volta a iniciar e o painel carrega com o botão **Iniciar Auto Loja** disponível.

## Reposição de Poké Bolas e poções

1. Abra o **Auto Loja** e aguarde a leitura automática do saldo e do estoque.
2. Escolha uma **Poké Bola**, uma **Poção** ou ambas. Use **Sem reposição** na categoria que você não quer comprar.
3. Em **Até**, informe o estoque que dispara a compra. Em **Comprar**, informe quantas unidades quer adquirir a cada compra.
4. Defina a **Reserva de Pokédollars**, que é o saldo mínimo que deve sobrar após a compra.
5. Clique em **Iniciar Auto Loja**. A extensão só compra a quantidade configurada quando o saldo comporta a compra inteira e a reserva. O painel informa quanto falta quando o saldo impede a reposição.

Por exemplo, **Até 10** e **Comprar 50** repõem 50 unidades quando restarem 10 ou menos. Use **Até 0** para repor apenas quando o estoque acabar.

## Venda de loot

Abra **Regras de loot** e use a busca por nome ou ID para encontrar itens da Pokepédia, inclusive os que ainda não estão na mochila. Selecione **Vender**, **Proteger** ou **Sem regra** para cada item.

| Modo de venda automática | Comportamento |
| --- | --- |
| **Desligada** | Mantém a venda automática de loot pausada. |
| **Somente marcados para venda** | Vende apenas o loot elegível marcado como **Vender**. |
| **Loot barato, exceto protegidos** | Vende todo loot elegível, incluindo itens **Sem regra**, e preserva os marcados como **Proteger**. |

Nos dois modos, o loot precisa constar no catálogo como elegível, aparecer na loja do jogo e valer até **100 Pokédollars por unidade**. Poké Bolas, poções e pedras de evolução ficam fora da lista de venda automática de loot.

## Venda de Pokémon

1. Expanda **Venda de Pokémon** e marque **Ativar venda de Pokémon**.
2. Preencha **Qualidade abaixo de**, **IV total abaixo de** ou ambos. Um campo em branco deixa aquele critério de fora.
3. Se preencher os dois, escolha **E** para exigir ambos ou **OU** para aceitar qualquer um.
4. Clique em **Iniciar Auto Loja**.

Com qualidade abaixo de **1,30** e IV total abaixo de **80**, o modo **E** exige os dois limites e o modo **OU** exige pelo menos um. Um Pokémon com qualidade exatamente **1,30** só pode passar pelo critério de IV. O mesmo vale para IV exatamente **80** em relação ao critério de qualidade.

A extensão vende até **20 Pokémon por venda**. Ela percorre o inventário do treinador em qualquer hunt ativa, priorizando as capturas mais antigas. Durante a venda automática, aplica os critérios do Auto Loja e restaura os filtros manuais da loja ao terminar. Iniciais, Pokémon da equipe ou da reserva, trancados, Shiny e Holo ficam protegidos, assim como os de qualidade **Lendária ou superior** (a partir de **1,70**). Se houver Pokémon selecionados manualmente na loja, o Auto Loja pausa antes de vender.

## Quando o Auto Loja funciona

- Com o painel aberto e a aba em foco, o estoque é lido a cada **5 segundos**, quando a loja está disponível.
- Durante a caçada, com a aba do jogo em foco, a reposição verifica o estoque a cada **5 segundos** e as vendas rodam a cada **30 segundos**. O painel pode ficar recolhido depois que você iniciar.
- A Poké Bola, a poção, os valores de reposição, as regras de loot e os filtros de Pokémon ficam salvos por treinador no navegador. Ao reabrir, escolha o modo de venda de loot ou marque a venda de Pokémon novamente e inicie o Auto Loja.
- O painel pausa se o jogo apresentar uma confirmação diferente da seleção esperada ou se a operação ficar sem comprovante. Confira o inventário e o saldo antes de iniciar novamente.

## Como atualizar

1. Atualize os arquivos na pasta que o Chrome carrega. Se você clonou o repositório, abra a branch `main` com `git switch main` e execute `git pull --ff-only` dentro da pasta do projeto. Se usou ZIP, baixe e extraia a versão nova na pasta da extensão.
2. Em `chrome://extensions`, clique em **Recarregar** no cartão **MultiPoke Autocaptura** e confira a versão.
3. Atualize a aba do jogo para carregar a Autocaptura e o painel automaticamente. Para ativar as compras e vendas, clique em **Iniciar Auto Loja** no painel.

Se o painel não aparecer, confira se você carregou a versão completa, se a aba está em `multipoke.io/jogar` e se a extensão está instalada no mesmo perfil do Chrome.

## Histórico de atualizações

| Versão | O que mudou |
| --- | --- |
| 1.5.6 | Autocaptura e painel Auto Loja carregam automaticamente ao abrir ou recarregar a página do jogo. |
| 1.5.5 | A Autocaptura pausa e retoma conforme o estoque da Poké Bola configurada, mesmo com a Auto Loja pausada. Se faltar saldo para comprar, a Auto Loja mantém as vendas e tenta a reposição quando houver saldo suficiente. |
| 1.5.4 | Botão roxo no painel para ligar e desligar a autocaptura independentemente das compras e vendas. |
| 1.5.3 | Venda pelo inventário do treinador em qualquer hunt ativa, com prioridade para capturas antigas e restauração dos filtros manuais da loja. Indicador verde quando a Auto Loja está ativa e vermelho-escuro quando está offline. |
| 1.5.2 | Lotes de até 20 Pokémon, com seleção ao rolar pela lista da loja. |
| 1.5.1 | Arraste pela faixa vermelha, seta exclusiva para abrir e recolher, reposição a cada 5 segundos e aviso de saldo insuficiente. |
| [1.5.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/189564c) | Venda de Pokémon por qualidade e IV total com combinação **E** ou **OU**, proteções e lotes de até 10. |
| [1.4.1](https://github.com/AntonioF2/multipoke-autocaptura/commit/4d5ddf1) | Sprite 2D de Dragonite de Pokémon HeartGold e SoulSilver incluído na extensão. |
| [1.4.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/579ca5d) | Tema visual inspirado em Pokémon e Dragonite no cabeçalho do Auto Loja. |
| [1.3.2](https://github.com/AntonioF2/multipoke-autocaptura/commit/4746cb3) | Escolhas de Poké Bola, poção e valores de reposição salvos por treinador. |
| [1.3.1](https://github.com/AntonioF2/multipoke-autocaptura/commit/d1ba819) | Busca e lista de regras de loot reunidas em uma seção recolhível. |
| [1.3.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/746d40c) | Catálogo pesquisável de loot, regras de proteção e atualização automática do estoque a cada 5 segundos. |
| [1.2.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/bd95c67) | Alça para mover o painel e guardar sua posição. |
| [1.1.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/bd4c223) | Primeiro Auto Loja com venda de loot e reposição de Poké Bolas e poções. |
| [1.0.0](https://github.com/AntonioF2/multipoke-autocaptura/commit/d48f122) | Autocaptura nos modos normal e economia, ativação pelo ícone do Chrome e lançador para Windows. |

## Créditos

Sprite de Dragonite de **Pokémon HeartGold e SoulSilver**, disponível no [repositório de sprites da PokéAPI](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/versions/generation-iv/heartgold-soulsilver/149.png). O catálogo de loot vem da [Pokepédia do MultiPoke Idle](https://multipoke.io/pokepedia/itens).
