async function enviarDadosHunts(acao, dados = {}) {
  const resposta = await chrome.runtime.sendMessage({ tipo: "multipoke:banco-hunts", acao, ...dados });
  if (!resposta?.ok) throw new Error(resposta?.erro ?? "Banco de hunts indisponível.");
  return resposta.dados;
}

async function cacheDadosHunts(chave, carregar, valido = () => true) {
  chave = `v1/${chave}`;
  async function consultar() {
    const salvo = await enviarDadosHunts("ler-cache", { chave }).catch(() => null);
    if (salvo !== null) return salvo;
    const valor = await carregar();
    if (valido(valor)) await enviarDadosHunts("salvar-cache", { chave, valor }).catch(() => {});
    return valor;
  }
  return navigator.locks.request(`multipoke-catalogo/${chave}`, consultar);
}

function criarAcessoHistoricoHunts(campo, aoAlterar) {
  const prefixo = "multipoke.auto-loja.hunts.";
  let migracao;

  async function migrar() {
    let armazenamento;
    try { armazenamento = localStorage; } catch { return; }
    const chaves = Object.keys(armazenamento).filter(chave => chave.startsWith(prefixo));
    for (const chave of chaves) {
      const salvo = armazenamento.getItem(chave);
      const equipe = chave.slice(prefixo.length);
      let historico;
      try {
        const formacao = JSON.parse(equipe);
        if (typeof formacao?.[0] !== "string" || !Array.isArray(formacao?.[1])) continue;
        historico = JSON.parse(salvo);
      } catch { continue; }
      if (!Array.isArray(historico)) continue;
      const amostras = historico.filter(item => typeof item?.hunt === "string" && item.hunt.length > 0 &&
        item.segundos >= 300 && [item.xp, item.drops, item.segundos, item.data].every(valor =>
          Number.isSafeInteger(valor) && valor >= 0)).map(({ hunt, xp, drops, segundos, data }) => ({
        equipe, contexto: "", area: `legado:${hunt}`, id: `legado:${hunt}:${data}`, hunt, xp, drops, segundos, data, legado: true,
      }));
      if (amostras.length) await enviarDadosHunts("salvar", { amostras });
      if (amostras.length === historico.length && armazenamento.getItem(chave) === salvo) armazenamento.removeItem(chave);
    }
  }

  const pronto = () => migracao ??= navigator.locks.request("multipoke-migracao-hunts", migrar)
    .catch(erro => { migracao = undefined; throw erro; });
  const ler = async (equipe, contexto) => {
    await pronto();
    return enviarDadosHunts("historico", { equipe, contexto });
  };
  const salvar = async amostra => {
    await pronto();
    await enviarDadosHunts("salvar", { amostras: [amostra] });
    aoAlterar();
  };

  const exportar = campo("hunt-exportar");
  const importar = campo("hunt-importar");
  const arquivo = campo("hunt-arquivo");
  const status = campo("hunt-backup-status");

  async function backup(executar) {
    exportar.disabled = importar.disabled = true;
    status.textContent = "Aguarde...";
    try {
      await pronto();
      status.textContent = await executar();
    } catch (erro) {
      status.textContent = erro.message || "Não foi possível acessar o histórico.";
    } finally {
      exportar.disabled = importar.disabled = false;
    }
  }

  exportar.addEventListener("click", () => void backup(async () => {
    const dados = await enviarDadosHunts("exportar");
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `multipoke-hunts-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return "Backup do histórico gerado.";
  }));
  importar.addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", () => {
    const escolhido = arquivo.files[0];
    arquivo.value = "";
    if (!escolhido) return;
    void backup(async () => {
      if (escolhido.size > 20 * 1024 * 1024) throw new Error("O arquivo excede 20 MB.");
      let dados;
      try { dados = JSON.parse(await escolhido.text()); } catch { throw new Error("Arquivo JSON inválido."); }
      if (dados?.formato !== "multipoke-hunts" || dados.versao !== 1) throw new Error("Formato de backup inválido.");
      await enviarDadosHunts("salvar", { amostras: dados.amostras });
      aoAlterar();
      return "Histórico do backup mesclado com o histórico local.";
    });
  });

  return { ler, salvar };
}
