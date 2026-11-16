const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const raiz = path.resolve(__dirname, "..");

function banco(iniciais = []) {
  const chave = regra => JSON.stringify([regra.treinador, regra.id]);
  const registros = new Map(iniciais.map(regra => [chave(regra), structuredClone(regra)]));
  const loja = {
    index: () => ({ getAll: treinador => structuredClone([...registros.values()].filter(regra => regra.treinador === treinador)) }),
    get: id => structuredClone(registros.get(JSON.stringify(id))),
    put: regra => { registros.set(chave(regra), structuredClone(regra)); },
  };
  const contexto = vm.createContext({ pedidoHunts: valor => Promise.resolve(valor),
    transacaoHunts: async (colecoes, modo, executar) => executar({ objectStore: () => loja }) });
  const fonte = fs.readFileSync(path.join(raiz, "banco-hunts.js"), "utf8");
  vm.runInContext(fonte.slice(fonte.indexOf("function configurarPokedex("), fonte.indexOf("chrome.runtime.onMessage")), contexto);
  return { enviar: mensagem => contexto.configurarPokedex({ treinador: "Ash", id: "1", ...mensagem }), registros };
}

test("o banco permite uma opção por espécie e rejeita configurações com vários bônus", async () => {
  const b = banco();
  let regra = await b.enviar({ acao: "dex-configurar", nome: "Bulbasaur", tipos: ["shiny"], ativa: false, revisao: 0 });
  regra = await b.enviar({ acao: "dex-configurar", nome: regra.nome, tipos: ["loot"], ativa: false, revisao: regra.revisao });
  assert.deepEqual(Array.from(regra.tipos), ["loot"]);
  await assert.rejects(b.enviar({ acao: "dex-configurar", nome: regra.nome,
    tipos: ["loot", "capture"], ativa: true, revisao: regra.revisao }), /inválida/);
  regra = await b.enviar({ acao: "dex-configurar", nome: regra.nome, tipos: ["loot"], ativa: true, revisao: regra.revisao });
  assert.equal(regra.ativa, true);
  const reserva = await b.enviar({ acao: "dex-reservar", categoria: "capture", revisao: regra.revisao, token: "t" });
  assert.equal(reserva, null, "não reserva pontos para uma opção diferente da escolhida");
  regra = await b.enviar({ acao: "dex-configurar", nome: regra.nome, tipos: [], ativa: false, revisao: regra.revisao });
  assert.equal(regra.tipos.length, 0);
  await assert.rejects(b.enviar({ acao: "dex-configurar", nome: regra.nome,
    tipos: [], ativa: true, revisao: regra.revisao }), /inválida/);
});

test("configurações antigas são pausadas sem perder progresso nem confirmações pendentes", async () => {
  const antiga = { treinador: "Ash", id: "1", nome: "Bulbasaur", tipos: ["shiny", "loot"], ativa: true,
    revisao: 5, pendente: { token: "pendente", data: 100 }, progresso: { abates: 500 } };
  const unica = { treinador: "Ash", id: "2", nome: "Ivysaur", tipos: ["capture"], ativa: true, revisao: 1 };
  const outro = { ...antiga, treinador: "Misty" };
  const b = banco([antiga, unica, outro]);
  assert.equal(await b.enviar({ acao: "dex-reservar", categoria: "loot", revisao: 5, token: "novo" }), null);
  const regras = await b.enviar({ acao: "dex-listar" });
  const migrada = regras.find(regra => regra.id === "1");
  assert.equal(migrada.tipos.length, 0);
  assert.equal(migrada.ativa, false);
  assert.equal(migrada.revisao, 6);
  assert.deepEqual(migrada.pendente, antiga.pendente);
  assert.deepEqual(migrada.progresso, antiga.progresso);
  assert.deepEqual(regras.find(regra => regra.id === "2"), unica);
  assert.deepEqual(b.registros.get(JSON.stringify(["Misty", "1"])), outro);
  assert.equal((await b.enviar({ acao: "dex-listar" })).find(regra => regra.id === "1").revisao, 6);
  await assert.rejects(b.enviar({ acao: "dex-configurar", nome: antiga.nome,
    tipos: ["shiny"], ativa: true, revisao: 5 }), /outra aba/);
  const finalizada = await b.enviar({ acao: "dex-finalizar", token: "pendente", confirmada: true });
  assert.equal(finalizada.pendente, null);
  assert.equal(finalizada.ativa, false, "confirmar a operação anterior não reativa uma regra migrada");
});

test("os checkboxes substituem a escolha anterior apenas na espécie editada", () => {
  class No {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.eventos = {}; this.classList = { add() {} }; }
    append(...filhos) { this.children.push(...filhos); }
    replaceChildren(...filhos) { this.children = filhos; }
    setAttribute() {}
    addEventListener(tipo, callback) { this.eventos[tipo] = callback; }
  }
  const lista = new No("lista");
  const contexto = vm.createContext({
    document: { createElement: tag => new No(tag), createDocumentFragment: () => new No("fragmento"), createTextNode: texto => ({ textContent: texto }) },
    visivel: () => true, dono: "Ash", notas: new Map(), salvando: false, ultimaApresentacao: undefined,
    categorias: { shiny: "Shiny chance", capture: "Catch rate", loot: "Loot" }, lista,
    imagem: () => new No("img"), criarProgresso: () => new No("progresso"), campo: () => new No("campo"),
    regras: [
      { id: "1", nome: "Bulbasaur", tipos: ["shiny"], ativa: true },
      { id: "2", nome: "Ivysaur", tipos: ["capture"], ativa: true },
    ],
    configurar: regra => { contexto.regras = contexto.regras.map(atual => atual.id === regra.id ? regra : atual); contexto.mostrarRegras(); },
  });
  const fonte = fs.readFileSync(path.join(raiz, "pokedex.js"), "utf8");
  vm.runInContext(fonte.slice(fonte.indexOf("  function mostrarRegras()"), fonte.indexOf("  function filtrar()")), contexto);
  contexto.mostrarRegras();
  const todos = no => [no, ...(no.children ?? []).flatMap(todos)];
  const controles = id => todos(todos(lista).find(no => no.dataset?.especie === id)).filter(no => no.tag === "input");
  const alterar = (tipo, checked) => {
    const controle = controles("1").find(no => no.dataset.tipo === tipo);
    controle.checked = checked;
    controle.eventos.change();
  };
  alterar("loot", true);
  assert.deepEqual(controles("1").filter(no => no.checked).map(no => no.dataset.tipo), ["loot"]);
  assert.equal(contexto.regras[0].ativa, false);
  assert.deepEqual(controles("2").filter(no => no.checked).map(no => no.dataset.tipo), ["capture"]);
  alterar("shiny", true);
  assert.deepEqual(controles("1").filter(no => no.checked).map(no => no.dataset.tipo), ["shiny"]);
  alterar("shiny", false);
  assert.equal(controles("1").filter(no => no.checked).length, 0);
});
