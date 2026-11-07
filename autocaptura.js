// Cole este arquivo no Console do navegador com o MultiPoke Idle aberto em /jogar.
// Para parar, execute multiPokeCaptura.parar() ou recarregue a página.
(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) {
    console.warn("Abra https://multipoke.io/jogar antes de iniciar a autocaptura.");
    return;
  }

  if (window.multiPokeCaptura) {
    console.info("A autocaptura já está ativa nesta aba.");
    return true;
  }

  const seletor = "#manual-capture button[data-capture-corpse], #economy-hunt button[data-economy-capture]";
  const tentados = new Set();

  function clicarSeDisponivel() {
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

  const intervalo = setInterval(clicarSeDisponivel, 350);
  window.multiPokeCaptura = {
    parar() {
      clearInterval(intervalo);
      delete window.multiPokeCaptura;
      console.info("Autocaptura parada.");
    },
  };

  console.info("Autocaptura ativa. Para parar, execute multiPokeCaptura.parar().");
  clicarSeDisponivel();
  return true;
})();
