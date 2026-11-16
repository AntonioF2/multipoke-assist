const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const raiz = path.resolve(__dirname, "..");
const fonte = fs.readFileSync(path.join(raiz, "loja.js"), "utf8");
const trecho = (inicio, fim) => fonte.slice(fonte.indexOf(inicio), fonte.indexOf(fim, fonte.indexOf(inicio)));

class Eventos {
  listeners = new Map();
  addEventListener(tipo, callback) {
    if (!this.listeners.has(tipo)) this.listeners.set(tipo, new Set());
    this.listeners.get(tipo).add(callback);
  }
  removeEventListener(tipo, callback) { this.listeners.get(tipo)?.delete(callback); }
  dispatchEvent(evento) {
    for (const callback of [...this.listeners.get(evento.type) ?? []]) callback(evento);
    return true;
  }
}

function ambiente() {
  const document = new Eventos();
  class Socket extends Eventos {
    static OPEN = 1;
    readyState = 1;
    enviados = [];
    send(dados) { this.enviados.push(dados); }
    receber(dados, isTrusted = true) { this.dispatchEvent({ type: "message", data: JSON.stringify(dados), isTrusted }); }
    fechar() { this.readyState = 3; this.dispatchEvent({ type: "close" }); }
  }
  class CustomEvent {
    constructor(type, { detail } = {}) { this.type = type; this.detail = detail; }
  }
  const contexto = vm.createContext({ document, WebSocket: Socket, URL, CustomEvent,
    location: { origin: "https://multipoke.io", host: "multipoke.io", pathname: "/jogar", href: "https://multipoke.io/jogar" } });
  contexto.window = contexto;
  vm.runInContext(fs.readFileSync(path.join(raiz, "objetos-loja.js"), "utf8"), contexto);
  const leituras = [], comandos = [], resultados = [];
  for (const [tipo, destino] of [["objetos-loja", leituras], ["loja-comando", comandos], ["loja-resultado", resultados]]) {
    document.addEventListener(`multipoke:${tipo}`, event => destino.push(JSON.parse(event.detail)));
  }
  const socket = vm.runInContext('new WebSocket("wss://multipoke.io/ws")', contexto);
  return { document, contexto, socket, leituras, comandos, resultados };
}

const pokemon = (extra = {}) => ({ id: "p1", quality: 1.1, ivTotal: 90, saleValue: 500, ...extra });
const estado = () => ({
  trainer: { name: "Ash", pokedollars: 10000, email: "nao-copiar" },
  balls: [{ id: 1, name: "Poke Ball", priceGold: 100, quantity: 0 }],
  supplies: [{ id: 2, name: "Small Potion", kind: "potion", buyGold: 50, quantity: 4 }],
  inventory: [{ id: 3, name: "Loot", npcPrice: 100, quantity: 5 }],
  collection: [pokemon()], team: [], online: { accountId: "nao-copiar" },
});

test("observa snapshots, deltas e somente os campos necessários à loja", () => {
  const a = ambiente();
  a.socket.receber({ type: "snapshot", wireSeq: 1, state: estado() });
  assert.equal(a.leituras.at(-1).trainer.pokedollars, 10000);
  assert.equal(a.leituras.at(-1).trainer.email, undefined);
  assert.equal(a.leituras.at(-1).online, undefined);
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 1, wireSeq: 2,
    changes: [[["balls", 0, "quantity"], 50], [["collection", 0, "locked"], true]] });
  assert.equal(a.leituras.at(-1).balls[0].quantity, 50);
  assert.equal(a.leituras.at(-1).collection[0].locked, true);
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 1, wireSeq: 3, changes: [] });
  assert.equal(a.leituras.at(-1), null, "uma lacuna invalida a leitura inteira");
  a.socket.receber({ type: "snapshot", wireSeq: 4, state: estado() });
  assert.equal(a.leituras.at(-1).conectada, true);
});

