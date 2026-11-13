function criarControleLives(campo) {
  const opcao = campo("live-automatica");
  const status = campo("live-status");
  let ocupada = false;
  let mensagem = "Automação de lives desligada.";

  function mostrar() {
    const bonus = document.querySelector("#active-boosts:not([hidden]) button[data-live-xp-badge]:not([hidden])");
    status.textContent = `${mensagem}${bonus ? " O jogo mostra o bônus de XP da live ativo." : ""}`;
  }

  async function atualizar(ativa) {
    if (ocupada) return;
    ocupada = true;
    opcao.disabled = true;
    try {
      const resposta = await chrome.runtime.sendMessage({ tipo: "multipoke:lives", acao: ativa === undefined ? "consultar" : "configurar",
        ...(ativa === undefined ? {} : { ativa }) });
      if (!resposta?.ok) throw new Error(resposta?.erro || "Não foi possível consultar o controle de lives.");
      opcao.checked = resposta.resultado.ativa;
      mensagem = resposta.resultado.status;
    } catch (erro) { mensagem = erro.message || "Aguardando o controle de lives."; }
    finally { ocupada = false; opcao.disabled = false; mostrar(); }
  }

  opcao.addEventListener("change", () => void atualizar(opcao.checked));
  setInterval(() => void atualizar(), 15_000);
  void atualizar();
  return atualizar;
}
