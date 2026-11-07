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

  function clicarSeDisponivel() {
    if (!atualizarEstado()) return;
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

  let intervalo = null;

  function escolhaBolaReposicao() {
    const treinador = document.querySelector("#party-trainer-name")?.textContent.trim();
    if (!treinador) return;
    if (raiz.dataset.multipokeTreinadorReposicao === treinador) return raiz.dataset.multipokeBolaReposicao;
    try { return localStorage.getItem(`multipoke.auto-loja.compra.${treinador}.bola`); }
    catch { /* A escolha feita no painel continua disponível nesta aba. */ }
  }

  function atualizarEstado() {
    const bola = escolhaBolaReposicao()?.match(/^ball:(\d+)$/)?.[1];
    let estado = "ativa";
    if (bola) {
      const quantidade = document.querySelector(
        `[data-custom-select-owner="ball-select"] [data-value="${bola}"] .custom-select-quantity`,
      )?.textContent.trim();
      const estoque = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(quantidade ?? "")
        ? Number(quantidade.replaceAll(".", "")) : NaN;
      if (!Number.isSafeInteger(estoque)) estado = "aguardando-estoque";
      else if (estoque === 0) estado = "sem-bolas";
    }
    if (raiz.dataset.multipokeAutocaptura !== estado) raiz.dataset.multipokeAutocaptura = estado;
    return estado === "ativa";
  }

  function parar() {
    if (intervalo === null) return;
    clearInterval(intervalo);
    intervalo = null;
    delete window.multiPokeCaptura;
    raiz.dataset.multipokeAutocaptura = "pausada";
    console.info("Autocaptura parada.");
  }

  function iniciar() {
    if (intervalo !== null) {
      atualizarEstado();
      return;
    }
    intervalo = setInterval(clicarSeDisponivel, 350);
    window.multiPokeCaptura = { parar };
    console.info("Autocaptura iniciada. Para parar, execute multiPokeCaptura.parar().");
    clicarSeDisponivel();
  }

  document.addEventListener(comando, event => {
    if (event.detail === "iniciar") iniciar();
    if (event.detail === "alternar") {
      if (intervalo === null) iniciar();
      else parar();
    }
  });
  iniciar();
  return true;
})();
