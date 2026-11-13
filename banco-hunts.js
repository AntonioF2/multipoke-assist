const LIMITE_AMOSTRAS_HUNTS = 10;
let bancoHunts;

function pedidoHunts(pedido) {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

function abrirBancoHunts() {
  bancoHunts ??= (() => {
    const pedido = indexedDB.open("multipoke-hunts", 3);
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains("catalogo")) {
        banco.createObjectStore("catalogo", { keyPath: "chave" });
        banco.createObjectStore("medicoes", { keyPath: ["equipe", "contexto", "area"] })
          .createIndex("equipe-contexto", ["equipe", "contexto"]);
        banco.createObjectStore("recordes", { keyPath: ["equipe", "area"] })
          .createIndex("equipe", "equipe");
      }
      const medicoes = pedido.transaction.objectStore("medicoes");
      if (!medicoes.indexNames.contains("equipe")) medicoes.createIndex("equipe", "equipe");
      if (!banco.objectStoreNames.contains("pokedex")) {
        banco.createObjectStore("pokedex", { keyPath: ["treinador", "id"] }).createIndex("treinador", "treinador");
      }
    };
    return pedidoHunts(pedido).then(banco => {
      banco.onversionchange = () => {
        banco.close();
        bancoHunts = undefined;
      };
      return banco;
    }).catch(erro => {
      bancoHunts = undefined;
      throw erro;
    });
  })();
  return bancoHunts;
}

async function transacaoHunts(colecoes, modo, executar) {
  const banco = await abrirBancoHunts();
  const transacao = banco.transaction(colecoes, modo);
  const conclusao = new Promise((resolve, reject) => {
    transacao.oncomplete = resolve;
    transacao.onabort = () => reject(transacao.error ?? new Error("Transação de hunts cancelada."));
  });
  try {
    const [resultado] = await Promise.all([executar(transacao), conclusao]);
    return resultado;
  } catch (erro) {
    try { transacao.abort(); } catch { /* A transação já terminou. */ }
    await conclusao.catch(() => {});
    throw erro;
  }
}

function taxasHunts(amostras) {
  const totais = { segundos: 0, xp: 0, drops: 0, abates: 0 };
  for (const amostra of amostras) {
    for (const campo of Object.keys(totais)) totais[campo] += amostra[campo];
  }
  const porHora = campo => Math.round(totais[campo] * 3600 / totais.segundos);
  return { xp: porHora("xp"), drops: porHora("drops"), abatesHora: porHora("abates") };
}

function resumoAmostraHunt(amostra) {
  const { hunt, data, segundos, legado } = amostra;
  const { xp, drops } = legado ? amostra : taxasHunts([amostra]);
  return { hunt, data, segundos, legado, xp, drops, ...(amostra.variouContexto ? { variouContexto: true } : {}) };
}

function amostraValidaHunt(amostra) {
  const campos = ["equipe", "contexto", "area", "id", "hunt"];
  if (!amostra || campos.some(campo => typeof amostra[campo] !== "string" || amostra[campo].length > 8192) ||
      !amostra.equipe || !amostra.area || !amostra.id || !amostra.hunt ||
      (amostra.variouContexto !== undefined && typeof amostra.variouContexto !== "boolean")) return false;
  const { equipe, data, segundos, xp, drops, abates, legado, contexto, area } = amostra;
  try {
    const formacao = JSON.parse(equipe);
    if (!Array.isArray(formacao) || typeof formacao[0] !== "string" || !Array.isArray(formacao[1])) return false;
  } catch { return false; }
  const numeros = [data, segundos, xp, drops];
  if (numeros.some(valor => !Number.isSafeInteger(valor) || valor < 0) || segundos < 300) return false;
  return legado === true ? contexto === "" : legado === false && Boolean(contexto) &&
    /^[\w-]+$/.test(area) && Number.isSafeInteger(abates) && abates >= 0 &&
    Object.values(taxasHunts([amostra])).every(Number.isSafeInteger);
}

function recordeHunt(anterior, novo, campo) {
  return !anterior || novo[campo] > anterior[campo] ||
    (novo[campo] === anterior[campo] && novo.data > anterior.data) ? novo : anterior;
}

