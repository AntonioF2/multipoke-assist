function criarPokedexAutomatica(campo, { treinador, normalizar, podeInteragir }) {
  const categorias = { shiny: "Shiny chance", capture: "Catch rate", loot: "Loot" };
  const lista = campo("dex-regras");
  const resultados = campo("dex-resultados");
  const busca = campo("dex-busca");
  const status = campo("dex-status");
  let dono = "";
  let regras = [];
  let catalogo = [];
  let carregandoCatalogo;
  let ocupada = false;
  let salvando = false;
  let ultimaEspecie = "";
  let ultimaApresentacao;
  let interacoes = 0;
  let ultimaInteracao = -Infinity;
  const notas = new Map();
  const visivel = () => campo("painel").open && !campo("aba-pokedex").hidden;
  const informar = mensagem => { if (status.textContent !== mensagem) status.textContent = mensagem; };
  const esperar = tempo => new Promise(resolve => setTimeout(resolve, tempo));
  const enviar = (acao, dados = {}, nome = dono) => enviarDadosHunts(acao, { treinador: nome, ...dados });
  const quantidade = numero => numero.toLocaleString("pt-BR");

  function criarProgresso(regra) {
    const bloco = document.createElement("div");
    bloco.className = "dex-progresso";
    const p = regra.progresso;
    const cabecalho = document.createElement("div");
    const titulo = document.createElement("strong");
    const percentual = document.createElement("span");
    const barra = document.createElement("progress");
    barra.setAttribute("aria-label", `Progresso de ${regra.nome} até o próximo Ponto Dex`);
    const detalhe = document.createElement("small");
    const leitura = document.createElement("small");
    if (!p?.registrado) {
      bloco.classList.add("sem-dados");
      titulo.textContent = p ? "Espécie ainda não registrada" : "Aguardando leitura do jogo";
      percentual.textContent = "—";
      barra.max = 1; barra.value = 0;
      barra.setAttribute("aria-valuetext", titulo.textContent);
      detalhe.textContent = p ? "Registre a espécie no jogo para acompanhar seus abates." : "O progresso será consultado quando o jogo estiver livre e em foco.";
    } else {
      const completo = p.proximaMeta === null;
      const total = completo ? 1 : p.proximaMeta - p.metaAnterior;
      const atual = completo ? 1 : p.abates - p.metaAnterior;
      const porcentagem = completo ? 100 : Math.min(99.9, Math.floor(atual * 1000 / total) / 10);
      titulo.textContent = completo ? "Domínio concluído" : `Ponto Dex ${p.conquistados + 1} de ${p.limite}`;
      percentual.textContent = `${quantidade(porcentagem)}%${completo ? "" : " da etapa"}`;
      barra.max = total; barra.value = atual;
      detalhe.textContent = completo ? `${p.limite} de ${p.limite} pontos conquistados · ${quantidade(p.abates)} abates`
        : `${quantidade(p.abates)} / ${quantidade(p.proximaMeta)} abates · faltam ${quantidade(p.proximaMeta - p.abates)}`;
      barra.setAttribute("aria-valuetext", completo ? detalhe.textContent
        : `${quantidade(atual)} de ${quantidade(total)} abates nesta etapa. ${detalhe.textContent}`);
      leitura.textContent = `${p.pontosLivres} ${p.pontosLivres === 1 ? "ponto livre" : "pontos livres"} · Leitura às ${new Date(p.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      bloco.title = "Percentual da etapa entre a meta anterior e o próximo Ponto Dex, conforme a Pokédex do jogo.";
    }
    cabecalho.append(titulo, percentual);
    bloco.append(cabecalho, barra, detalhe);
    if (leitura.textContent) bloco.append(leitura);
    return bloco;
  }

  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (event.isTrusted) { interacoes++; ultimaInteracao = performance.now(); }
    }, { capture: true, passive: true });
  }

  function imagem(id) {
    const img = document.createElement("img");
    img.width = img.height = 48;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.crossOrigin = "anonymous";
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    img.addEventListener("error", () => { img.hidden = true; }, { once: true });
    return img;
  }

  function mostrarRegras() {
    if (!visivel()) return;
    const assinatura = JSON.stringify([dono, regras, [...notas], salvando]);
    if (assinatura === ultimaApresentacao) return;
    ultimaApresentacao = assinatura;
    const fragmento = document.createDocumentFragment();
    for (const regra of [...regras].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      const cartao = document.createElement("section");
      cartao.className = "dex-regra";
      cartao.dataset.especie = regra.id;
      cartao.dataset.ativa = String(regra.ativa);
      const cabecalho = document.createElement("div");
      cabecalho.className = "dex-regra-cabecalho";
      const titulo = document.createElement("div");
      const numero = document.createElement("small");
      numero.textContent = `#${regra.id.padStart(3, "0")}`;
      const nome = document.createElement("strong");
      nome.textContent = regra.nome;
      titulo.append(numero, nome);
      const alternar = document.createElement("button");
      alternar.type = "button";
      alternar.className = "dex-alternar";
      alternar.textContent = regra.ativa ? "Ativada" : "Desativada";
      alternar.setAttribute("aria-pressed", String(regra.ativa));
      alternar.setAttribute("aria-label", `${regra.ativa ? "Desativar" : "Ativar"} melhorias de ${regra.nome}`);
      alternar.disabled = salvando || (!regra.ativa && (!regra.tipos.length || Boolean(regra.pendente)));
      alternar.addEventListener("click", () => void configurar({ ...regra, ativa: !regra.ativa }));
      cabecalho.append(imagem(regra.id), titulo, alternar);
      const opcoes = document.createElement("fieldset");
      const legenda = document.createElement("legend");
      legenda.textContent = "Melhorias autorizadas";
      opcoes.append(legenda);
      for (const [tipo, rotulo] of Object.entries(categorias)) {
        const label = document.createElement("label");
        const controle = document.createElement("input");
        controle.type = "checkbox";
        controle.checked = regra.tipos.includes(tipo);
        controle.disabled = salvando || Boolean(regra.pendente);
        controle.dataset.tipo = tipo;
        controle.setAttribute("aria-label", `${rotulo} para ${regra.nome}`);
        controle.addEventListener("change", () => {
          const tipos = Object.keys(categorias).filter(item => item === tipo ? controle.checked : regra.tipos.includes(item));
          void configurar({ ...regra, tipos, ativa: false });
        });
        label.append(controle, document.createTextNode(rotulo));
        opcoes.append(label);
      }
      const nota = document.createElement("p");
      nota.className = "dex-regra-nota";
      nota.textContent = notas.get(regra.id) || regra.aviso || (regra.ativa
        ? "Aguardando pontos disponíveis para esta espécie." : "Marque os bônus desejados e ative este Pokémon.");
      cartao.append(cabecalho, criarProgresso(regra), opcoes, nota);
      if (!regra.ativa) {
        const rodape = document.createElement("div");
        rodape.className = "dex-regra-rodape";
        const remover = document.createElement("button");
        remover.type = "button";
        remover.className = "dex-remover";
        remover.textContent = "Remover";
        remover.setAttribute("aria-label", `Remover ${regra.nome} da lista de melhorias`);
        remover.disabled = salvando || Boolean(regra.pendente);
        remover.addEventListener("click", () => void configurar(regra, "dex-remover"));
        rodape.append(remover);
        cartao.append(rodape);
      }
      fragmento.append(cartao);
    }
    if (!regras.length) {
      const vazio = document.createElement("p");
      vazio.className = "dex-vazio";
      vazio.textContent = "Busque um Pokémon acima para configurar suas melhorias. Nenhuma espécie é ativada automaticamente.";
      fragmento.append(vazio);
    }
    lista.replaceChildren(fragmento);
    campo("dex-treinador").textContent = dono ? `Configurações de ${dono}` : "Aguardando um treinador.";
  }

  function filtrar() {
    resultados.replaceChildren();
    const termo = normalizar(busca.value.trim()).replace(/^#/, "");
    if (!termo) return;
    const encontrados = catalogo.filter(item => normalizar(`${item.nome} ${item.id}`).includes(termo));
    for (const pokemon of encontrados.slice(0, 20)) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "dex-resultado";
      const configurado = regras.some(regra => regra.id === pokemon.id);
      botao.disabled = salvando || configurado || !dono;
      const nome = document.createElement("span");
      nome.textContent = `#${pokemon.id.padStart(3, "0")} · ${pokemon.nome}`;
      const acao = document.createElement("small");
      acao.textContent = configurado ? "Adicionado" : "Adicionar";
      botao.append(imagem(pokemon.id), nome, acao);
      botao.addEventListener("click", () => void configurar({ ...pokemon, tipos: [], ativa: false, revisao: 0 }));
      resultados.append(botao);
    }
    const nota = document.createElement("small");
    nota.textContent = encontrados.length ? `${Math.min(20, encontrados.length)} de ${encontrados.length} resultados` : "Nenhum Pokémon encontrado.";
    resultados.append(nota);
  }

  async function configurar(regra, acao = "dex-configurar") {
    if (salvando || !dono || treinador() !== dono) return;
    const nome = dono;
    salvando = true;
    mostrarRegras(); filtrar();
    try {
      await enviar(acao, { id: regra.id, nome: regra.nome, tipos: regra.tipos, ativa: regra.ativa, revisao: regra.revisao }, nome);
      if (dono === nome) {
        regras = await enviar("dex-listar", {}, nome);
        notas.delete(regra.id);
        informar(acao === "dex-remover" ? `${regra.nome} removido da lista. Você pode adicioná-lo novamente pela busca.`
          : regra.ativa ? `${regra.nome}: melhoria automática ativada.` : `${regra.nome}: melhorias automáticas desativadas. Ative após escolher os bônus.`);
      }
    } catch (erro) {
      informar(erro.message || "Não foi possível atualizar a lista da Pokédex.");
      if (dono === nome) regras = await enviar("dex-listar", {}, nome).catch(() => []);
    } finally { salvando = false; mostrarRegras(); filtrar(); }
  }

  async function carregarCatalogo() {
    const resposta = await fetch("/pokepedia/pokemon", { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error("Catálogo indisponível.");
    const modelo = document.createElement("template");
    modelo.innerHTML = await resposta.text();
    const especies = new Map();
    for (const item of modelo.content.querySelectorAll("article[data-filter-number]")) {
      const id = item.dataset.filterNumber;
      const nome = item.querySelector("h2")?.textContent.trim();
      if (/^[1-9]\d{0,5}$/.test(id) && nome && item.querySelector("a.entry-main")?.getAttribute("href") === `/pokepedia/pokemon/${id}`) {
        especies.set(id, { id, nome });
      }
    }
    if (!especies.size) throw new Error("Catálogo sem espécies reconhecidas.");
    return [...especies.values()];
  }

  function livre() {
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    return podeInteragir() && !document.hidden && document.hasFocus() && performance.now() - ultimaInteracao >= 3000 &&
      document.querySelector("#game-shell:not([inert]) #party-trainer-name") &&
      !foco?.matches("input, select, textarea, [contenteditable='true']") &&
      !document.querySelector("#drawer.open, dialog[open], #connection-screen:not([hidden]), #starter-overlay:not([hidden]), " +
        "#hunt-map-overlay:not([hidden]), #analyzer-insight:not([hidden]), body.pvp-mode");
  }

  function lerDetalhe(id) {
    const detalhe = document.querySelector(`#drawer.open.pokedex-drawer [data-dex-entry="${id}"]`);
    const inteiro = valor => /^\d+$/.test(valor ?? "") ? Number(valor) : NaN;
    const pontos = inteiro(detalhe?.querySelector(".dex-point-balance strong")?.textContent.trim());
    const percentual = no => {
      const valor = no?.textContent.trim().match(/^\+(\d+(?:[.,]\d+)?)%$/)?.[1];
      return valor === undefined ? NaN : Number(valor.replace(",", "."));
    };
    if (!detalhe || !Number.isSafeInteger(pontos)) return;
    const bonus = Object.fromEntries(Object.keys(categorias).map(tipo =>
      [tipo, percentual(detalhe.querySelector(`.dex-upgrade--${tipo} .dex-upgrade-current strong`))]));
    if (Object.values(bonus).some(valor => !Number.isFinite(valor))) return;
    return { detalhe, pontos, bonus, percentual };
  }

  function lerProgresso(id) {
    const detalhe = document.querySelector(`#drawer.open.pokedex-drawer [data-dex-entry="${id}"]`);
    if (!detalhe) return;
    const numero = texto => /^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(texto ?? "") ? Number(texto.replace(/[.,]/g, "")) : NaN;
    const abates = numero(detalhe.querySelector(".dex-mastery-summary > div:first-child dd")?.textContent.trim());
    const pontosLivres = numero(detalhe.querySelector(".dex-point-balance strong")?.textContent.trim());
    const metas = [...detalhe.querySelectorAll("li[data-dex-goal]")].map(no => Number(no.dataset.dexGoal));
    if (!Number.isSafeInteger(abates) || !Number.isSafeInteger(pontosLivres) || !metas.length ||
        metas.some((meta, indice) => !Number.isSafeInteger(meta) || meta <= (metas[indice - 1] ?? 0))) return;
    const conquistados = metas.filter(meta => meta <= abates).length;
    return { registrado: true, abates, pontosLivres, conquistados, limite: metas.length,
      metaAnterior: metas[conquistados - 1] ?? 0, proximaMeta: metas[conquistados] ?? null };
  }

  async function guardarProgresso(regra, nome, progresso = lerProgresso(regra.id)) {
    if (!progresso || treinador() !== nome) return;
    const atual = await enviar("dex-progresso", { id: regra.id, progresso }, nome);
    if (atual && dono === nome) {
      regras = regras.map(item => item.id === atual.id ? atual : item);
      mostrarRegras();
    }
  }

  async function consultarEspecie(regra, nome, somenteProgresso) {
    if (!livre() || treinador() !== nome) return;
    const abrir = document.querySelector("#nav-pokedex-register:not(:disabled)");
    if (!abrir) return;
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    const inicio = interacoes;
    let dispositivo;
    let anterior;
    let reserva;
    let confirmada = false;
    let confirmouClique = false;
    abrir.click();
    try {
      dispositivo = document.querySelector("#drawer.open.pokedex-drawer [data-pokedex-device]");
      if (!dispositivo) return;
      const filtro = dispositivo.querySelector('[data-dex-filter="all"]');
      const pesquisa = dispositivo.querySelector("[data-dex-search]");
      if (!filtro || !pesquisa) return;
      anterior = { busca: pesquisa.value, filtro: dispositivo.querySelector('[data-dex-filter][aria-pressed="true"]')?.dataset.dexFilter,
        especie: dispositivo.querySelector('[data-dex-species][aria-pressed="true"]')?.dataset.dexSpecies };
      if (filtro.getAttribute("aria-pressed") !== "true") filtro.click();
      if (pesquisa.value) { pesquisa.value = ""; pesquisa.dispatchEvent(new Event("input", { bubbles: true })); }
      const especie = dispositivo.querySelector(`button[data-dex-species="${regra.id}"]`);
      if (!especie) { notas.set(regra.id, "Espécie não disponível na Pokédex do jogo."); return; }
      if (especie.dataset.dexUnlocked !== "true") {
        await guardarProgresso(regra, nome, { registrado: false });
        notas.set(regra.id, "Espécie ainda não registrada na Pokédex do treinador."); return;
      }
      especie.click();
      dispositivo.querySelector('[data-dex-mastery-toggle][aria-expanded="false"]')?.click();
      await guardarProgresso(regra, nome);
      if (somenteProgresso) return;
      const antes = lerDetalhe(regra.id);
      if (!antes) { notas.set(regra.id, "Aguardando uma leitura completa da Pokédex."); return; }
      if (!antes.pontos) { notas.set(regra.id, "Sem Pontos Dex livres. Aguardando novos pontos desta espécie."); return; }
      const escolhas = regra.tipos.map(tipo => {
        const botao = antes.detalhe.querySelector(`button[data-dex-upgrade="${tipo}"]:not(:disabled):not([aria-disabled="true"])`);
        const incremento = antes.percentual(botao?.querySelector(".dex-upgrade-increment"));
        const custo = botao?.querySelector(".dex-upgrade-cost")?.textContent.trim().replace(/\s+/g, " ");
        return { tipo, botao, incremento, custo };
      }).filter(item => item.botao && item.incremento > 0 && normalizar(item.custo ?? "") === "1 ponto dex")
        .sort((a, b) => antes.bonus[a.tipo] - antes.bonus[b.tipo]);
      const escolha = escolhas[0];
      if (!escolha) { notas.set(regra.id, "Melhorias selecionadas indisponíveis ou limite atingido no jogo."); return; }
      reserva = await enviar("dex-reservar", { id: regra.id, revisao: regra.revisao, categoria: escolha.tipo, token: crypto.randomUUID() }, nome);
      if (!reserva) return;
      if (dono === nome) { regras = regras.map(item => item.id === reserva.id ? reserva : item); mostrarRegras(); }
      const atual = (await enviar("dex-listar", {}, nome)).find(item => item.id === regra.id);
      if (treinador() !== nome || inicio !== interacoes || document.hidden || !document.hasFocus() ||
          !atual?.ativa || atual.pendente?.token !== reserva.pendente.token || !atual.tipos.includes(escolha.tipo) ||
          document.querySelector("dialog[open], #connection-screen:not([hidden])") || lerDetalhe(regra.id)?.detalhe !== antes.detalhe ||
          escolha.botao.matches(":disabled, [aria-disabled='true']") || !escolha.botao.isConnected) return;
      escolha.botao.click();
      confirmouClique = true;
      const prazo = performance.now() + 15_000;
      while (performance.now() < prazo) {
        if (treinador() !== nome || interacoes !== inicio || document.hidden ||
            document.querySelector("#connection-screen:not([hidden]), dialog[open]")) break;
        const depois = lerDetalhe(regra.id);
        if (!depois) break;
        if (Math.abs(depois.bonus[escolha.tipo] - antes.bonus[escolha.tipo] - escolha.incremento) < 0.00001 &&
            Object.keys(categorias).filter(tipo => tipo !== escolha.tipo).every(tipo => depois.bonus[tipo] === antes.bonus[tipo])) {
          confirmada = true;
          await guardarProgresso(regra, nome);
          notas.set(regra.id, `${categorias[escolha.tipo]} melhorado. ${depois.pontos} Ponto(s) Dex livre(s).`);
          break;
        }
        await esperar(150);
      }
    } finally {
      if (reserva) {
        await enviar("dex-finalizar", { id: regra.id, token: reserva.pendente.token, confirmada }, nome)
          .catch(() => informar("Aguardando o banco local para encerrar a confirmação. Nenhum novo ponto será gasto nesta espécie."));
        if (!confirmada) notas.set(regra.id, confirmouClique
          ? "Sem confirmação. Automação pausada: confira no jogo antes de reativar." : "Operação cancelada antes do gasto. Reative quando quiser.");
      }
      if (inicio === interacoes && dispositivo?.isConnected && dispositivo === document.querySelector("#drawer.open.pokedex-drawer [data-pokedex-device]") &&
          !document.querySelector("dialog[open]")) {
        if (anterior) {
          if (["all", "unlocked", "captured", "points"].includes(anterior.filtro)) {
            dispositivo.querySelector(`[data-dex-filter="${anterior.filtro}"]`)?.click();
          }
          const pesquisa = dispositivo.querySelector("[data-dex-search]");
          if (pesquisa && pesquisa.value !== anterior.busca) {
            pesquisa.value = anterior.busca; pesquisa.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (/^[1-9]\d*$/.test(anterior.especie ?? "")) dispositivo.querySelector(`[data-dex-species="${anterior.especie}"]`)?.click();
        }
        document.querySelector("#drawer-close:not(:disabled)")?.click();
        if (foco?.isConnected) foco.focus({ preventScroll: true });
      }
    }
  }

  async function atualizar() {
    if (ocupada || salvando) return;
    ocupada = true;
    try {
      const nome = treinador();
      if (nome !== dono) { dono = nome; regras = []; notas.clear(); mostrarRegras(); filtrar(); }
      if (!nome) { informar("Selecione um treinador para configurar a Pokédex."); return; }
      regras = await enviar("dex-listar", {}, nome);
      if (treinador() !== nome) return;
      const antigas = regras.filter(item => item.pendente && Date.now() - item.pendente.data > 20_000);
      for (const regra of antigas) {
        await enviar("dex-finalizar", { id: regra.id, token: regra.pendente.token, confirmada: false }, nome);
      }
      if (antigas.length) regras = await enviar("dex-listar", {}, nome);
      if (visivel()) {
        const id = document.querySelector("#drawer.open.pokedex-drawer [data-dex-entry]")?.dataset.dexEntry;
        const regra = regras.find(item => item.id === id);
        if (regra) await guardarProgresso(regra, nome);
      }
      mostrarRegras();
      if (visivel() && !catalogo.length && !carregandoCatalogo) {
        carregandoCatalogo = cacheDadosHunts("pokedex-pokemon", carregarCatalogo).then(dados => {
          if (!Array.isArray(dados) || !dados.length || dados.some(item => !/^[1-9]\d{0,5}$/.test(item?.id ?? "") || typeof item.nome !== "string")) {
            throw new Error("Catálogo inválido.");
          }
          catalogo = dados; filtrar();
        }).catch(() => informar("Catálogo indisponível. A busca tentará novamente ao abrir esta aba."))
          .finally(() => { carregandoCatalogo = undefined; });
      }
      const ativas = regras.filter(item => item.ativa && !item.pendente);
      const precisaLer = item => visivel() && (!item.progresso || Date.now() - item.progresso.data >= 30_000);
      if (!ativas.length && !regras.some(item => !item.pendente && precisaLer(item))) {
        informar(regras.some(item => item.pendente) ? "Aguardando a confirmação da última melhoria." : "Nenhum Pokémon com melhoria automática ativa."); return;
      }
      informar(`${ativas.length} Pokémon ativo(s). Consultando progresso sem alterar espécies desativadas.`);
      if (!livre()) { informar("Aguardando o jogo livre e a aba em foco para atualizar a Pokédex."); return; }
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, async lock => {
        if (!lock || !livre() || treinador() !== nome) return;
        const atuais = (await enviar("dex-listar", {}, nome)).filter(item => !item.pendente && (item.ativa || precisaLer(item)));
        if (!atuais.length) return;
        const indice = atuais.findIndex(item => item.id === ultimaEspecie);
        const regra = atuais[(indice + 1) % atuais.length];
        ultimaEspecie = regra.id;
        await consultarEspecie(regra, nome, !regra.ativa);
      });
      if (treinador() === nome) { regras = await enviar("dex-listar", {}, nome); mostrarRegras(); }
    } catch (erro) { informar(erro.message || "Aguardando a Pokédex e o banco local."); }
    finally { ocupada = false; }
  }

  busca.addEventListener("input", filtrar);
  setInterval(() => void atualizar(), 5000);
  void atualizar();
  return atualizar;
}
