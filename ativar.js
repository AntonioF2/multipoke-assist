const statusAtivacao = document.querySelector("#status");

async function ativar() {
  const [abaLancador, janelaAtual, abas] = await Promise.all([
    chrome.tabs.getCurrent(),
    chrome.windows.getCurrent(),
    chrome.tabs.query({ url: "https://multipoke.io/jogar*" }),
  ]);

  const abasDoJogo = abas.filter(aba =>
    /^https:\/\/multipoke\.io\/jogar\/?(?:[?#].*)?$/.test(aba.url),
  );
  if (abasDoJogo.length === 0) {
    statusAtivacao.textContent = "Abra multipoke.io/jogar neste perfil do Chrome e tente novamente.";
    return;
  }

  const aba = abasDoJogo.length === 1
    ? abasDoJogo[0]
    : abasDoJogo.find(aba => aba.active && aba.windowId === janelaAtual.id);
  if (!aba) {
    statusAtivacao.textContent = "Há mais de uma aba do jogo. Selecione a que deseja usar e clique no ícone da extensão.";
    return;
  }

  const [execucao] = await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    world: "MAIN",
    files: ["autocaptura.js"],
  });
  if (execucao?.result !== true) {
    statusAtivacao.textContent = "A aba mudou antes da ativação. Abra a caçada e tente novamente.";
    return;
  }

  await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["loja.js"] });
  statusAtivacao.textContent = "Autocaptura ativa. O painel Auto Loja está na aba do MultiPoke.";
  await chrome.tabs.update(aba.id, { active: true });
  await chrome.windows.update(aba.windowId, { focused: true });
  if (abaLancador) await chrome.tabs.remove(abaLancador.id);
}

ativar().catch(erro => {
  statusAtivacao.textContent = "O Chrome não conseguiu ativar a captura. Confira se a aba do jogo está aberta e tente novamente.";
  console.error(erro);
});