test("a loja reconhece o treinador online e preenche os suprimentos sem trainer.name", () => {
  const a = ambiente();
  const contexto = vm.createContext({ document: a.document, Event, treinador: () => "Ash",
    inteiro: (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max });
  // Exercita o mesmo recebimento e a mesma validação usados pelo painel isolado.
  vm.runInContext(trecho("  let estadoLoja = null;", "  let estoqueLoot"), contexto);
  vm.runInContext(trecho('  document.addEventListener("multipoke:objetos-loja",', "  function publicarReposicao("), contexto);
  vm.runInContext(trecho("  function produto(", "  function pilha("), contexto);
  const online = estado();
  delete online.trainer.name;
  online.online = { trainerName: "Ash", accountId: "nao-copiar", trainerId: "nao-copiar" };
  online.supplies.push({ id: 4, name: "Revive", kind: "revive", buyGold: 200, quantity: 2 });
  a.socket.receber({ type: "snapshot", wireSeq: 1, state: online });
  assert.equal(a.leituras.at(-1).trainer.name, "Ash");
  assert.equal(a.leituras.at(-1).online, undefined);
  assert.equal(contexto.produto({ dataset: { shopRow: "ball:1" } })?.tipo, "bola");
  assert.equal(contexto.produto({ dataset: { shopRow: "supply:2" } })?.tipo, "pocao");
  assert.equal(contexto.produto({ dataset: { shopRow: "supply:4" } })?.tipo, "revive");
  const tipos = ["bola", "pocao", "revive"];
  const seletores = Object.fromEntries(tipos.map(tipo => [tipo, {
    options: [{ value: "", text: "Sem reposição" }], value: "",
    get length() { return this.options.length; }, set length(valor) { this.options.length = valor; },
    add(opcao) { this.options.push(opcao); },
  }]));
  const linhas = ["ball:1", "supply:2", "supply:4"].map(shopRow => ({ dataset: { shopRow } }));
  Object.assign(contexto, { tiposCompra: tipos, escolhasCompra: new Map([["bola", "ball:1"], ["pocao", "supply:2"], ["revive", "supply:4"]]),
    interfaceLoja: {}, loja: () => ({ querySelectorAll: () => linhas, querySelector: () => null }),
    campo: id => seletores[id] ?? {}, formatar: valor => valor.toLocaleString("pt-BR"),
    escrever: (no, mensagem) => { no.textContent = mensagem; },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } } });
  vm.runInContext(trecho("  const saldo =", "  const treinador ="), contexto);
  vm.runInContext(trecho("  function mostrarEstoque()", "  function atualizarRotuloLoot("), contexto);
  contexto.mostrarEstoque();
  for (const [tipo, id] of [["bola", "ball:1"], ["pocao", "supply:2"], ["revive", "supply:4"]]) {
    assert.equal(seletores[tipo].options.length, 2, `${tipo}: inclui a opção de reposição`);
    assert.equal(seletores[tipo].options[1].value, id);
    assert.equal(seletores[tipo].value, id, "recupera a escolha salva");
    assert.match(seletores[tipo].options[1].text, /na mochila/);
  }
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 1, wireSeq: 2,
    changes: [[["online", "trainerName"], "Misty"]] });
  assert.equal(a.leituras.at(-1).trainer.name, "Misty");
  assert.equal(contexto.produto({ dataset: { shopRow: "ball:1" } }), null, "mantém a proteção contra mudança de treinador");
  contexto.mostrarEstoque();
  assert.ok(tipos.every(tipo => seletores[tipo].options.length === 1));
});

test("o nome online tem a mesma prioridade do jogo e a remoção recupera o nome legado", () => {
  const a = ambiente();
  const online = estado();
  online.trainer.name = "Treinador";
  online.online.trainerName = "Ash";
  a.socket.receber({ type: "snapshot", wireSeq: 1, state: online });
  assert.equal(a.leituras.at(-1).trainer.name, "Ash");
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 1, wireSeq: 2, changes: [[["online", "trainerName"]]] });
  assert.equal(a.leituras.at(-1).trainer.name, "Treinador");
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 2, wireSeq: 3,
    changes: [[["online"], { trainerName: "Misty", accountId: "nao-copiar" }]] });
  assert.equal(a.leituras.at(-1).trainer.name, "Misty");
  assert.equal(a.leituras.at(-1).online, undefined);
  a.socket.receber({ type: "snapshot", wireSeq: 4, state: estado() });
  assert.equal(a.leituras.at(-1).trainer.name, "Ash");
});

