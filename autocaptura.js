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
  const seletoresReposicao = { bola: "ball-select", pocao: "potion-select", revive: "revive-select" };
  const estadosCaptura = { pronta: "ativa", vazio: "sem-bolas", estoque: "aguardando-estoque", selecao: "aguardando-bola" };
  let tentados = new Set();
  const INTERVALO_SELECAO = 2_000;
  let capturaAtiva = false;
  const selecoesPendentes = new Map();

  function clicarSeDisponivel() {
    const treinadorDaCompra = raiz.dataset.multipokeTreinadorReposicaoAtiva;
    if (!capturaAtiva && !treinadorDaCompra) return;
    const treinador = document.querySelector("#party-trainer-name")?.textContent.trim();
    const compraDoTreinador = treinador && treinadorDaCompra === treinador;
    let estado = "ativa";
    for (const [tipo, seletorItem] of Object.entries(seletoresReposicao)) {
      const compraAtiva = compraDoTreinador ? raiz.getAttribute(`data-multipoke-${tipo}-reposicao-ativa`) : "";
      const escolha = compraAtiva || (capturaAtiva ? escolhaReposicao(treinador, tipo) : "");
      const id = escolha?.match(tipo === "bola" ? /^ball:(\d+)$/ : /^supply:(\d+)$/)?.[1];
      if (!id) {
        selecoesPendentes.delete(tipo);
        continue;
      }
      const selecao = sincronizarItem(tipo, seletorItem, id, treinador);
      if (tipo === "bola") estado = estadosCaptura[selecao];
    }
    if (!capturaAtiva) return;
    if (raiz.dataset.multipokeAutocaptura !== estado) raiz.dataset.multipokeAutocaptura = estado;
    if (estado !== "ativa") return;
    const botoes = document.querySelectorAll(seletor);
    if (!botoes.length) {
      tentados.clear();
      return;
    }

    const presentes = new Set();
    let proximo;
    for (const botao of botoes) {
      const alvo = botao.dataset.captureCorpse ?? botao.dataset.economyCapture;
      if (!alvo) continue;
      if (tentados.has(alvo)) {
        presentes.add(alvo);
        continue;
      }
      if (proximo || botao.matches(":disabled, [aria-disabled='true']")) continue;
      if (botao.textContent.trim() !== "Capturar" ||
          botao.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;

      const area = botao.getBoundingClientRect();
      const visivel = document.elementFromPoint(area.left + area.width / 2, area.top + area.height / 2);
      if (!botao.contains(visivel)) continue;

      presentes.add(alvo);
      proximo = botao;
    }
    tentados = presentes;
    proximo?.click();
  }

  function escolhaReposicao(treinador, tipo) {
    if (!treinador) return;
    if (raiz.dataset.multipokeTreinadorReposicao === treinador) return raiz.getAttribute(`data-multipoke-${tipo}-reposicao`);
    try { return localStorage.getItem(`multipoke.auto-loja.compra.${treinador}.${tipo}`); }
    catch { /* A escolha feita no painel continua disponível nesta aba. */ }
  }

  function sincronizarItem(tipo, seletorItem, id, treinador) {
    const opcao = document.querySelector(`[data-custom-select-owner="${seletorItem}"] button[data-value="${id}"]`);
    const quantidade = opcao?.querySelector(".custom-select-quantity")?.textContent.trim();
    const estoque = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(quantidade ?? "")
      ? Number(quantidade.replaceAll(".", "")) : NaN;
    if (!Number.isSafeInteger(estoque)) return "estoque";
    if (estoque === 0) return "vazio";
    const controle = document.querySelector(`#${seletorItem} .custom-select-trigger:not(:disabled)`);
    if (!controle || document.hidden || controle.getAttribute("aria-expanded") === "true" ||
        document.querySelector("#game-shell[inert], #connection-screen:not([hidden]), #starter-overlay:not([hidden]), " +
          "#drawer.open, dialog[open], body.pvp-mode")) {
      return "selecao";
    }

    let selecaoPendente = selecoesPendentes.get(tipo);
    if (selecaoPendente && (selecaoPendente.id !== id || selecaoPendente.treinador !== treinador)) {
      selecoesPendentes.delete(tipo);
      selecaoPendente = null;
    }
    const selecionada = opcao.getAttribute("aria-selected") === "true";
    // O clique altera o seletor localmente. Aguarda a próxima atualização do jogo.
    if (selecionada && (!selecaoPendente || controle.firstChild !== selecaoPendente.conteudo)) {
      selecoesPendentes.delete(tipo);
      return "pronta";
    }
    if (!selecionada && !opcao.disabled && performance.now() >= (selecaoPendente?.tentarApos ?? 0)) {
      opcao.click();
      selecoesPendentes.set(tipo, { id, treinador, conteudo: controle.firstChild, tentarApos: performance.now() + INTERVALO_SELECAO });
    }
    return "selecao";
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