async function salvarAmostrasHunts(amostras) {
  if (!Array.isArray(amostras) || amostras.length > 50_000 || amostras.some(amostra => !amostraValidaHunt(amostra))) {
    throw new Error("Arquivo ou medição de hunts inválida.");
  }
  const grupos = new Map();
  for (const amostra of amostras) {
    const chave = JSON.stringify([amostra.equipe, amostra.contexto, amostra.area]);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(amostra);
  }
  return transacaoHunts(["medicoes", "recordes"], "readwrite", async transacao => {
    const medicoes = transacao.objectStore("medicoes");
    const recordes = transacao.objectStore("recordes");
    for (const grupo of grupos.values()) {
      const { equipe, contexto, area } = grupo[0];
      const [anterior, recorde] = await Promise.all([
        pedidoHunts(medicoes.get([equipe, contexto, area])),
        pedidoHunts(recordes.get([equipe, area])),
      ]);
      const recentes = new Map((anterior?.recentes ?? []).map(amostra => [amostra.id, amostra]));
      let melhorXp = anterior?.melhorXp;
      let melhoresDrops = anterior?.melhoresDrops;
      let ultima = recorde?.ultima;
      let xp = recorde?.xp;
      let drops = recorde?.drops;
      for (const { id, hunt, data, segundos, legado, xp: xpAmostra, drops: dropsAmostra, abates, variouContexto } of grupo) {
        if (recentes.has(id) || melhorXp?.id === id || melhoresDrops?.id === id) continue;
        const amostra = { id, hunt, data, segundos, legado, xp: xpAmostra, drops: dropsAmostra, abates,
          ...(variouContexto ? { variouContexto: true } : {}) };
        recentes.set(id, amostra);
        const resumo = resumoAmostraHunt(amostra);
        if (!melhorXp || resumo.xp > resumoAmostraHunt(melhorXp).xp) melhorXp = amostra;
        if (!melhoresDrops || resumo.drops > resumoAmostraHunt(melhoresDrops).drops) melhoresDrops = amostra;
        xp = recordeHunt(xp, resumo, "xp");
        drops = recordeHunt(drops, resumo, "drops");
        if (!ultima || resumo.data > ultima.data) ultima = resumo;
      }
      medicoes.put({
        equipe, contexto, area, melhorXp, melhoresDrops,
        recentes: [...recentes.values()].sort((a, b) => b.data - a.data).slice(0, LIMITE_AMOSTRAS_HUNTS),
      });
      recordes.put({ equipe, area, xp, drops, ultima });
    }
    return amostras.length;
  });
}

function lerHistoricoHunts(equipe) {
  if (typeof equipe !== "string" || !equipe || equipe.length > 8192) throw new Error("Equipe inválida.");
  return transacaoHunts(["medicoes", "recordes"], "readonly", async transacao => {
    const [registros, recordes] = await Promise.all([
      pedidoHunts(transacao.objectStore("medicoes").index("equipe").getAll(equipe)),
      pedidoHunts(transacao.objectStore("recordes").index("equipe").getAll(equipe)),
    ]);
    // Reúne também os contextos antigos, sem regravar nem excluir seus backups.
    const areas = new Map();
    for (const { area, recentes } of registros) {
      if (!areas.has(area)) areas.set(area, new Map());
      for (const amostra of recentes) {
        if (!amostra.legado) areas.get(area).set(amostra.id, amostra);
      }
    }
    const rendimentos = [...areas].flatMap(([area, amostras]) => {
      const recentes = [...amostras.values()].sort((a, b) => b.data - a.data).slice(0, LIMITE_AMOSTRAS_HUNTS);
      return recentes.length ? [{ area, hunt: recentes[0].hunt, ...taxasHunts(recentes) }] : [];
    });
    return { recordes, rendimentos };
  });
}

function exportarHistoricoHunts() {
  return transacaoHunts(["medicoes"], "readonly", async transacao => {
    const grupos = await pedidoHunts(transacao.objectStore("medicoes").getAll());
    const amostras = grupos.flatMap(({ equipe, contexto, area, recentes, melhorXp, melhoresDrops }) => {
      const unicas = new Map([...recentes, melhorXp, melhoresDrops].map(amostra => [amostra.id, amostra]));
      return [...unicas.values()].map(amostra => ({ equipe, contexto, area, ...amostra }));
    });
    return { formato: "multipoke-hunts", versao: 1, amostras };
  });
}

