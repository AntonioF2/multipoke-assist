(() => {
  if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) return;
  if (document.getElementById("multipoke-auto-loja")) return;

  function configurarArraste(painel, cabecalho, faixa) {
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

    faixa.addEventListener("click", event => event.preventDefault());
    faixa.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || arraste) return;
      const { left, top } = painel.getBoundingClientRect();
      arraste = { id: event.pointerId, dx: event.clientX - left, dy: event.clientY - top };
      faixa.setPointerCapture(event.pointerId);
    });
    faixa.addEventListener("pointermove", event => {
      if (arraste?.id !== event.pointerId) return;
      posicao = limitar(event.clientX - arraste.dx, event.clientY - arraste.dy);
      posicionar();
    });
    faixa.addEventListener("lostpointercapture", event => {
      if (arraste?.id !== event.pointerId) return;
      arraste = null;
      salvarPosicao();
    });

    const setas = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    cabecalho.addEventListener("keydown", event => {
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

  const LIMITE_LOOT = 10_000;
  const LIMITE_LOTE_POKEMON = 20;
  const QUALIDADE_LENDARIA = 1.70;
  const INTERVALO_VENDA = 30_000;
  const INTERVALO_ESTOQUE = 5_000;
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
  const huntAtiva = () => Boolean(jogo('#hunt-header[aria-label="Hunt atual"]')) || cacada();
  const modal = () => jogo("dialog[open]");

  const chavePainel = "multipoke.auto-loja.painel-oculto";
  const painel = document.createElement("div");
  painel.id = "multipoke-auto-loja";
  try { painel.hidden = localStorage.getItem(chavePainel) === "true"; }
  catch { /* A visibilidade pode ser alterada nesta aba sem armazenamento. */ }
  const interfaceLoja = painel.attachShadow({ mode: "open" });
  interfaceLoja.innerHTML = `
    <style>
      :host { position: fixed; bottom: 12px; left: 12px; z-index: 100000; color-scheme: light;
        --azul: #203961; --vermelho: #b92033; --amarelo: #ffcb36; --papel: #fffdf6; }
      :host([hidden]) { display: none; }
      #painel { box-sizing: border-box; width: max-content; max-width: calc(100vw - 24px); color: var(--azul);
        background: var(--papel); border: 2px solid var(--azul); border-radius: 12px;
        box-shadow: 0 4px 0 #152641, 0 10px 24px #101d3340; overflow: hidden; font: 14px/1.4 system-ui, sans-serif; }
      #painel[open] { width: 370px; max-height: min(75vh, 580px); overflow: auto; }
      summary, button, select, input[type=checkbox] { cursor: pointer; }
      #painel > summary { position: sticky; top: 0; z-index: 1; display: flex; list-style: none;
        background: var(--vermelho); border-bottom: 3px solid var(--amarelo); color: #fff; }
      #painel > summary::-webkit-details-marker { display: none; }
      #seta-painel { width: 32px; flex: 0 0 auto; display: grid; place-items: center; }
      #seta-painel:hover { background: #811827; }
      #seta-painel::before { content: ""; width: 7px; height: 7px; border: solid #fff;
        border-width: 0 2px 2px 0; transform: rotate(-45deg); }
      #painel[open] #seta-painel::before { transform: rotate(45deg); }
      #arrastar { display: flex; align-items: center; flex: 1; gap: 8px; padding: 7px 12px 7px 4px;
        cursor: grab; touch-action: none; user-select: none; }
      #arrastar:active { cursor: grabbing; }
      #dragonite { width: 48px; height: 48px; flex: 0 0 auto; background: #fff5d6;
        border: 1px solid var(--amarelo); border-radius: 8px; object-fit: contain; image-rendering: pixelated; }
      .titulo { display: block; color: var(--amarelo); font-size: 19px; font-weight: 900;
        text-shadow: 1px 2px var(--azul); white-space: nowrap; }
      #estado { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
      #estado::before { content: ""; width: 8px; height: 8px; border-radius: 50%;
        background: #5f0715; border: 1px solid #ffb4bf; }
      #estado[data-ativa]::before { background: #54ff72; border-color: #ceffd5;
        box-shadow: 0 0 7px #54ff72; }
      #abas { display: flex; gap: 6px; margin: 9px 12px 6px; }
      #abas button { flex: 1; border: 1px solid #a6b7d0; border-radius: 6px; padding: 5px 6px;
        background: #edf3ff; color: var(--azul); font-weight: 700; }
      #abas button[aria-pressed="true"] { background: var(--azul); color: #fff; }
      #aba-hunts { padding: 0 12px 12px; }
      #aba-hunts h3 { margin: 10px 0 4px; font-size: 14px; }
      .hunt-resumo { margin: 8px 0; padding: 7px 9px; background: #edf3ff; border-radius: 6px; }
      .hunt-resumo strong, .hunt-resumo span { display: block; }
      #hunt-historico, #hunt-golpes-equipe, #hunt-comparacao { white-space: pre-line; }
      #hunt-comparacao { max-height: 250px; overflow: auto; }
      #hunt-medicao, #aba-hunts small { color: #445b7d; }
      .regras { margin-top: 8px; padding: 6px 8px; background: #edf3ff; border-radius: 6px; }
      .regras > summary { font-weight: 700; }
      #regras-pokemon label { margin: 3px 0; }
      #pokemon-qualidade { width: 76px; }
      fieldset { margin: 0; padding: 0 12px; border: 0; min-width: 0; }
      fieldset > div { margin: 8px 0; }
      label { display: inline-block; }
      input[type=number] { width: 76px; }
      select { max-width: 100%; }
      button, select, input { font: inherit; }
      select, input { box-sizing: border-box; min-height: 26px; padding: 2px 5px;
        border: 1px solid #a6b7d0; border-radius: 5px; background: #fff; color: var(--azul); }
      select:disabled, input:disabled { background: #edf1f7; color: #5b6c87; cursor: default; }
      :is(summary, button, select, input):focus-visible { outline: 2px solid #2d61b1; outline-offset: 2px; }
      #painel > summary:focus-visible { outline-color: var(--amarelo); outline-offset: -3px; }
      #buscar-loot { box-sizing: border-box; width: 100%; margin: 6px 0; }
      .loot { display: grid; max-height: 170px; overflow: auto; }
      .regra-loot { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px;
        padding: 5px 2px; border-bottom: 1px solid #c5d4ec; }
      .controles-loot { display: grid; gap: 4px; }
      .controles-loot label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
      .controles-loot input { min-height: 0; margin: 0; }
      .loot small { display: block; color: #445b7d; }
      #alternar, #alternar-captura { display: block; width: calc(100% - 24px); margin: 12px 12px 0; padding: 7px;
        border-radius: 7px; font-weight: 800; }
      #alternar { background: var(--amarelo); border: 1px solid var(--azul); color: var(--azul); }
      #alternar:hover { background: #ffda67; }
      #alternar-captura { margin-top: 8px; background: #efe5ff; color: #461b72; border: 1px solid #6e37a8; }
      #alternar-captura:hover { background: #e4d1ff; }
      #alternar-captura[aria-pressed="true"] { background: #652bb0; color: white; }
      #alternar-captura[aria-pressed="true"]:hover { background: #51208e; }
      #mensagem { margin: 8px 12px 12px; color: #445b7d; font-size: 12px; }
      p { margin: 8px 0; }
    </style>
    <details id="painel">
      <summary id="cabecalho" aria-label="Abrir ou recolher Auto Loja">
        <span id="seta-painel" title="Abrir ou recolher" aria-hidden="true"></span>
        <span id="arrastar" title="Segure e arraste para mover">
          <!-- Sprite frontal de Pokémon HeartGold e SoulSilver, via PokéAPI. -->
          <img id="dragonite" src="${chrome.runtime.getURL("dragonite.png")}" alt="" width="48" height="48" draggable="false">
          <span><span class="titulo">Auto Loja</span><span id="estado" role="status">Offline</span></span>
        </span>
      </summary>
      <div id="abas" role="group" aria-label="Seções da Auto Loja">
        <button id="abrir-loja" type="button" aria-controls="aba-loja" aria-pressed="true">Loja</button>
        <button id="abrir-hunts" type="button" aria-controls="aba-hunts" aria-pressed="false">Análise de hunts</button>
      </div>
      <section id="aba-loja" aria-labelledby="abrir-loja">
      <fieldset id="config">
        <p id="estoque-status">Aguardando a leitura automática do estoque.</p>
        <div><label>Poké Bola <select id="bola"><option value="">Sem reposição</option></select></label>
          <br><label>Até <input id="bola-min" type="number" min="0" max="10000" value="10"></label>
          <label>Comprar <input id="bola-qtd" type="number" min="1" max="10000" value="50"></label></div>
        <div><label>Poção <select id="pocao"><option value="">Sem reposição</option></select></label>
          <br><label>Até <input id="pocao-min" type="number" min="0" max="10000" value="5"></label>
          <label>Comprar <input id="pocao-qtd" type="number" min="1" max="10000" value="25"></label></div>
        <div><label>Reserva de Pokédollars <input id="reserva" type="number" min="0" max="999999999" value="200"></label></div>
        <div><label>Venda automática <select id="modo-venda">
            <option value="">Desligada</option>
            <option value="marcados">Somente marcados para venda</option>
            <option value="baratos">Abaixo de 10.000 e itens marcados</option>
          </select></label>
          <details id="regras-loot" class="regras">
            <summary>Regras de loot</summary>
            <input id="buscar-loot" type="search" placeholder="Buscar loot por nome ou ID" aria-label="Buscar loot por nome ou ID">
            <div id="loot" class="loot">Carregando o catálogo de loot…</div>
          </details>
        </div>
        <details id="regras-pokemon" class="regras">
          <summary>Venda de Pokémon</summary>
          <label><input id="vender-pokemon" type="checkbox"> Ativar venda de Pokémon</label><br>
          <label>Qualidade abaixo de <input id="pokemon-qualidade" type="text" inputmode="decimal" placeholder="1,30" maxlength="4"></label><br>
          <label>IV total abaixo de <input id="pokemon-iv" type="number" min="6" max="193" placeholder="80"></label><br>
          <label>Combinar filtros <select id="pokemon-condicao">
            <option value="e">E · precisa cumprir os dois</option>
            <option value="ou">OU · basta cumprir um</option>
          </select></label>
          <p><small>Preencha pelo menos um limite. Qualidade Lendária ou superior fica protegida.</small></p>
        </details>
      </fieldset>
      <button id="alternar" type="button">Iniciar Auto Loja</button>
      <button id="alternar-captura" type="button" aria-label="Autocaptura de Pokémon" aria-pressed="false">Autocaptura desligada</button>
      <p id="mensagem" role="status">Configure os itens que deseja comprar, vender ou proteger.</p>
      </section>
      <section id="aba-hunts" aria-labelledby="abrir-hunts" hidden>
        <p><strong>Equipe ativa</strong><br><span id="hunt-equipe"></span></p>
        <p id="hunt-atual"></p>
        <h3>Estimativas para seu nível</h3>
        <div class="hunt-resumo"><strong>Melhor estimativa de XP</strong><span id="hunt-estimativa-xp"></span></div>
        <div class="hunt-resumo"><strong>Melhor estimativa de drops</strong><span id="hunt-estimativa-drops"></span></div>
        <p><small id="hunt-estimativa-status"></small></p>
        <details class="regras">
          <summary>Comparar hunts e golpes</summary>
          <p><strong>Golpes ativos da equipe</strong></p>
          <p id="hunt-golpes-equipe"></p>
          <p id="hunt-comparacao" tabindex="0"></p>
        </details>
        <p><small>Ritmo estimado com tipos e golpes de poder fixo. Atributos de referência e encontros da Pokepédia. XP base da PokéAPI.</small></p>
        <h3>Ganhos medidos no jogo</h3>
        <div class="hunt-resumo"><strong>Melhor XP/h medido</strong><span id="hunt-melhor-xp"></span></div>
        <div class="hunt-resumo"><strong>Melhor drops/h medido</strong><span id="hunt-melhor-drops"></span></div>
        <p id="hunt-medicao" role="status"></p>
        <details class="regras">
          <summary>Histórico da mesma equipe</summary>
          <p id="hunt-historico"></p>
        </details>
        <p><small>Deixe a análise aberta durante a caçada. A comparação usa medições de pelo menos 5 minutos. Drops/h representa o valor dos itens no Registro da Caçada.</small></p>
      </section>
    </details>`;
  document.body.append(painel);

  const campo = id => interfaceLoja.getElementById(id);
  const atualizarAnalise = criarAnaliseHunts(campo, { texto, treinador, numero, formatar });
  for (const aba of ["loja", "hunts"]) {
    campo(`abrir-${aba}`).addEventListener("click", () => {
      const hunts = aba === "hunts";
      campo("abrir-loja").setAttribute("aria-pressed", String(!hunts));
      campo("abrir-hunts").setAttribute("aria-pressed", String(hunts));
      campo("aba-loja").hidden = hunts;
      campo("aba-hunts").hidden = !hunts;
      if (hunts) void atualizarAnalise();
      else void atualizarEstoque();
    });
  }
  configurarArraste(painel, campo("cabecalho"), campo("arrastar"));
  const botaoCaptura = campo("alternar-captura");
  const raiz = document.documentElement;
  const comandoCaptura = detail => document.dispatchEvent(new CustomEvent("multipoke:autocaptura", { detail }));
  function atualizarBotaoCaptura() {
    const estado = raiz.dataset.multipokeAutocaptura;
    const rotulos = {
      ativa: "Autocaptura ligada",
      "sem-bolas": "Autocaptura pausada · Poké Bola selecionada sem estoque",
      "aguardando-estoque": "Autocaptura pausada · aguardando leitura do estoque",
    };
    botaoCaptura.setAttribute("aria-pressed", String(Object.hasOwn(rotulos, estado)));
    botaoCaptura.textContent = rotulos[estado] ?? "Autocaptura desligada";
  }
  botaoCaptura.addEventListener("click", () => comandoCaptura("alternar"));
  new MutationObserver(atualizarBotaoCaptura).observe(raiz, { attributeFilter: ["data-multipoke-autocaptura"] });
  atualizarBotaoCaptura();
  const informar = mensagem => { campo("mensagem").textContent = mensagem; };
  const tiposCompra = ["bola", "pocao"];
  const camposCompra = [...tiposCompra, "bola-min", "bola-qtd", "pocao-min", "pocao-qtd", "reserva"];
  const camposPokemon = ["pokemon-qualidade", "pokemon-iv", "pokemon-condicao"];
  const escolhasCompra = new Map();
  const regrasLoot = new Map();
  let estoqueLoot = new Map();
  let catalogo;
  let proximaConsultaCatalogo = 0;
  let sessao = null;
  let ocupada = false;
  let estoqueLido = false;
  let treinadorConfigurado = "";
  let interacoes = 0;
  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (event.isTrusted) interacoes++;
    }, { capture: true, passive: true });
  }

  async function carregarCatalogo() {
    if (catalogo || Date.now() < proximaConsultaCatalogo) return;
    proximaConsultaCatalogo = Date.now() + 60_000;
    const resposta = await fetch("/pokepedia/itens", {
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) throw new Error("Catálogo de loot indisponível.");
    const modelo = document.createElement("template");
    modelo.innerHTML = await resposta.text();
    const itens = new Map();
    for (const item of modelo.content.querySelectorAll('article[data-filter-kind="loot"]')) {
      const nome = texto(item, "h2");
      const id = item.dataset.filterNumber;
      if (!nome || !/^\d+$/.test(id)) continue;
      const preco = numero(texto(item, "p").match(/^Venda · ([\d.]+) Pokédollars$/)?.[1]);
      const vendavel = item.dataset.filterAvailable === "yes" && normalizar(nome) !== "ruby" &&
        inteiro(preco, 1, Number.MAX_SAFE_INTEGER);
      itens.set(chaveLoot(`id:${id}`, nome), { id, nome, preco, vendavel });
    }
    if (!itens.size) throw new Error("A Pokepédia não apresentou o catálogo de loot esperado.");
    catalogo = itens;
  }

  const chaveLoot = (id, nome) => `${id}:${normalizar(nome)}`;
  const chaveRegras = () => `multipoke.auto-loja.loot.${treinadorConfigurado}`;
  const chaveCompra = id => `multipoke.auto-loja.compra.${treinadorConfigurado}.${id}`;
  const chavePokemon = id => `multipoke.auto-loja.pokemon.${treinadorConfigurado}.${id}`;

  function publicarBolaReposicao() {
    raiz.dataset.multipokeTreinadorReposicao = treinadorConfigurado;
    raiz.dataset.multipokeBolaReposicao = escolhasCompra.get("bola");
  }

  function carregarCompras() {
    for (const id of camposCompra) {
      const controle = campo(id);
      let salvo;
      try { salvo = localStorage.getItem(chaveCompra(id)); }
      catch { /* Usa os valores padrão quando o armazenamento está indisponível. */ }
      if (controle.matches("select")) {
        escolhasCompra.set(id, salvo ?? "");
        controle.value = "";
      } else {
        controle.value = salvo ?? controle.defaultValue;
        if (!controle.value || !controle.validity.valid) controle.value = controle.defaultValue;
      }
    }
    publicarBolaReposicao();
  }

  function carregarRegras() {
    regrasLoot.clear();
    try {
      const salvas = JSON.parse(localStorage.getItem(chaveRegras()));
      for (const [chave, regra] of Object.entries(salvas ?? {})) {
        if (["vender", "vender-acima-do-limite", "proteger"].includes(regra)) regrasLoot.set(chave, regra);
      }
    } catch { /* As regras podem ser usadas nesta aba sem armazenamento. */ }
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
    const chave = chaveLoot(id, nome);
    if (!catalogo?.has(chave) || !inteiro(preco, 1, Number.MAX_SAFE_INTEGER) ||
        !inteiro(estoque, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { chave, nome, preco, estoque, qtd: inteiro(digitado, 1, estoque) ? digitado : estoque, caixa };
  }

  const produtos = () => [...loja().querySelectorAll("[data-shop-row]")].map(produto).filter(Boolean);
  const caixasLoot = () => [...loja().querySelectorAll(".loot-ledger-row [data-loot-select]")];
  const pilhas = () => caixasLoot().map(pilha).filter(Boolean);

  function mostrarEstoque() {
    const disponiveis = produtos();
    for (const tipo of tiposCompra) {
      const select = campo(tipo);
      if (interfaceLoja.activeElement === select) continue;
      const anterior = escolhasCompra.get(tipo);
      const itens = disponiveis.filter(item => item.tipo === tipo);
      const opcoes = [...select.options].slice(1);
      if (opcoes.length !== itens.length || itens.some((item, i) => item.id !== opcoes[i].value)) {
        select.length = 1;
        for (const item of itens) select.add(new Option("", item.id));
      }
      if (itens.some(item => item.id === anterior)) select.value = anterior;
      for (const [i, item] of itens.entries()) {
        const rotulo = `${item.nome} · ${formatar(item.estoque)} na mochila`;
        if (select.options[i + 1].text !== rotulo) select.options[i + 1].text = rotulo;
      }
    }
    if (loja().querySelector('[data-bag-sale-tab="loot"][aria-selected="true"], .loot-filters')) {
      estoqueLoot = new Map(pilhas().map(item => [item.chave, item.estoque]));
      for (const rotulo of campo("loot").querySelectorAll("[data-estoque-loot]")) atualizarRotuloLoot(rotulo);
    }
    const gold = saldo();
    campo("estoque-status").textContent = Number.isFinite(gold) ? `Saldo na loja: ${formatar(gold)} Pokédollars.`
      : "Aguardando o saldo da loja.";
  }

  function atualizarRotuloLoot(rotulo) {
    const chave = rotulo.dataset.estoqueLoot;
    const item = catalogo.get(chave);
    const estoque = estoqueLoot.get(chave);
    const partes = [`#${item.id}`];
    if (Number.isFinite(item.preco)) partes.push(`${formatar(item.preco)} por unidade`);
    if (estoque) partes.push(`${formatar(estoque)} na loja`);
    if (!item.vendavel) partes.push("indisponível para venda automática");
    else if (item.preco >= LIMITE_LOOT) partes.push("exige permissão explícita");
    rotulo.textContent = partes.join(" · ");
  }

  function lootPermitido(chave, modo, precoAtual) {
    const item = catalogo?.get(chave);
    const regra = regrasLoot.get(chave);
    if (!item?.vendavel || regra === "proteger") return false;
    if (regra === "vender-acima-do-limite") return true;
    const abaixoDoLimite = item.preco < LIMITE_LOOT && (precoAtual ?? item.preco) < LIMITE_LOOT;
    return abaixoDoLimite && (regra === "vender" || modo === "baratos");
  }

  function mostrarCatalogo() {
    const lista = campo("loot");
    lista.replaceChildren();
    if (!catalogo) {
      lista.textContent = "Catálogo de loot indisponível. A leitura será repetida automaticamente.";
      return;
    }
    const busca = normalizar(campo("buscar-loot").value.trim()).replace(/^#/, "");
    const modo = campo("modo-venda").value || "baratos";
    for (const [chave, item] of catalogo) {
      if (!normalizar(item.nome).includes(busca) && !item.id.includes(busca)) continue;
      const linha = document.createElement("div");
      linha.className = "regra-loot";
      const nome = document.createElement("span");
      const rotulo = document.createElement("small");
      rotulo.dataset.estoqueLoot = chave;
      atualizarRotuloLoot(rotulo);
      nome.append(item.nome, rotulo);
      const controles = document.createElement("span");
      controles.className = "controles-loot";
      controles.innerHTML = `
        <label><input type="checkbox">Permitir venda</label>
        <label><input type="checkbox">Bloquear venda</label>`;
      const [permitir, bloquear] = controles.querySelectorAll("input");
      permitir.disabled = bloquear.disabled = !item.vendavel;
      permitir.setAttribute("aria-label", `Permitir venda de ${item.nome} #${item.id}`);
      bloquear.setAttribute("aria-label", `Bloquear venda de ${item.nome} #${item.id}`);
      const atualizar = () => {
        permitir.checked = lootPermitido(chave, modo);
        bloquear.checked = regrasLoot.get(chave) === "proteger";
      };
      const salvar = regra => {
        if (item.vendavel && treinador() === treinadorConfigurado) {
          if (regra) regrasLoot.set(chave, regra);
          else regrasLoot.delete(chave);
          try { localStorage.setItem(chaveRegras(), JSON.stringify(Object.fromEntries(regrasLoot))); }
          catch { /* Mantém as regras nesta aba. */ }
        }
        atualizar();
      };
      const regraVenda = item.preco >= LIMITE_LOOT ? "vender-acima-do-limite" : "vender";
      permitir.addEventListener("change", () => salvar(permitir.checked ? regraVenda : "proteger"));
      bloquear.addEventListener("change", () => salvar(bloquear.checked ? "proteger" : ""));
      atualizar();
      linha.append(nome, controles);
      lista.append(linha);
    }
    if (!lista.childElementCount) lista.textContent = "Nenhum loot corresponde à busca.";
  }

  function abaLoja(tipo) {
    const layout = loja();
    if (layout.dataset.mode === "tabs") {
      layout.parentElement.querySelector(`[data-bag-tab="${tipo}"][aria-selected="false"]`)?.click();
    } else if (tipo !== "shop") {
      layout.querySelector(`[data-bag-sale-tab="${tipo}"][aria-selected="false"]`)?.click();
    }
  }

  function comLoja(abertaPeloUsuario, executar) {
    const aberta = Boolean(loja());
    const inicio = interacoes;
    const foco = interfaceLoja.activeElement ?? document.activeElement;
    if (!jogo("#game-shell:not([inert])") || modal() ||
        jogo("#starter-overlay:not([hidden]), #hunt-map-overlay:not([hidden])") ||
        (jogo("#drawer.open") && !(abertaPeloUsuario && aberta))) return;
    if (!aberta) jogo("#nav-bag:not(:disabled)")?.click();
    if (!loja()) return;
    return Promise.resolve().then(() => executar(aberta)).finally(() => {
      if (!aberta && inicio === interacoes && loja() && !modal()) {
        jogo("#drawer-close")?.click();
        if (foco?.isConnected) foco.focus({ preventScroll: true });
      }
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
        const enviada = disparar();
        if (enviada === null) terminar(); // Operação adiada antes de ser enviada.
        else if (!enviada) terminar(new Error("A confirmação da loja divergiu dos itens ou valores esperados."));
      } catch (erro) { terminar(erro); }
    });
  }

  async function comprar(regra, reserva) {
    abaLoja("shop");
    const item = produtos().find(item => item.id === regra.id);
    if (!item) throw new Error("O produto escolhido não aparece mais na loja.");
    if (item.estoque > regra.minimo) return;
    const custo = item.preco * regra.qtd;
    if (!Number.isSafeInteger(custo + reserva)) {
      throw new Error(`Não foi possível verificar o custo para ${item.nome}.`);
    }
    const saldoInsuficiente = `Saldo insuficiente para comprar ${item.nome}`;
    const avisoSaldo = saldoRestante => {
      if (!Number.isSafeInteger(saldoRestante)) return `Aguardando o saldo da loja para comprar ${item.nome}`;
      if (saldoRestante < reserva) {
        return `${saldoInsuficiente}. Faltam ${formatar(reserva - saldoRestante)} Pokédollars contando a reserva`;
      }
    };
    let aviso = avisoSaldo(saldo() - custo);
    if (aviso) return aviso;
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
      try {
        alterar(String(regra.qtd));
        const limite = numero(item.linha.querySelector("[data-shop-slider]")?.max);
        // O jogo limita a quantidade pelo saldo real, que pode ter mudado antes de o painel atualizar.
        if (limite < regra.qtd && input.value === String(limite)) {
          aviso = saldoInsuficiente;
          return null;
        }
        if (botao.disabled || Number(input.value) !== regra.qtd || modal()) return false;
        botao.click();
        const confirmada = confirmar(modal(), "Confirmar compra", "Comprar", dialogo => {
          const valores = [...dialogo.querySelectorAll(".ui-confirm__details dd")].map(no => no.textContent.trim());
          if (texto(dialogo, "p") !== pedido || valores[0] !== `$ ${formatar(item.preco)}` ||
              valores[1] !== `$ ${formatar(custo)}`) return false;
          aviso = avisoSaldo(saldo() - custo);
          const saldoPrevisto = numero(valores[2]?.match(/^\$\s*([\d.]+)$/)?.[1]);
          if (!aviso && Number.isSafeInteger(saldoPrevisto)) aviso = avisoSaldo(saldoPrevisto);
          return !aviso;
        });
        return aviso ? null : confirmada;
      } finally { if (input.isConnected) alterar(anterior); }
    }, mensagem => mensagem === `Compra concluída: ${pedido} por ${formatar(custo)} Pokédollars.`,
    () => produtos().some(atual => atual.id === item.id && atual.estoque > item.estoque));
    return aviso ?? `Comprou ${pedido}`;
  }

  async function vender(modo) {
    abaLoja("loot");
    const permitido = item => item && lootPermitido(item.chave, modo, item.preco);
    const alvo = new Set(pilhas().filter(permitido).map(item => item.chave));
    if (!alvo.size) return;

    const limpar = () => loja()?.querySelector("[data-clear-loot-selection]:not(:disabled)");
    limpar()?.click();
    if (!loja() || modal() || limpar() || caixasLoot().some(caixa => caixa.checked)) {
      throw new Error("Não foi possível limpar a seleção de loot antes da venda.");
    }

    const inicio = interacoes;
    try {
      for (const chave of alvo) pilhas().find(item => item.chave === chave)?.caixa.click();
      const itens = caixasLoot().filter(caixa => caixa.checked).map(pilha);
      const marcados = new Set(itens.map(item => item?.chave));
      if (itens.length !== alvo.size || !itens.every(permitido) ||
          ![...alvo].every(chave => marcados.has(chave))) {
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
      () => itens.every(item => !pilhas().some(atual => atual.chave === item.chave && atual.estoque >= item.estoque)));
      return `${formatar(quantidade)} loots por ${formatar(total)} Pokédollars`;
    } finally {
      if (inicio === interacoes && !modal()) limpar()?.click();
    }
  }

  function pokemonElegivel(linha, filtro) {
    const caixa = linha.querySelector("input[data-sale-select]:not(:disabled)");
    const id = linha.dataset.pokemonId;
    if (!id || caixa?.dataset.saleSelect !== id || linha.matches('[data-shiny="true"], [data-holo="true"]')) return null;
    const selo = texto(linha, ".quality-badge").match(/^(.+) · (\d+,\d{2})×$/);
    const qualidade = Number(selo?.[2].replace(",", "."));
    const iv = numero(texto(linha, ".pokemon-iv-total").match(/^(\d+)\/192$/)?.[1]);
    const preco = numero(texto(linha, ".pokemon-sale-price strong").match(/^\$\s*([\d.]+)$/)?.[1]);
    if (!(qualidade > 0 && qualidade < QUALIDADE_LENDARIA) || !inteiro(iv, 6, 192) || !inteiro(preco, 1, Number.MAX_SAFE_INTEGER)) return null;
    const atende = [];
    if (filtro.qualidade !== null) atende.push(qualidade < filtro.qualidade);
    if (filtro.iv !== null) atende.push(iv < filtro.iv);
    if (!(filtro.condicao === "ou" ? atende.some(Boolean) : atende.every(Boolean))) return null;
    return { id, caixa, preco, faixa: selo[1] };
  }

  function suspenderFiltrosPokemon(layout) {
    const limparFiltros = layout.querySelector("[data-reset-sale-filters]");
    if (!limparFiltros) return;

    const campos = ["[data-sale-search]", "[data-sale-iv-min]", "[data-sale-iv-max]", "[data-sale-sort]"];
    const valores = campos.map(seletor => [seletor, layout.querySelector(seletor)?.value]);
    const excluidas = [...layout.querySelectorAll('[data-sale-quality][aria-pressed="false"]')]
      .map(botao => botao.dataset.saleQuality);
    limparFiltros.click();

    return () => {
      // Se o jogador já mudou os filtros, preserva as escolhas feitas por ele.
      if (layout.querySelector("[data-reset-sale-filters]")) return;
      for (const [seletor, valor] of valores) {
        const campo = layout.querySelector(seletor);
        if (!campo || valor === undefined || campo.value === valor) continue;
        campo.value = valor;
        campo.dispatchEvent(new Event(campo.matches("select") ? "change" : "input", { bubbles: true }));
      }
      for (const qualidade of excluidas) {
        layout.querySelector(`[data-sale-quality="${CSS.escape(qualidade)}"][aria-pressed="true"]`)?.click();
      }
    };
  }

  async function venderPokemon(filtro, continua) {
    const layout = loja();
    const abaAnterior = layout.dataset.mode === "tabs" ? layout.dataset.activeTab
      : layout.querySelector('[data-bag-sale-tab][aria-selected="true"]')?.dataset.bagSaleTab;
    const caixas = () => [...layout.querySelectorAll(".pokemon-sale-row [data-sale-select]:checked")];
    const limpar = () => layout.querySelector("[data-clear-sale-selection]");
    const candidatos = () => [...layout.querySelectorAll(".pokemon-sale-row")]
      .map(linha => pokemonElegivel(linha, filtro)).filter(Boolean);
    abaLoja("pokemon");
    const rolagem = layout.querySelector(".bag-sell-panel");
    if (!rolagem?.clientHeight) return;
    const topo = rolagem.scrollTop;
    const lote = new Map();
    const treinadorDaVenda = treinador();
    const continuaVenda = () => continua() && huntAtiva() && loja() === layout && !modal();
    let selecaoManual = false;
    const registrarSelecaoManual = event => {
      if (event.isTrusted && event.target.closest(".pokemon-sale-row .depot-check, [data-select-filtered-sale-pokemon], [data-clear-sale-selection]")) {
        selecaoManual = true;
      }
    };
    let restaurarFiltros;
    layout.addEventListener("click", registrarSelecaoManual, true);
    try {
      if (limpar() || caixas().length) throw new Error("Há Pokémon selecionados manualmente na loja. Limpe a seleção antes de retomar.");
      restaurarFiltros = suspenderFiltrosPokemon(layout);
      // A ordem padrão da loja é do mais recente para o mais antigo.
      if (rolagem.scrollHeight > rolagem.clientHeight) {
        rolagem.scrollTop = rolagem.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      while (continuaVenda()) {
        for (const { id } of candidatos().reverse()) {
          if (lote.size === LIMITE_LOTE_POKEMON) break;
          if (lote.has(id)) continue;
          const linha = layout.querySelector(`.pokemon-sale-row[data-pokemon-id="${CSS.escape(id)}"]`);
          const item = linha && pokemonElegivel(linha, filtro);
          if (!item || item.caixa.checked) continue;
          item.caixa.click();
          lote.set(id, item);
        }
        if (lote.size === LIMITE_LOTE_POKEMON || rolagem.scrollTop <= 0) break;
        const antes = rolagem.scrollTop;
        rolagem.scrollTop -= Math.max(1, Math.floor(rolagem.clientHeight * 0.8));
        if (rolagem.scrollTop === antes) break;
        // A lista do jogo só monta no DOM os cartões próximos à área visível.
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!lote.size || !continuaVenda()) return;

      const marcadosVisiveis = candidatos().filter(item => item.caixa.checked);
      const quantidade = formatar(lote.size);
      let preco = 0;
      for (const item of lote.values()) preco += item.preco;
      const barra = layout.querySelector(".sale-selection-sticky");
      const botao = barra?.querySelector("[data-bulk-sell-sale-pokemon]:not(:disabled)");
      // O resumo da loja inclui os marcados cujos cartões saíram do DOM ao rolar.
      if (caixas().length !== marcadosVisiveis.length || !marcadosVisiveis.every(item => lote.has(item.id)) ||
          !Number.isSafeInteger(preco) || !botao || texto(barra, "strong") !== `${quantidade} selecionados no filtro` ||
          texto(barra, "small") !== `${formatar(preco)} Pokédollars`) {
        throw new Error("A seleção de Pokémon mudou antes da venda.");
      }

      const faixas = new Map();
      for (const { faixa } of lote.values()) faixas.set(faixa, (faixas.get(faixa) ?? 0) + 1);
      const esperado = new Map([["Pokémon na venda", quantidade], ["Total", `$ ${formatar(preco)}`]]);
      for (const [faixa, quantidade] of faixas) esperado.set(faixa, formatar(quantidade));
      await comprovante(() => {
        if (!continuaVenda()) return false;
        const semDialogo = localStorage.getItem("multipoke-hide-sale-confirmation:pokemon") === "true";
        botao.click();
        const dialogo = modal();
        if (!dialogo) return semDialogo;
        return confirmar(dialogo, "Confirmar venda de Pokémon", "Vender", dialogo => {
          const linhas = [...dialogo.querySelectorAll(".ui-confirm__details > div")];
          return linhas.length === esperado.size && new Set(linhas.map(linha => texto(linha, "dt"))).size === esperado.size &&
            linhas.every(linha => esperado.get(texto(linha, "dt")) === texto(linha, "dd"));
        });
      }, mensagem => mensagem === `${quantidade} Pokémon vendidos por ${formatar(preco)} Pokédollars.`,
      () => !limpar() && !caixas().length);
      return `${quantidade} Pokémon por ${formatar(preco)} Pokédollars`;
    } finally {
      layout.removeEventListener("click", registrarSelecaoManual, true);
      if (layout.isConnected && treinador() === treinadorDaVenda && !modal()) {
        if (lote.size && !selecaoManual) limpar()?.click();
        restaurarFiltros?.();
        if (loja() === layout && continua()) {
          rolagem.scrollTop = topo;
          if (abaAnterior) abaLoja(abaAnterior);
        }
      }
    }
  }

  function atualizarIndicador() {
    const ativo = Boolean(sessao);
    campo("estado").toggleAttribute("data-ativa", ativo);
    campo("estado").textContent = ativo ? "Ativa" : "Offline";
  }

  function pausar(mensagem) {
    sessao = null;
    atualizarIndicador();
    campo("alternar").textContent = "Iniciar Auto Loja";
    campo("config").disabled = ocupada;
    informar(mensagem);
  }

  async function ciclo() {
    const atual = sessao;
    if (!atual || ocupada || !document.hasFocus() || document.hidden) return;
    const inicio = interacoes;
    const continua = () => sessao === atual && treinador() === atual.treinador &&
      inicio === interacoes && document.hasFocus() && !document.hidden && jogo("#game-shell:not([inert])");
    if (treinador() !== atual.treinador) return pausar("Treinador mudou. Confira as regras antes de retomar.");
    const vendaDevida = Date.now() >= atual.proximaVenda;
    const compras = cacada() ? atual.compras : [];
    const modoVenda = vendaDevida && cacada() && atual.modoVenda;
    const filtroPokemon = vendaDevida && huntAtiva() && atual.filtroPokemon;
    if (!continua() || (!compras.length && !modoVenda && !filtroPokemon)) return atualizarEstoque();
    ocupada = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, async lock => {
        if (!lock || !continua()) return;
        await comLoja(false, async () => {
          const resultados = [];
          for (const regra of compras) {
            if (!continua() || !cacada() || !loja() || modal()) return;
            const compra = await comprar(regra, atual.reserva);
            if (compra) resultados.push(compra);
          }
          if ((modoVenda || filtroPokemon) && continua() && loja() && !modal()) {
            atual.proximaVenda = Date.now() + INTERVALO_VENDA;
            if (modoVenda && cacada()) {
              const venda = await vender(modoVenda);
              if (venda) resultados.push(`Vendeu ${venda}`);
            }
            if (filtroPokemon && continua() && huntAtiva() && loja() && !modal()) {
              const venda = await venderPokemon(filtroPokemon, continua);
              if (venda) resultados.push(`Vendeu ${venda}`);
            }
          }
          if (continua() && loja() && !modal()) {
            mostrarEstoque();
            informar(resultados.join(" · ") || "Aguardando reposição ou itens elegíveis para venda.");
          }
        });
      });
    } catch (erro) { pausar(erro.message); }
    finally {
      ocupada = false;
      campo("config").disabled = Boolean(sessao);
    }
  }

  async function atualizarEstoque() {
    if (!campo("painel").open || campo("aba-loja").hidden || ocupada || document.hidden || !document.hasFocus() ||
        !jogo("#game-shell:not([inert])")) return;
    const nome = treinador();
    if (!nome) return;
    if (treinadorConfigurado !== nome) {
      if (sessao) pausar("Treinador mudou. Confira as regras antes de retomar.");
      treinadorConfigurado = nome;
      estoqueLido = false;
      estoqueLoot.clear();
      carregarCompras();
      carregarRegras();
      for (const id of camposPokemon) {
        const controle = campo(id);
        const padrao = id === "pokemon-condicao" ? "e" : "";
        try { controle.value = localStorage.getItem(chavePokemon(id)) ?? padrao; }
        catch { controle.value = padrao; }
      }
      campo("vender-pokemon").checked = false;
      campo("modo-venda").value = "";
      if (catalogo) mostrarCatalogo();
    }
    if (!catalogo && Date.now() >= proximaConsultaCatalogo) {
      void carregarCatalogo().catch(() => {}).finally(mostrarCatalogo);
    }
    const foco = interfaceLoja.activeElement ?? document.activeElement;
    if (!loja() && foco?.matches("input, select, textarea, [contenteditable='true']")) return;
    ocupada = true;
    try {
      await comLoja(true, jaAberta => {
        if (treinador() !== nome) return;
        if (!jaAberta) abaLoja("loot");
        mostrarEstoque();
        estoqueLido = true;
      });
    } catch {
      campo("estoque-status").textContent = "Aguardando os controles da loja.";
    } finally {
      ocupada = false;
    }
  }

  campo("buscar-loot").addEventListener("input", mostrarCatalogo);
  campo("modo-venda").addEventListener("change", mostrarCatalogo);
  campo("painel").addEventListener("toggle", () => {
    if (campo("aba-hunts").hidden) void atualizarEstoque();
    else void atualizarAnalise();
  });
  for (const id of camposCompra) {
    const controle = campo(id);
    const seletor = controle.matches("select");
    controle.addEventListener(seletor ? "change" : "input", () => {
      if (!treinadorConfigurado || treinador() !== treinadorConfigurado) return;
      if (seletor) escolhasCompra.set(id, controle.value);
      else if (!controle.value || !controle.validity.valid) return;
      if (id === "bola") publicarBolaReposicao();
      try { localStorage.setItem(chaveCompra(id), controle.value); }
      catch { /* A configuração continua disponível nesta aba. */ }
    });
  }
  for (const id of camposPokemon) {
    const controle = campo(id);
    controle.addEventListener("input", () => {
      if (!treinadorConfigurado || treinador() !== treinadorConfigurado || !controle.validity.valid) return;
      try { localStorage.setItem(chavePokemon(id), controle.value); }
      catch { /* A configuração continua disponível nesta aba. */ }
    });
  }
  window.addEventListener("storage", event => {
    if (event.key === chavePainel) painel.hidden = event.newValue === "true";
    if (!treinadorConfigurado || event.key !== chaveRegras()) return;
    carregarRegras();
    mostrarCatalogo();
  });

  campo("alternar").addEventListener("click", () => {
    if (sessao) return pausar("Auto Loja pausada.");
    if (ocupada) return;
    if (!estoqueLido || treinador() !== treinadorConfigurado) return informar("Aguarde a leitura automática do estoque.");
    const compras = tiposCompra.map(tipo => ({
      id: campo(tipo).value,
      minimo: campo(`${tipo}-min`).valueAsNumber,
      qtd: campo(`${tipo}-qtd`).valueAsNumber,
    })).filter(regra => regra.id);
    const modoVenda = campo("modo-venda").value;
    if (modoVenda && !catalogo) return informar("Aguarde o catálogo de loot.");
    if (modoVenda === "marcados" && ![...regrasLoot.keys()].some(chave => lootPermitido(chave, modoVenda))) {
      return informar("Marque os itens de loot que quer vender.");
    }
    let filtroPokemon = null;
    if (campo("vender-pokemon").checked) {
      const entradaQualidade = campo("pokemon-qualidade").value.trim();
      const qualidade = entradaQualidade ? Number(entradaQualidade.replace(",", ".")) : null;
      const entradaIv = campo("pokemon-iv");
      const iv = entradaIv.value ? entradaIv.valueAsNumber : null;
      if (entradaIv.validity.badInput || (qualidade === null && iv === null) || (qualidade !== null &&
          (!/^\d(?:[.,]\d{1,2})?$/.test(entradaQualidade) || qualidade <= 0 || qualidade > QUALIDADE_LENDARIA)) ||
          (iv !== null && !inteiro(iv, 6, 193))) {
        return informar("Preencha pelo menos um limite válido para Pokémon. Qualidade até 1,70 ou IV de 6 a 193.");
      }
      filtroPokemon = { qualidade, iv, condicao: campo("pokemon-condicao").value };
    }
    if (!compras.length && !modoVenda && !filtroPokemon) return informar("Escolha uma reposição ou um modo de venda.");
    const reserva = campo("reserva").valueAsNumber;
    if ((compras.length && !inteiro(reserva, 0, 999_999_999)) ||
        compras.some(regra => !inteiro(regra.minimo, 0, 10_000) || !inteiro(regra.qtd, 1, 10_000))) {
      return informar("Confira os números de estoque mínimo, quantidade e reserva.");
    }
    sessao = { treinador: treinadorConfigurado, compras, modoVenda, filtroPokemon, reserva, proximaVenda: 0 };
    campo("config").disabled = true;
    atualizarIndicador();
    campo("alternar").textContent = "Pausar Auto Loja";
    informar("Ativa durante a caçada. Reposição a cada 5 segundos e vendas a cada 30 segundos.");
    void ciclo();
  });

  setInterval(() => sessao ? ciclo() : atualizarEstoque(), INTERVALO_ESTOQUE);
})();
