(() => {
  const url = new URL(location.href);
  if (url.origin !== "https://player.twitch.tv" || !url.searchParams.getAll("parent").includes("multipoke.io") ||
      !/^[A-Za-z0-9_]{1,25}$/.test(url.searchParams.get("channel") ?? "")) return;
  if (globalThis.multiPokePlayerLive) return;
  globalThis.multiPokePlayerLive = true;
  let timer;
  let ocupado = false;
  let ciclo;
  let tentativas = 0;
  let ultimaInteracao = -Infinity;
  let manual = false;
  let manualEm = 0;
  const videos = new WeakSet();
  const reproducoes = new WeakSet();

  function agendar(tempo = 250) {
    clearTimeout(timer);
    timer = setTimeout(() => void conferir(), tempo);
  }

  function acompanhar(video) {
    if (!video || videos.has(video)) return;
    videos.add(video);
    for (const evento of ["loadeddata", "canplay", "playing", "pause", "ended"]) {
      video.addEventListener(evento, event => {
        if (evento === "playing" && event.isTrusted) reproducoes.add(video);
        if (["pause", "ended"].includes(evento)) reproducoes.delete(video);
        if (evento === "pause" && performance.now() - ultimaInteracao < 2000) { manual = true; manualEm = Date.now(); }
        if (evento === "playing") manual = false;
        agendar();
      });
    }
  }

  async function conferir() {
    if (ocupado) return agendar(500);
    ocupado = true;
    try {
      const video = document.querySelector("video");
      acompanhar(video);
      const tocando = Boolean(video && !video.paused && !video.ended && video.readyState >= 2 &&
        (reproducoes.has(video) || video.currentTime > 0 && video.readyState >= 3));
      const resposta = await chrome.runtime.sendMessage({ tipo: "multipoke:lives", acao: "player", manual, manualEm, tocando, ciclo,
        falhou: tentativas >= 3 && !tocando && !manual });
      if (!resposta?.ok) return;
      const controle = resposta.resultado;
      if (controle.ciclo !== ciclo) { ciclo = controle.ciclo; tentativas = 0; manual = false; }
      if (!controle.monitorar || tocando || manual) return;
      if (!controle.iniciar || !video) return agendar(1500);
      if (tentativas >= 3) return;
      tentativas++;
      // Reproduz mídia real, sem som, respeitando as regras normais de autoplay.
      // O SDK e o servidor continuam decidindo quando a audiência gera o bônus.
      video.muted = true;
      try {
        await Promise.race([video.play(), new Promise(resolve => setTimeout(resolve, 4000))]);
      } catch { /* O estado real do player decide se haverá outra tentativa. */ }
      agendar(1500);
    } catch { /* A extensão ou a janela pode ter sido recarregada. */ }
    finally { ocupado = false; }
  }

  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => { if (event.isTrusted) ultimaInteracao = performance.now(); }, { capture: true, passive: true });
  }
  new MutationObserver(mudancas => {
    if (mudancas.some(mudanca => [...mudanca.addedNodes].some(no => no.matches?.("video") || no.querySelector?.("video")))) agendar();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("message", event => {
    if (event.origin === "https://multipoke.io" && event.source === window.parent && event.data?.tipo === "multipoke:iniciar-player") agendar();
  });
  agendar();
})();
