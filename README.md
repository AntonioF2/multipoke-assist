# MultiPoke Assist

O **MultiPoke Assist** reúne capturas automáticas, reposição de suprimentos, venda de loot e Pokémon, análise e troca de hunts e tierlist em uma extensão para o Chrome. Use o painel dentro do MultiPoke Idle para acessar as funções.

**Versão 1.5.34**

## Instalar ou atualizar

1. Na página do [repositório oficial](https://github.com/AntonioF2/multipoke-assist), clique em **Code → Download ZIP** e extraia a pasta. Se preferir usar Git, execute `git clone https://github.com/AntonioF2/multipoke-assist.git`.
2. No perfil do Chrome em que você joga, abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Abra o jogo e entre com seu treinador. [MultiPoke Idle](https://multipoke.io/jogar)

Para atualizar, substitua os arquivos na pasta da extensão ou execute `git pull --ff-only` na branch `main` do clone. Depois clique em **Recarregar** no cartão da extensão e atualize a aba do jogo.

Em clones anteriores à mudança de nome, atualize o endereço com `git remote set-url origin https://github.com/AntonioF2/multipoke-assist.git`.

## Autocaptura

A Autocaptura inicia ao abrir a página do jogo e usa o botão **Capturar** nos modos normal e economia. Use o botão roxo do painel para ligar ou desligar a captura. No Windows, o arquivo `Ativar Autocaptura.bat` permite reativá-la com a extensão instalada.

No **modo economia**, o Assist acompanha automaticamente a parte inferior do painel da caçada, inclusive quando o conteúdo cresce ou a janela muda de tamanho. Com a Autocaptura ligada, traz cada botão **Capturar** pendente para a área visível antes de clicar, mesmo em listas maiores que a tela. Sem capturas pendentes, mantém a rolagem no fim do painel. A rolagem também continua com a Autocaptura pausada, enquanto o modo economia estiver ativo. Ela aguarda durante menus, diálogos e edição de campos; no modo normal, a posição de rolagem é livre.

Ao escolher uma Poké Bola para reposição, a extensão mantém essa bola equipada no Auto Helper enquanto a Autocaptura ou a reposição estiver ativa. Se o estoque zerar, a Autocaptura aguarda a reposição e a confirmação da seleção. Escolha **Sem reposição** para usar livremente a bola selecionada no jogo.

## Fechamento automático de avisos

Ao abrir o jogo, o Assist fecha as ofertas de entrada e os avisos dispensáveis do jogador, incluindo Pontos Dex e capturas especiais por qualidade, Shiny ou Holo. O fechamento usa o botão do próprio jogo e registra a leitura; os avisos continuam disponíveis no histórico do menu **Avisos**. Funciona também com a loja e a Autocaptura desligadas.

A extensão aguarda a confirmação de leitura antes de tentar fechar novamente o mesmo aviso, com tentativas espaçadas se o servidor demorar. Confirmações de compra, venda e outras ações, escolha do inicial e telas de conexão permanecem sob o controle dos seus respectivos fluxos. A fila volta a ser processada quando a aba está visível e essas janelas são liberadas.

## Loja e suprimentos

Use a seta para expandir ou recolher o painel. Arraste pela faixa vermelha para mover o painel ou use as setas do teclado com o cabeçalho em foco. O ícone da extensão mostra ou oculta o painel. A posição e a visibilidade ficam salvas no navegador.

### Repor Poké Bolas, poções e revives

1. Aguarde a leitura do estoque e selecione os suprimentos que quer repor.
2. Em **Estoque mín.**, defina o estoque que dispara a compra. Em **Comprar**, informe a quantidade por pedido. Por exemplo, **Estoque mín. 10** e **Comprar 50** repõem 50 unidades quando restarem 10 ou menos.
3. Defina a **Reserva de Pokédollars** e clique em **Iniciar loja**. A compra exige saldo para o lote inteiro e para a reserva.

A Poké Bola, a poção e o revive escolhidos para reposição também são selecionados para uso no Auto Helper enquanto a Autocaptura ou a reposição correspondente estiver ativa. Ao receber estoque, a extensão volta a selecionar o item configurado, inclusive depois de uma troca automática do jogo para um item inferior. Escolha **Sem reposição** para controlar o tipo daquele suprimento pelo próprio jogo. O limiar de HP para usar poções segue a configuração do Auto Helper. A reposição de revive também funciona fora da hunt. [Guia do Auto Helper](https://multipoke.io/pokepedia/guias/auto-helper)

### Vender loot

Em **Venda automática**, escolha **Somente marcados para venda** para vender apenas itens autorizados ou **Abaixo de 10.000 e itens marcados** para incluir loot elegível abaixo de 10.000 Pokédollars por unidade. Itens a partir de 10.000 exigem autorização individual.

Em **Permissões de venda por item**, busque por nome ou ID e use **Permitir venda** ou **Bloquear venda**. O bloqueio vale em qualquer modo. Antes de vender, o MultiPoke Assist limpa a seleção anterior de loot e confere os itens do lote.

### Vender Pokémon

Expanda **Venda de Pokémon**, ative a opção e informe um limite de qualidade, de IV total ou ambos. Com dois limites, **E** exige que os dois sejam atendidos e **OU** exige pelo menos um. Os valores precisam estar abaixo dos limites.

Cada lote reúne até 20 Pokémon, com prioridade para capturas antigas. Iniciais, Pokémon da equipe ou da reserva, trancados, Shiny, Holo e de qualidade Lendária ou superior (1,70×) ficam protegidos. Uma seleção manual adia a venda de Pokémon.

### Funcionamento da loja

A reposição é verificada a cada **5 segundos** e as vendas a cada **30 segundos** enquanto o jogo estiver disponível e a aba estiver visível. A loja pode funcionar com o painel recolhido. A sessão é retomada ao recarregar a mesma aba com o mesmo treinador. Use **Pausar loja** para interromper as operações e editar as regras.

## Hunts

- **Análise de hunts** compara até 12 áreas regulares por XP e drops por abate. A estimativa considera o nível, os golpes da equipe, os encontros e os bônus de XP ativos. Com uma medição recente compatível, também estima o rendimento por hora.
- A aba **Grind** escolhe a favorita acessível de maior nível no menu **Caçada**. Se nenhuma favorita estiver disponível, escolhe a área acessível de maior nível. Em empate de nível e preferência, mantém a hunt atual. A troca aguarda o primeiro minuto da caçada, exige a aba em foco e respeita cinco minutos entre tentativas de entrada.

Com a análise aberta, a troca automática ou os testes ativos, a extensão registra medições em janelas de pelo menos cinco minutos com a mesma formação. A duração vem da diferença entre as leituras do relógio do **Registro da Caçada**, sem um cronômetro próprio de coleta. O histórico e a média das dez amostras mais recentes são consultados por treinador, Pokémon do time e hunt, sem separar por nível, golpes ou bônus. Subir de nível mantém a janela em andamento e as medições anteriores. Os ganhos reais continuam incluindo os boosts e bônus recebidos. Os níveis e golpes ainda entram nas estimativas teóricas de combate.

As medições e os recordes ficam no **IndexedDB da extensão**, sem prazo de expiração, e permanecem ao fechar e reabrir o navegador no mesmo perfil. Atualizações da extensão preservam o banco. Registros anteriores separados por nível ou configuração são reaproveitados automaticamente na média do time, sem apagar os dados originais. Em **Histórico da mesma equipe**, use **Exportar backup** ou **Importar backup** para guardar ou mesclar os dados em JSON. Desinstalar a extensão, excluir o perfil ou limpar os dados da extensão pode remover esse histórico; o backup permite recuperá-lo.

### Testes reais nas hunts

Na aba **Hunts**, clique em **Iniciar testes nas hunts** durante uma caçada regular. O Assist consulta todas as áreas regulares acessíveis no menu **Caçada** e testa as que ainda precisam de uma medição para o time atual. Marque **Incluir hunts já medidas** para repetir a avaliação. A fila é definida ao iniciar a rodada.

Cada hunt recebe uma janela de pelo menos **cinco minutos de coleta pelo relógio do Registro da Caçada**, após até **um minuto de adaptação** à entrada. São medidos XP, valor dos drops e abates do Registro da Caçada, incluindo o tempo de caminhada, combate e espera por respawn. A aba mostra o tempo do jogo, os totais observados e as projeções por hora. As medições ficam no IndexedDB e alimentam o histórico e as estimativas do time. Os melhores ganhos medidos priorizam as médias da mesma equipe; recordes históricos aparecem identificados quando faltam amostras de totais reais. Janelas sem abates registram rendimento zero. [Ritmo e respawn das hunts](https://multipoke.io/pokepedia/guias/progressao)

Mantenha a aba em foco e o jogo livre. Perder o foco ou ficar mais de 45 segundos sem leitura reinicia a janela em andamento. A reposição e as vendas podem continuar entre as leituras, enquanto a troca automática aguarda a rodada. Ao concluir, o Assist retorna à hunt de origem e libera a troca automática. **Parar testes** encerra as próximas ações e conserva as medições já salvas.

Alterar treinador ou integrantes encerra a rodada. Subidas de nível, mudanças de golpes e bônus mantêm as medições associadas ao mesmo time. Os testes não retomam automaticamente após recarregar a página; as medições já concluídas permanecem salvas.

## Tierlist de Pokémon

A aba **Tierlist** agrupa todas as espécies do catálogo da Pokepédia por rank, de **SS** a **D**. Escolha um rank ou use a busca por nome ou número para encontrar um Pokémon e clique no seu ícone para abrir a ficha em outra aba. Os ranks seguem a classificação de cada espécie publicada pelo jogo. [Guia de ranks](https://multipoke.io/pokepedia/guias/ranks)

O catálogo é carregado ao abrir a aba e reaproveitado no IndexedDB. As imagens são carregadas conforme os Pokémon entram na área visível.

No topo, **Rank médio do time atual** mostra os Pokémon equipados e seus ranks individuais. A extensão atribui D = 1, C = 2, B = 3, A = 4, S = 5 e SS = 6, calcula a média com o mesmo peso para cada integrante e arredonda ao rank mais próximo, com 0,5 para cima. Por exemplo, S + A + B resulta em A. A composição é conferida a cada dois segundos enquanto a Tierlist está aberta. O resultado aguarda a identificação de todos os integrantes e usa os ranks das espécies, incluindo os Pokémon desmaiados que continuam na equipe.

## Privacidade e créditos

Os dados de configuração e histórico são armazenados no navegador. [Política de privacidade](PRIVACIDADE.md)

Os catálogos de itens, hunts e ranks vêm da Pokepédia do MultiPoke. Os dados de XP base, o sprite de Dragonite e os ícones de Pokémon da tierlist vêm da PokéAPI. [Pokepédia](https://multipoke.io/pokepedia/hunts) · [PokéAPI](https://pokeapi.co/) · [Sprites](https://github.com/PokeAPI/sprites)