test("acompanha Pokémon por revisão, remoção, ordem e reconexão", () => {
  const a = ambiente();
  const inicial = estado(); delete inicial.collection;
  a.socket.receber({ type: "snapshot-collection", snapshot: { type: "snapshot", wireSeq: 1, state: inicial },
    collection: { reset: true, revision: 10, upserts: [pokemon(), pokemon({ id: "p2" })], order: ["p2", "p1"] } });
  assert.deepEqual(a.leituras.at(-1).collection.map(p => p.id), ["p2", "p1"]);
  a.socket.receber({ type: "snapshot-collection", snapshot: { type: "snapshot-delta", baseWireSeq: 1, wireSeq: 2, changes: [] },
    collection: { baseRevision: 10, revision: 11, upserts: [pokemon({ id: "p2", reserved: true })], removedIds: ["p1"] } });
  assert.deepEqual(a.leituras.at(-1).collection, [pokemon({ id: "p2", reserved: true })]);
  a.socket.fechar();
  assert.equal(a.leituras.at(-1), null);
  vm.runInContext('globalThis.novoSocket = new WebSocket("wss://multipoke.io/ws")', a.contexto);
  a.socket.receber({ type: "snapshot", wireSeq: 3, state: estado() });
  assert.equal(a.leituras.at(-1), null, "a conexão antiga não revalida o estado");
});

test("ignora eventos artificiais e invalida alterações perigosas sem poluir protótipos", () => {
  const a = ambiente();
  a.socket.receber({ type: "snapshot", state: estado() }, false);
  assert.equal(a.leituras.at(-1), null);
  a.socket.receber({ type: "snapshot", wireSeq: 1, state: estado() });
  a.socket.receber({ type: "snapshot-delta", baseWireSeq: 1, wireSeq: 2,
    changes: [[["trainer", "__proto__", "poluido"], true]] });
  assert.equal(a.leituras.at(-1), null);
  assert.equal({}.poluido, undefined);
});

test("observa o comando nativo sem alterar bytes, retorno ou encaminhar outros dados", () => {
  const a = ambiente();
  const comando = JSON.stringify({ type: "buy-ball", ballId: 1, quantity: 50, requestId: "pedido-1", extra: "privado" });
  assert.equal(a.socket.send(comando), undefined);
  assert.deepEqual(a.socket.enviados, [comando]);
  assert.deepEqual(a.comandos, [{ type: "buy-ball", requestId: "pedido-1", ballId: 1, quantity: 50 }]);
  a.socket.send(JSON.stringify({ type: "chat", message: "privado", requestId: "chat-1" }));
  assert.equal(a.comandos.length, 1);
  a.socket.receber({ type: "command-result", requestId: "pedido-1", ok: true, message: "Texto que pode mudar" });
  assert.deepEqual(a.resultados, [{ requestId: "pedido-1", ok: true }]);
});

function recibos(a, objetos = () => ({ trainer: { name: "Ash" } })) {
  const contexto = vm.createContext({ document: a.document, setInterval, clearInterval, setTimeout, clearTimeout,
    objetosDaLoja: objetos, treinador: () => "Ash", jogoDisponivel: () => true, PRAZO_COMPROVANTE: 350 });
  vm.runInContext(trecho("  function comandoConfere(", "  async function comprar("), contexto);
  return (reservar, disparar, esperado, atualizou = () => true) => contexto.comprovante(reservar, disparar, esperado, atualizou);
}

test("compra e ambas as vendas exigem comando exato e requestId correspondente, sem toast", async () => {
  for (const esperado of [
    { type: "buy-ball", ballId: 1, quantity: 50 },
    { type: "buy-supply", supplyId: 2, quantity: 50 },
    { type: "sell-loot-bulk", items: [{ itemId: 3, quantity: 5 }] },
    { type: "sell-pokemon-bulk", pokemonIds: ["p1", "p2"] },
  ]) {
    const a = ambiente();
    const ouvintesAntes = a.document.listeners.get("multipoke:loja-comando").size;
    let reservado = 0, concluido = false;
    const promessa = recibos(a)(() => reservado++, () => {
      a.socket.send(JSON.stringify({ ...esperado, requestId: "certo" })); return true;
    }, esperado).then(valor => { concluido = true; return valor; });
    a.socket.receber({ type: "command-result", requestId: "outro", ok: true });
    await Promise.resolve();
    assert.equal(concluido, false);
    a.socket.receber({ type: "command-result", requestId: "certo", ok: true });
    assert.equal(await promessa, true);
    assert.equal(reservado, 1);
    assert.equal(a.document.listeners.get("multipoke:loja-comando").size, ouvintesAntes);
  }
});

