// Cole este arquivo no Console do navegador com o MultiPoke Idle aberto em /jogar.
// Para pausar a captura nesta aba, execute multiPokeCaptura.parar().
(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) {
    console.warn("Abra https://multipoke.io/jogar antes de iniciar a autocaptura.");
    return;
  }

  const comando = "multipoke:autocaptura";
  const raiz = document.documentElement;
  if (raiz.hasAttribute("data-multipoke-autocaptura")) {
    document.dispatchEvent(new CustomEvent(comando, { detail: "iniciar" }));
    return true;
  }

  const seletor = "#manual-capture button[data-capture-corpse], #economy-hunt button[data-economy-capture]";
  const tentados = new Set();
  const INTERVALO_SELECAO = 2_000;
  let capturaAtiva = false;
  let selecaoPendente;

  function clicarSeDisponivel() {
    const treinador = document.querySelector("#party-trainer-name")?.textContent.trim();
    const compraAtiva = treinador && raiz.dataset.multipokeTreinadorReposicaoAtiva === treinador
      ? raiz.dataset.multipokeBolaReposicaoAtiva : "";
    if (!capturaAtiva && !compraAtiva) return;
    const bola = (compraAtiva || escolhaBolaReposicao(treinador))?.match(/^ball:(\d+)$/)?.[1];
    const estado = bola ? sincronizarBola(bola, treinador) : "ativa";
    if (!capturaAtiva) return;
    if (raiz.dataset.multipokeAutocaptura !== estado) raiz.dataset.multipokeAutocaptura = estado;
    if (estado !== "ativa") return;
    const botoes = Array.from(document.querySelectorAll(seletor), botao => ({
      botao,
      alvo: botao.dataset.captureCorpse ?? botao.dataset.economyCapture,
    }));
    const presentes = new Set(botoes.map(({ alvo }) => alvo));
    for (const alvo of tentados) {
      if (!presentes.has(alvo)) tentados.delete(alvo);
    }

    for (const { botao, alvo } of botoes) {
      if (!alvo || tentados.has(alvo) || botao.matches(":disabled, [aria-disabled='true']")) continue;
      if (botao.textContent.trim() !== "Capturar" ||
          botao.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;

      const area = botao.getBoundingClientRect();
      const visivel = document.elementFromPoint(area.left + area.width / 2, area.top + area.height / 2);
      if (!botao.contains(visivel)) continue;

      tentados.add(alvo);
      botao.click();
      return;
    }
  }

  function escolhaBolaReposicao(treinador) {
    if (!treinador) return;
    if (raiz.dataset.multipokeTreinadorReposicao === treinador) return raiz.dataset.multipokeBolaReposicao;
    try { return localStorage.getItem(`multipoke.auto-loja.compra.${treinador}.bola`); }
    catch { /* A escolha feita no painel continua disponível nesta aba. */ }
  }

  function sincronizarBola(bola, treinador) {
    const opcao = document.querySelector(`[data-custom-select-owner="ball-select"] button[data-value="${bola}"]`);
    const quantidade = opcao?.querySelector(".custom-select-quantity")?.textContent.trim();
    const estoque = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(quantidade ?? "")
      ? Number(quantidade.replaceAll(".", "")) : NaN;
    if (!Number.isSafeInteger(estoque)) return "aguardando-estoque";
    if (estoque === 0) return "sem-bolas";
    const controle = document.querySelector("#ball-select .custom-select-trigger:not(:disabled)");
    if (!controle || document.hidden || controle.getAttribute("aria-expanded") === "true" ||
        document.querySelector("#game-shell[inert], #connection-screen:not([hidden]), body.pvp-mode")) {
      return "aguardando-bola";
    }

    if (selecaoPendente && (selecaoPendente.bola !== bola || selecaoPendente.treinador !== treinador)) {
      selecaoPendente = null;
    }
    const selecionada = opcao.getAttribute("aria-selected") === "true";
    // O clique altera o seletor localmente. A captura usa a seleção da próxima atualização do jogo.
    if (selecionada && (!selecaoPendente || controle.firstChild !== selecaoPendente.conteudo)) {
      selecaoPendente = null;
      return "ativa";
    }
    if (!selecionada && !opcao.disabled && performance.now() >= (selecaoPendente?.tentarApos ?? 0)) {
      opcao.click();
      selecaoPendente = { bola, treinador, conteudo: controle.firstChild, tentarApos: performance.now() + INTERVALO_SELECAO };
    }
    return "aguardando-bola";
  }

  function parar() {
    if (!capturaAtiva) return;
    capturaAtiva = false;
    delete window.multiPokeCaptura;
    raiz.dataset.multipokeAutocaptura = "pausada";
    console.info("Autocaptura parada.");
  }

  function iniciar() {
    if (capturaAtiva) return;
    capturaAtiva = true;
    window.multiPokeCaptura = { parar };
    console.info("Autocaptura iniciada. Para parar, execute multiPokeCaptura.parar().");
    clicarSeDisponivel();
  }

  document.addEventListener(comando, event => {
    if (event.detail === "iniciar") iniciar();
    if (event.detail === "alternar") {
      if (capturaAtiva) parar();
      else iniciar();
    }
  });
  setInterval(clicarSeDisponivel, 350);
  iniciar();
  return true;
})();
