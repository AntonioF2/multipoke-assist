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
  let ciclo;
  let tentativas = 0;
  let ultimaTentativa = -Infinity;
  let pausaManual = false;
  let manualEm = 0;

  async function informar() {
    const estado = document.querySelector("[data-watch-status]")?.dataset.state;
    if (!estado) return;
    try {
      const resposta = await chrome.runtime.sendMessage({ tipo: "multipoke:lives", acao: "estado", estado, manual: pausaManual, ciclo, manualEm });
      if (!resposta?.ok) return;
      const controle = resposta.resultado;
      if (controle.ciclo !== ciclo) { ciclo = controle.ciclo; tentativas = 0; ultimaTentativa = -Infinity; pausaManual = false; }
      if (controle.player && !pausaManual) {
        for (const frame of document.querySelectorAll("#twitch-player iframe")) {
          try {
            if (new URL(frame.src).origin === "https://player.twitch.tv") {
              frame.contentWindow?.postMessage({ tipo: "multipoke:iniciar-player" }, "https://player.twitch.tv");
            }
          } catch { /* Outro conteúdo do player não faz parte desta automação. */ }
        }
      }
      if (!controle.iniciar || pausaManual || tentativas >= 2 ||
          !["ready", "paused", "blocked"].includes(estado) || document.querySelector("[data-watch-status]")?.dataset.state !== estado) return;
      if (performance.now() - ultimaTentativa < 1500) return agendar(1500);
      const iniciar = document.querySelector("button[data-watch-start]:not(:disabled):not([hidden])");
      if (!iniciar || iniciar.checkVisibility?.({ visibilityProperty: true }) === false) return agendar(1000);
      tentativas++;
      ultimaTentativa = performance.now();
      // Aciona apenas o player oficial. Os eventos de reprodução e o bônus
      // são produzidos pelo jogo, nunca simulados pela extensão.
      iniciar.click();
      agendar(1500);
    } catch { /* Recarregar a extensão pode encerrar a conexão desta página. */ }
  }

  function agendar(espera = 250) {
    clearTimeout(timer);
    timer = setTimeout(() => void informar(), espera);
  }
  new MutationObserver(mudancas => {
    if (mudancas.some(mudanca => mudanca.target.matches?.("[data-watch-status], [data-watch-start], #twitch-player") ||
        [...mudanca.addedNodes].some(no => no.matches?.("[data-watch-status], iframe") || no.querySelector?.("[data-watch-status], #twitch-player iframe")))) agendar();
  }).observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "hidden", "disabled"] });
  document.addEventListener("click", event => {
    if (!event.isTrusted) return;
    if (event.target.closest?.("button[data-watch-stop]")) { pausaManual = true; manualEm = Date.now(); agendar(); }
    else if (event.target.closest?.("button[data-watch-start]")) { pausaManual = false; agendar(); }
  }, true);
  document.addEventListener(evento, () => agendar());
  agendar();
})();