test("a confirmação aguarda os objetos atualizados antes de liberar outra operação", async () => {
  const a = ambiente();
  let atualizou = false, concluido = false;
  const esperado = { type: "buy-ball", ballId: 1, quantity: 50 };
  const promessa = recibos(a)(() => {}, () => {
    a.socket.send(JSON.stringify({ ...esperado, requestId: "p" })); return true;
  }, esperado, () => atualizou).then(valor => { concluido = true; return valor; });
  a.socket.receber({ type: "command-result", requestId: "p", ok: true });
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(concluido, false);
  atualizou = true;
  assert.equal(await promessa, true);
});

test("recusa comando divergente, negativa do servidor, timeout e objetos ausentes", async () => {
  for (const caso of ["divergente", "negado", "timeout", "sem-objetos"]) {
    const a = ambiente();
    const esperado = { type: "buy-ball", ballId: 1, quantity: 50 };
    const promessa = recibos(a, () => caso === "sem-objetos" ? null : {})(() => {}, () => {
      a.socket.send(JSON.stringify({ ...esperado, quantity: caso === "divergente" ? 1 : 50, requestId: "p" }));
      return true;
    }, esperado);
    if (caso === "negado") a.socket.receber({ type: "command-result", requestId: "p", ok: false });
    await assert.rejects(promessa, /divergiu|recusou|sem confirmação|objetos da loja/);
  }
});

