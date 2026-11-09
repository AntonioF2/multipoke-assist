function criarTrocaHunts(campo, { formatar, treinador, podeInteragir }) {
  const INTERVALO_TROCA = 5 * 60_000;
  const INTERVALO_CONSULTA = 60_000;
  const PRAZO_CONFIRMACAO = 15_000;
  const jogo = seletor => document.querySelector(seletor);
  const botao = campo("troca-alternar");
  const status = campo("troca-status");
  const informar = mensagem => {
    if (status.textContent !== mensagem) status.textContent = mensagem;
  };
  let sessao;
  let pendente;
  let proximaConsulta = 0;
  let proximaTroca = 0;
  let ultimaInteracao = -Infinity;
  let ocupada = false;

  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (event.isTrusted) ultimaInteracao = performance.now();
    }, { capture: true, passive: true });
  }

  function definirSessao(atual) {
    sessao = atual;
    botao.textContent = sessao ? "Pausar troca automática" : "Iniciar troca automática";
  }

  botao.addEventListener("click", () => {
    if (sessao) {
      definirSessao(null);
      informar("Troca automática pausada.");
    } else {
      const nome = treinador();
      if (!nome) return informar("Selecione um treinador antes de iniciar a troca automática.");
      proximaConsulta = 0;
      definirSessao({ treinador: nome });
      informar(Date.now() < proximaTroca ? "Troca automática ativa. Aguardando o intervalo entre trocas."
        : "Troca automática ativa. Aguardando a leitura do menu Caçada.");
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

  function lerHunts(regiao) {
    const hunts = [];
    const lista = document.querySelectorAll('#hunt-list .hunt-destination[data-locked="false"][data-team-blocked="false"]');
    for (const cartao of lista) {
      if (cartao.closest("[data-safari-activity]")) continue;
      const slug = cartao.querySelector("[data-hunt-slug]")?.dataset.huntSlug;
      const nome = cartao.querySelector(".hunt-destination-name-copy")?.textContent.trim();
      const nivel = cartao.querySelector(".hunt-destination-level")?.textContent.trim().match(/^LV\. (\d+)$/)?.[1];
      if (!slug || !nome || nivel === undefined) continue;
      const favorita = Boolean(cartao.querySelector('[data-hunt-favorite][aria-pressed="true"]'));
      hunts.push({ slug, nome, nivel: Number(nivel), favorita, regiao });
    }
    return hunts;
  }

  function procurarHunt(slugAtual) {
    const abrir = jogo("#nav-hunt:not(:disabled)");
    const fechar = jogo("#drawer-close:not(:disabled)");
    if (!abrir || !fechar) return;
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    const restaurar = [];
    const menu = () => jogo("#drawer.open #hunt-menu:not([hidden])");
    abrir.click();

    try {
      if (!menu()) return;
      const regiaoAnterior = jogo('#hunt-region-tabs [aria-selected="true"]');
      const regioes = document.querySelectorAll("#hunt-region-tabs button[role=tab]:not(:disabled)");
      const abaAnterior = jogo('#hunt-menu [id^="hunt-tab-"][aria-selected="true"]');
      const acessiveis = jogo("#hunt-tab-accessible:not(:disabled)");
      if (!regiaoAnterior || !abaAnterior || !acessiveis) return;

      if (abaAnterior !== acessiveis) {
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

      let regiaoAtual = regiaoAnterior;
      const selecionarRegiao = regiao => {
        if (regiao === regiaoAtual) return;
        regiao.click();
        regiaoAtual = regiao;
      };
      restaurar.push(() => selecionarRegiao(regiaoAnterior));
      const hunts = [...regioes].flatMap(regiao => {
        selecionarRegiao(regiao);
        return lerHunts(regiao);
      });
      hunts.sort((a, b) => Number(b.favorita) - Number(a.favorita) || b.nivel - a.nivel ||
        Number(b.slug === slugAtual) - Number(a.slug === slugAtual));

      for (const hunt of hunts) {
        if (hunt.slug === slugAtual) {
          informar(`Você já está em ${hunt.nome} (Lv. ${formatar(hunt.nivel)}), a hunt prioritária.`);
          return;
        }
        selecionarRegiao(hunt.regiao);
        const slug = CSS.escape(hunt.slug);
        const seletor = `#hunt-list button[data-hunt-enter="${slug}"]:not(:disabled):not([aria-disabled="true"])`;
        if (!jogo(seletor)) jogo(`#hunt-list button[data-hunt-slug="${slug}"]`)?.click();
        const entrar = menu() && jogo(seletor);
        if (!entrar) continue;
        entrar.click();
        return hunt;
      }
      informar("Aguardando uma hunt regular disponível no menu Caçada.");
    } finally {
      for (const restaurarFiltro of restaurar.reverse()) restaurarFiltro();
      if (menu()) fechar.click();
      if (foco?.isConnected) foco.focus({ preventScroll: true });
    }
  }

  async function atualizar(cacada, confirmarContexto) {
    const nome = treinador();
    if (pendente) {
      if (nome === pendente.treinador && cacada?.slug === pendente.slug) {
        informar(`Troca confirmada para ${pendente.nome}.${sessao ? " Aguardando o intervalo antes de outra troca." : ""}`);
        pendente = null;
      } else if (Date.now() >= pendente.vence || (nome && nome !== pendente.treinador)) {
        informar(`O jogo não confirmou a entrada em ${pendente.nome}. Confira a caçada atual.`);
        pendente = null;
      } else return;
    }
    const atual = sessao;
    if (!atual || ocupada) return;
    if (nome && nome !== atual.treinador) {
      definirSessao(null);
      informar("O treinador mudou. Inicie a troca automática para este treinador.");
      return;
    }
    if (!cacada?.slug || !nome) return informar("Aguardando uma hunt regular ativa.");
    if (Date.now() < Math.max(proximaConsulta, proximaTroca)) return;
    if (cacada.segundos < 60) return informar("Aguardando o primeiro minuto da caçada.");
    if (!livre()) return informar("Aguardando o jogo livre e em foco.");

    ocupada = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, lock => {
        if (!lock || sessao !== atual || treinador() !== nome || !livre() || !confirmarContexto()) return;
        proximaConsulta = Date.now() + INTERVALO_CONSULTA;
        const hunt = procurarHunt(cacada.slug);
        if (!hunt) return;
        proximaTroca = Date.now() + INTERVALO_TROCA;
        pendente = { slug: hunt.slug, nome: hunt.nome, treinador: nome, vence: Date.now() + PRAZO_CONFIRMACAO };
        informar(`Entrada solicitada em ${hunt.nome} (Lv. ${formatar(hunt.nivel)}${hunt.favorita ? ", favorita" : ""}). Aguardando confirmação do jogo.`);
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
    emTroca: () => Boolean(ocupada || pendente),
    atualizar,
  };
}
