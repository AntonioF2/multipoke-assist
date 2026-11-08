# MultiPoke Autocaptura

Extensão local para o Google Chrome que clica em **Capturar** no MultiPoke Idle e adiciona o painel **Auto Loja** para repor suprimentos, vender loot e vender Pokémon por qualidade e IV total.

A versão atual é a **1.5.16**, disponível na branch principal [`main`](https://github.com/AntonioF2/multipoke-autocaptura/tree/main).

## Instalação no Chrome em modo de desenvolvimento

1. Abra a [branch principal](https://github.com/AntonioF2/multipoke-autocaptura/tree/main) e clique em **Code → Download ZIP**. Extraia o arquivo para uma pasta de sua escolha.
2. No mesmo perfil do Chrome que você usa para jogar, abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém o arquivo `manifest.json`.
4. Confira se **MultiPoke Autocaptura** aparece na lista. Se quiser deixar o ícone à mão, abra o menu de extensões do Chrome e fixe a extensão na barra.

Se preferir clonar o repositório, use o comando abaixo e selecione a pasta clonada no passo 3.

```bash
git clone https://github.com/AntonioF2/multipoke-autocaptura.git
```

[Guia do Chrome para carregar extensões locais](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Guia do GitHub para baixar um ZIP](https://docs.github.com/pt/repositories/working-with-files/using-files/downloading-source-code-archives)

## Como ativar

1. Abra [multipoke.io/jogar](https://multipoke.io/jogar) e entre no jogo.
2. Ao abrir ou recarregar a página, a Autocaptura inicia e o painel **Auto Loja** carrega com a visibilidade salva.
3. Clique na **seta** para expandir ou recolher o painel. Segure e arraste a **faixa vermelha** para mover a janela. Com o cabeçalho em foco, as setas do teclado também movem o painel. A posição fica salva no navegador.
4. Configure as compras e vendas desejadas e clique em **Iniciar Auto Loja**. **Pausar Auto Loja** interrompe as operações e libera os campos para edição.

Com a aba do jogo aberta, clique no ícone **MultiPoke Autocaptura** na barra do Chrome para ocultar o painel. Clique novamente para exibi-lo. Você pode fixar o ícone na barra pelo menu de extensões do Chrome. A escolha vale para as abas do MultiPoke nesse perfil do Chrome e fica salva após recarregar. A Autocaptura e a Auto Loja seguem com as operações já ativadas enquanto o painel está oculto.

Para ativar a captura manualmente, use o botão roxo no painel. No Windows, você também pode executar `Ativar Autocaptura.bat` depois de instalar a extensão.

## Autocaptura

A extensão procura o botão **Capturar** nos painéis normal e de economia e aciona o clique quando o botão está visível e habilitado. O próprio jogo processa a tentativa com a Poké Bola selecionada nele.

Se você selecionar uma Poké Bola para reposição, a Autocaptura acompanha o estoque dessa bola mesmo com a Auto Loja pausada ou com o painel recolhido. Ela aguarda quando o estoque chega a zero e retoma assim que a mochila volta a ter pelo menos uma unidade. Para capturar sem esse controle de estoque, escolha **Sem reposição** no campo **Poké Bola**.

Use o botão roxo **Autocaptura ligada** no painel Auto Loja para desligar só a captura. Clique em **Autocaptura desligada** para ligar de novo. Esse botão funciona independentemente das compras e vendas. O comando `multiPokeCaptura.parar()` no console também pode desligá-la. Ao recarregar a página, a Autocaptura volta a iniciar e o painel carrega com o botão **Iniciar Auto Loja** disponível.

## Reposição de Poké Bolas e poções

1. Abra o **Auto Loja** e aguarde a leitura automática do saldo e do estoque.
2. Escolha uma **Poké Bola**, uma **Poção** ou ambas. Use **Sem reposição** na categoria que você não quer comprar.
3. Em **Até**, informe o estoque que dispara a compra. Em **Comprar**, informe quantas unidades quer adquirir a cada compra.
4. Defina a **Reserva de Pokédollars**, que é o saldo mínimo que deve sobrar após a compra.
5. Clique em **Iniciar Auto Loja**. A extensão só compra a quantidade configurada quando o saldo comporta a compra inteira e a reserva. O painel informa quanto falta quando o saldo impede a reposição.

Por exemplo, **Até 10** e **Comprar 50** repõem 50 unidades quando restarem 10 ou menos. Use **Até 0** para repor apenas quando o estoque acabar.

## Venda de loot

Abra **Regras de loot** e use a busca por nome ou ID para encontrar itens da Pokepédia, inclusive os que ainda não estão na mochila. Marque **Permitir venda** para autorizar um item ou **Bloquear venda** para protegê-lo em qualquer modo. Ao desmarcar **Bloquear venda**, o item volta a seguir a regra do modo selecionado. As escolhas ficam salvas por treinador.

| Modo de venda automática | Comportamento |
| --- | --- |
| **Desligada** | Mantém a venda automática de loot pausada. |
| **Somente marcados para venda** | Vende apenas o loot elegível marcado como **Vender**. |
| **Abaixo de 10.000 e itens marcados** | Permite por padrão o loot elegível que vale menos de **10.000 Pokédollars por unidade**. Itens de **10.000** ou mais exigem autorização individual. |

Nos dois modos, o loot precisa constar no catálogo como disponível para venda e aparecer na loja do jogo. Poké Bolas, poções e pedras de evolução ficam fora da lista de venda automática de loot.

Antes de uma venda automática, a Auto Loja limpa as marcações existentes na loja do jogo e seleciona os itens que as regras autorizam.

## Venda de Pokémon

1. Expanda **Venda de Pokémon** e marque **Ativar venda de Pokémon**.
2. Preencha **Qualidade abaixo de**, **IV total abaixo de** ou ambos. Um campo em branco deixa aquele critério de fora.
3. Se preencher os dois, escolha **E** para exigir ambos ou **OU** para aceitar qualquer um.
4. Clique em **Iniciar Auto Loja**.

Com qualidade abaixo de **1,30** e IV total abaixo de **80**, o modo **E** exige os dois limites e o modo **OU** exige pelo menos um. Um Pokémon com qualidade exatamente **1,30** só pode passar pelo critério de IV. O mesmo vale para IV exatamente **80** em relação ao critério de qualidade.

A extensão vende até **20 Pokémon por venda**. Ela percorre o inventário do treinador em qualquer hunt ativa, priorizando as capturas mais antigas. Durante a venda automática, aplica os critérios do Auto Loja e restaura os filtros manuais da loja ao terminar. Iniciais, Pokémon da equipe ou da reserva, trancados, Shiny e Holo ficam protegidos, assim como os de qualidade **Lendária ou superior** (a partir de **1,70**). Se houver Pokémon selecionados manualmente na loja, o Auto Loja pausa antes de vender.

## Análise de hunts

Abra **Análise de hunts** para ver estimativas antes de testar uma hunt. A extensão verifica o nível do treinador, os níveis da equipe e o VIP, então compara até 12 hunts regulares próximas do nível da equipe, limitado pelo nível do treinador.

Para XP, a análise pondera a XP base de referência de cada espécie pela sua participação nos encontros e aplica os multiplicadores da hunt. Para drops, usa o valor esperado dos itens comuns vendidos ao NPC que a Pokepédia publica por abate. [Catálogo de hunts](https://multipoke.io/pokepedia/hunts) · [XP base de referência](https://pokeapi.co/docs/v2#pokemon)

Em **Comparar hunts e golpes**, a extensão lista os golpes equipados na barra de habilidades e estima até quatro golpes dos selvagens pelo nível típico da faixa de encontro. A comparação usa tipos, STAB, fraquezas, resistências, imunidades, poder, precisão e recarga. O modelo combina o tempo estimado para abater cada espécie com o risco do dano recebido e pondera pela frequência dos encontros. Usa atributos de referência e golpes de poder fixo. Críticos, efeitos, dano variável, área, genes e bônus individuais podem mudar o resultado no jogo. [Guia de combate](https://multipoke.io/pokepedia/guias/combate)

A classificação combina recompensa por abate e ritmo estimado. Quando existe uma medição da hunt atual com os mesmos golpes equipados e ela está entre as candidatas analisadas, a extensão calibra os ganhos por hora a partir dos abates observados. Sem essa referência, mostra o ritmo relativo entre as hunts. Se os dados de combate estiverem indisponíveis, usa a recompensa por abate.

Deixe a aba da análise aberta durante a caçada para obter uma medição real. A extensão lê o Registro da Caçada do jogo e registra a hunt depois de pelo menos **5 minutos** com a mesma equipe e um abate. Se você já estava na caçada ao começar a medir, ou se trocar a equipe, a extensão começa a contagem a partir da nova leitura.

Para comparar, visite outras hunts com a mesma formação e deixe a análise registrar cada uma. O painel mostra a melhor hunt medida para **XP/h** e a melhor para **drops/h**, além do histórico local por treinador e formação. Drops/h considera o valor dos itens no registro, sem somar moedas ou capturas e sem descontar consumíveis. As taxas refletem as condições de cada medição, incluindo o nível da equipe, os bônus e o ritmo de abates.

## Quando o Auto Loja funciona

- Com o painel aberto e a aba em foco, o estoque é lido a cada **5 segundos**, quando a loja está disponível.
- Durante a caçada, com a aba do jogo em foco, a reposição verifica o estoque a cada **5 segundos** e as vendas rodam a cada **30 segundos**. O painel pode ficar recolhido depois que você iniciar.
- A Poké Bola, a poção, os valores de reposição, as regras de loot e os filtros de Pokémon ficam salvos por treinador no navegador. Ao reabrir, escolha o modo de venda de loot ou marque a venda de Pokémon novamente e inicie o Auto Loja.
- O painel pausa se o jogo apresentar uma confirmação diferente da seleção esperada ou se a operação ficar sem comprovante. Confira o inventário e o saldo antes de iniciar novamente.

## Como atualizar

Para receber atualizações automáticas, instale a extensão pela Chrome Web Store quando a listagem estiver disponível. Se você usava a instalação sem compactação, desative essa cópia ao trocar para a versão da loja.

Na instalação em modo de desenvolvimento, siga estes passos.

1. Atualize os arquivos na pasta que o Chrome carrega. Se você clonou o repositório, abra a branch `main` com `git switch main` e execute `git pull --ff-only` dentro da pasta do projeto. Se usou ZIP, baixe e extraia a versão nova na pasta da extensão.
2. Em `chrome://extensions`, clique em **Recarregar** no cartão **MultiPoke Autocaptura** e confira a versão.
3. Atualize a aba do jogo para carregar a Autocaptura e o painel automaticamente. Para ativar as compras e vendas, clique em **Iniciar Auto Loja** no painel.

Se o painel não aparecer, confira se você carregou a versão completa, se a aba está em `multipoke.io/jogar` e se a extensão está instalada no mesmo perfil do Chrome.

## Publicação e atualizações na Chrome Web Store

O fluxo [Chrome Web Store](https://github.com/AntonioF2/multipoke-autocaptura/actions/workflows/chrome-web-store.yml) gera `multipoke-autocaptura.zip` a cada push na `main`. Depois de configurado, ele envia à revisão versões do `manifest.json` maiores que as já publicadas ou submetidas. O Chrome distribui a versão depois da aprovação. [API de publicação](https://developer.chrome.com/docs/webstore/using-api)

### Primeira publicação

1. Abra o [Painel do desenvolvedor](https://chrome.google.com/webstore/devconsole/), habilite a verificação em duas etapas e conclua o cadastro se for seu primeiro item.
2. Baixe `multipoke-autocaptura.zip` em **Artifacts** na execução mais recente do fluxo e envie o arquivo em **Adicionar novo item**. Use o ID que o painel atribuir. O ZIP da loja usa uma identidade própria e o lançador `.bat` se aplica à instalação local.
3. Preencha a ficha e as declarações de privacidade, anexe os materiais pedidos pelo painel e use a [política de privacidade do projeto](https://github.com/AntonioF2/multipoke-autocaptura/blob/main/PRIVACIDADE.md). Escolha a visibilidade **Pública** e envie a primeira versão para revisão. [Guia da primeira publicação](https://developer.chrome.com/docs/webstore/publish)

### Vincular o GitHub Actions

Em um projeto do Google Cloud, habilite a Chrome Web Store API e configure uma conta de serviço com credenciais temporárias do GitHub. O bloco abaixo pode ser executado no Cloud Shell após substituir `SEU_PROJETO` pelo ID do projeto. A condição vincula a conta a este repositório e ao fluxo da branch `main`. [Federação de identidade no Google Cloud](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)

```bash
PROJECT_ID="SEU_PROJETO"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SERVICE_ACCOUNT="cws-publisher@${PROJECT_ID}.iam.gserviceaccount.com"
POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/multipoke-cws"

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com chromewebstore.googleapis.com \
  --project="$PROJECT_ID"
gcloud iam service-accounts create cws-publisher --project="$PROJECT_ID"
gcloud iam workload-identity-pools create multipoke-cws --location=global --project="$PROJECT_ID"
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=multipoke-cws --project="$PROJECT_ID" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="assertion.repository_id=='1449608632' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='AntonioF2/multipoke-autocaptura/.github/workflows/chrome-web-store.yml@refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository_id/1449608632"
printf 'CWS_SERVICE_ACCOUNT=%s\nCWS_WORKLOAD_IDENTITY_PROVIDER=%s/providers/github\n' "$SERVICE_ACCOUNT" "$POOL"
```

Vincule o e-mail da conta de serviço em **Conta** no Painel do desenvolvedor da Chrome Web Store. Depois, no GitHub, em **Settings → Secrets and variables → Actions → Variables**, cadastre estas quatro variáveis. [Vínculo da conta de serviço](https://developer.chrome.com/docs/webstore/service-accounts)

| Variável | Valor |
| --- | --- |
| `CWS_PUBLISHER_ID` | ID do editor exibido no Painel do desenvolvedor |
| `CWS_EXTENSION_ID` | ID do item criado na Chrome Web Store |
| `CWS_SERVICE_ACCOUNT` | E-mail da conta de serviço mostrado no Cloud Shell |
| `CWS_WORKLOAD_IDENTITY_PROVIDER` | Identificador do provedor mostrado no Cloud Shell |

Execute **Run workflow** na `main` para validar o acesso. Aumente `version` no `manifest.json` quando preparar uma versão para distribuição.

## Histórico de atualizações

| Versão | O que mudou |
| --- | --- |
| 1.5.16 | Análise de hunts com tipos, golpes ativos da equipe e repertório estimado dos selvagens. |
| 1.5.15 | Um clique no ícone da barra do Chrome alterna a visibilidade do painel Auto Loja. |
| 1.5.14 | Menu no ícone da extensão para mostrar ou ocultar o painel Auto Loja. |
| 1.5.13 | Estimativas de XP e drops por abate, com seleção de hunts pelo nível do treinador e da equipe. |
| 1.5.12 | Aba **Análise de hunts** compara XP e drops por hora medidos para a equipe ativa. |
| 1.5.11 | Pacote e fluxo de publicação de atualizações na Chrome Web Store. |
| 1.5.10 | A Auto Loja pede a correção de um IV incompleto antes de iniciar a venda de Pokémon. |
| 1.5.9 | A Auto Loja limpa a seleção de loot antes de marcar os itens autorizados para a venda. |
| 1.5.8 | Loot elegível abaixo de 10.000 Pokédollars permitido por padrão e opção **Bloquear venda** por item. |
| 1.5.7 | Regras de loot com a opção **Permitir venda** por item, padrões por modo e autorização individual para itens acima de 100 Pokédollars. |
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
