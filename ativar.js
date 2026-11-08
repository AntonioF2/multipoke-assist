const statusAtivacao = document.querySelector("#status");
const botaoPainel = document.querySelector("#alternar-painel");
const botaoCaptura = document.querySelector("#ativar-captura");

async function ativar(aba) {
  const [execucao] = await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    world: "MAIN",
    files: ["autocaptura.js"],
  });
  if (execucao?.result !== true) throw new Error("A aba mudou antes da ativação.");
  await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["analise-hunts.js", "loja.js"] });
}

async function atualizarPainel(aba, alternar = false) {
  botaoPainel.disabled = true;
  try {
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      tipo: "multipoke:visibilidade-painel",
      alternar,
    }, { frameId: 0 });
    if (typeof resposta?.visivel !== "boolean") throw new Error("Painel indisponível.");
    botaoPainel.textContent = resposta.visivel ? "Ocultar painel" : "Mostrar painel";
    statusAtivacao.textContent = resposta.visivel ? "O painel Auto Loja está visível." : "O painel Auto Loja está oculto.";
    botaoPainel.disabled = false;
  } catch {
    statusAtivacao.textContent = "Atualize a aba do MultiPoke para carregar o painel.";
  }
}

async function iniciar() {
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

  if (abaLancador) {
    await ativar(aba);
    await chrome.tabs.update(aba.id, { active: true });
    await chrome.windows.update(aba.windowId, { focused: true });
    await chrome.tabs.remove(abaLancador.id);
    return;
  }

  document.querySelector("#controles").hidden = false;
  botaoPainel.addEventListener("click", () => void atualizarPainel(aba, true));
  botaoCaptura.addEventListener("click", async () => {
    botaoCaptura.disabled = true;
    try {
      await ativar(aba);
      await atualizarPainel(aba);
    } catch (erro) { informarErro(erro); }
    finally { botaoCaptura.disabled = false; }
  });
  await atualizarPainel(aba);
}

function informarErro(erro) {
  statusAtivacao.textContent = "O Chrome não conseguiu ativar a captura. Confira se a aba do jogo está aberta e tente novamente.";
  console.error(erro);
}

iniciar().catch(informarErro);
