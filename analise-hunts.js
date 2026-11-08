function criarRecomendadorHunts(campo, { texto, numero, formatar }) {
  const LIMITE_HUNTS = 12;
  const TTL = 15 * 60_000;
  const URL_XP = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv";
  const casasDecimais = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const fichas = new Map();
  let catalogo;
  let consulta;

  const decimal = valor => /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(valor ?? "")
    ? Number(valor.replaceAll(".", "").replace(",", ".")) : NaN;

  async function baixar(url) {
    const resposta = await fetch(url, {
      credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) throw new Error("Fonte de dados indisponível.");
    return resposta.text();
  }

  async function pagina(url) {
    const modelo = document.createElement("template");
    modelo.innerHTML = await baixar(url);
    return modelo.content;
  }

  async function lerIndice() {
    const indice = await pagina("/pokepedia/hunts");
    const hunts = [];
    for (const link of indice.querySelectorAll("a.hunt-entry[href]")) {
      const url = link.getAttribute("href");
      const nome = texto(link, "h2");
      const acesso = texto(link, ".catalog-id").match(/^ACESSO · LV\. ([\d.]+) · (FREE|VIP)$/);
      const nivel = numero(acesso?.[1]);
      if (nome && /^\/pokepedia\/hunts\/[\w-]+$/.test(url) && Number.isSafeInteger(nivel) && nivel > 0) {
        hunts.push({ url, nome, nivel, vip: acesso[2] === "VIP" });
      }
    }
    if (!hunts.length) throw new Error("Catálogo de hunts indisponível.");
    return hunts;
  }

  async function lerXpBase() {
    const [cabecalho, ...linhas] = (await baixar(URL_XP)).trim().split(/\r?\n/);
    const colunas = cabecalho.split(",");
    const id = colunas.indexOf("id");
    const base = colunas.indexOf("base_experience");
    if (id < 0 || base < 0) throw new Error("Referência de XP indisponível.");
    const xp = new Map();
    for (const linha of linhas) {
      const dados = linha.split(",");
      if (/^\d+$/.test(dados[id]) && /^[1-9]\d*$/.test(dados[base])) xp.set(dados[id], Number(dados[base]));
    }
    return xp;
  }

  function carregarCatalogo() {
    if (!catalogo || Date.now() >= catalogo.expira) {
      const atual = { expira: Date.now() + TTL };
      fichas.clear();
      atual.promessa = Promise.all([lerIndice(), lerXpBase().catch(() => null)]).then(([hunts, xp]) => {
        if (!xp) atual.expira = Date.now() + 60_000;
        return { hunts, xp };
      }).catch(erro => {
        atual.expira = Date.now() + 60_000;
        throw erro;
      });
      catalogo = atual;
    }
    return catalogo.promessa;
  }

  async function lerFicha(hunt) {
    const ficha = await pagina(hunt.url);
    const fatos = new Map([...ficha.querySelectorAll(".fact")]
      .map(no => [texto(no, "dt"), texto(no, "dd")]));
    const nivelMinimo = numero(fatos.get("Nível mínimo do Pokémon")?.match(/^Lv\. ([\d.]+)$/)?.[1]);
    const fatorXp = decimal(fatos.get("XP por abate")?.match(/^×([\d.,]+)$/)?.[1]);
    const paragrafos = [...ficha.querySelectorAll(".details-content p")].map(no => no.textContent.trim());
    const ritmo = paragrafos.find(valor => valor.startsWith("Ritmo:"));
    const compensacaoXp = ritmo ? decimal(ritmo.match(/Compensação por abate: XP ×([\d.]+(?:,\d+)?)/)?.[1]) : 1;
    const renda = paragrafos.find(valor => valor.startsWith("Renda bruta média:"));
    const drops = decimal(renda?.match(/ e ([\d.,]+) em itens comuns vendidos ao NPC\./)?.[1]);
    const encontros = [...ficha.querySelectorAll("#encontros tbody tr")].map(linha => {
      const url = linha.querySelector('th a[href^="/pokepedia/pokemon/"]')?.getAttribute("href");
      const id = url?.match(/^\/pokepedia\/pokemon\/(\d+)$/)?.[1];
      const peso = decimal(texto(linha, "td:nth-child(3)").match(/^([\d.,]+)%$/)?.[1]);
      return { id, peso };
    });
    return { ...hunt, nivelMinimo, fatorXp, compensacaoXp, drops, encontros };
  }

  function fichaComCache(hunt) {
    if (!fichas.has(hunt.url)) {
      const promessa = lerFicha(hunt).catch(() => {
        if (fichas.get(hunt.url) === promessa) fichas.delete(hunt.url);
        return null;
      });
      fichas.set(hunt.url, promessa);
    }
    return fichas.get(hunt.url);
  }

  function xpPorAbate(hunt, baseXp, vip) {
    if (!baseXp || !(hunt.fatorXp > 0) || !(hunt.compensacaoXp > 0) || !hunt.encontros.length) return NaN;
    let total = 0;
    let pesoTotal = 0;
    for (const { id, peso } of hunt.encontros) {
      const base = baseXp.get(id);
      if (!(peso > 0) || !base) return NaN;
      total += peso * Math.max(1, Math.round(base * hunt.fatorXp * hunt.compensacaoXp * (vip ? 1.4 : 0.7)));
      pesoTotal += peso;
    }
    return total / pesoTotal;
  }

  async function classificar(nivel, niveisEquipe, vip) {
    const { hunts, xp } = await carregarCatalogo();
    const nivelEquipe = Math.min(...niveisEquipe);
    const referencia = Math.min(nivel, niveisEquipe.reduce((soma, lv) => soma + lv, 0) / niveisEquipe.length);
    const elegiveis = hunts.filter(hunt => hunt.nivel <= nivel && hunt.nivel - nivelEquipe <= 199 &&
      (!hunt.vip || vip));
    elegiveis.sort((a, b) => Math.abs(a.nivel - referencia) - Math.abs(b.nivel - referencia) ||
      b.nivel - a.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
    const candidatas = elegiveis.slice(0, LIMITE_HUNTS);
    const dados = [];
    let falhas = 0;
    for (let i = 0; i < candidatas.length; i += 4) {
      const lote = await Promise.all(candidatas.slice(i, i + 4).map(fichaComCache));
      for (const hunt of lote) {
        if (!hunt || !Number.isSafeInteger(hunt.nivelMinimo)) {
          falhas++;
          continue;
        }
        if (hunt.nivelMinimo > nivelEquipe) continue;
        dados.push({ ...hunt, xp: xpPorAbate(hunt, xp, vip) });
      }
    }
    const melhor = campo => dados.reduce((lider, hunt) =>
      Number.isFinite(hunt[campo]) && (!lider || hunt[campo] > lider[campo]) ? hunt : lider, null);
    return { xp: melhor("xp"), drops: melhor("drops"), total: dados.length, elegiveis: elegiveis.length, falhas };
  }

  function apresentar(resultado, ritmo) {
    const exibir = (id, hunt, metrica, unidade) => {
      const valor = hunt?.[metrica];
      const porHora = Number.isFinite(ritmo) && Number.isSafeInteger(Math.round(valor * ritmo))
        ? ` · ~${formatar(Math.round(valor * ritmo))} ${unidade}/h ao ritmo de ${formatar(ritmo)} abates/h` : "";
      campo(id).textContent = hunt
        ? `${hunt.nome} · Lv. ${formatar(hunt.nivel)} · ${casasDecimais.format(valor)} ${unidade}/abate${porHora}`
        : "Estimativa indisponível";
    };
    exibir("hunt-estimativa-xp", resultado.xp, "xp", "XP");
    exibir("hunt-estimativa-drops", resultado.drops, "drops", "Pokédollars");
    campo("hunt-estimativa-status").textContent = resultado.elegiveis
      ? `${resultado.total} de ${resultado.elegiveis} hunts elegíveis por nível comparadas${resultado.falhas ? ` · ${resultado.falhas} fichas indisponíveis` : ""}.`
      : "Nenhuma hunt regular elegível para este nível e esta equipe.";
  }

  return function recomendar(equipe, ritmo) {
    const nivel = numero(texto(document, "#trainer-level-small").match(/^Lv\. ([\d.]+)$/)?.[1]);
    const niveisEquipe = equipe?.membros.map(membro => numero(membro.nivel.match(/^Lv\. ([\d.]+)$/)?.[1]));
    const vip = document.getElementById("trainer-vip-status")?.dataset.active === "true";
    if (!Number.isSafeInteger(nivel) || nivel < 1 || !niveisEquipe?.every(lv => Number.isSafeInteger(lv) && lv > 0)) {
      consulta = undefined;
      campo("hunt-estimativa-xp").textContent = "Aguardando níveis";
      campo("hunt-estimativa-drops").textContent = "Aguardando níveis";
      campo("hunt-estimativa-status").textContent = "Aguardando o nível do treinador e dos Pokémon ativos.";
      return;
    }

    const chave = JSON.stringify([nivel, niveisEquipe, vip]);
    if (consulta?.chave === chave && Date.now() < consulta.expira) {
      consulta.ritmo = ritmo;
      if (consulta.resultado) apresentar(consulta.resultado, ritmo);
      return;
    }
    const atual = { chave, ritmo, expira: Date.now() + TTL };
    consulta = atual;
    campo("hunt-estimativa-xp").textContent = "Consultando...";
    campo("hunt-estimativa-drops").textContent = "Consultando...";
    campo("hunt-estimativa-status").textContent = `Treinador Lv. ${formatar(nivel)} · Consultando a Pokepédia.`;
    void classificar(nivel, niveisEquipe, vip).then(resultado => {
      if (consulta !== atual) return;
      atual.resultado = resultado;
      if (resultado.falhas || !resultado.xp) atual.expira = Date.now() + 60_000;
      apresentar(resultado, atual.ritmo);
    }).catch(() => {
      if (consulta !== atual) return;
      atual.expira = Date.now() + 60_000;
      campo("hunt-estimativa-xp").textContent = "Estimativa indisponível";
      campo("hunt-estimativa-drops").textContent = "Estimativa indisponível";
      campo("hunt-estimativa-status").textContent = "Não foi possível ler o catálogo. A análise tentará novamente.";
    });
  };
}

function criarAnaliseHunts(campo, { texto, treinador, numero, formatar }) {
  const MINIMO_SEGUNDOS = 300;
  const INTERVALO_LEITURA = 15_000;
  const PREFIXO = "multipoke.auto-loja.hunts.";
  const historicoTemporario = new Map();
  const recomendar = criarRecomendadorHunts(campo, { texto, numero, formatar });
  let sessao;

  const visivel = () => campo("painel").open && !campo("aba-hunts").hidden;
  const mostrar = (id, valor) => {
    const no = campo(id);
    if (no.textContent !== valor) no.textContent = valor;
  };

  function equipeAtual() {
    if (!document.querySelector("#game-shell:not([inert])")) return;
    const nome = treinador();
    const membros = [...document.querySelectorAll("#party-members [data-team-pokemon]")].map(linha => {
      const rotulo = linha.querySelector(".member-label");
      return {
        id: linha.dataset.teamPokemon,
        nome: rotulo?.title || rotulo?.textContent.trim(),
        nivel: texto(linha, ".member-level"),
      };
    });
    if (!nome || !membros.length || membros.some(membro => !membro.id || !membro.nome)) return;
    const chave = PREFIXO + JSON.stringify([nome, membros.map(({ id, nome }) => [id, nome])]);
    return { chave, membros };
  }

  function lerCacada() {
    const cabecalho = document.querySelector('#hunt-header[aria-label="Hunt atual"]:not(.is-dungeon)');
    const hunt = cabecalho && texto(cabecalho, "#hunt-header-name");
    const relogio = document.getElementById("hunt-clock")?.title;
    if (!hunt || !relogio) return;
    const unidades = { dia: 86400, hora: 3600, minuto: 60, segundo: 1 };
    const partes = [...relogio.matchAll(/([\d.]+) (dia|hora|minuto|segundo)s?/g)];
    const segundos = partes.reduce((total, [, quantidade, unidade]) => total + numero(quantidade) * unidades[unidade], 0);
    const abates = numero(texto(document, "#kill-count"));
    if ((!partes.length && relogio !== "menos de 1 segundo") ||
        !Number.isSafeInteger(segundos) || !Number.isSafeInteger(abates)) return;
    return { hunt, segundos, abates };
  }

  function acompanhar(equipe, cacada) {
    if (!equipe || !cacada) {
      sessao = undefined;
      return;
    }
    if (sessao?.chave !== equipe.chave || sessao.hunt !== cacada.hunt ||
        cacada.segundos < sessao.segundos || cacada.abates < sessao.abates) {
      sessao = {
        chave: equipe.chave,
        hunt: cacada.hunt,
        base: cacada.segundos <= 15 && cacada.abates === 0 ? { segundos: 0, xp: 0, drops: 0, abates: 0 } : null,
        proximaLeitura: 0,
        mensagem: "",
      };
    }
    sessao.segundos = cacada.segundos;
    sessao.abates = cacada.abates;
  }

  function lerDetalhe(popup, tipo, extrair) {
    const botao = document.querySelector(`.ha-analyzer button[data-insight="${tipo}"][aria-controls="analyzer-insight"]:not(:disabled)`);
    const fechar = popup.querySelector("#insight-close");
    const conteudo = popup.querySelector("#insight-content");
    if (!popup.hidden || !botao || !fechar || !conteudo) return NaN;
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    try {
      botao.click();
      return !popup.hidden && botao.getAttribute("aria-expanded") === "true" ? extrair(conteudo) : NaN;
    } finally {
      if (!popup.hidden && botao.getAttribute("aria-expanded") === "true") fechar.click();
      if (foco?.isConnected) foco.focus({ preventScroll: true });
    }
  }

  function lerTotais(popup) {
    const xp = lerDetalhe(popup, "xp", conteudo =>
      numero(texto(conteudo, "p.ha-detail-subtitle").match(/^\+([\d.]+) XP em /)?.[1]));
    const drops = lerDetalhe(popup, "economy", conteudo => {
      const linhas = [...conteudo.querySelectorAll("[data-drop-item]")];
      if (!linhas.length) {
        const vazio = [...conteudo.querySelectorAll(".ha-muted")]
          .some(no => no.textContent.trim() === "Nenhum drop registrado.");
        return vazio ? 0 : NaN;
      }
      return linhas.reduce((total, linha) =>
        total + numero(texto(linha, "td:last-child").match(/^\$\s*([\d.]+)$/)?.[1]), 0);
    });
    if (Number.isSafeInteger(xp) && Number.isSafeInteger(drops)) return { xp, drops };
  }

  function lerHistorico(chave) {
    if (historicoTemporario.has(chave)) return historicoTemporario.get(chave);
    try {
      const salvas = JSON.parse(localStorage.getItem(chave));
      if (Array.isArray(salvas)) {
        return salvas.filter(item => typeof item?.hunt === "string" &&
          [item.xp, item.drops, item.segundos, item.data].every(Number.isSafeInteger));
      }
    } catch { /* O histórico também pode ser mantido nesta aba. */ }
    return [];
  }

  function salvar(chave, medicao) {
    return navigator.locks.request(chave, () => {
      const historico = lerHistorico(chave);
      const anterior = historico.find(item => item.hunt === medicao.hunt);
      if (anterior?.data > medicao.data) return;
      const dados = [medicao, ...historico.filter(item => item.hunt !== medicao.hunt)].slice(0, 100);
      try {
        localStorage.setItem(chave, JSON.stringify(dados));
        historicoTemporario.delete(chave);
      } catch { historicoTemporario.set(chave, dados); }
    });
  }

  async function medir(atual, cacada, popup) {
    const totais = lerTotais(popup);
    if (!totais) return "Aguardando os totais do Registro da Caçada.";
    const amostra = { ...totais, segundos: cacada.segundos, abates: cacada.abates };
    if (!atual.base || totais.xp < atual.base.xp || totais.drops < atual.base.drops) {
      atual.base = amostra;
      return "Medição iniciada para esta equipe.";
    }

    const segundos = amostra.segundos - atual.base.segundos;
    if (segundos < MINIMO_SEGUNDOS || amostra.abates <= atual.base.abates) {
      return `Medindo esta equipe · ${Math.floor(segundos / 60)} de 5 min e pelo menos um abate.`;
    }
    const porHora = campo => Math.round((amostra[campo] - atual.base[campo]) * 3600 / segundos);
    const medicao = {
      hunt: cacada.hunt,
      xp: atual.base.segundos === 0 ? numero(texto(document, "#xp-per-hour")) : porHora("xp"),
      drops: porHora("drops"),
      abatesHora: porHora("abates"),
      segundos,
      data: Date.now(),
    };
    if (![medicao.xp, medicao.drops, medicao.abatesHora].every(Number.isSafeInteger)) {
      return "Ganhos fora da faixa de leitura.";
    }
    await salvar(atual.chave, medicao);
    return `Medição atualizada · ${Math.floor(segundos / 60)} min com esta equipe.`;
  }

  function apresentar(equipe, cacada) {
    const historico = equipe ? lerHistorico(equipe.chave) : [];
    const melhor = campo => historico.reduce((primeiro, item) =>
      !primeiro || item[campo] > primeiro[campo] ? item : primeiro, null);
    const xp = melhor("xp");
    const drops = melhor("drops");
    const ritmo = cacada && historico.find(item => item.hunt === cacada.hunt)?.abatesHora;
    recomendar(equipe, ritmo);
    const xpOficial = numero(texto(document, "#xp-per-hour"));
    mostrar("hunt-equipe", equipe?.membros.map(membro => [membro.nome, membro.nivel].filter(Boolean).join(" ")).join(" · ")
      || "Aguardando a equipe ativa.");
    mostrar("hunt-atual", cacada
      ? `${cacada.hunt}${Number.isFinite(xpOficial) ? ` · ${formatar(xpOficial)} XP/h na sessão` : ""}`
      : "Entre em uma hunt para iniciar a medição.");
    mostrar("hunt-melhor-xp", xp ? `${xp.hunt} · ${formatar(xp.xp)} XP/h` : "Aguardando medição");
    mostrar("hunt-melhor-drops", drops ? `${drops.hunt} · ${formatar(drops.drops)} Pokédollars/h` : "Aguardando medição");
    mostrar("hunt-historico", historico.length
      ? historico.map(item => `${item.hunt} · ${formatar(item.xp)} XP/h · ${formatar(item.drops)} Pokédollars/h · ${Math.floor(item.segundos / 60)} min`).join("\n")
      : "Ainda sem hunts medidas com esta formação.");
  }

  async function atualizar() {
    const equipe = equipeAtual();
    const cacada = lerCacada();
    acompanhar(equipe, cacada);
    if (!visivel()) return;
    apresentar(equipe, cacada);
    const atual = sessao;
    if (!atual) return mostrar("hunt-medicao", "Aguardando uma caçada com a equipe ativa.");
    mostrar("hunt-medicao", atual.mensagem || "Aguardando a primeira leitura desta equipe.");
    if (Date.now() < atual.proximaLeitura || document.hidden || !document.hasFocus() ||
        document.querySelector("dialog[open], #drawer.open")) return;
    const popup = document.getElementById("analyzer-insight");
    if (!popup?.hidden) return mostrar("hunt-medicao", "Aguardando o Registro da Caçada ficar disponível.");
    if (!/^[+-]?\$\s*[\d.]+$/.test(texto(document, "#metric-profit-rate"))) {
      return mostrar("hunt-medicao", "Aguardando uma medição completa no Registro da Caçada.");
    }
    atual.proximaLeitura = Date.now() + INTERVALO_LEITURA;
    try { atual.mensagem = await medir(atual, cacada, popup); }
    catch { atual.mensagem = "Não foi possível salvar a medição desta caçada."; }
    if (sessao === atual && visivel()) {
      mostrar("hunt-medicao", atual.mensagem);
      apresentar(equipe, cacada);
    }
  }

  setInterval(() => void atualizar(), 5000);
  const observar = new MutationObserver(() => acompanhar(equipeAtual(), lerCacada()));
  for (const id of ["party-members", "hunt-header", "hunt-clock"]) {
    const no = document.getElementById(id);
    if (no) observar.observe(no, { childList: true, subtree: true, characterData: true, attributeFilter: ["aria-label", "data-team-pokemon"] });
  }
  return atualizar;
}
