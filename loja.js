(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) return;
  if (document.getElementById("multipoke-auto-loja")) return;

  function configurarArraste(painel, alca) {
    const chave = "multipoke.auto-loja.posicao";
    const margem = 12;
    let posicao;
    let arraste;

    try {
      const salva = JSON.parse(localStorage.getItem(chave));
      if (Number.isFinite(salva?.x) && Number.isFinite(salva?.y)) posicao = salva;
    } catch { /* O painel também funciona quando o armazenamento está indisponível. */ }

    function limitar(x, y) {
      return {
        x: Math.max(margem, Math.min(x, innerWidth - painel.offsetWidth - margem)),
        y: Math.max(margem, Math.min(y, innerHeight - painel.offsetHeight - margem)),
      };
    }

    function posicionar() {
      if (!posicao) return;
      const { x, y } = limitar(posicao.x, posicao.y);
      Object.assign(painel.style, { left: `${x}px`, top: `${y}px`, bottom: "auto" });
    }

    function salvarPosicao() {
      if (!posicao) return;
      try { localStorage.setItem(chave, JSON.stringify(posicao)); } catch { /* Mantém a posição nesta aba. */ }
    }

    alca.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || arraste) return;
      const { left, top } = painel.getBoundingClientRect();
      arraste = { id: event.pointerId, dx: event.clientX - left, dy: event.clientY - top };
      alca.setPointerCapture(event.pointerId);
    });
    alca.addEventListener("pointermove", event => {
      if (arraste?.id !== event.pointerId) return;
      posicao = limitar(event.clientX - arraste.dx, event.clientY - arraste.dy);
      posicionar();
    });
    alca.addEventListener("lostpointercapture", event => {
      if (arraste?.id !== event.pointerId) return;
      arraste = null;
      salvarPosicao();
    });

    const setas = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    alca.addEventListener("keydown", event => {
      if (!Object.hasOwn(setas, event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const [dx, dy] = setas[event.key];
      const { left, top } = painel.getBoundingClientRect();
      posicao = limitar(left + dx, top + dy);
      posicionar();
      salvarPosicao();
    });

    window.addEventListener("resize", posicionar);
    new ResizeObserver(posicionar).observe(painel);
    posicionar();
  }

  const LIMITE_LOOT = 100;
  const INTERVALO = 30_000;
  const bolas = new Set(["poke ball", "great ball", "super ball", "ultra ball"]);
  const pocoes = new Set(["small potion", "great potion", "ultra potion", "hyper potion", "ultimate potion", "max potion"]);
  const normalizar = texto => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const numero = texto => /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(texto ?? "")
    ? Number(texto.replaceAll(".", "")) : NaN;
  const inteiro = (valor, min, max) => Number.isSafeInteger(valor) && valor >= min && valor <= max;
  const formatar = valor => valor.toLocaleString("pt-BR");
  const texto = (raiz, seletor) => raiz.querySelector(seletor)?.textContent.trim() ?? "";
  const jogo = seletor => document.querySelector(seletor);
  const loja = () => jogo("#drawer.open.bag-drawer .bag-layout");
  const saldo = () => numero(texto(document, "#drawer.open [data-bag-balance] strong").match(/^\$\s*([\d.]+)$/)?.[1]);
  const treinador = () => texto(document, "#party-trainer-name");
  const cacada = () => texto(document, "#hunt-header-state") === "CAÇANDO";
  const modal = () => jogo("dialog[open]");

  const painel = document.createElement("div");
  painel.id = "multipoke-auto-loja";
  const interfaceLoja = painel.attachShadow({ mode: "open" });
  interfaceLoja.innerHTML = `
    <style>
      :host { position: fixed; bottom: 12px; left: 12px; z-index: 100000; color-scheme: dark; }
      details { box-sizing: border-box; width: max-content; max-width: calc(100vw - 24px); color: #f5f7fa;
        background: #172230; border: 1px solid #70849a; border-radius: 8px; padding: 8px 12px;
        font: 14px/1.4 system-ui, sans-serif; }
      details[open] { width: 370px; max-height: min(75vh, 580px); overflow: auto; }
      summary, button, select, input[type=checkbox] { cursor: pointer; }
      summary { font-weight: 700; padding-right: 30px; }
      #mover { position: absolute; top: 5px; right: 6px; width: 26px; height: 24px;
        border: 1px solid #70849a; border-radius: 4px; background: #233346;
        color: #f5f7fa; cursor: grab; touch-action: none; user-select: none; }
      #mover:active { cursor: grabbing; }
      fieldset { margin: 8px 0; padding: 0; border: 0; min-width: 0; }
      fieldset > div { margin: 8px 0; }
      label { display: inline-block; }
      input[type=number] { width: 76px; }
      select { max-width: 100%; }
      button, select, input { font: inherit; }
      .loot { display: grid; max-height: 120px; overflow: auto; }
      p { margin: 8px 0; }
    </style>
    <details>
      <summary>Auto Loja <span id="estado"></span></summary>
      <fieldset id="config">
        <button id="ler" type="button">Ler estoque da loja</button>
        <div><label>Poké Bola <select id="bola"><option value="">Sem reposição</option></select></label>
          <br><label>Até <input id="bola-min" type="number" min="0" max="10000" value="10"></label>
          <label>Comprar <input id="bola-qtd" type="number" min="1" max="10000" value="50"></label></div>
        <div><label>Poção <select id="pocao"><option value="">Sem reposição</option></select></label>
          <br><label>Até <input id="pocao-min" type="number" min="0" max="10000" value="5"></label>
          <label>Comprar <input id="pocao-qtd" type="number" min="1" max="10000" value="25"></label></div>
        <div><label>Reserva de Pokédollars <input id="reserva" type="number" min="0" max="999999999" value="200"></label></div>
        <div><label><input id="vender" type="checkbox"> Vender loot marcado</label>
          <div id="loot" class="loot"></div></div>
      </fieldset>
      <button id="alternar" type="button">Iniciar Auto Loja</button>
      <p id="mensagem" role="status">Leia o estoque para escolher o que comprar e vender.</p>
    </details>
    <button id="mover" type="button" aria-label="Mover painel Auto Loja" title="Arraste para mover ou use as setas">⠿</button>`;
  document.body.append(painel);

  const campo = id => interfaceLoja.getElementById(id);
  configurarArraste(painel, campo("mover"));
  const informar = mensagem => { campo("mensagem").textContent = mensagem; };
  const selecionados = new Set();
  const nomesLoot = new Map();
  let catalogo;
  let sessao = null;
  let ocupada = false;
  let treinadorConfigurado = "";
  let interacoes = 0;
  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (event.isTrusted) interacoes++;
    }, { capture: true, passive: true });
  }

  async function carregarCatalogo() {
    if (catalogo) return;
    const resposta = await fetch("/pokepedia/itens", {
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) throw new Error("Catálogo de loot indisponível.");
    const modelo = document.createElement("template");
    modelo.innerHTML = await resposta.text();
    const permitidos = new Set();
    for (const item of modelo.content.querySelectorAll('article[data-filter-kind="loot"][data-filter-available="yes"]')) {
      const nome = normalizar(texto(item, "h2"));
      const preco = numero(texto(item, "p").match(/^Venda · ([\d.]+) Pokédollars$/)?.[1]);
      if (nome && nome !== "ruby" && inteiro(preco, 1, LIMITE_LOOT)) {
        permitidos.add(`${item.dataset.filterNumber}:${nome}`);
      }
    }
    if (!permitidos.size) throw new Error("A Pokepédia não apresentou o catálogo de loot esperado.");
    catalogo = permitidos;
  }

  function produto(linha) {
    const id = linha.dataset.shopRow;
    const nome = texto(linha, ".shop-row-main strong");
    const tipo = id.startsWith("ball:") && bolas.has(normalizar(nome)) ? "bola"
      : id.startsWith("supply:") && pocoes.has(normalizar(nome)) ? "pocao" : null;
    const estoque = numero(texto(linha, "[data-shop-owned]").match(/^([\d.]+) na mochila$/)?.[1]);
    const preco = numero(texto(linha, "[data-shop-price]").match(/^\$\s*([\d.]+)$/)?.[1]);
    return tipo && inteiro(estoque, 0, Number.MAX_SAFE_INTEGER) && inteiro(preco, 1, Number.MAX_SAFE_INTEGER)
      ? { id, tipo, nome, estoque, preco, linha } : null;
  }

  function pilha(caixa) {
    const linha = caixa.closest(".loot-ledger-row");
    const id = caixa.dataset.lootSelect;
    const nome = texto(linha, ".loot-identity strong");
    const preco = numero(texto(linha, ".loot-identity small").match(/^\$\s*([\d.]+) cada$/)?.[1]);
    const estoque = numero(texto(linha, ".loot-count strong").match(/^×\s*([\d.]+)$/)?.[1]);
    const digitado = Number(linha.querySelector("[data-loot-sale-qty]")?.value);
    if (!catalogo?.has(`${id.slice(3)}:${normalizar(nome)}`) || !/^id:\d+$/.test(id) ||
        !inteiro(preco, 1, LIMITE_LOOT) || !inteiro(estoque, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { id, nome, preco, estoque, qtd: inteiro(digitado, 1, estoque) ? digitado : estoque, caixa };
  }

  const produtos = () => [...loja().querySelectorAll("[data-shop-row]")].map(produto).filter(Boolean);
  const caixasLoot = () => [...loja().querySelectorAll(".loot-ledger-row [data-loot-select]")];
  const pilhas = () => caixasLoot().map(pilha).filter(Boolean);

  function mostrarEstoque() {
    const disponiveis = produtos();
    for (const tipo of ["bola", "pocao"]) {
      const select = campo(tipo);
      const anterior = select.value;
      select.length = 1;
      for (const item of disponiveis.filter(item => item.tipo === tipo)) {
        select.add(new Option(`${item.nome} · ${formatar(item.estoque)} na mochila`, item.id));
      }
      if ([...select.options].some(opcao => opcao.value === anterior)) select.value = anterior;
    }
    const atuais = new Map(pilhas().map(item => [item.id, item]));
    for (const item of atuais.values()) nomesLoot.set(item.id, item.nome);
    const lista = campo("loot");
    lista.replaceChildren();
    for (const [id, nome] of nomesLoot) {
      const item = atuais.get(id);
      if (!item && !selecionados.has(id)) continue;
      const label = document.createElement("label");
      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      caixa.checked = selecionados.has(id);
      caixa.addEventListener("change", () => caixa.checked ? selecionados.add(id) : selecionados.delete(id));
      label.append(caixa, item ? ` ${nome} · ${formatar(item.preco)} cada · ${formatar(item.estoque)} em estoque` : ` ${nome} · sem estoque`);
      lista.append(label);
    }
    if (!lista.childElementCount) lista.textContent = catalogo ? "Nenhum loot elegível na mochila." : "Catálogo de loot indisponível.";
  }

  function abaLoja(tipo) {
    const layout = loja();
    if (layout.dataset.mode === "tabs") {
      layout.parentElement.querySelector(`[data-bag-tab="${tipo}"][aria-selected="false"]`)?.click();
    } else if (tipo === "loot") {
      layout.querySelector('[data-bag-sale-tab="loot"][aria-selected="false"]')?.click();
    }
  }

  function comLoja(abertaPeloUsuario, executar) {
    const aberta = Boolean(loja());
    const inicio = interacoes;
    if (!jogo("#game-shell:not([inert])") || modal() ||
        jogo("#starter-overlay:not([hidden]), #hunt-map-overlay:not([hidden])") ||
        (jogo("#drawer.open") && !(abertaPeloUsuario && aberta))) return;
    if (!aberta) jogo("#nav-bag:not(:disabled)")?.click();
    if (!loja()) return;
    return Promise.resolve().then(executar).finally(() => {
      if (!aberta && inicio === interacoes && loja() && !modal()) jogo("#drawer-close")?.click();
    });
  }

  function confirmar(dialogo, titulo, rotulo, conferir) {
    const botao = dialogo?.querySelector("button[data-confirm-accept]:not(:disabled)");
    if (!botao || !dialogo.matches(".ui-confirm") || texto(dialogo, "h2") !== titulo) return false;
    if (botao.textContent.trim() !== rotulo || !conferir(dialogo)) {
      dialogo.querySelector("button[data-confirm-cancel]")?.click();
      return false;
    }
    botao.click();
    return true;
  }

  function comprovante(disparar, confere, atualizou) {
    return new Promise((resolve, reject) => {
      const area = jogo("#toast-area");
      if (!area) return reject(new Error("Área de comprovantes da loja indisponível."));
      let recebido = false;
      const terminar = erro => {
        clearInterval(checagem);
        clearTimeout(prazo);
        observador.disconnect();
        if (erro) reject(erro);
        else resolve();
      };
      const observador = new MutationObserver(mudancas => {
        for (const mudanca of mudancas) {
          for (const no of mudanca.addedNodes) {
            if (no.matches?.(".toast.good") && confere(no.textContent.trim())) recebido = true;
          }
        }
      });
      const checagem = setInterval(() => {
        if (recebido && loja() && atualizou()) terminar();
      }, 100);
      const prazo = setTimeout(() => terminar(new Error("O jogo não confirmou a operação e o estoque. Confira a loja antes de retomar.")), 6000);
      observador.observe(area, { childList: true });
      try {
        if (!disparar()) terminar(new Error("A confirmação da loja divergiu dos itens ou valores esperados."));
      } catch (erro) { terminar(erro); }
    });
  }

  async function comprar(regra, reserva) {
    abaLoja("shop");
    const item = produtos().find(item => item.id === regra.id);
    if (!item) throw new Error("O produto escolhido não aparece mais na loja.");
    if (item.estoque > regra.minimo) return;
    const custo = item.preco * regra.qtd;
    if (!Number.isSafeInteger(custo) || !(saldo() - custo >= reserva)) return;
    const input = item.linha.querySelector("[data-shop-quantity]");
    const botao = item.linha.querySelector("[data-buy-shop]");
    if (!input || !botao) throw new Error("Os controles de compra mudaram.");
    const anterior = input.value;
    const alterar = valor => {
      input.value = valor;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pedido = `${formatar(regra.qtd)}× ${item.nome}`;
    await comprovante(() => {
      alterar(String(regra.qtd));
      try {
        if (botao.disabled || Number(input.value) !== regra.qtd || modal()) return false;
        botao.click();
        return confirmar(modal(), "Confirmar compra", "Comprar", dialogo => {
          const valores = [...dialogo.querySelectorAll(".ui-confirm__details dd")].map(no => no.textContent.trim());
          return texto(dialogo, "p") === pedido && valores[0] === `$ ${formatar(item.preco)}` &&
            valores[1] === `$ ${formatar(custo)}` && saldo() - custo >= reserva;
        });
      } finally { if (input.isConnected) alterar(anterior); }
    }, mensagem => mensagem === `Compra concluída: ${pedido} por ${formatar(custo)} Pokédollars.`,
    () => produtos().some(atual => atual.id === item.id && atual.estoque > item.estoque));
    return pedido;
  }

  async function vender(ids) {
    abaLoja("loot");
    const alvo = pilhas().filter(item => ids.has(item.id));
    if (!alvo.length) return;
    if (caixasLoot().some(caixa => caixa.checked)) throw new Error("Há uma seleção manual de loot na loja. Limpe-a antes de retomar.");

    const inicio = interacoes;
    try {
      for (const { id } of alvo) pilhas().find(item => item.id === id)?.caixa.click();
      const marcado = caixasLoot().filter(caixa => caixa.checked);
      const itens = marcado.map(pilha);
      if (itens.length !== alvo.length || itens.some(item => !item || !ids.has(item.id))) {
        throw new Error("A seleção da loja mudou antes da venda.");
      }
      const total = itens.reduce((soma, item) => soma + item.qtd * item.preco, 0);
      const quantidade = itens.reduce((soma, item) => soma + item.qtd, 0);
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(quantidade)) throw new Error("Total da venda inválido.");
      const botao = loja().querySelector("[data-bulk-sell-loot]:not(:disabled)");
      await comprovante(() => {
        if (!botao || modal()) return false;
        botao.click();
        const dialogo = modal();
        if (!dialogo) return true; // O jogo permite ocultar a confirmação de loot.
        return confirmar(dialogo, "Confirmar venda de loot", "Vender", dialogo => {
          const revisao = [...dialogo.querySelectorAll(".ui-confirm__items strong")].map(no => no.textContent.trim()).sort();
          const esperado = itens.map(item => `${item.nome} ×${formatar(item.qtd)}`).sort();
          return revisao.length === esperado.length && revisao.every((nome, i) => nome === esperado[i]) &&
            [...dialogo.querySelectorAll(".ui-confirm__details dd")].at(-1)?.textContent.trim() === `$ ${formatar(total)}`;
        });
      }, mensagem => mensagem === `${formatar(quantidade)} itens vendidos por ${formatar(total)} Pokédollars.`,
      () => itens.every(item => !pilhas().some(atual => atual.id === item.id && atual.estoque >= item.estoque)));
      return `${formatar(quantidade)} loots por ${formatar(total)} Pokédollars`;
    } finally {
      if (inicio === interacoes && loja() && !modal()) loja().querySelector("[data-clear-loot-selection]:not(:disabled)")?.click();
    }
  }

  function pausar(mensagem) {
    sessao = null;
    campo("estado").textContent = "";
    campo("alternar").textContent = "Iniciar Auto Loja";
    campo("config").disabled = ocupada;
    informar(mensagem);
  }

  async function ciclo() {
    const atual = sessao;
    if (!atual || ocupada || !document.hasFocus() || document.hidden) return;
    const inicio = interacoes;
    const continua = () => sessao === atual && treinador() === atual.treinador && cacada() &&
      inicio === interacoes && document.hasFocus() && !document.hidden && jogo("#game-shell:not([inert])");
    if (treinador() !== atual.treinador) return pausar("Treinador mudou. Leia o estoque novamente.");
    if (!continua()) return;
    ocupada = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, async lock => {
        if (!lock || !continua()) return;
        await comLoja(false, async () => {
          const realizadas = [];
          for (const regra of atual.compras) {
            if (!continua() || !loja() || modal()) return;
            const compra = await comprar(regra, atual.reserva);
            if (compra) realizadas.push(`Comprou ${compra}`);
          }
          if (atual.vendas.size && continua() && loja() && !modal()) {
            const venda = await vender(atual.vendas);
            if (venda) realizadas.push(`Vendeu ${venda}`);
          }
          if (continua() && loja() && !modal()) {
            abaLoja("loot");
            mostrarEstoque();
            informar(realizadas.join(". ") || "Aguardando estoque baixo ou loot marcado. A reserva é respeitada.");
          }
        });
      });
    } catch (erro) { pausar(erro.message); }
    finally {
      ocupada = false;
      campo("config").disabled = Boolean(sessao);
    }
  }

  campo("ler").addEventListener("click", async () => {
    if (ocupada || sessao) return;
    ocupada = true;
    campo("config").disabled = true;
    informar("Lendo estoque e catálogo…");
    try {
      await carregarCatalogo().catch(() => {});
      const leitura = comLoja(true, () => {
        if (treinadorConfigurado !== treinador()) {
          selecionados.clear();
          nomesLoot.clear();
          campo("bola").value = campo("pocao").value = "";
          campo("vender").checked = false;
        }
        treinadorConfigurado = treinador();
        abaLoja("loot");
        mostrarEstoque();
        informar(catalogo ? `Saldo na loja: ${formatar(saldo())} Pokédollars. Escolha os produtos ou marque o loot.`
          : "Reposição disponível. O catálogo de loot não pôde ser validado.");
      });
      if (leitura) await leitura;
      else informar("Feche o menu aberto e tente ler a Loja de Pokédollars novamente.");
    } catch {
      informar("Não consegui ler os controles da loja. Confira se ela está disponível e tente novamente.");
    } finally {
      ocupada = false;
      campo("config").disabled = false;
    }
  });

  campo("alternar").addEventListener("click", () => {
    if (sessao) return pausar("Auto Loja pausada.");
    if (ocupada) return;
    if (!treinadorConfigurado || treinador() !== treinadorConfigurado) return informar("Leia o estoque da loja primeiro.");
    const compras = ["bola", "pocao"].map(tipo => ({
      id: campo(tipo).value,
      minimo: campo(`${tipo}-min`).valueAsNumber,
      qtd: campo(`${tipo}-qtd`).valueAsNumber,
    })).filter(regra => regra.id);
    const vendas = campo("vender").checked ? new Set(selecionados) : new Set();
    if (campo("vender").checked && !vendas.size) return informar("Marque os itens de loot que quer vender.");
    if (!compras.length && !vendas.size) return informar("Escolha uma reposição ou marque loot para vender.");
    const reserva = campo("reserva").valueAsNumber;
    if ((compras.length && !inteiro(reserva, 0, 999_999_999)) ||
        compras.some(regra => !inteiro(regra.minimo, 0, 10_000) || !inteiro(regra.qtd, 1, 10_000))) {
      return informar("Confira os números de estoque mínimo, quantidade e reserva.");
    }
    sessao = { treinador: treinadorConfigurado, compras, vendas, reserva };
    campo("config").disabled = true;
    campo("estado").textContent = "· ativa";
    campo("alternar").textContent = "Pausar Auto Loja";
    informar("Ativa durante a caçada. A loja é conferida a cada 30 segundos com a aba em foco.");
    void ciclo();
  });

  setInterval(ciclo, INTERVALO);
})();
