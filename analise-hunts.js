function pontuacaoCombateHunt(hunt, metrica) {
  return Number.isFinite(hunt?.combate?.custo) && Number.isFinite(hunt[metrica]) ? hunt[metrica] / hunt.combate.custo : NaN;
}

function lerBonusHunts() {
  const fator = (rotulo, padrao) => {
    const percentual = Number(rotulo?.match(padrao)?.[1]?.replaceAll(".", "").replace(",", "."));
    return Number.isFinite(percentual) ? 1 + percentual / 100 : 1;
  };
  const bonus = [...document.querySelectorAll("#active-boosts:not([hidden]) button:not([hidden])")]
    .map(botao => botao.hasAttribute("data-live-xp-badge") ? "live" : botao.title.split(" · ")[0]).sort();
  const eventos = [];
  let global = 1;
  let beta = 1;
  for (const botao of document.querySelectorAll("#global-boost-events:not([hidden]) button[data-global-boost-event]:not([hidden])")) {
    const efeitos = [...botao.querySelectorAll("[data-global-boost-kind]")];
    eventos.push([botao.dataset.globalBoostEvent, efeitos.map(no => no.textContent.trim())]);
    for (const efeito of efeitos) {
      const multiplicador = fator(efeito.textContent, /\+([\d.,]+)%/);
      if (efeito.dataset.globalBoostKind === "xp") global = Math.max(global, multiplicador);
      if (efeito.dataset.globalBoostKind === "betaXp") beta = Math.max(beta, multiplicador);
    }
  }
  const dia = document.querySelector("#global-boost-events:not([hidden]) button[data-daily-type]:not([hidden])");
  const tipoDia = dia?.dataset.dailyType ?? "";
  const fatorDia = fator(dia?.getAttribute("aria-label"), /\+([\d.,]+)% de XP\b/);
  const nomeDia = dia?.querySelector(".global-boost-event-label")?.textContent.trim() || `Tipo do Dia (${tipoDia})`;
  const vip = document.getElementById("trainer-vip-status")?.dataset.active === "true";
  const pessoal = Math.max(1, ...bonus.map(rotulo => fator(rotulo, /\+([\d.,]+)% de XP do treinador\b/)));
  const live = bonus.includes("live") ? 1.1 : 1;
  return { bonus, eventos, tipoDia, nomeDia, fatorDia, vip, pessoal, live, global, beta };
}

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
  const combate = criarModeloCombateHunts(pagina, { texto, decimal, numero });

  async function lerIndice() {
    const indice = await pagina("/pokepedia/hunts");
    const hunts = [];
    for (const link of indice.querySelectorAll("a.hunt-entry[href]")) {
      const url = link.getAttribute("href");
      const nome = texto(link, "h2");
      const acesso = texto(link, ".catalog-id").match(/^ACESSO · LV\. ([\d.]+) · (FREE|VIP)$/);
      const nivel = numero(acesso?.[1]);
      if (nome && /^\/pokepedia\/hunts\/[\w-]+$/.test(url) && Number.isSafeInteger(nivel) && nivel > 0) {
        hunts.push({ url, slug: url.split("/").at(-1), nome, nivel, vip: acesso[2] === "VIP" });
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
    if (!xp.size) throw new Error("Referência de XP vazia.");
    return [...xp];
  }

  function carregarCatalogo() {
    if (!catalogo || Date.now() >= catalogo.expira) {
      const atual = { expira: Date.now() + TTL };
      fichas.clear();
      combate.limparCache();
      atual.promessa = Promise.all([
        cacheDadosHunts("indice", lerIndice),
        cacheDadosHunts("xp", lerXpBase).catch(() => null),
      ]).then(([hunts, xp]) => {
        if (!xp) atual.expira = Date.now() + 60_000;
        return { hunts, xp: xp && new Map(xp) };
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
    const ritmoPassos = decimal(ritmo?.match(/duração ×([\d.,]+)/)?.[1]) || 1;
    const pressao = decimal(paragrafos.find(valor => valor.startsWith("Pressão de ataque dos selvagens:"))
      ?.match(/×([\d.,]+)/)?.[1]) || 1;
    const renda = paragrafos.find(valor => valor.startsWith("Renda bruta média:"));
    const drops = decimal(renda?.match(/ e ([\d.,]+) em itens comuns vendidos ao NPC\./)?.[1]);
    const encontros = [...ficha.querySelectorAll("#encontros tbody tr")].map(linha => {
      const url = linha.querySelector('th a[href^="/pokepedia/pokemon/"]')?.getAttribute("href");
      const id = url?.match(/^\/pokepedia\/pokemon\/(\d+)$/)?.[1];
      const peso = decimal(texto(linha, "td:nth-child(3)").match(/^([\d.,]+)%$/)?.[1]);
      const faixa = texto(linha, "td:nth-child(2)").match(/^(?:Lv\. )?([\d.]+)(?:\s*[–—-]\s*([\d.]+))?$/);
      const minimo = numero(faixa?.[1]);
      const maximo = numero(faixa?.[2] ?? faixa?.[1]);
      return { id, peso, minimo, maximo };
    });
    return { ...hunt, nivelMinimo, fatorXp, compensacaoXp, drops, encontros, ritmo: ritmoPassos, pressao };
  }

  function fichaComCache(hunt) {
    if (!fichas.has(hunt.url)) {
      const promessa = cacheDadosHunts(`hunt/${hunt.slug}`, () => lerFicha(hunt), ficha =>
        Number.isSafeInteger(ficha.nivelMinimo) && Number.isFinite(ficha.drops) && ficha.fatorXp > 0 &&
        ficha.encontros.length && ficha.encontros.every(encontro => encontro.id && encontro.peso > 0 && encontro.minimo > 0),
      ).then(ficha => ({ ...ficha, ...hunt })).catch(() => {
        if (fichas.get(hunt.url) === promessa) fichas.delete(hunt.url);
        return null;
      });
      fichas.set(hunt.url, promessa);
    }
    return fichas.get(hunt.url);
  }

  async function xpPorAbate(hunt, baseXp, bonus, tipos) {
    if (!baseXp || !(hunt.fatorXp > 0) || !(hunt.compensacaoXp > 0) || !hunt.encontros.length) return NaN;
    const { vip, pessoal, live, global, beta, tipoDia, fatorDia } = bonus;
    const fatorBase = vip ? 1.4 : 0.7;
    const usarTipoDia = tipoDia && fatorDia > 1;
    const tiposEncontros = usarTipoDia
      ? await Promise.all(hunt.encontros.map(({ id }) => combate.carregarTipos(id, tipos))) : [];
    if (tiposEncontros.some(tipos => !tipos)) return NaN;
    let total = 0;
    let pesoTotal = 0;
    for (const [i, { id, peso }] of hunt.encontros.entries()) {
      const base = baseXp.get(id);
      if (!(peso > 0) || !base) return NaN;
      const bonusEncontro = tiposEncontros[i]?.includes(tipoDia) ? fatorDia : 1;
      const xp = base * hunt.fatorXp * hunt.compensacaoXp * fatorBase * pessoal * live * global * beta * bonusEncontro;
      total += peso * Math.max(1, Math.round(xp));
      pesoTotal += peso;
    }
    return total / pesoTotal;
  }

  async function classificar(nivel, niveisEquipe, bonus, membros, golpesAtivos, slugAtual, porNivel) {
    const { hunts, xp } = await carregarCatalogo();
    const { vip, tipoDia, fatorDia } = bonus;
    const nivelEquipe = Math.min(...niveisEquipe);
    const referencia = Math.min(nivel, niveisEquipe.reduce((soma, lv) => soma + lv, 0) / niveisEquipe.length);
    const elegiveis = hunts.filter(hunt => hunt.nivel <= nivel && hunt.nivel - nivelEquipe <= 199 &&
      (!hunt.vip || vip) && (!slugAtual || /^(kanto|johto|hoenn)-/.test(hunt.slug)));
    elegiveis.sort((a, b) => Math.abs(a.nivel - referencia) - Math.abs(b.nivel - referencia) ||
      b.nivel - a.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
    const candidatas = new Set(elegiveis.slice(0, LIMITE_HUNTS));
    if (slugAtual) {
      const nivelAtual = hunts.find(hunt => hunt.slug === slugAtual)?.nivel;
      const maiorNivel = Math.max(...elegiveis.map(hunt => hunt.nivel));
      for (const hunt of elegiveis) {
        if (hunt.slug === slugAtual || hunt.nivel === maiorNivel || (porNivel && hunt.nivel > nivelAtual)) {
          candidatas.add(hunt);
        }
      }
    }
    const selecionadas = [...candidatas];
    const tipos = xp && selecionadas.length && tipoDia && fatorDia > 1 ? (await combate.carregarIndice())?.tipos : null;
    const dados = [];
    let falhas = 0;
    for (let i = 0; i < selecionadas.length; i += 4) {
      const lote = await Promise.all(selecionadas.slice(i, i + 4).map(fichaComCache));
      const validas = [];
      for (const hunt of lote) {
        if (!hunt || !Number.isSafeInteger(hunt.nivelMinimo)) {
          falhas++;
          continue;
        }
        if (hunt.nivelMinimo <= nivelEquipe) validas.push(hunt);
      }
      const estimativas = await Promise.all(validas.map(async hunt => ({ ...hunt, xp: await xpPorAbate(hunt, xp, bonus, tipos) })));
      dados.push(...estimativas);
    }
    const equipe = dados.length && await combate.carregarEquipe(membros, niveisEquipe, golpesAtivos);
    if (equipe) {
      for (let i = 0; i < dados.length; i += 2) {
        await Promise.all(dados.slice(i, i + 2).map(async hunt => {
          hunt.combate = await combate.comparar(hunt, equipe);
        }));
      }
    }
    return { dados, elegiveis: elegiveis.length, falhas };
  }

  function apresentar(resultado, medicao) {
    const { dados, elegiveis, falhas } = resultado;
    const comparadas = dados.filter(hunt => hunt.combate);
    const comCombate = comparadas.length > 0;
    const referencia = comparadas.find(hunt => hunt.slug === medicao?.area);
    const fatorHora = Number.isFinite(referencia?.combate.custo) && medicao.abatesHora > 0
      ? referencia.combate.custo * medicao.abatesHora : NaN;
    const candidatas = comCombate ? comparadas : dados;
    const pontuar = (hunt, metrica) => comCombate ? pontuacaoCombateHunt(hunt, metrica) : hunt[metrica];
    const melhor = metrica => candidatas.reduce((lider, hunt) => {
      const pontos = pontuar(hunt, metrica);
      return Number.isFinite(pontos) && (!comCombate || Number.isFinite(hunt.combate.custo)) &&
        (!lider || pontos > pontuar(lider, metrica)) ? hunt : lider;
    }, null);
    const porHora = (hunt, metrica, unidade) => {
      const valor = Math.round(pontuar(hunt, metrica) * fatorHora);
      return Number.isSafeInteger(valor) ? ` · ~${formatar(valor)} ${unidade}/h` : "";
    };
    const exibir = (id, hunt, metrica, unidade) => {
      campo(id).textContent = hunt
        ? `${hunt.nome} · Lv. ${formatar(hunt.nivel)} · ${casasDecimais.format(hunt[metrica])} ${unidade}/abate${porHora(hunt, metrica, unidade)}`
        : "Estimativa indisponível";
    };
    const melhorXp = melhor("xp");
    const melhoresDrops = melhor("drops");
    exibir("hunt-estimativa-xp", melhorXp, "xp", "XP");
    exibir("hunt-estimativa-drops", melhoresDrops, "drops", "Pokédollars");
    const metodo = comCombate
      ? `${comparadas.length} com comparação de combate${Number.isFinite(fatorHora) ? " e ritmo calibrado" : " e ritmo relativo"}`
      : "classificação por abate enquanto faltam dados de combate";
    campo("hunt-estimativa-status").textContent = elegiveis
      ? `${dados.length} de ${elegiveis} hunts elegíveis por nível comparadas · ${metodo}${falhas ? ` · ${falhas} fichas indisponíveis` : ""}.`
      : "Nenhuma hunt regular elegível para este nível e esta equipe.";
    const custos = comparadas.map(hunt => hunt.combate.custo).filter(Number.isFinite);
    const maisRapida = Math.min(...custos);
    const comparacao = dados.map(hunt => {
      const titulo = `${hunt.nome} (Lv. ${formatar(hunt.nivel)})`;
      if (!hunt.combate) return `${titulo}\nDados de combate indisponíveis para esta comparação.`;
      const { custo, pressaoAlta } = hunt.combate;
      if (!Number.isFinite(custo)) return `${titulo}\nCobertura insuficiente contra parte dos encontros.`;

      const ritmo = custo === maisRapida ? "Ritmo mais rápido para o time"
        : `${formatar(Math.round(100 * maisRapida / custo))}% do melhor ritmo do time`;
      const destaques = [ritmo];
      if (hunt === melhorXp) destaques.push("melhor para XP");
      if (hunt === melhoresDrops) destaques.push("melhor para drops");
      if (pressaoAlta) destaques.push("dano recebido pode atrasar abates");
      return `${titulo}\n${destaques.join(" · ")}.`;
    }).join("\n\n") || "Aguardando hunts para comparar.";
    const lista = campo("hunt-comparacao");
    if (lista.textContent !== comparacao) lista.textContent = comparacao;
  }

  return function recomendar(equipe, golpesAtivos, medicao, slugAtual, bonus, porNivel) {
    const nivel = numero(texto(document, "#trainer-level-small").match(/^Lv\. ([\d.]+)$/)?.[1]);
    const niveisEquipe = equipe?.membros.map(membro => numero(membro.nivel.match(/^Lv\. ([\d.]+)$/)?.[1]));
    const { vip, pessoal, live, global, beta, tipoDia, nomeDia, fatorDia } = bonus;
    const ativos = [["VIP", vip ? 2 : 1], ["XP Boost", pessoal], ["Live", live],
      ["Evento de XP", global], ["Beta XP", beta], [nomeDia, tipoDia ? fatorDia : 1]]
      .filter(([, fator]) => fator > 1).map(([nome, fator]) => `${nome} ×${casasDecimais.format(fator)}`);
    const rotuloBonus = ativos.length ? `Bônus de XP ativos · ${ativos.join(" · ")}` : "Sem bônus de XP ativos.";
    if (campo("hunt-bonus-xp").textContent !== rotuloBonus) campo("hunt-bonus-xp").textContent = rotuloBonus;
    if (!Number.isSafeInteger(nivel) || nivel < 1 || !niveisEquipe?.every(lv => Number.isSafeInteger(lv) && lv > 0)) {
      consulta = undefined;
      campo("hunt-estimativa-xp").textContent = "Aguardando níveis";
      campo("hunt-estimativa-drops").textContent = "Aguardando níveis";
      campo("hunt-estimativa-status").textContent = "Aguardando o nível do treinador e dos Pokémon ativos.";
      campo("hunt-comparacao").textContent = "";
      return;
    }

    const chave = JSON.stringify([nivel, equipe.chave, niveisEquipe, golpesAtivos, slugAtual, porNivel,
      vip, pessoal, live, global, beta, tipoDia, fatorDia]);
    if (consulta?.chave === chave && Date.now() < consulta.expira) {
      consulta.medicao = medicao;
      if (consulta.resultado) apresentar(consulta.resultado, medicao);
      return consulta.resultado?.dados;
    }
    const atual = { chave, medicao, expira: Date.now() + TTL };
    consulta = atual;
    campo("hunt-estimativa-xp").textContent = "Consultando...";
    campo("hunt-estimativa-drops").textContent = "Consultando...";
    campo("hunt-estimativa-status").textContent = `Treinador Lv. ${formatar(nivel)} · Consultando a Pokepédia.`;
    campo("hunt-comparacao").textContent = "Consultando as fichas de combate...";
    void classificar(nivel, niveisEquipe, bonus, equipe.membros, golpesAtivos, slugAtual, porNivel).then(resultado => {
      if (consulta !== atual) return;
      atual.resultado = resultado;
      if (resultado.falhas || resultado.dados.some(hunt => !hunt.combate || !Number.isFinite(hunt.xp))) {
        atual.expira = Date.now() + 60_000;
      }
      apresentar(resultado, atual.medicao);
    }).catch(() => {
      if (consulta !== atual) return;
      atual.expira = Date.now() + 60_000;
      campo("hunt-estimativa-xp").textContent = "Estimativa indisponível";
      campo("hunt-estimativa-drops").textContent = "Estimativa indisponível";
      campo("hunt-estimativa-status").textContent = "Não foi possível ler o catálogo. A análise tentará novamente.";
      campo("hunt-comparacao").textContent = "";
    });
  };
}

function criarAnaliseHunts(campo, { texto, treinador, numero, formatar, trocaHunts }) {
  const MINIMO_SEGUNDOS = 300;
  const INTERVALO_LEITURA = 15_000;
  const recomendar = criarRecomendadorHunts(campo, { texto, numero, formatar });
  let sessao;
  let consultaHistorico;
  const historico = criarAcessoHistoricoHunts(campo, () => { consultaHistorico = undefined; });

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
    const chave = JSON.stringify([nome, membros.map(({ id, nome }) => [id, nome])]);
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
    const slug = cabecalho.querySelector("#hunt-header-encounters [data-hunt-context]")?.dataset.huntContext;
    return { hunt, slug, segundos, abates };
  }

  function acompanhar(equipe, cacada) {
    if (!equipe || !cacada) {
      sessao = undefined;
      return;
    }
    if (sessao?.chave !== equipe.chave || sessao.hunt !== cacada.hunt || sessao.slug !== cacada.slug ||
        cacada.segundos < sessao.segundos || cacada.abates < sessao.abates) {
      sessao = {
        chave: equipe.chave,
        hunt: cacada.hunt,
        slug: cacada.slug,
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

  function contextoMedicao(equipe, golpesAtivos, bonusAtivos) {
    if (!equipe || !golpesAtivos.every(Boolean)) return "";
    const { vip, bonus, eventos, tipoDia, fatorDia } = bonusAtivos;
    const contexto = [equipe.membros.map(membro => membro.nivel), golpesAtivos, vip, bonus, eventos, tipoDia];
    // Mantém as medições do calendário padrão e separa dias com outro bônus de XP.
    if (tipoDia && fatorDia !== 1.2) contexto.push(fatorDia);
    return JSON.stringify(contexto);
  }

  function consultarHistorico(equipe, contexto) {
    const chave = JSON.stringify([equipe, contexto]);
    if (consultaHistorico?.chave === chave && Date.now() < consultaHistorico.expira) return consultaHistorico.dados;
    const atual = {
      chave, expira: Date.now() + 30_000,
      dados: consultaHistorico?.chave === chave ? consultaHistorico.dados : undefined,
    };
    consultaHistorico = atual;
    void historico.ler(equipe, contexto).then(dados => { atual.dados = dados; }).catch(() => {
      atual.dados = { recordes: [], rendimentos: [], indisponivel: true };
    });
    return atual.dados;
  }

  async function medir(atual, cacada, popup, contexto) {
    if (!atual.pendente) {
      const totais = lerTotais(popup);
      if (!totais) return "Aguardando os totais do Registro da Caçada.";
      const amostra = { ...totais, segundos: cacada.segundos, abates: cacada.abates };
      const base = atual.base;
      const intervalo = cacada.segundos - (atual.ultimaLeitura ?? -Infinity);
      atual.ultimaLeitura = cacada.segundos;
      if (!base || intervalo > 45 || totais.xp < base.xp || totais.drops < base.drops) {
        atual.base = amostra;
        return "Medição iniciada para esta equipe.";
      }

      const segundos = amostra.segundos - base.segundos;
      const abates = amostra.abates - base.abates;
      if (segundos < MINIMO_SEGUNDOS || abates <= 0) {
        return `Medindo esta equipe · ${Math.floor(segundos / 60)} de 5 min e pelo menos um abate.`;
      }
      atual.pendente = { amostra, medicao: {
        equipe: atual.chave, contexto, area: cacada.slug, hunt: cacada.hunt,
        id: crypto.randomUUID(), data: Date.now(), legado: false, segundos, abates,
        xp: amostra.xp - base.xp, drops: amostra.drops - base.drops,
      } };
    }
    const { medicao, amostra } = atual.pendente;
    await historico.salvar(medicao);
    atual.pendente = null;
    if (atual.contexto === medicao.contexto && atual.base) atual.base = amostra;
    const { segundos } = medicao;
    return `Medição atualizada · ${Math.floor(segundos / 60)} min com esta equipe.`;
  }

  function apresentar(equipe, cacada, dados) {
    const recordes = dados?.recordes ?? [];
    const melhor = campo => recordes.reduce((primeiro, item) =>
      !primeiro || item[campo][campo] > primeiro[campo] ? item[campo] : primeiro, null);
    const xp = melhor("xp");
    const drops = melhor("drops");
    const xpOficial = numero(texto(document, "#xp-per-hour"));
    mostrar("hunt-equipe", equipe?.membros.map(membro => [membro.nome, membro.nivel].filter(Boolean).join(" ")).join(" · ")
      || "Aguardando a equipe ativa.");
    mostrar("hunt-atual", cacada
      ? `${cacada.hunt}${Number.isFinite(xpOficial) ? ` · ${formatar(xpOficial)} XP/h na sessão` : ""}`
      : "Entre em uma hunt para iniciar a medição.");
    mostrar("hunt-melhor-xp", xp ? `${xp.hunt} · ${formatar(xp.xp)} XP/h` : "Aguardando medição");
    mostrar("hunt-melhor-drops", drops ? `${drops.hunt} · ${formatar(drops.drops)} Pokédollars/h` : "Aguardando medição");
    const recentes = recordes.map(item => item.ultima).sort((a, b) => b.data - a.data).slice(0, 100);
    mostrar("hunt-historico", recentes.length
      ? recentes.map(item => `${item.hunt} · ${formatar(item.xp)} XP/h · ${formatar(item.drops)} Pokédollars/h · ${Math.floor(item.segundos / 60)} min${item.legado ? " · histórico anterior" : ""}`).join("\n")
      : dados?.indisponivel ? "Histórico indisponível. Tentando reconectar ao banco local."
        : equipe && !dados ? "Carregando histórico..." : "Ainda sem hunts medidas com esta formação.");
  }

  const reiniciarJanela = () => { if (sessao) sessao.base = null; };
  window.addEventListener("blur", reiniciarJanela);
  document.addEventListener("visibilitychange", reiniciarJanela);

  async function atualizar() {
    const equipe = equipeAtual();
    const cacada = lerCacada();
    acompanhar(equipe, cacada);
    const mostraAnalise = visivel();
    const trocaAtiva = trocaHunts.ativa();
    if (!mostraAnalise && !trocaAtiva) return reiniciarJanela();
    const golpesAtivos = equipe ? lerGolpesHunts(equipe.membros) : [];
    const bonus = lerBonusHunts();
    const contextoAtual = contextoMedicao(equipe, golpesAtivos, bonus);
    const historicoAtual = equipe && consultarHistorico(equipe.chave, contextoAtual);
    const rendimentos = historicoAtual?.rendimentos;
    const referencia = rendimentos?.find(item => item.area === cacada?.slug);
    if (mostraAnalise) apresentar(equipe, cacada, historicoAtual);
    const slugAtual = trocaAtiva ? cacada?.slug : undefined;
    const porNivel = trocaHunts.porNivel();
    const dados = (mostraAnalise || slugAtual) ? recomendar(equipe, golpesAtivos, referencia, slugAtual, bonus, porNivel) : undefined;
    if (trocaAtiva) {
      const contexto = (time, golpes, medicao) => JSON.stringify([time, golpes, texto(document, "#trainer-level-small"), medicao]);
      const inicial = contexto(equipe, golpesAtivos, contextoAtual);
      void trocaHunts.atualizar(porNivel ? dados : historicoAtual && dados, cacada, treinador(), () => {
        const time = equipeAtual();
        if (lerCacada()?.slug !== slugAtual) return false;
        const golpes = time ? lerGolpesHunts(time.membros) : [];
        return contexto(time, golpes, contextoMedicao(time, golpes, lerBonusHunts())) === inicial;
      }, rendimentos);
    }
    const atual = sessao;
    if (!atual || !cacada.slug || !contextoAtual) return mostrar("hunt-medicao", "Aguardando uma caçada e a leitura dos golpes da equipe.");
    if (atual.contexto !== contextoAtual) {
      atual.contexto = contextoAtual;
      atual.base = null;
    }
    mostrar("hunt-medicao", atual.mensagem || "Aguardando a primeira leitura desta equipe.");
    if (trocaHunts.emTroca() || document.hidden || !document.hasFocus() ||
        document.querySelector("dialog[open], #drawer.open, body.pvp-mode")) return reiniciarJanela();
    if (atual.lendo || Date.now() < atual.proximaLeitura) return;
    const popup = document.getElementById("analyzer-insight");
    if (!popup?.hidden) return mostrar("hunt-medicao", "Aguardando o Registro da Caçada ficar disponível.");
    if (!/^[+-]?\$\s*[\d.]+$/.test(texto(document, "#metric-profit-rate"))) {
      return mostrar("hunt-medicao", "Aguardando uma medição completa no Registro da Caçada.");
    }
    atual.proximaLeitura = Date.now() + INTERVALO_LEITURA;
    atual.lendo = true;
    try { atual.mensagem = await medir(atual, cacada, popup, contextoAtual); }
    catch { atual.mensagem = "Não foi possível salvar a medição desta caçada."; }
    finally { atual.lendo = false; }
    if (sessao === atual && visivel()) mostrar("hunt-medicao", atual.mensagem);
  }

  setInterval(() => void atualizar(), 5000);
  const observar = new MutationObserver(() => acompanhar(equipeAtual(), lerCacada()));
  for (const id of ["party-members", "hunt-header", "hunt-clock"]) {
    const no = document.getElementById(id);
    if (no) observar.observe(no, { childList: true, subtree: true, characterData: true, attributeFilter: ["aria-label", "data-team-pokemon"] });
  }
  return atualizar;
}
