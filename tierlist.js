function criarTierlist(campo, { normalizar }) {
  const ranks = ["SS", "S", "A", "B", "C", "D"];
  const lista = campo("tierlist-lista");
  const status = campo("tierlist-status");
  const busca = campo("tierlist-busca");
  const filtros = campo("tierlist-ranks");
  const tentar = campo("tierlist-tentar");
  const grupos = new Map();
  let itens = [];
  let carregando;
  let expira = 0;
  let rankAtual = "";

  for (const rank of ["", ...ranks]) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = rank || "Todos";
    botao.dataset.rank = rank;
    botao.setAttribute("aria-pressed", String(rank === rankAtual));
    botao.addEventListener("click", () => {
      rankAtual = rank;
      for (const opcao of filtros.children) opcao.setAttribute("aria-pressed", String(opcao === botao));
      if (itens.length) filtrar();
    });
    filtros.append(botao);
  }

  async function lerCatalogo() {
    const resposta = await fetch("/pokepedia/pokemon", {
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) throw new Error("Catálogo de Pokémon indisponível.");
    const modelo = document.createElement("template");
    modelo.innerHTML = await resposta.text();
    const especies = new Map();
    for (const entrada of modelo.content.querySelectorAll("article[data-filter-number][data-filter-rank]")) {
      const id = entrada.dataset.filterNumber;
      const nome = entrada.querySelector("h2")?.textContent.trim();
      const rank = entrada.dataset.filterRank;
      const url = entrada.querySelector("a.entry-main")?.getAttribute("href");
      if (/^[1-9]\d*$/.test(id) && nome && ranks.includes(rank) && url === `/pokepedia/pokemon/${id}`) {
        especies.set(id, { id, nome, rank });
      }
    }
    if (!especies.size) throw new Error("A Pokepédia não apresentou os ranks esperados.");
    return [...especies.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function criarPokemon(pokemon) {
    const { id, nome, rank } = pokemon;
    const numero = `#${id.padStart(3, "0")}`;
    const link = document.createElement("a");
    link.className = "tier-pokemon";
    link.href = `https://multipoke.io/pokepedia/pokemon/${id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `${numero} · ${nome} · Rank ${rank}`;
    link.setAttribute("aria-label", `${nome}, rank ${rank}. Abrir na Pokepédia em outra aba.`);
    const icone = document.createElement("span");
    icone.className = "tier-icone";
    icone.dataset.numero = numero;
    const imagem = document.createElement("img");
    imagem.alt = "";
    imagem.width = imagem.height = 56;
    imagem.loading = "lazy";
    imagem.decoding = "async";
    imagem.referrerPolicy = "no-referrer";
    imagem.crossOrigin = "anonymous";
    imagem.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    imagem.addEventListener("error", () => {
      imagem.remove();
      icone.classList.add("sem-icone");
    }, { once: true });
    icone.append(imagem);
    const legenda = document.createElement("span");
    legenda.className = "tier-nome";
    legenda.textContent = nome;
    link.append(icone, legenda);
    return { link, rank, busca: normalizar(`${nome} ${id} ${numero}`) };
  }

  function filtrar() {
    const termo = normalizar(busca.value.trim());
    let total = 0;
    const quantidades = new Map(ranks.map(rank => [rank, 0]));
    for (const item of itens) {
      item.link.hidden = Boolean(rankAtual && item.rank !== rankAtual) || !item.busca.includes(termo);
      if (item.link.hidden) continue;
      total++;
      quantidades.set(item.rank, quantidades.get(item.rank) + 1);
    }
    for (const [rank, grupo] of grupos) {
      const quantidade = quantidades.get(rank);
      grupo.secao.hidden = Boolean(rankAtual && rank !== rankAtual) || Boolean(termo && quantidade === 0);
      grupo.contador.textContent = `${quantidade} Pokémon`;
    }
    status.textContent = !total && termo ? "Nenhum Pokémon encontrado para esta busca."
      : `${total} de ${itens.length} Pokémon · ${rankAtual ? `Rank ${rankAtual}` : "ranks da Pokepédia"}`;
  }

  function apresentar(especies) {
    const fragmento = document.createDocumentFragment();
    grupos.clear();
    itens = especies.map(criarPokemon);
    for (const rank of ranks) {
      const secao = document.createElement("section");
      secao.className = "tier-grupo";
      secao.dataset.rank = rank;
      secao.setAttribute("aria-labelledby", `tier-rank-${rank}`);
      const cabecalho = document.createElement("div");
      cabecalho.className = "tier-cabecalho";
      const selo = document.createElement("span");
      selo.className = "tier-selo";
      selo.textContent = rank;
      selo.setAttribute("aria-hidden", "true");
      const titulo = document.createElement("h4");
      titulo.id = `tier-rank-${rank}`;
      titulo.textContent = `Rank ${rank}`;
      const contador = document.createElement("span");
      contador.className = "tier-contador";
      cabecalho.append(selo, titulo, contador);
      const grade = document.createElement("div");
      grade.className = "tier-grade";
      const membros = itens.filter(item => item.rank === rank);
      grade.append(...membros.map(item => item.link));
      secao.append(cabecalho, grade);
      if (!membros.length) {
        const vazio = document.createElement("p");
        vazio.className = "tier-vazio";
        vazio.textContent = "Nenhum Pokémon neste rank no catálogo atual.";
        secao.append(vazio);
      }
      grupos.set(rank, { secao, contador });
      fragmento.append(secao);
    }
    lista.replaceChildren(fragmento);
    filtrar();
  }

  async function atualizar() {
    if (carregando || (itens.length && Date.now() < expira)) return;
    status.textContent = "Consultando os ranks na Pokepédia...";
    tentar.hidden = true;
    lista.setAttribute("aria-busy", "true");
    carregando = cacheDadosHunts("tierlist-pokemon", lerCatalogo).then(especies => {
      apresentar(especies);
      expira = Date.now() + 15 * 60_000;
    }).catch(() => {
      status.textContent = "Não foi possível carregar os ranks. Confira sua conexão e tente novamente.";
      tentar.hidden = false;
    }).finally(() => {
      lista.setAttribute("aria-busy", "false");
      carregando = undefined;
    });
    await carregando;
  }

  busca.addEventListener("input", () => { if (itens.length) filtrar(); });
  tentar.addEventListener("click", () => void atualizar());
  return atualizar;
}