function configurarPokedex(mensagem) {
  const { treinador, id, acao } = mensagem;
  if (typeof treinador !== "string" || !treinador.trim() || treinador.length > 120 ||
      (acao !== "dex-listar" && (typeof id !== "string" || !/^[1-9]\d{0,5}$/.test(id)))) {
    throw new Error("Treinador ou espécie inválidos.");
  }
  if (acao === "dex-listar") return transacaoHunts(["pokedex"], "readonly", transacao =>
    pedidoHunts(transacao.objectStore("pokedex").index("treinador").getAll(treinador)));
  return transacaoHunts(["pokedex"], "readwrite", async transacao => {
    const loja = transacao.objectStore("pokedex");
    const anterior = await pedidoHunts(loja.get([treinador, id]));
    if (acao === "dex-remover") {
      if (!anterior) return false;
      if (mensagem.revisao !== anterior.revisao) throw new Error("A configuração mudou em outra aba. Tente novamente.");
      if (anterior.ativa || anterior.pendente) throw new Error("Desative o Pokémon e aguarde a confirmação de melhorias antes de removê-lo.");
      await pedidoHunts(loja.delete([treinador, id]));
      return true;
    }
    if (acao === "dex-progresso") {
      const p = mensagem.progresso;
      if (!p || typeof p.registrado !== "boolean") throw new Error("Progresso da Pokédex inválido.");
      let progresso = { registrado: p.registrado, data: Date.now() };
      if (p.registrado) {
        const campos = ["abates", "metaAnterior", "conquistados", "limite", "pontosLivres"];
        if (campos.some(campo => !Number.isSafeInteger(p[campo]) || p[campo] < 0) ||
            !p.limite || p.limite > 1000 || p.conquistados > p.limite || p.pontosLivres > p.limite || p.metaAnterior > p.abates ||
            (p.proximaMeta === null ? p.conquistados !== p.limite :
              !Number.isSafeInteger(p.proximaMeta) || p.proximaMeta <= p.abates || p.conquistados >= p.limite)) {
          throw new Error("Progresso da Pokédex inválido.");
        }
        progresso = { ...progresso, ...Object.fromEntries([...campos, "proximaMeta"].map(campo => [campo, p[campo]])) };
      }
      if (!anterior) return null;
      if (anterior.progresso?.registrado && (!p.registrado || p.abates < anterior.progresso.abates)) return anterior;
      // Uma leitura não altera a ativação, os bônus autorizados ou a revisão da regra.
      const regra = { ...anterior, progresso };
      await pedidoHunts(loja.put(regra));
      return regra;
    }
    let regra;
    if (acao === "dex-configurar") {
      const { nome, tipos, ativa, revisao } = mensagem;
      if (typeof nome !== "string" || !nome || nome.length > 120 || typeof ativa !== "boolean" ||
          !Array.isArray(tipos) || tipos.length > 3 || new Set(tipos).size !== tipos.length ||
          tipos.some(tipo => !["capture", "loot", "shiny"].includes(tipo)) || (ativa && !tipos.length)) {
        throw new Error("Configuração da Pokédex inválida.");
      }
      if (revisao !== (anterior?.revisao ?? 0)) throw new Error("A configuração mudou em outra aba. Tente novamente.");
      if (anterior?.pendente && ativa) throw new Error("Aguarde a confirmação da melhoria antes de ativar ou editar.");
      regra = { ...anterior, treinador, id, nome, tipos, ativa, aviso: anterior?.pendente ? "Confirmando a última melhoria." : "" };
    } else if (acao === "dex-reservar") {
      if (!anterior?.ativa || anterior.pendente || anterior.revisao !== mensagem.revisao ||
          !anterior.tipos.includes(mensagem.categoria) || typeof mensagem.token !== "string" || mensagem.token.length > 80) return null;
      regra = { ...anterior, pendente: { token: mensagem.token, data: Date.now() }, aviso: "Confirmando melhoria no jogo." };
    } else if (acao === "dex-finalizar") {
      if (!anterior?.pendente || anterior.pendente.token !== mensagem.token) return anterior ?? null;
      if (typeof mensagem.confirmada !== "boolean") throw new Error("Confirmação inválida.");
      regra = { ...anterior, pendente: null, ativa: mensagem.confirmada && anterior.ativa,
        aviso: mensagem.confirmada ? "Última melhoria confirmada no jogo." : "Sem confirmação. Confira no jogo antes de reativar." };
    } else throw new Error("Operação da Pokédex desconhecida.");
    regra.revisao = (anterior?.revisao ?? 0) + 1;
    await pedidoHunts(loja.put(regra));
    return regra;
  });
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo !== "multipoke:banco-hunts" || remetente.id !== chrome.runtime.id ||
      !/^https:\/\/multipoke\.io\/jogar\/?(?:[?#].*)?$/.test(remetente.url ?? "")) return;

  const { acao, chave, valor } = mensagem;
  async function executar() {
    if (["dex-listar", "dex-configurar", "dex-reservar", "dex-finalizar", "dex-progresso", "dex-remover"].includes(acao)) return configurarPokedex(mensagem);
    switch (acao) {
      case "ler-cache":
      case "salvar-cache": {
        if (typeof chave !== "string" || !/^v1\/[\w/-]{1,100}$/.test(chave)) throw new Error("Chave de catálogo inválida.");
        if (acao === "ler-cache") {
          const ficha = await transacaoHunts(["catalogo"], "readonly", transacao =>
            pedidoHunts(transacao.objectStore("catalogo").get(chave)));
          return ficha?.expira > Date.now() ? ficha.valor : null;
        }
        const horas = chave === "v1/indice" ? 1 : chave === "v1/xp" ? 24 : 6;
        await transacaoHunts(["catalogo"], "readwrite", transacao => pedidoHunts(transacao.objectStore("catalogo")
          .put({ chave, valor, expira: Date.now() + horas * 3600_000 })));
        return true;
      }
      case "historico": return lerHistoricoHunts(mensagem.equipe);
      case "salvar": return salvarAmostrasHunts(mensagem.amostras);
      case "exportar": return exportarHistoricoHunts();
      default: throw new Error("Operação de hunts desconhecida.");
    }
  }
  executar().then(dados => responder({ ok: true, dados }), erro =>
    responder({ ok: false, erro: erro.message }));
  return true;
});
