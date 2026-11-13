(() => {
  if (location.origin !== "https://multipoke.io" || location.pathname !== "/live-watch.html") return;
  const evento = "multipoke:conferir-live";
  const raiz = document.documentElement;
  if (globalThis.multiPokeLiveMonitor) {
    document.dispatchEvent(new Event(evento));
    return;
  }
  globalThis.multiPokeLiveMonitor = true;
  raiz.setAttribute("data-multipoke-live-monitor", "ativo");
  let timer;
  let tentouIniciar = false;

  async function informar() {
    const estado = document.querySelector("[data-watch-status]")?.dataset.state;
    if (!estado) return;
    try {
      const resposta = await chrome.runtime.sendMessage({ tipo: "multipoke:lives", acao: "estado", estado });
      if (!resposta?.ok || !resposta.resultado?.iniciar || tentouIniciar || estado !== "ready" ||
          document.querySelector("[data-watch-status]")?.dataset.state !== estado) return;
      const iniciar = document.querySelector("button[data-watch-start]:not(:disabled):not([hidden])");
      if (!iniciar || iniciar.checkVisibility?.({ visibilityProperty: true }) === false) return;
      tentouIniciar = true;
      // Aciona apenas o player oficial. Os eventos de reprodução e o bônus
      // são produzidos pelo jogo, nunca simulados pela extensão.
      iniciar.click();
    } catch { /* Recarregar a extensão pode encerrar a conexão desta página. */ }
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(() => void informar(), 250);
  }
  new MutationObserver(mudancas => {
    if (mudancas.some(mudanca => mudanca.target.matches?.("[data-watch-status], [data-watch-start]") ||
        [...mudanca.addedNodes].some(no => no.matches?.("[data-watch-status]") || no.querySelector?.("[data-watch-status]")))) agendar();
  }).observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "hidden", "disabled"] });
  document.addEventListener(evento, agendar);
  agendar();
})();
