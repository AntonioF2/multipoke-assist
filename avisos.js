(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) return;
  const raiz = document.documentElement;
  if (raiz.hasAttribute("data-multipoke-avisos")) return;
  raiz.setAttribute("data-multipoke-avisos", "ativo");

  const seletor = "#shiny-capture-notice, dialog.login-offers";
  const tentativas = new WeakMap();
  let timer;
  let proximaExecucao = Infinity;
  let ocupado = false;

  function agendar(espera = 500) {
    if (document.hidden) return;
    const quando = performance.now() + espera;
    if (quando >= proximaExecucao) return;
    clearTimeout(timer);
    proximaExecucao = quando;
    timer = setTimeout(executar, espera);
  }

  function disponivel(botao) {
    return botao && !botao.matches(":disabled, [aria-disabled='true']") &&
      !botao.closest("[hidden], [inert]") && botao.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  }

  function fechar() {
    if (document.hidden || document.querySelector("#connection-screen:not([hidden]), #starter-overlay:not([hidden])")) return;
    const ofertas = document.querySelector("dialog.login-offers[open]");
    // Uma confirmação de compra, venda ou outra ação pertence ao fluxo que a abriu.
    if ([...document.querySelectorAll("dialog[open]")].some(dialogo => dialogo !== ofertas)) return;
    const aviso = ofertas ?? document.querySelector("#shiny-capture-notice:not([hidden])");
    if (!aviso) return;
    if (!ofertas && (!aviso.dataset.eventId || !["shiny", "capture", "item", "system"].includes(aviso.dataset.noticeType))) return;
    const botao = aviso.querySelector(ofertas ? "button[data-offers-close]" : "button[data-notice-read]");
    if (!disponivel(botao)) return;
    const chave = ofertas ? "ofertas" : JSON.stringify([aviso.dataset.eventId, aviso.dataset.pendingCount]);
    const anterior = tentativas.get(aviso);
    if (anterior?.chave === chave && performance.now() < anterior.apos) return agendar(anterior.apos - performance.now());
    const numero = anterior?.chave === chave ? anterior.numero + 1 : 1;
    const espera = Math.min(30_000, 5_000 * 2 ** Math.min(numero - 1, 3));
    tentativas.set(aviso, { chave, numero, apos: performance.now() + espera });
    // O jogo registra a leitura e avança sua própria fila após confirmar no servidor.
    botao.click();
    agendar(espera);
  }

  async function executar() {
    proximaExecucao = Infinity;
    if (ocupado) return agendar();
    ocupado = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, lock => {
        if (lock) fechar();
        else agendar(1_000);
      });
    } finally { ocupado = false; }
  }

  new MutationObserver(mudancas => {
    if (mudancas.some(mudanca => mudanca.target.closest?.(seletor) ||
      (mudanca.type === "attributes" && mudanca.target.matches("dialog, #connection-screen, #starter-overlay, #game-shell")) ||
      [...mudanca.addedNodes, ...mudanca.removedNodes].some(no =>
        no.matches?.(`${seletor}, dialog`) || no.querySelector?.(`${seletor}, dialog`)))) agendar();
  }).observe(raiz, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["hidden", "open", "inert", "data-event-id", "data-pending-count", "data-notice-type", "disabled", "aria-disabled"],
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(timer);
      proximaExecucao = Infinity;
    } else agendar();
  });
  // Fechamentos de outras janelas e reconexões podem liberar um aviso já existente.
  document.addEventListener("close", () => agendar(), true);
  agendar();
})();
