// Observa metadados de itens na conexão existente, sem enviar comandos ou alterar mensagens.
(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname) || globalThis.multiPokeObjetosLoot) return;
  globalThis.multiPokeObjetosLoot = true;
  let catalogo = [], inventario = [], sequencia = null, atual, publicado;
  const campos = new Set(["id", "itemId", "name", "npcPrice", "evolutionStone", "shopBoost", "breedingPheromone"]);
  const id = item => Number(item?.id ?? item?.itemId);
  const valido = numero => Number.isSafeInteger(numero) && numero > 0;
  const preco = valor => valor == null ? undefined : Number(valor);
  const bloqueado = item => Boolean(item?.evolutionStone || item?.shopBoost || item?.breedingPheromone);

  function copiar(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const copia = {};
    for (const campo of campos) {
      const valor = item[campo];
      if (campo === "name") {
        if (typeof valor === "string" && valor.length <= 200) copia[campo] = valor;
      } else if (["id", "itemId", "npcPrice"].includes(campo)) {
        if (valor != null && (typeof valor === "number" || typeof valor === "string" && /^\d+$/.test(valor))) {
          const numero = Number(valor);
          if (Number.isSafeInteger(numero) && numero >= 0) copia[campo] = numero;
        }
      } else copia[campo] = Boolean(valor);
    }
    return copia;
  }
  function lista(valor) {
    if (!Array.isArray(valor) || valor.length > 10000) throw new Error("Lista de itens inválida.");
    return valor.map(copiar);
  }
  function publicar(forcar = false) {
    const base = new Map(catalogo.filter(item => valido(id(item))).map(item => [id(item), item]));
    const efetivos = new Map(base);
    for (const item of inventario) {
      if (!valido(id(item))) continue;
      const referencia = base.get(id(item));
      efetivos.set(id(item), { ...referencia, ...item, id: id(item),
        npcPrice: item.npcPrice ?? referencia?.npcPrice,
        evolutionStone: item.evolutionStone || referencia?.evolutionStone,
        shopBoost: item.shopBoost || referencia?.shopBoost,
        breedingPheromone: item.breedingPheromone || referencia?.breedingPheromone });
    }
    const itens = [...efetivos.values()].filter(item => typeof item.name === "string" && item.name &&
      Number.isSafeInteger(preco(item.npcPrice)) && preco(item.npcPrice) >= 0).map(item => ({
        id: id(item), nome: item.name, preco: preco(item.npcPrice), bloqueado: bloqueado(item),
        vendavel: preco(item.npcPrice) > 0 && !bloqueado(item),
      }));
    const json = JSON.stringify(itens);
    if (forcar || json !== publicado) {
      publicado = json;
      document.dispatchEvent(new CustomEvent("multipoke:objetos-loot", { detail: json }));
    }
  }

  function receber(mensagem) {
    const quadro = mensagem?.type === "snapshot-collection" ? mensagem.snapshot : mensagem;
    if (quadro?.type === "snapshot") {
      const novos = quadro.state?.catalog?.items;
      const proximoCatalogo = novos === undefined ? catalogo : lista(novos);
      const proximoInventario = lista(quadro.state?.inventory ?? []);
      catalogo = proximoCatalogo; inventario = proximoInventario;
      sequencia = Number.isSafeInteger(quadro.wireSeq) ? quadro.wireSeq : null;
      publicar();
    } else if (quadro?.type === "snapshot-delta") {
      if (!Number.isSafeInteger(sequencia) || quadro.baseWireSeq !== sequencia || quadro.wireSeq !== sequencia + 1 ||
          !Array.isArray(quadro.changes)) throw new Error("Base de itens desatualizada.");
      let proximoCatalogo = catalogo, proximoInventario = inventario, mudou = false;
      for (const mudanca of quadro.changes) {
        if (!Array.isArray(mudanca) || ![1, 2].includes(mudanca.length) || !Array.isArray(mudanca[0])) throw new Error("Alteração inválida.");
        const [caminho, valor] = mudanca;
        if (caminho.length === 1 && caminho[0] === "catalog") {
          proximoCatalogo = mudanca.length === 1 || valor?.items === undefined ? [] : lista(valor.items);
          mudou = true;
          continue;
        }
        const ehInventario = caminho[0] === "inventory";
        const ehCatalogo = caminho[0] === "catalog" && caminho[1] === "items";
        if (!ehInventario && !ehCatalogo) continue;
        const partes = caminho.slice(ehInventario ? 1 : 2);
        let itens = ehInventario ? proximoInventario : proximoCatalogo;
        if (!partes.length) itens = mudanca.length === 1 ? [] : lista(valor);
        else {
          const [indice, campo] = partes;
          if (!Number.isSafeInteger(indice) || indice < 0 || indice >= itens.length) throw new Error("Índice inválido.");
          if (partes.length > 1 && !campos.has(campo)) continue;
          if (partes.length > 2) throw new Error("Metadado inesperado.");
          itens = itens.slice();
          if (partes.length === 1) {
            if (mudanca.length === 1) throw new Error("Remoção de índice inválida.");
            itens[indice] = copiar(valor);
          } else {
            const item = { ...itens[indice] };
            if (mudanca.length === 1) delete item[campo];
            else item[campo] = valor;
            itens[indice] = copiar(item);
          }
        }
        if (ehInventario) proximoInventario = itens;
        else proximoCatalogo = itens;
        mudou = true;
      }
      catalogo = proximoCatalogo; inventario = proximoInventario; sequencia = quadro.wireSeq;
      if (mudou) publicar();
    }
  }
  document.addEventListener("multipoke:consultar-objetos-loot", () => publicar(true));
  const Original = window.WebSocket;
  window.WebSocket = new Proxy(Original, {
    construct(alvo, argumentos, construtor) {
      const socket = Reflect.construct(alvo, argumentos, construtor);
      let url;
      try { url = new URL(argumentos[0], location.href); } catch { return socket; }
      if (url.protocol !== "wss:" || url.host !== location.host || url.pathname !== "/ws") return socket;
      atual = socket; catalogo = []; inventario = []; sequencia = null; publicar();
      socket.addEventListener("message", event => {
        if (socket !== atual || !event.isTrusted || typeof event.data !== "string" || !event.data.includes('"snapshot')) return;
        try { receber(JSON.parse(event.data)); }
        catch { catalogo = []; inventario = []; sequencia = null; publicar(); }
      });
      return socket;
    },
  });
})();