test("preços, tipos e quantidades de produtos vêm dos objetos, sem leitura de rótulos", () => {
  const dados = estado();
  const contexto = vm.createContext({ objetosDaLoja: () => dados,
    inteiro: (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max });
  vm.runInContext(trecho("  function produto(", "  function pilha("), contexto);
  const bola = contexto.produto({ dataset: { shopRow: "ball:1" } });
  assert.equal(bola.tipo, "bola");
  assert.equal(bola.estoque, 0);
  assert.equal(bola.preco, 100);
  const pocao = contexto.produto({ dataset: { shopRow: "supply:2" } });
  assert.equal(pocao.tipo, "pocao");
  assert.equal(pocao.estoque, 4);
  dados.supplies[0].kind = "revive";
  assert.equal(contexto.produto({ dataset: { shopRow: "supply:2" } }).tipo, "revive");
  dados.balls[0].shopGoldEnabled = false;
  assert.equal(contexto.produto({ dataset: { shopRow: "ball:1" } }), null);
});

test("loot cruza estoque numérico com o objeto e preserva preço e bloqueios de NPC", () => {
  const dados = estado();
  const metadados = new Map([["id:3", { preco: 90 }]]);
  const controle = { dataset: { uiIntegerMax: "5" }, type: "number", valueAsNumber: 2 };
  const linha = { querySelector: () => controle };
  const caixa = { dataset: { lootSelect: "id:3" }, closest: () => linha };
  const contexto = vm.createContext({ objetosDaLoja: () => dados, objetosLoot: metadados, texto: () => "Loot",
    inteiro: (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max,
    chaveLoot: id => id, catalogo: null });
  vm.runInContext(trecho("  function pilha(", "  const seletorLoot"), contexto);
  assert.equal(contexto.pilha(caixa).preco, 100, "o inventário tem prioridade sobre o catálogo");
  assert.equal(contexto.pilha(caixa).qtd, 2);
  dados.inventory[0].quantity = 6;
  assert.equal(contexto.pilha(caixa), null, "não usa um controle com estoque desatualizado");
  dados.inventory[0].quantity = 5;
  for (const campo of ["evolutionStone", "shopBoost", "breedingPheromone"]) {
    dados.inventory[0][campo] = true;
    assert.equal(contexto.pilha(caixa), null);
    delete dados.inventory[0][campo];
  }
  metadados.set("id:3", { preco: 90, bloqueado: true });
  assert.equal(contexto.pilha(caixa), null);
});

test("pedido incerto mantém uma espera compartilhada; confirmação libera o próximo", async () => {
  const prazos = new Map();
  const contexto = vm.createContext({
    chavePrazo: (atual, operacao) => operacao, lerPrazo: chave => prazos.get(chave) ?? 0,
    salvarPrazo: (chave, prazo) => prazos.set(chave, prazo), PRAZO_COMPROVANTE: 15000, ESPERA_OPERACAO_INCERTA: 60000,
  });
  vm.runInContext(trecho("  async function operar(", "  async function ciclo("), contexto);
  const atual = { proximas: new Map(), avisos: new Map() };
  assert.equal(await contexto.operar(atual, "ball:1", "Bolas", 5000, reservar => {
    reservar(); throw new Error("Sem confirmação");
  }), false);
  assert.ok(prazos.get("confirmacao") > Date.now());
  await contexto.operar(atual, "supply:2", "Poções", 5000, reservar => { reservar(); });
  assert.equal(prazos.get("confirmacao"), 0);
});

test("filtros e proteções de Pokémon usam os objetos, inclusive fora da tela", () => {
  let dados = estado();
  const contexto = vm.createContext({ objetosDaLoja: () => dados, QUALIDADE_LENDARIA: 1.7,
    inteiro: (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max });
  vm.runInContext(trecho("  function pokemonDoObjeto(", "  function pokemonElegivel("), contexto);
  const filtro = { qualidade: 1.2, iv: 100, condicao: "e" };
  assert.equal(contexto.pokemonDoObjeto("p1", filtro).preco, 500);
  for (const campo of ["starter", "locked", "shiny", "holo", "reserved", "breedingBox"]) {
    dados = estado(); dados.collection[0][campo] = true;
    assert.equal(contexto.pokemonDoObjeto("p1", filtro), null, campo);
  }
  dados = estado(); dados.team = [{ id: "p1" }];
  assert.equal(contexto.pokemonDoObjeto("p1", filtro), null);
  dados = estado(); dados.collection[0].quality = 1.7;
  assert.equal(contexto.pokemonDoObjeto("p1", { ...filtro, condicao: "ou" }), null);
  dados.collection[0].quality = 1.3;
  assert.equal(contexto.pokemonDoObjeto("p1", filtro), null);
  assert.equal(contexto.pokemonDoObjeto("p1", { ...filtro, condicao: "ou" }).id, "p1");
  dados.collection[0].ivTotal = 100;
  assert.equal(contexto.pokemonDoObjeto("p1", { ...filtro, condicao: "ou" }), null);
});

test("o ciclo executa bolas, poções, revives, loot e Pokémon sem qualquer hunt", async () => {
  const chamadas = [];
  const atual = { treinador: "Ash", compras: [
    { id: "ball:1", tipo: "bola" }, { id: "supply:2", tipo: "pocao" }, { id: "supply:3", tipo: "revive" },
  ], modoVenda: "baratos", filtroPokemon: {}, proximas: new Map(), avisos: new Map() };
  const contexto = vm.createContext({ sessao: atual, ocupada: false, document: { hidden: false },
    treinador: () => "Ash", jogoDisponivel: () => true, objetosDaLoja: () => ({}), sincronizarTreinador() {},
    trocaHunts: { emTroca: () => false }, modal: () => null, jogo: () => null,
    interfaceLoja: {}, performance: { now: () => 10000 }, ultimaInteracao: 0, interacoes: 0,
    catalogo: {}, atualizarIndicador() {}, chavePrazo: () => "", lerPrazo: () => 0,
    navigator: { locks: { request: async (nome, opcoes, callback) => callback({}) } },
    comLoja: async (aberta, callback) => callback(), loja: () => ({}),
    rotulosCompra: { bola: "bolas", pocao: "poções", revive: "revives" }, INTERVALO_ESTOQUE: 5000, INTERVALO_VENDA: 30000,
    operar: async (atual, id, rotulo, intervalo, executar) => executar(() => {}),
    comprar: regra => chamadas.push(regra.tipo), vender: () => chamadas.push("loot"), venderPokemon: () => chamadas.push("pokemon"),
    lojaVisivel: () => false, informar() {}, campo: () => ({}),
    aguardar: mensagem => { throw new Error(mensagem); }, pausar: mensagem => { throw new Error(mensagem); },
  });
  vm.runInContext(trecho("  async function ciclo()", "  function sincronizarTreinador("), contexto);
  await contexto.ciclo();
  assert.deepEqual(chamadas, ["bola", "pocao", "revive", "loot", "pokemon"]);
});
