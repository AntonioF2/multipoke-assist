function criarTrocaHunts(campo, { formatar, treinador, podeInteragir }) {
  const INTERVALO_TROCA = 5 * 60_000;
  const PRAZO_CONFIRMACAO = 15_000;
  const jogo = seletor => document.querySelector(seletor);
  const botao = campo("troca-alternar");
  const objetivo = campo("troca-objetivo");
  const minimo = campo("troca-minimo");
  const informar = mensagem => {
    const status = campo("troca-status");
    if (status.textContent !== mensagem) status.textContent = mensagem;
  };
  let sessao;
  let pendente;
  let proximaTroca = 0;
  let ultimaInteracao = -Infinity;
  let ocupada = false;
  let ultimaAnalise;
  const bloqueadas = new Set();

  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (event.isTrusted) ultimaInteracao = performance.now();
    }, { capture: true, passive: true });
  }

  function atualizarMinimo() {
    const porNivel = objetivo.value === "nivel";
    campo("troca-limite").hidden = porNivel;
    minimo.disabled = porNivel || Boolean(sessao);
  }

  objetivo.addEventListener("change", atualizarMinimo);
  atualizarMinimo();

  function definirSessao(atual) {
    sessao = atual;
    botao.textContent = sessao ? "Pausar troca automática" : "Iniciar troca automática";
    objetivo.disabled = Boolean(sessao);
    atualizarMinimo();
  }

  botao.addEventListener("click", () => {
    if (sessao) {
      definirSessao(null);
      informar("Troca automática pausada.");
    } else if (!["xp", "drops", "nivel"].includes(objetivo.value)) {
      informar("Escolha uma prioridade para a troca.");
    } else if (objetivo.value !== "nivel" && !minimo.validity.valid) {
      informar("Informe uma melhoria de 1% a 100%.");
    } else {
      const nome = treinador();
      if (!nome) return informar("Selecione um treinador antes de iniciar a troca automática.");
      bloqueadas.clear();
      definirSessao({ metrica: objetivo.value, minimo: minimo.valueAsNumber, treinador: nome });
      informar(Date.now() < proximaTroca ? "Troca automática ativa. Aguardando o intervalo entre trocas."
        : "Troca automática ativa. Aguardando a comparação.");
    }
  });

  function livre() {
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    return podeInteragir() && document.hasFocus() && !document.hidden &&
      performance.now() - ultimaInteracao >= 3000 &&
      !foco?.matches("input, select, textarea, [contenteditable='true']") &&
      jogo('#game-shell:not([inert]) #hunt-header[aria-label="Hunt atual"]:not(.is-dungeon)') &&
      jogo("#hunt-header-state")?.textContent.trim() === "CAÇANDO" &&
      !jogo("body.pvp-mode, #drawer.open, dialog[open], #connection-screen:not([hidden]), " +
        "#starter-overlay:not([hidden]), #hunt-map-overlay:not([hidden]), #analyzer-insight:not([hidden]), " +
        "#party-members [data-fainted='true'], #party-members [data-recovering='true']");
  }

  function selecionarHunt(slug) {
    const regiao = slug.match(/^(kanto|johto|hoenn)-[\w-]+$/)?.[1];
    const abrir = jogo("#nav-hunt:not(:disabled)");
    const fechar = jogo("#drawer-close:not(:disabled)");
    if (!regiao || !abrir || !fechar) return false;
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    const restaurar = [];
    const buscar = () => jogo(`#hunt-list .hunt-destination [data-hunt-slug="${slug}"]`);

    abrir.click();
    const menu = () => jogo("#drawer.open #hunt-menu:not([hidden])");
    if (!menu()) return false;

    try {
      const abaRegiao = jogo(`#hunt-region-${regiao}:not(:disabled)`);
      if (!abaRegiao) return false;
      const regiaoAnterior = jogo('#hunt-region-tabs [aria-selected="true"]');
      if (regiaoAnterior && regiaoAnterior !== abaRegiao) {
        abaRegiao.click();
        restaurar.push(() => regiaoAnterior.click());
      }

      if (!buscar()) {
        const abaAnterior = jogo('#hunt-menu [id^="hunt-tab-"][aria-selected="true"]');
        const acessiveis = jogo("#hunt-tab-accessible:not(:disabled)");
        if (abaAnterior && acessiveis && abaAnterior !== acessiveis) {
          acessiveis.click();
          restaurar.push(() => abaAnterior.click());
        }
        for (const id of ["hunt-search", "hunt-level-min", "hunt-level-max"]) {
          const campoJogo = document.getElementById(id);
          if (!campoJogo?.value) continue;
          const valor = campoJogo.value;
          const definir = valor => {
            campoJogo.value = valor;
            campoJogo.dispatchEvent(new Event("input", { bubbles: true }));
          };
          definir("");
          restaurar.push(() => definir(valor));
        }
        const tipos = jogo("#hunt-type-filter");
        const todos = tipos?.querySelector('[data-value="all"]:not(:disabled)');
        const tipoAnterior = tipos?.querySelector('[data-value][aria-selected="true"]')?.dataset.value;
        if (todos && tipoAnterior && tipoAnterior !== "all") {
          todos.click();
          restaurar.push(() => tipos.querySelector(`[data-value="${CSS.escape(tipoAnterior)}"]:not(:disabled)`)?.click());
        }
      }

      const cartao = buscar()?.closest('.hunt-destination[data-active="false"][data-locked="false"][data-team-blocked="false"]');
      if (!cartao) return false;
      const seletor = `#hunt-list button[data-hunt-enter="${slug}"]:not(:disabled):not([aria-disabled="true"])`;
      if (!jogo(seletor)) buscar()?.click();
      const entrar = menu() && jogo(seletor);
      if (!entrar) return false;
      entrar.click();
      return true;
    } finally {
      if (menu()) fechar.click();
      for (const restaurarFiltro of restaurar.reverse()) restaurarFiltro();
      if (foco?.isConnected) foco.focus({ preventScroll: true });
    }
  }

  function escolherPorNivel(candidatas, huntAtual) {
    const [hunt] = candidatas.filter(hunt => hunt.nivel > huntAtual.nivel &&
      Number.isFinite(hunt.combate?.custo) && !hunt.combate.pressaoAlta)
      .sort((a, b) => b.nivel - a.nivel || a.combate.custo - b.combate.custo);
    return hunt && { hunt, detalhe: ` (Lv. ${formatar(huntAtual.nivel)} → Lv. ${formatar(hunt.nivel)})` };
  }

  function escolherPorRendimento(candidatas, huntAtual, { metrica, minimo }, rendimentos) {
    const medidos = new Map(rendimentos.map(item => [item.area, item[metrica]]));
    const baseMedida = medidos.get(huntAtual.slug);
    const baseEstimada = pontuacaoCombateHunt(huntAtual, metrica);
    const [alvo] = candidatas.map(hunt => {
      const pontosMedidos = medidos.get(hunt.slug);
      const medida = Number.isFinite(baseMedida) && Number.isFinite(pontosMedidos);
      const base = medida ? baseMedida : baseEstimada;
      const pontos = medida ? pontosMedidos : pontuacaoCombateHunt(hunt, metrica);
      return { hunt, pontos, medida, ganho: pontos > base ? (base === 0 ? Infinity : pontos / base - 1) : 0 };
    }).filter(({ ganho }) => ganho >= minimo / 100 - Number.EPSILON)
      .sort((a, b) => b.ganho - a.ganho || Number(b.medida) - Number(a.medida) || b.pontos - a.pontos);
    if (!alvo) return;
    const { hunt, medida, ganho } = alvo;
    const origem = medida ? "medição recente" : "estimativa";
    const detalhe = Number.isFinite(ganho) ? ` (+${formatar(Math.round(ganho * 100))}% por ${origem})`
      : ` (ganho acima de zero por ${origem})`;
    return { hunt, detalhe };
  }

  async function atualizar(dados, cacada, treinador, confirmarContexto, rendimentos = []) {
    if (pendente) {
      if (cacada?.slug === pendente.slug) {
        informar(`Troca confirmada para ${pendente.nome}.${sessao ? " Aguardando o intervalo antes de outra troca." : ""}`);
        pendente = null;
      } else if (Date.now() >= pendente.vence) {
        informar(`O jogo não confirmou a entrada em ${pendente.nome}. Confira a caçada atual.`);
        pendente = null;
      } else return;
    }
    const atual = sessao;
    if (!atual || ocupada) return;
    if (treinador && treinador !== atual.treinador) {
      definirSessao(null);
      informar("O treinador mudou. Inicie a troca automática para este treinador.");
      return;
    }
    if (!cacada?.slug || !treinador) return informar("Aguardando uma hunt regular ativa com sua equipe.");
    if (Date.now() < proximaTroca) return;
    if (cacada.segundos < 60) return informar("Aguardando o primeiro minuto da caçada.");
    if (!dados) return informar("Atualizando a comparação para o time atual.");
    if (dados !== ultimaAnalise) {
      ultimaAnalise = dados;
      bloqueadas.clear();
    }

    const porNivel = atual.metrica === "nivel";
    const huntAtual = dados.find(hunt => hunt.slug === cacada.slug);
    if (!huntAtual) return informar("Aguardando dados da hunt atual.");
    const candidatas = dados.filter(hunt => hunt !== huntAtual && !bloqueadas.has(hunt.slug));
    const alvo = porNivel ? escolherPorNivel(candidatas, huntAtual)
      : escolherPorRendimento(candidatas, huntAtual, atual, rendimentos);
    if (!alvo) return informar(porNivel ? "Aguardando uma hunt de nível mais alto adequada ao time atual."
      : `Nenhuma hunt disponível entre as comparadas alcançou a melhoria mínima de ${formatar(atual.minimo)}%.`);
    const { hunt, detalhe } = alvo;
    if (!livre()) return informar(`${hunt.nome}${detalhe}. Aguardando o jogo livre e em foco.`);

    ocupada = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, lock => {
        if (!lock || sessao !== atual || !livre() || !confirmarContexto()) return;
        if (!selecionarHunt(hunt.slug)) {
          bloqueadas.add(hunt.slug);
          informar(`${hunt.nome} não está disponível no menu do jogo. Vou verificar as demais opções.`);
          return;
        }
        proximaTroca = Date.now() + INTERVALO_TROCA;
        pendente = { slug: hunt.slug, nome: hunt.nome, vence: Date.now() + PRAZO_CONFIRMACAO };
        informar(`Entrada solicitada em ${hunt.nome}${detalhe}. Aguardando confirmação do jogo.`);
      });
    } catch {
      proximaTroca = Date.now() + INTERVALO_TROCA;
      informar("A tentativa de troca foi interrompida. Confira a caçada atual.");
    } finally {
      ocupada = false;
    }
  }

  return {
    ativa: () => Boolean(sessao || pendente),
    porNivel: () => sessao?.metrica === "nivel",
    emTroca: () => Boolean(ocupada || pendente),
    atualizar,
  };
}
