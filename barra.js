importScripts("banco-hunts.js");

function alternarPainel() {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) return;

  const chave = "multipoke.auto-loja.painel-oculto";
  const painel = document.getElementById("multipoke-auto-loja");
  let oculto = !painel?.hidden;
  try {
    const salvo = localStorage.getItem(chave);
    if (salvo !== null) oculto = salvo !== "true";
    localStorage.setItem(chave, String(oculto));
  } catch { /* O painel atual também pode alternar sem armazenamento. */ }
  if (painel) painel.hidden = oculto;
}

chrome.action.onClicked.addListener(async aba => {
  if (aba.id == null || !/^https:\/\/multipoke\.io\/jogar\/?(?:[?#].*)?$/.test(aba.url)) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId: aba.id }, func: alternarPainel });
  } catch (erro) {
    console.warn("Não foi possível alternar o painel do MultiPoke.", erro);
  }
});
