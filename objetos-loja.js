// Lê somente a projeção necessária à loja e observa comandos nativos, sem enviá-los.
(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname) || globalThis.multiPokeObjetosLoja) return;
  globalThis.multiPokeObjetosLoja = true;
  const esquemas = {
    treinador: ["name", "pokedollars", "gold"],
    identidade: ["trainerName"],
    produto: ["id", "name", "kind", "quantity", "priceGold", "buyGold", "shopGoldEnabled"],
    pokemon: ["id", "quality", "ivTotal", "saleValue", "starter", "locked", "shiny", "holo", "reserved", "breedingBox"],
    equipe: ["id"],
    loot: ["id", "itemId", "name", "quantity", "npcPrice", "evolutionStone", "shopBoost", "breedingPheromone"],
  };
  const raizes = { trainer: "treinador", online: "identidade", balls: "produto", supplies: "produto", inventory: "loot", collection: "pokemon", team: "equipe" };
  const listas = new Set(["balls", "supplies", "inventory", "collection", "team"]);
  const proibidas = new Set(["__proto__", "constructor", "prototype"]);
  const tipos = new Set(["buy-ball", "buy-supply", "sell-loot-bulk", "sell-pokemon-bulk"]);
  let atual, estado = null, sequencia = null, colecao = null, publicado;
  const inteiro = valor => Number.isSafeInteger(valor) && valor >= 0;
  const identidade = valor => typeof valor === "string" && valor.length > 0 && valor.length <= 256;
  const emitir = (tipo, dados) => document.dispatchEvent(new CustomEvent(tipo, { detail: JSON.stringify(dados) }));

  function registro(valor, esquema) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error("Registro inválido.");
    const copia = {};
    for (const campo of esquemas[esquema]) {
      const dado = valor[campo];
      if (typeof dado === "boolean" || typeof dado === "number" && Number.isFinite(dado) ||
          typeof dado === "string" && dado.length <= 256) copia[campo] = dado;
    }
    return copia;
  }

  function projetar(raiz, valor) {
    if (raiz === "online" && valor === null) return {};
    if (!listas.has(raiz)) return registro(valor, raizes[raiz]);
    if (!Array.isArray(valor) || valor.length > 100_000) throw new Error("Lista inválida.");
    return valor.map(item => registro(item, raizes[raiz]));
  }

  function publicar(forcar = false) {
    let dados = null;
    if (estado) {
      const { online, ...campos } = estado;
      // A interface do jogo prioriza a identidade online sobre o nome legado.
      // Normaliza só a projeção publicada, preservando a base dos próximos deltas.
      dados = { ...campos, trainer: { ...estado.trainer, name: online?.trainerName || estado.trainer?.name },
        conectada: atual?.readyState === WebSocket.OPEN };
    }
    const json = JSON.stringify(dados);
    if (forcar || json !== publicado) {
      publicado = json;
      document.dispatchEvent(new CustomEvent("multipoke:objetos-loja", { detail: json }));
    }
  }

  function invalidar() {
    estado = null; sequencia = null; colecao = null;
    publicar();
  }

  function atualizarColecao(patch) {
    if (!patch || !inteiro(patch.revision) || !Array.isArray(patch.upserts) ||
        !Array.isArray(patch.removedIds ?? []) || patch.upserts.length > 100_000 ||
        (patch.reset !== true && (!colecao || patch.baseRevision !== colecao.revisao || patch.revision < patch.baseRevision)) ||
        (patch.reset !== true && patch.revision === patch.baseRevision &&
          (patch.upserts.length || patch.removedIds?.length || patch.order !== undefined))) throw new Error("Coleção desatualizada.");
    let itens = new Map(patch.reset === true ? [] : colecao.itens);
    const removidos = new Set(), incluidos = new Set();
    for (const id of patch.removedIds ?? []) {
      if (!identidade(id) || removidos.has(id)) throw new Error("Remoção inválida.");
      removidos.add(id); itens.delete(id);
    }
    for (const item of patch.upserts) {
      if (!identidade(item?.id) || incluidos.has(item.id)) throw new Error("Pokémon inválido.");
      incluidos.add(item.id); itens.set(item.id, registro(item, "pokemon"));
    }
    if (itens.size > 100_000) throw new Error("Coleção muito grande.");
    if (patch.order !== undefined) {
      if (!Array.isArray(patch.order) || patch.order.length !== itens.size || new Set(patch.order).size !== itens.size ||
          patch.order.some(id => !itens.has(id))) throw new Error("Ordem inválida.");
      itens = new Map(patch.order.map(id => [id, itens.get(id)]));
    }
    return { revisao: patch.revision, itens };
  }

  function receber(mensagem) {
    const agrupada = mensagem?.type === "snapshot-collection";
    const quadro = agrupada ? mensagem.snapshot : mensagem;
    if (!["snapshot", "snapshot-delta"].includes(quadro?.type)) return;
    if (agrupada && (!inteiro(quadro.wireSeq) || quadro.type === "snapshot" && Object.hasOwn(quadro.state ?? {}, "collection"))) {
      throw new Error("Snapshot agrupado inválido.");
    }
    const proximaColecao = agrupada ? atualizarColecao(mensagem.collection) : null;
    let proximo;
    if (quadro.type === "snapshot") {
      if (!quadro.state || quadro.wireSeq !== undefined && !inteiro(quadro.wireSeq)) throw new Error("Snapshot inválido.");
      proximo = {};
      for (const raiz of Object.keys(raizes)) {
        if (Object.hasOwn(quadro.state, raiz)) proximo[raiz] = projetar(raiz, quadro.state[raiz]);
      }
    } else {
      if (!estado || !inteiro(sequencia) || quadro.baseWireSeq !== sequencia || quadro.wireSeq !== sequencia + 1 ||
          !Array.isArray(quadro.changes)) throw new Error("Base desatualizada.");
      proximo = { ...estado };
      for (const mudanca of quadro.changes) {
        if (!Array.isArray(mudanca) || ![1, 2].includes(mudanca.length) || !Array.isArray(mudanca[0]) || !mudanca[0].length ||
            mudanca[0].some(parte => proibidas.has(parte))) throw new Error("Alteração inválida.");
        const [caminho, valor] = mudanca;
        const [raiz, indice, campo] = caminho;
        if (!Object.hasOwn(raizes, raiz)) continue;
        if (agrupada && raiz === "collection") throw new Error("Coleção duplicada.");
        const remover = mudanca.length === 1;
        if (caminho.length === 1) {
          if (remover) delete proximo[raiz];
          else proximo[raiz] = projetar(raiz, valor);
          continue;
        }
        const ehLista = listas.has(raiz);
        const chave = ehLista ? campo : indice;
        if (caminho.length > (ehLista ? 3 : 2)) continue;
        if (ehLista) {
          if (!Array.isArray(proximo[raiz]) || !inteiro(indice) || indice >= proximo[raiz].length) throw new Error("Índice inválido.");
          proximo[raiz] = proximo[raiz].slice();
          if (caminho.length === 2) {
            if (remover) throw new Error("Remoção de índice inválida.");
            proximo[raiz][indice] = registro(valor, raizes[raiz]);
            continue;
          }
        }
        if (!esquemas[raizes[raiz]].includes(chave)) continue;
        const item = { ...(ehLista ? proximo[raiz][indice] : proximo[raiz]) };
        if (remover) delete item[chave];
        else item[chave] = valor;
        if (ehLista) proximo[raiz][indice] = registro(item, raizes[raiz]);
        else proximo[raiz] = registro(item, raizes[raiz]);
      }
    }
    if (agrupada) proximo.collection = [...proximaColecao.itens.values()];
    else if (quadro.type === "snapshot") colecao = null;
    estado = proximo;
    sequencia = quadro.wireSeq ?? null;
    if (agrupada) colecao = proximaColecao;
    publicar();
  }

  document.addEventListener("multipoke:consultar-objetos-loja", () => publicar(true));
  const Original = window.WebSocket;
  window.WebSocket = new Proxy(Original, {
    construct(alvo, argumentos, construtor) {
      const socket = Reflect.construct(alvo, argumentos, construtor);
      let url;
      try { url = new URL(argumentos[0], location.href); } catch { return socket; }
      if (url.protocol !== "wss:" || url.host !== location.host || url.pathname !== "/ws") return socket;
      atual = socket; invalidar();
      const enviar = socket.send;
      socket.send = function(dados) {
        const resultado = Reflect.apply(enviar, this, [dados]);
        // Apenas observa o comando que o próprio jogo já enviou, sem modificar o transporte.
        if (this === atual && typeof dados === "string" && dados.length < 100_000) {
          try {
            const comando = JSON.parse(dados);
            if (tipos.has(comando?.type) && identidade(comando.requestId)) {
              const copia = { type: comando.type, requestId: comando.requestId };
              for (const chave of ["ballId", "supplyId", "quantity"]) if (inteiro(comando[chave])) copia[chave] = comando[chave];
              if (Array.isArray(comando.items)) copia.items = comando.items.map(item => ({ itemId: item.itemId, quantity: item.quantity }));
              if (Array.isArray(comando.pokemonIds)) copia.pokemonIds = comando.pokemonIds.filter(identidade);
              emitir("multipoke:loja-comando", copia);
            }
          } catch { /* A observação nunca interfere no envio nativo. */ }
        }
        return resultado;
      };
      socket.addEventListener("message", event => {
        if (socket !== atual || !event.isTrusted || typeof event.data !== "string") return;
        try {
          const mensagem = JSON.parse(event.data);
          receber(mensagem);
          if (mensagem?.type === "command-result" && identidade(mensagem.requestId) && typeof mensagem.ok === "boolean") {
            emitir("multipoke:loja-resultado", { requestId: mensagem.requestId, ok: mensagem.ok });
          }
        } catch { invalidar(); }
      });
      socket.addEventListener("close", () => { if (socket === atual) invalidar(); });
      socket.addEventListener("error", () => { if (socket === atual) invalidar(); });
      return socket;
    },
  });
})();
