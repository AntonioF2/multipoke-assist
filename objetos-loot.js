// Observa somente o catálogo recebido pela conexão existente do jogo.
// Não abre conexões adicionais, não envia comandos e não altera as mensagens recebidas.
(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname) || globalThis.multiPokeObjetosLoot) return;
  globalThis.multiPokeObjetosLoot = true;
  let itens;
  let atual;
  const publicar = () => {
    if (itens) document.dispatchEvent(new CustomEvent("multipoke:objetos-loot", { detail: JSON.stringify(itens) }));
  };
  document.addEventListener("multipoke:consultar-objetos-loot", publicar);
  const Original = window.WebSocket;
  window.WebSocket = new Proxy(Original, {
    construct(alvo, argumentos, construtor) {
      const socket = Reflect.construct(alvo, argumentos, construtor);
      let url;
      try { url = new URL(argumentos[0], location.href); } catch { return socket; }
      if (url.protocol !== "wss:" || url.host !== location.host || url.pathname !== "/ws") return socket;
      atual = socket;
      itens = undefined;
      socket.addEventListener("message", event => {
        if (socket !== atual || !event.isTrusted || typeof event.data !== "string" || !event.data.includes('"catalog"')) return;
        try {
          const dados = JSON.parse(event.data)?.state?.catalog?.items;
          if (!Array.isArray(dados) || dados.length > 10000) return;
          const validos = dados.filter(item => Number.isSafeInteger(item?.id) && item.id > 0 &&
            typeof item.name === "string" && item.name.length > 0 && item.name.length <= 200 &&
            Number.isSafeInteger(item.npcPrice) && item.npcPrice >= 0);
          if (!validos.length) return;
          itens = validos.map(item => ({ id: item.id, nome: item.name, preco: item.npcPrice,
            vendavel: item.npcPrice > 0 && !item.evolutionStone && !item.shopBoost && !item.breedingPheromone }));
          publicar();
        } catch { /* Outros quadros da conexão continuam sendo tratados apenas pelo jogo. */ }
      });
      return socket;
    },
  });
})();
