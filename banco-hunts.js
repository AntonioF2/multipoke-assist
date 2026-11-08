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
    const pedido = indexedDB.open("multipoke-hunts", 1);
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      banco.createObjectStore("catalogo", { keyPath: "chave" });
      banco.createObjectStore("medicoes", { keyPath: ["equipe", "contexto", "area"] })
        .createIndex("equipe-contexto", ["equipe", "contexto"]);
      banco.createObjectStore("recordes", { keyPath: ["equipe", "area"] })
        .createIndex("equipe", "equipe");
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
  return { hunt, data, segundos, legado, xp, drops };
}

function amostraValidaHunt(amostra) {
  const campos = ["equipe", "contexto", "area", "id", "hunt"];
  if (!amostra || campos.some(campo => typeof amostra[campo] !== "string" || amostra[campo].length > 8192) ||
      !amostra.equipe || !amostra.area || !amostra.id || !amostra.hunt) return false;
  const { equipe, data, segundos, xp, drops, abates, legado, contexto, area } = amostra;
  try {
    const formacao = JSON.parse(equipe);
    if (!Array.isArray(formacao) || typeof formacao[0] !== "string" || !Array.isArray(formacao[1])) return false;
  } catch { return false; }
  const numeros = [data, segundos, xp, drops];
  if (numeros.some(valor => !Number.isSafeInteger(valor) || valor < 0) || segundos < 300) return false;
  return legado === true ? contexto === "" : legado === false && Boolean(contexto) &&
    /^[\w-]+$/.test(area) && Number.isSafeInteger(abates) && abates > 0 &&
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
      for (const { id, hunt, data, segundos, legado, xp: xpAmostra, drops: dropsAmostra, abates } of grupo) {
        if (recentes.has(id) || melhorXp?.id === id || melhoresDrops?.id === id) continue;
        const amostra = { id, hunt, data, segundos, legado, xp: xpAmostra, drops: dropsAmostra, abates };
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

function lerHistoricoHunts(equipe, contexto) {
  return transacaoHunts(["medicoes", "recordes"], "readonly", async transacao => {
    const [registros, recordes] = await Promise.all([
      contexto ? pedidoHunts(transacao.objectStore("medicoes").index("equipe-contexto").getAll([equipe, contexto])) : [],
      pedidoHunts(transacao.objectStore("recordes").index("equipe").getAll(equipe)),
    ]);
    const rendimentos = registros.map(({ area, recentes }) => ({
      area, hunt: recentes[0].hunt, ...taxasHunts(recentes),
    }));
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

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo !== "multipoke:banco-hunts" || remetente.id !== chrome.runtime.id ||
      !/^https:\/\/multipoke\.io\/jogar\/?(?:[?#].*)?$/.test(remetente.url ?? "")) return;

  const { acao, chave, valor } = mensagem;
  async function executar() {
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
      case "historico": return lerHistoricoHunts(mensagem.equipe, mensagem.contexto);
      case "salvar": return salvarAmostrasHunts(mensagem.amostras);
      case "exportar": return exportarHistoricoHunts();
      default: throw new Error("Operação de hunts desconhecida.");
    }
  }
  executar().then(dados => responder({ ok: true, dados }), erro =>
    responder({ ok: false, erro: erro.message }));
  return true;
});
