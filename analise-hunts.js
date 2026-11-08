function criarAnaliseHunts(campo, { texto, treinador, numero, formatar }) {
  const MINIMO_SEGUNDOS = 300;
  const INTERVALO_LEITURA = 15_000;
  const PREFIXO = "multipoke.auto-loja.hunts.";
  const historicoTemporario = new Map();
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
      segundos,
      data: Date.now(),
    };
    if (![medicao.xp, medicao.drops].every(Number.isSafeInteger)) return "Ganhos fora da faixa de leitura.";
    await salvar(atual.chave, medicao);
    return `Medição atualizada · ${Math.floor(segundos / 60)} min com esta equipe.`;
  }

  function apresentar(equipe, cacada) {
    const historico = equipe ? lerHistorico(equipe.chave) : [];
    const melhor = campo => historico.reduce((primeiro, item) =>
      !primeiro || item[campo] > primeiro[campo] ? item : primeiro, null);
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
