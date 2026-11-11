# MultiPoke Autocaptura

Extensão para o Chrome que automatiza capturas no MultiPoke Idle. O painel **Auto Loja** também repõe suprimentos, vende loot e Pokémon, compara hunts e troca de área automaticamente.

**Versão 1.5.27**

## Instalar ou atualizar

1. Na página do repositório, clique em **Code → Download ZIP** e extraia a pasta. Se preferir usar Git, execute `git clone https://github.com/AntonioF2/multipoke-autocaptura.git`.
2. No perfil do Chrome em que você joga, abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Abra o jogo e entre com seu treinador. [MultiPoke Idle](https://multipoke.io/jogar)

Para atualizar, substitua os arquivos na pasta da extensão ou execute `git pull --ff-only` na branch `main` do clone. Depois clique em **Recarregar** no cartão da extensão e atualize a aba do jogo.

## Autocaptura

A Autocaptura inicia ao abrir a página do jogo e usa o botão **Capturar** nos modos normal e economia. Use o botão roxo do painel para ligar ou desligar a captura. No Windows, o arquivo `Ativar Autocaptura.bat` permite reativá-la com a extensão instalada.

Ao escolher uma Poké Bola para reposição, a extensão mantém essa bola equipada no Auto Helper enquanto a Autocaptura ou a reposição estiver ativa. Se o estoque zerar, a Autocaptura aguarda a reposição e a confirmação da seleção. Escolha **Sem reposição** para usar livremente a bola selecionada no jogo.

## Auto Loja

Use a seta para expandir ou recolher o painel. Arraste pela faixa vermelha para mover o painel ou use as setas do teclado com o cabeçalho em foco. O ícone da extensão mostra ou oculta o painel. A posição e a visibilidade ficam salvas no navegador.

### Repor Poké Bolas, poções e revives

1. Aguarde a leitura do estoque e selecione os suprimentos que quer repor.
2. Em **Estoque mín.**, defina o estoque que dispara a compra. Em **Comprar**, informe a quantidade por pedido. Por exemplo, **Estoque mín. 10** e **Comprar 50** repõem 50 unidades quando restarem 10 ou menos.
3. Defina a **Reserva de Pokédollars** e clique em **Iniciar Auto Loja**. A compra exige saldo para o lote inteiro e para a reserva.

A Poké Bola, a poção e o revive escolhidos para reposição também são selecionados para uso no Auto Helper enquanto a Autocaptura ou a reposição correspondente estiver ativa. Ao receber estoque, a extensão volta a selecionar o item configurado, inclusive depois de uma troca automática do jogo para um item inferior. Escolha **Sem reposição** para controlar o tipo daquele suprimento pelo próprio jogo. O limiar de HP para usar poções segue a configuração do Auto Helper. A reposição de revive também funciona fora da hunt. [Guia do Auto Helper](https://multipoke.io/pokepedia/guias/auto-helper)

### Vender loot

Em **Venda automática**, escolha **Somente marcados para venda** para vender apenas itens autorizados ou **Abaixo de 10.000 e itens marcados** para incluir loot elegível abaixo de 10.000 Pokédollars por unidade. Itens a partir de 10.000 exigem autorização individual.

Em **Regras de loot**, busque por nome ou ID e use **Permitir venda** ou **Bloquear venda**. O bloqueio vale em qualquer modo. Antes de vender, a Auto Loja limpa a seleção anterior de loot e confere os itens do lote.

### Vender Pokémon

Expanda **Venda de Pokémon**, ative a opção e informe um limite de qualidade, de IV total ou ambos. Com dois limites, **E** exige que os dois sejam atendidos e **OU** exige pelo menos um. Os valores precisam estar abaixo dos limites.

Cada lote reúne até 20 Pokémon, com prioridade para capturas antigas. Iniciais, Pokémon da equipe ou da reserva, trancados, Shiny, Holo e de qualidade Lendária ou superior (1,70×) ficam protegidos. Uma seleção manual adia a venda de Pokémon.

### Funcionamento da loja

A reposição é verificada a cada **5 segundos** e as vendas a cada **30 segundos** enquanto o jogo estiver disponível e a aba estiver visível. A Auto Loja pode funcionar com o painel recolhido. A sessão é retomada ao recarregar a mesma aba com o mesmo treinador. Use **Pausar Auto Loja** para interromper as operações e editar as regras.

## Hunts

- **Análise de hunts** compara até 12 áreas regulares por XP e drops por abate. A estimativa considera o nível, os golpes da equipe, os encontros e os bônus de XP ativos. Com uma medição recente compatível, também estima o rendimento por hora.
- **Troca de hunt** escolhe a favorita acessível de maior nível no menu **Caçada**. Se nenhuma favorita estiver disponível, escolhe a área acessível de maior nível. Em empate de nível e preferência, mantém a hunt atual. A troca aguarda o primeiro minuto da caçada, exige a aba em foco e respeita cinco minutos entre tentativas de entrada.

Com a análise aberta ou a troca automática ativa, a extensão registra medições em janelas de pelo menos cinco minutos com a mesma formação e pelo menos um abate. O histórico guarda as dez amostras mais recentes por hunt e configuração, além dos recordes. Em **Histórico da mesma equipe**, use **Exportar backup** ou **Importar backup** para guardar ou mesclar os dados em JSON.

## Tierlist de Pokémon

A aba **Tierlist** agrupa todas as espécies do catálogo da Pokepédia por rank, de **SS** a **D**. Escolha um rank ou use a busca por nome ou número para encontrar um Pokémon e clique no seu ícone para abrir a ficha em outra aba. Os ranks seguem a classificação de cada espécie publicada pelo jogo. [Guia de ranks](https://multipoke.io/pokepedia/guias/ranks)

O catálogo é carregado ao abrir a aba e reaproveitado no IndexedDB. As imagens são carregadas conforme os Pokémon entram na área visível.

## Privacidade e créditos

Os dados de configuração e histórico são armazenados no navegador. [Política de privacidade](PRIVACIDADE.md)

Os catálogos de itens, hunts e ranks vêm da Pokepédia do MultiPoke. Os dados de XP base, o sprite de Dragonite e os ícones de Pokémon da tierlist vêm da PokéAPI. [Pokepédia](https://multipoke.io/pokepedia/hunts) · [PokéAPI](https://pokeapi.co/) · [Sprites](https://github.com/PokeAPI/sprites)
