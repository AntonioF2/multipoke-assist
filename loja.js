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
  const PRAZO_COMPROVANTE = 15_000;
  const ESPERA_OPERACAO_INCERTA = 60_000;
  // As chaves legadas permitem recuperar as configurações das instalações existentes.
  const chaveSessao = "multipoke.auto-loja.sessao";
  const bolas = new Set(["poke ball", "great ball", "super ball", "ultra ball"]);
  const pocoes = new Set(["small potion", "great potion", "ultra potion", "hyper potion", "ultimate potion", "max potion"]);
  const revives = new Set(["revive", "max revive"]);
  const rotulosCompra = { bola: "Poké Bolas", pocao: "poções", revive: "revives" };
  const tiposCompra = Object.keys(rotulosCompra);
  const normalizar = texto => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const numero = texto => /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(texto ?? "")
    ? Number(texto.replaceAll(".", "")) : NaN;
  const inteiro = (valor, min, max) => Number.isSafeInteger(valor) && valor >= min && valor <= max;
  const compraValida = regra => tiposCompra.includes(regra?.tipo) && typeof regra.id === "string" &&
    (regra.tipo === "bola" ? /^ball:\d+$/ : /^supply:\d+$/).test(regra.id) &&
    inteiro(regra.minimo, 0, 10_000) && inteiro(regra.qtd, 1, 10_000);
  const filtroPokemonValido = ({ qualidade, iv, condicao }) =>
    (condicao === "e" || condicao === "ou") && (qualidade !== null || iv !== null) &&
    (qualidade === null || (qualidade > 0 && qualidade <= QUALIDADE_LENDARIA)) &&
    (iv === null || inteiro(iv, 6, 193));
  const formatar = valor => valor.toLocaleString("pt-BR");
  const texto = (raiz, seletor) => raiz.querySelector(seletor)?.textContent.trim() ?? "";
  const escrever = (no, valor) => {
    if (no.textContent !== valor) no.textContent = valor;
  };
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
  const desenhos = {
    bola: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6m6 0h6"/><circle cx="12" cy="12" r="3"/>',
    bolsa: '<path d="M5 8h14v12H5zM9 8V5h6v3M5 13h14m-9 0v3h4v-3"/>',
    hunt: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    grind: '<path d="m3 19 6-10 4 6 3-4 5 8H3ZM9 9V3m0 0h7l-2 2 2 2H9"/>',
    rank: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    dex: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="10" cy="8" r="2"/><path d="M14 7h2M8 14h8m-8 3h5"/>',
    pocao: '<path d="M9 3h6v4l3 5v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7l3-5V3ZM9 7h6M6 14h12"/>',
    revive: '<path d="m12 3 7 9-7 9-7-9 7-9ZM5 12h14M12 3l-3 9 3 9 3-9-3-9Z"/>',
    loot: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M8 5l9 5"/>',
    live: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m10 9 5 3-5 3V9Zm-2 12h8m-4-3v3"/>',
    xp: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  };
  const icone = nome => `<svg class="icone-interface" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${desenhos[nome]}</svg>`;
  interfaceLoja.innerHTML = `
    <style>
      :host { position: fixed; bottom: 12px; left: 12px; z-index: 100000; color-scheme: light;
        --azul: #223754; --vermelho: #a92338; --amarelo: #f3c851; --papel: #f5f7fb;
        --borda: #dce3ed; --muted: #637189; }
      :host([hidden]) { display: none; }
      *, *::before, *::after { box-sizing: border-box; }
      #painel { --sinal-loja: #91a0b5; width: max-content; max-width: calc(100vw - 24px); color: var(--azul);
        background: var(--papel); border: 1px solid #263c59; border-radius: 15px;
        box-shadow: 0 16px 48px #111c3545, 0 2px 8px #111c3520; overflow: hidden;
        font: 13px/1.5 system-ui, sans-serif; scrollbar-width: thin; scrollbar-color: #b7c4d7 transparent; }
      #painel[open] { width: 440px; max-height: min(86vh, 800px); overflow: auto; }
      summary, button, select, input[type=checkbox] { cursor: pointer; }
      #painel > summary { position: sticky; top: 0; z-index: 3; display: flex; height: 78px; list-style: none;
        background: linear-gradient(110deg, #9c2538, #781f32); border-bottom: 3px solid var(--amarelo); color: #fff; }
      #painel > summary::-webkit-details-marker { display: none; }
      #seta-painel { width: 32px; flex: 0 0 auto; display: grid; place-items: center; }
      #seta-painel:hover { background: #ffffff12; }
      #seta-painel::before { content: ""; width: 7px; height: 7px; border: solid #fff;
        border-width: 0 2px 2px 0; transform: rotate(-45deg); }
      #painel[open] #seta-painel::before { transform: rotate(45deg); }
      #arrastar { display: flex; align-items: center; flex: 1; min-width: 0; gap: 11px; padding: 10px 18px 10px 2px;
        cursor: grab; touch-action: none; user-select: none; }
      #arrastar:active { cursor: grabbing; }
      #dragonite { width: 44px; height: 44px; flex: 0 0 auto; background: #fff5d6;
        border: 1px solid #e4b74f; border-radius: 10px; object-fit: contain; image-rendering: pixelated; }
      .marca { display: block; color: #f6d7da; font-size: 9px; font-weight: 700; letter-spacing: .16em; }
      .titulo { display: block; color: #fff; font-size: 21px; font-weight: 800; letter-spacing: -.5px; white-space: nowrap; }
      #painel:has(#estado[data-ativa]) { --sinal-loja: #3fcb95; }
      #painel:has(#estado[data-aguardando]) { --sinal-loja: #f0bb42; }
      .pokebola-status { position: relative; min-height: 26px; padding-left: 35px; }
      .pokebola-status::before { content: ""; position: absolute; left: 0; top: 50%; width: 25px; height: 25px;
        transform: translateY(-50%); border: 2px solid #233449; border-radius: 50%;
        background: linear-gradient(to bottom, #d54a58 0 43%, #233449 43% 57%, #f8fafc 57% 100%);
        box-shadow: inset 0 -2px 0 #23344916, 0 1px 2px #10223618; }
      .pokebola-status::after { content: ""; position: absolute; left: 9px; top: 50%; width: 7px; height: 7px;
        transform: translateY(-50%); border-radius: 50%; background: var(--sinal-loja);
        box-shadow: 0 0 0 2px #f8fafc, 0 0 0 3.5px #233449; transition: background-color .2s; }
      #estado { display: inline-flex; align-items: center; flex: 0 0 auto; margin-left: auto;
        padding-right: 0; color: #fff; font-size: 11px; font-weight: 650; white-space: nowrap; }
      #abas { position: sticky; top: 78px; z-index: 2; display: flex; gap: 4px; padding: 9px 12px;
        background: #f9fafc; border-bottom: 1px solid var(--borda); }
      #abas button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;
        flex: 1; min-width: 0; border: 1px solid transparent; border-radius: 10px; padding: 8px 3px;
        background: transparent; color: var(--muted); font-size: 11px; font-weight: 650; }
      .icone-interface { display: inline-block; width: 19px; height: 19px; flex: 0 0 auto; vertical-align: middle; }
      #abas button:hover { background: #e9eef6; }
      #abas button[aria-pressed="true"] { background: #fff2f2; border-color: #efd7dc; color: #9b293e; }
      .secao-intro { display: flex; align-items: center; gap: 12px; padding: 2px 0 4px; }
      .secao-emblema { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto;
        color: #a72b40; background: #f9e9ec; border: 1px solid #efcfd7; border-radius: 13px; }
      .secao-emblema .icone-interface { width: 23px; height: 23px; }
      .sobrelinha { display: block; color: var(--muted); font-size: 9px; font-weight: 750; letter-spacing: .12em; }
      .secao-intro h2 { margin: 1px 0 0; font-size: 19px; letter-spacing: -.45px; line-height: 1.3; }
      .secao-intro p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
      .titulo-bloco { display: flex; align-items: center; gap: 9px; }
      .titulo-bloco > .icone-interface { width: 27px; height: 27px; padding: 5px; color: #a72b40;
        background: #fcf0f2; border-radius: 8px; }
      .rotulo-item { display: flex; align-items: center; gap: 5px; }
      .rotulo-item .icone-interface { width: 14px; height: 14px; }
      .rotulo-item[data-item="bola"] { color: #a52e43; }
      .rotulo-item[data-item="pocao"] { color: #4c718a; }
      .rotulo-item[data-item="revive"] { color: #8a6b23; }
      #aba-hunts, #aba-troca, #aba-tierlist, #aba-pokedex { padding: 14px; }
      .dex-apresentacao { padding: 17px; border-radius: 12px; color: #fff;
        background: linear-gradient(135deg, #263d60, #3d5480); }
      .dex-apresentacao > span { font-size: 9px; font-weight: 800; letter-spacing: .14em; color: #b9cbe9; }
      .dex-apresentacao h3 { font-size: 19px; margin: 6px 0; }
      .dex-apresentacao p { margin: 0; font-size: 12px; color: #e4ecfa; }
      #dex-treinador { display: block; margin-top: 12px; color: #405b7e; }
      #dex-busca { width: 100%; margin: 8px 0; }
      #dex-resultados { display: grid; gap: 5px; max-height: 240px; overflow: auto; }
      #dex-resultados:empty { display: none; }
      .dex-resultado { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 9px;
        border: 1px solid var(--borda); border-radius: 9px; background: #fff; color: var(--azul); text-align: left; }
      .dex-resultado img { width: 36px; height: 36px; image-rendering: pixelated; }
      .dex-resultado span { flex: 1; }
      #dex-regras { display: grid; gap: 12px; }
      .dex-regra { padding: 12px; border: 1px solid var(--borda); border-radius: 12px; background: #fff; }
      .dex-regra[data-ativa="true"] { border-color: #82b59d; box-shadow: inset 3px 0 #4a9670; }
      .dex-regra-cabecalho { display: flex; gap: 8px; align-items: center; }
      .dex-regra-cabecalho img { image-rendering: pixelated; flex: none; }
      .dex-regra-cabecalho > div { flex: 1; min-width: 0; }
      .dex-regra-cabecalho strong, .dex-regra-cabecalho small { display: block; overflow-wrap: anywhere; }
      .dex-progresso { margin-top: 12px; padding: 10px; background: #f3f6fb; border: 1px solid #e6ecf5; border-radius: 9px; }
      .dex-progresso > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; }
      .dex-progresso > div span { color: #49658d; font-weight: 750; white-space: nowrap; }
      .dex-progresso progress { display: block; width: 100%; height: 8px; margin: 7px 0; border: 0; border-radius: 8px;
        overflow: hidden; background: #dfe7f2; accent-color: #4c739f; }
      .dex-progresso progress::-webkit-progress-bar { background: #dfe7f2; border-radius: 8px; }
      .dex-progresso progress::-webkit-progress-value { background: linear-gradient(90deg, #4d719c, #70a9b5); border-radius: 8px; }
      .dex-progresso progress::-moz-progress-bar { background: #4d719c; border-radius: 8px; }
      .dex-progresso small { display: block; font-size: 10px; overflow-wrap: anywhere; }
      .dex-progresso.sem-dados > div { color: var(--muted); }
      .dex-alternar { border: 1px solid var(--borda); border-radius: 20px; padding: 7px 9px;
        font-size: 11px; color: var(--muted); background: #f2f5f9; }
      .dex-alternar[aria-pressed="true"] { background: #e5f4ec; color: #286b49; border-color: #a7ceba; }
      .dex-regra-rodape { display: flex; justify-content: flex-end; margin-top: 8px; }
      .dex-remover { padding: 5px 10px; border: 1px solid #e7cdd3; border-radius: 7px; background: #fff; color: #a04c5a; font-size: 11px; }
      .dex-remover:hover:not(:disabled) { background: #fff1f3; border-color: #cd9fa9; }
      .dex-regra fieldset { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 10px 0 0; margin: 8px 0 0;
        border-top: 1px solid #edf0f5; }
      .dex-regra legend { font-size: 10px; color: var(--muted); padding: 0 5px 0 0; }
      .dex-regra label { display: flex; align-items: center; gap: 5px; font-size: 11px; margin: 0; }
      .dex-regra input[type="checkbox"] { width: 15px; height: 15px; accent-color: #405e88; }
      .dex-regra-nota, .dex-vazio, #dex-status { margin: 10px 0 0; font-size: 11px; color: #61728a; line-height: 1.6; }
      #dex-status { margin: 10px 0; }
      #aba-hunts h3 { margin: 18px 0 9px; font-size: 13px; }
      .hunt-resumo { margin: 8px 0; padding: 12px; background: #fff; border: 1px solid var(--borda); border-radius: 10px; }
      .hunt-resumo strong, .hunt-resumo span { display: block; }
      .hunt-resumo strong { margin-bottom: 4px; font-size: 11px; color: var(--muted); }
      #hunt-historico, #hunt-comparacao { white-space: pre-line; }
      #hunt-comparacao { max-height: 250px; overflow: auto; }
      #hunt-medicao, small { color: var(--muted); }
      small { font-size: 11px; line-height: 1.6; }
      fieldset { margin: 0; padding: 14px; border: 0; min-width: 0; display: grid; gap: 12px; }
      .bloco-config { min-width: 0; padding: 14px; background: #fff; border: 1px solid var(--borda); border-radius: 12px;
        box-shadow: 0 2px 5px #22375404; }
      .bloco-config h3 { margin: 0; font-size: 13px; font-weight: 750; }
      .descricao { margin: 3px 0 14px; color: var(--muted); font-size: 11px; }
      #estoque-status { margin: 0; padding: 10px 12px; color: #405b7e; background: #eaf0f9;
        border: 1px solid #dbe5f3; border-radius: 9px; font-size: 12px; }
      .linha-reposicao { display: grid; grid-template-columns: minmax(0, 1fr) 72px 72px; align-items: end; gap: 8px; }
      .linha-reposicao + .linha-reposicao { padding-top: 12px; margin-top: 12px; border-top: 1px solid #edf0f5; }
      .campo { display: grid; min-width: 0; gap: 6px; color: #415470; font-size: 11px; font-weight: 650; }
      .campo select, .campo input { width: 100%; min-width: 0; font-size: 12px; font-weight: 500; }
      .linha-reposicao input { text-align: center; }
      .reserva { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--borda); }
      .entrada-moeda { display: flex; align-items: center; gap: 8px; }
      .entrada-moeda > span { font-size: 14px; color: #8896aa; }
      .entrada-moeda input { flex: 1; }
      .nota { margin: 12px 0 0; padding: 9px 11px; background: #faf7ed; border-left: 2px solid #e4c364;
        border-radius: 0 7px 7px 0; color: #7c704d; font-size: 11px; line-height: 1.55; }
      .regras { margin-top: 12px; background: #f7f9fc; border: 1px solid var(--borda); border-radius: 9px; }
      .regras > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 11px 12px; font-size: 12px; font-weight: 650; list-style: none; }
      .regras > summary::-webkit-details-marker { display: none; }
      .regras > summary::after { content: ""; flex: 0 0 auto; width: 6px; height: 6px;
        margin-right: 2px; border: solid #7b8ca5; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
      .regras[open] > summary::after { transform: rotate(225deg); }
      .regras[open] > summary { border-bottom: 1px solid var(--borda); }
      .conteudo-regras { padding: 12px; }
      .regras > p, .regras > button, .regras > input { margin-left: 12px; margin-right: 12px; }
      .regras > p { margin-bottom: 12px; }
      #regras-pokemon { margin: 0; padding: 0; background: #fff; border-radius: 12px; }
      #regras-pokemon > summary { padding: 14px; font-size: 13px; }
      #regras-pokemon > summary small { display: block; margin-top: 2px; font-weight: 400; }
      #regras-pokemon .conteudo-regras { padding: 14px; }
      .grade-filtros { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
      .opcao-check { display: flex; align-items: center; gap: 9px; padding: 10px; border: 1px solid #e0e6ef;
        border-radius: 9px; background: #f8fafc; font-size: 12px; font-weight: 550; cursor: pointer; }
      .opcao-check:has(input:checked) { background: #fdf0f2; border-color: #e5bac4; }
      input[type=checkbox] { width: 16px; height: 16px; min-height: 0; margin: 0; flex: 0 0 auto; accent-color: #355985; }
      button, select, input { font: inherit; }
      button { transition: background-color .12s, border-color .12s; }
      select, input { min-height: 36px; max-width: 100%; padding: 7px 9px; border: 1px solid #cfd8e5;
        border-radius: 7px; background: #fff; color: var(--azul); }
      select { padding-right: 28px; appearance: none; text-overflow: ellipsis;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='m5 6 3 3 3-3' fill='none' stroke='%23637189' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center; }
      select:hover:not(:disabled), input:hover:not(:disabled) { border-color: #91a5c0; }
      select:disabled, input:disabled { background-color: #f2f5f9; color: #738198; cursor: default; }
      fieldset:disabled .campo { color: #738198; }
      :is(summary, button, select, input):focus-visible { outline: 2px solid #6286b6; outline-offset: 2px; }
      #painel > summary:focus-visible { outline-color: var(--amarelo); outline-offset: -3px; }
      #buscar-loot { width: 100%; margin-bottom: 10px; }
      .loot { display: grid; max-height: 210px; overflow: auto; scrollbar-width: thin; }
      .regra-loot { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px;
        padding: 10px 0; border-bottom: 1px solid var(--borda); }
      .regra-loot:last-child { border-bottom: 0; }
      .controles-loot { display: grid; gap: 7px; }
      .controles-loot label { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 11px; }
      .loot small { display: block; margin-top: 2px; }
      .acoes-loja { position: sticky; bottom: 0; z-index: 2; display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px 14px;
        background: var(--papel); border-top: 1px solid var(--borda); box-shadow: 0 -4px 12px #22375405; }
      #alternar, #alternar-captura, #troca-alternar { display: block; width: 100%; padding: 10px 12px;
        border-radius: 8px; font-size: 12px; font-weight: 750; }
      #alternar, #troca-alternar { background: var(--azul); border: 1px solid var(--azul); color: #fff; }
      #alternar:hover, #troca-alternar:hover { background: #314f76; }
      #alternar-captura { background: #f0eafa; color: #653993; border: 1px solid #ded0ef; }
      #alternar-captura:hover { background: #e6dbf5; }
      #alternar-captura[aria-pressed="true"] { background: #705096; border-color: #705096; color: #fff; }
      #alternar-captura[aria-pressed="true"]:hover { background: #5f4184; }
      #mensagem { grid-column: 1 / -1; display: flex; align-items: center; margin: 3px 0 0; color: var(--muted);
        font-size: 11px; line-height: 1.6; }
      #hunt-exportar, #hunt-importar { padding: 7px 10px; border: 1px solid #cfd8e5; border-radius: 7px;
        background: #fff; color: var(--azul); font-size: 11px; }
      #troca-status { padding: 12px; background: #eaf0f9; border-radius: 9px; color: #405b7e; }
      .hunt-testes { margin-top: 12px; }
      #aba-hunts .hunt-testes h3 { margin: 0 0 5px; }
      .hunt-testes > p { color: var(--muted); font-size: 11px; }
      #hunt-testar { width: 100%; margin-top: 12px; padding: 10px; border: 1px solid var(--azul);
        border-radius: 8px; background: var(--azul); color: #fff; font-size: 12px; font-weight: 700; }
      #hunt-testar:hover { background: #314f76; }
      #hunt-teste-progresso { display: block; width: 100%; height: 7px; margin: 12px 0; appearance: none;
        border: 0; border-radius: 9px; overflow: hidden; background: #e3eaf4; accent-color: #426fa6; }
      #hunt-teste-progresso::-webkit-progress-bar { background: #e3eaf4; }
      #hunt-teste-progresso::-webkit-progress-value { background: #426fa6; }
      #hunt-teste-progresso::-moz-progress-bar { background: #426fa6; }
      #hunt-teste-status { margin: 0; font-size: 11px; color: #405b7e; }
      #hunt-teste-resultados { display: grid; gap: 8px; max-height: 280px; overflow: auto; scrollbar-width: thin; }
      .hunt-resultado-teste { padding: 10px; border: 1px solid var(--borda); border-radius: 8px; background: #f7f9fc; }
      .hunt-resultado-teste strong, .hunt-resultado-teste span, .hunt-resultado-teste small { display: block; }
      .hunt-resultado-teste span { margin: 4px 0; font-size: 11px; }
      .tier-apresentacao { padding: 16px; background: var(--azul); color: #fff; border-radius: 12px; }
      .tier-apresentacao > span { color: #b9cbe3; font-size: 9px; font-weight: 700; letter-spacing: .14em; }
      .tier-apresentacao h3 { margin: 4px 0 6px; font-size: 20px; letter-spacing: -.4px; }
      .tier-apresentacao p { margin: 0 0 10px; color: #d4dfef; font-size: 11px; }
      .tier-apresentacao a { color: #f3d174; font-size: 11px; text-underline-offset: 3px; }
      #tierlist-busca { width: 100%; margin-top: 14px; font-size: 12px; }
      #tierlist-ranks { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; margin-top: 10px; }
      #tierlist-ranks button { min-width: 0; padding: 6px 2px; border: 1px solid var(--borda);
        border-radius: 7px; background: #fff; color: var(--muted); font-size: 11px; font-weight: 700; }
      #tierlist-ranks button:hover { border-color: #91a5c0; }
      #tierlist-ranks button[aria-pressed="true"] { background: var(--azul); border-color: var(--azul); color: #fff; }
      #tierlist-status { margin: 9px 0 12px; color: var(--muted); font-size: 11px; }
      #tierlist-tentar { padding: 8px 12px; margin-bottom: 12px; border: 1px solid var(--azul);
        border-radius: 7px; background: var(--azul); color: #fff; font-size: 12px; }
      #tierlist-lista { display: grid; gap: 12px; }
      .tier-grupo { border: 1px solid var(--borda); border-top: 3px solid var(--rank-cor);
        border-radius: 11px; background: #fff; overflow: hidden; }
      .tier-grupo[data-rank="SS"], .tier-equipe[data-rank="SS"], .tier-membro[data-rank="SS"] { --rank-cor: #7951aa; --rank-fundo: #f1eafa; }
      .tier-grupo[data-rank="S"], .tier-equipe[data-rank="S"], .tier-membro[data-rank="S"] { --rank-cor: #97701c; --rank-fundo: #fff4d7; }
      .tier-grupo[data-rank="A"], .tier-equipe[data-rank="A"], .tier-membro[data-rank="A"] { --rank-cor: #ae4857; --rank-fundo: #fff0f1; }
      .tier-grupo[data-rank="B"], .tier-equipe[data-rank="B"], .tier-membro[data-rank="B"] { --rank-cor: #426fa6; --rank-fundo: #edf3fc; }
      .tier-grupo[data-rank="C"], .tier-equipe[data-rank="C"], .tier-membro[data-rank="C"] { --rank-cor: #317e75; --rank-fundo: #eaf6f3; }
      .tier-grupo[data-rank="D"], .tier-equipe[data-rank="D"], .tier-membro[data-rank="D"] { --rank-cor: #68778d; --rank-fundo: #f1f4f8; }
      .tier-cabecalho { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        border-bottom: 1px solid var(--borda); }
      .tier-selo { display: grid; place-items: center; width: 36px; height: 36px;
        border-radius: 9px; background: var(--rank-fundo); color: var(--rank-cor); font-size: 17px; font-weight: 850; }
      .tier-cabecalho h4 { margin: 0; font-size: 13px; }
      .tier-contador { margin-left: auto; color: var(--muted); font-size: 11px; }
      .tier-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px; padding: 10px; }
      .tier-pokemon { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0;
        padding: 2px 2px 7px; border: 1px solid transparent; border-radius: 8px; background: #f7f9fc;
        color: var(--azul); text-decoration: none; }
      .tier-pokemon:hover { background: var(--rank-fundo); border-color: var(--rank-cor); }
      .tier-pokemon:focus-visible, .tier-apresentacao a:focus-visible { outline: 2px solid #6286b6; outline-offset: 2px; }
      .tier-pokemon[hidden] { display: none; }
      .tier-icone { display: grid; place-items: center; width: 56px; height: 56px; }
      .tier-icone img { width: 56px; height: 56px; object-fit: contain; image-rendering: pixelated; }
      .tier-icone.sem-icone::after { content: attr(data-numero); color: var(--muted); font-size: 11px; }
      .tier-nome { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 10px; font-weight: 550; }
      .tier-vazio { margin: 0; padding: 0 12px 12px; font-size: 11px; color: var(--muted); }
      .tier-equipe { --rank-cor: #68778d; --rank-fundo: #f1f4f8; margin-top: 12px; padding: 12px;
        background: #fff; border: 1px solid var(--borda); border-left: 3px solid var(--rank-cor); border-radius: 11px; }
      .tier-equipe-cabecalho { display: flex; align-items: center; gap: 10px; }
      .tier-equipe-cabecalho h4 { margin: 0; font-size: 13px; }
      .tier-equipe-cabecalho .tier-selo { flex: 0 0 42px; width: 42px; height: 42px; font-size: 20px; }
      #tierlist-equipe-status { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
      #tierlist-equipe-membros { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
      #tierlist-equipe-membros:empty { display: none; }
      .tier-membro { --rank-cor: #68778d; --rank-fundo: #f1f4f8; min-height: 96px; justify-content: center; }
      .tier-membro .tier-nome { font-size: 11px; }
      .tier-membro-rank { max-width: 100%; padding: 1px 7px; border-radius: 5px; font-size: 10px; font-weight: 700; text-align: center;
        color: var(--rank-cor); background: var(--rank-fundo); }
      .tier-metodo { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--borda); font-size: 11px; color: var(--muted); }
      .tier-metodo > summary { font-weight: 600; }
      .tier-metodo p { margin: 7px 0 0; line-height: 1.6; }
      .dex-apresentacao, .tier-apresentacao { position: relative; isolation: isolate; overflow: hidden;
        background: linear-gradient(125deg, #223754, #314d6f); border: 1px solid #3f5777; }
      .dex-apresentacao::after, .tier-apresentacao::after { content: ""; position: absolute; right: -27px; top: -22px;
        z-index: -1; width: 126px; height: 126px; border: 14px solid #ffffff08; border-radius: 50%;
        background: linear-gradient(transparent 45%, #ffffff08 45% 55%, transparent 55%); }
      .dex-apresentacao > .icone-interface, .tier-apresentacao > .icone-interface { float: right; color: #e9c875;
        width: 27px; height: 27px; margin: 1px 0 8px 12px; }
      .hunt-resumo { border-left: 3px solid #8fa2b9; }
      .resumo-xp { border-left-color: #c99a34; }
      .resumo-drops { border-left-color: #4b9585; }
      .hunt-resumo strong { display: flex; align-items: center; gap: 6px; }
      .hunt-resumo strong .icone-interface { width: 15px; height: 15px; }
      #live-status { padding: 10px 11px; background: #f3f6fb; border: 1px solid #e2e9f3;
        border-radius: 8px; color: #49617c; font-size: 11px; }
      @media (max-width: 480px) {
        .linha-reposicao { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .linha-reposicao > .campo:first-child { grid-column: 1 / -1; }
        #arrastar { gap: 8px; padding-right: 12px; }
        #estado { font-size: 10px; padding-right: 0; }
      }
      @media (prefers-reduced-motion: reduce) { button, .pokebola-status::after { transition: none; } }
      p { margin: 8px 0; }
    </style>
    <details id="painel">
      <summary id="cabecalho" aria-label="Abrir ou recolher MultiPoke Assist">
        <span id="seta-painel" title="Abrir ou recolher" aria-hidden="true"></span>
        <span id="arrastar" title="Segure e arraste para mover">
          <!-- Sprite frontal de Pokémon HeartGold e SoulSilver, via PokéAPI. -->
          <img id="dragonite" src="${chrome.runtime.getURL("dragonite.png")}" alt="" width="48" height="48" draggable="false">
          <span><span class="marca">MULTIPOKE</span><span class="titulo">Assist</span></span>
          <span id="estado" class="pokebola-status" role="status" title="Estado da reposição e venda automática">Offline</span>
        </span>
      </summary>
      <div id="abas" role="group" aria-label="Seções do MultiPoke Assist">
        <button id="abrir-loja" type="button" aria-controls="aba-loja" aria-pressed="true">${icone("bolsa")}Loja</button>
        <button id="abrir-hunts" type="button" aria-controls="aba-hunts" aria-pressed="false" aria-label="Análise de hunts" title="Análise de hunts">${icone("hunt")}Hunts</button>
        <button id="abrir-troca" type="button" aria-controls="aba-troca" aria-pressed="false" aria-label="Grind" title="Grind">${icone("grind")}Grind</button>
        <button id="abrir-tierlist" type="button" aria-controls="aba-tierlist" aria-pressed="false">${icone("rank")}Tierlist</button>
        <button id="abrir-pokedex" type="button" aria-controls="aba-pokedex" aria-pressed="false">${icone("dex")}Pokédex</button>
      </div>
      <section id="aba-loja" aria-labelledby="abrir-loja">
      <fieldset id="config">
        <header class="secao-intro"><span class="secao-emblema">${icone("bolsa")}</span>
          <div><span class="sobrelinha">SUPRIMENTOS E NEGÓCIOS</span><h2>Loja do treinador</h2><p>Seu inventário pronto para a próxima caçada.</p></div></header>
        <p id="estoque-status">Aguardando a leitura automática do estoque.</p>
        <section class="bloco-config" aria-labelledby="titulo-reposicao">
          <h3 id="titulo-reposicao" class="titulo-bloco">${icone("bolsa")}Reposição de suprimentos</h3>
          <p class="descricao">Escolha os itens e a quantidade de cada compra.</p>
          <div class="linha-reposicao">
            <label class="campo"><span class="rotulo-item" data-item="bola">${icone("bola")}Poké Bola</span><select id="bola"><option value="">Sem reposição</option></select></label>
            <label class="campo"><span>Estoque mín.</span><input id="bola-min" type="number" min="0" max="10000" value="10"></label>
            <label class="campo"><span>Comprar</span><input id="bola-qtd" type="number" min="1" max="10000" value="50"></label>
          </div>
          <div class="linha-reposicao">
            <label class="campo"><span class="rotulo-item" data-item="pocao">${icone("pocao")}Poção</span><select id="pocao"><option value="">Sem reposição</option></select></label>
            <label class="campo"><span>Estoque mín.</span><input id="pocao-min" type="number" min="0" max="10000" value="5"></label>
            <label class="campo"><span>Comprar</span><input id="pocao-qtd" type="number" min="1" max="10000" value="25"></label>
          </div>
          <div class="linha-reposicao">
            <label class="campo"><span class="rotulo-item" data-item="revive">${icone("revive")}Revive</span><select id="revive"><option value="">Sem reposição</option></select></label>
            <label class="campo"><span>Estoque mín.</span><input id="revive-min" type="number" min="0" max="10000" value="2"></label>
            <label class="campo"><span>Comprar</span><input id="revive-qtd" type="number" min="1" max="10000" value="5"></label>
          </div>
          <label class="campo reserva"><span>Reserva de Pokédollars</span>
            <span class="entrada-moeda"><span aria-hidden="true">$</span><input id="reserva" type="number" min="0" max="999999999" value="200"></span>
          </label>
          <p class="nota">Os itens escolhidos também são selecionados para uso no Auto Helper.</p>
        </section>
        <section class="bloco-config" aria-labelledby="titulo-loot">
          <h3 id="titulo-loot" class="titulo-bloco">${icone("loot")}Venda de loot</h3>
          <p class="descricao">Defina os itens que podem ser vendidos.</p>
          <label class="campo"><span>Venda automática</span><select id="modo-venda">
            <option value="">Desligada</option>
            <option value="marcados">Somente marcados para venda</option>
            <option value="baratos">Abaixo de 10.000 e itens marcados</option>
          </select></label>
          <details id="regras-loot" class="regras">
            <summary>Permissões de venda por item</summary>
            <div class="conteudo-regras">
              <input id="buscar-loot" type="search" placeholder="Buscar por nome ou ID" aria-label="Buscar loot por nome ou ID">
              <div id="loot" class="loot">Carregando o catálogo de loot…</div>
            </div>
          </details>
        </section>
        <details id="regras-pokemon" class="bloco-config regras">
          <summary><span class="titulo-bloco">${icone("bola")}<span>Venda de Pokémon<small>Filtros de qualidade e IV</small></span></span></summary>
          <div class="conteudo-regras">
            <label class="opcao-check"><input id="vender-pokemon" type="checkbox"><span>Ativar venda de Pokémon</span></label>
            <div class="grade-filtros">
              <label class="campo"><span>Qualidade abaixo de</span><input id="pokemon-qualidade" type="text" inputmode="decimal" placeholder="1,30" maxlength="4"></label>
              <label class="campo"><span>IV total abaixo de</span><input id="pokemon-iv" type="number" min="6" max="193" placeholder="80"></label>
            </div>
            <label class="campo"><span>Combinar filtros</span><select id="pokemon-condicao">
              <option value="e">E · precisa cumprir os dois</option>
              <option value="ou">OU · basta cumprir um</option>
            </select></label>
            <p class="nota">Preencha pelo menos um limite. Qualidade Lendária ou superior fica protegida.</p>
          </div>
        </details>
      </fieldset>
      <div class="acoes-loja">
        <button id="alternar" type="button">Iniciar loja</button>
        <button id="alternar-captura" type="button" aria-label="Autocaptura de Pokémon" aria-pressed="false">Autocaptura desligada</button>
        <p id="mensagem" class="pokebola-status" role="status">Configure os itens que deseja comprar, vender ou proteger.</p>
      </div>
      </section>
      <section id="aba-hunts" aria-labelledby="abrir-hunts" hidden>
        <header class="secao-intro"><span class="secao-emblema">${icone("hunt")}</span>
          <div><span class="sobrelinha">EXPLORAÇÃO E ANÁLISE</span><h2>Radar de hunts</h2><p>Encontre o melhor destino para sua equipe.</p></div></header>
        <p><strong>Equipe ativa</strong><br><span id="hunt-equipe"></span></p>
        <p id="hunt-atual"></p>
        <section class="bloco-config hunt-testes" aria-labelledby="hunt-testes-titulo">
          <h3 id="hunt-testes-titulo" class="titulo-bloco">${icone("hunt")}Teste real das hunts</h3>
          <p>Cinco minutos pelo relógio do Registro da Caçada em cada hunt acessível, após até um minuto de adaptação de entrada.</p>
          <label class="opcao-check"><input id="hunt-testar-repetir" type="checkbox"><span>Incluir hunts já medidas</span></label>
          <button id="hunt-testar" type="button">Iniciar testes nas hunts</button>
          <progress id="hunt-teste-progresso" max="1" value="0" aria-label="Progresso dos testes de hunts"></progress>
          <p id="hunt-teste-status" role="status">Pronto para testar as hunts que precisam de medição.</p>
          <p><small>Mantenha o jogo em foco. Ao concluir, retorna à hunt de origem. A troca automática aguarda esta rodada.</small></p>
          <details class="regras" open>
            <summary>Resultados desta rodada</summary>
            <div class="conteudo-regras"><div id="hunt-teste-resultados"></div></div>
          </details>
        </section>
        <h3>Estimativas para seu nível</h3>
        <div class="hunt-resumo resumo-xp"><strong>${icone("xp")}Melhor estimativa de XP do treinador</strong><span id="hunt-estimativa-xp"></span></div>
        <p><small id="hunt-bonus-xp"></small></p>
        <div class="hunt-resumo resumo-drops"><strong>${icone("loot")}Melhor estimativa de drops</strong><span id="hunt-estimativa-drops"></span></div>
        <p><small id="hunt-estimativa-status"></small></p>
        <details class="regras">
          <summary>Comparar hunts e golpes</summary>
          <p id="hunt-comparacao" tabindex="0"></p>
        </details>
        <p><small>Ritmo estimado com tipos e golpes de poder fixo. Atributos de referência e encontros da Pokepédia. XP base da PokéAPI.</small></p>
        <h3>Ganhos medidos no jogo</h3>
        <div class="hunt-resumo resumo-xp"><strong>${icone("xp")}Melhor XP/h medido</strong><span id="hunt-melhor-xp"></span></div>
        <div class="hunt-resumo resumo-drops"><strong>${icone("loot")}Melhor drops/h medido</strong><span id="hunt-melhor-drops"></span></div>
        <p id="hunt-medicao" role="status"></p>
        <details class="regras">
          <summary>Histórico da mesma equipe</summary>
          <p id="hunt-historico"></p>
          <button id="hunt-exportar" type="button">Exportar backup</button>
          <button id="hunt-importar" type="button">Importar backup</button>
          <input id="hunt-arquivo" type="file" accept=".json,application/json" hidden>
          <p id="hunt-backup-status" role="status"></p>
        </details>
        <p><small>Tempo medido pelo Registro da Caçada. O histórico pertence ao time e permanece salvo ao fechar o navegador; subir de nível não reinicia a coleta. Drops/h representa o valor dos itens no Registro da Caçada.</small></p>
      </section>
      <section id="aba-troca" aria-labelledby="abrir-troca" hidden>
        <header class="secao-intro"><span class="secao-emblema">${icone("grind")}</span>
          <div><span class="sobrelinha">ROTA E EVOLUÇÃO</span><h2>Jornada automática</h2><p>Prepare o caminho para o próximo nível.</p></div></header>
        <p>Prioriza sempre a hunt acessível de maior nível. Favoritas só desempatam entre hunts desse mesmo nível. Se a atual já estiver no nível máximo, permanece nela, sem trocar para uma inferior.</p>
        <button id="troca-alternar" type="button">Iniciar troca automática</button>
        <p id="troca-status" role="status">Troca automática desligada.</p>
        <p><small>Funciona em hunts regulares com a aba do jogo em foco. Aguarda pelo menos 5 minutos entre tentativas de entrada.</small></p>
        <section class="bloco-config" aria-labelledby="live-titulo">
          <h3 id="live-titulo" class="titulo-bloco">${icone("live")}Live e bônus de XP</h3>
          <p class="descricao">Acompanhe uma transmissão no player oficial do jogo.</p>
          <label class="opcao-check"><input id="live-automatica" type="checkbox"> Manter uma live aberta automaticamente</label>
          <p id="live-status" role="status">Automação de lives desligada.</p>
          <small>Restaura a janela e retoma pausas automáticas. Se o bônus não voltar após 2 minutos, procura outra live elegível. Pausar transmissão suspende a retomada. Exige Twitch vinculada e reprodução real.</small>
        </section>
      </section>
      <section id="aba-pokedex" aria-labelledby="abrir-pokedex" hidden>
        <div class="dex-apresentacao">${icone("dex")}<span>PROGRESSÃO · POR ESPÉCIE</span>
          <h3>Domínio da Pokédex</h3><p>Escolha seus Pokémon e autorize os bônus que deseja melhorar.</p></div>
        <small id="dex-treinador">Aguardando um treinador.</small>
        <input id="dex-busca" type="search" placeholder="Buscar Pokémon por nome ou número" aria-label="Buscar Pokémon para melhoria automática" autocomplete="off">
        <div id="dex-resultados" aria-label="Resultados da busca"></div>
        <p><small>Use os Pontos Dex da espécie em melhorias permanentes. Marque os bônus e ative o Pokémon. Com vários marcados, priorizamos o menos melhorado. Editar as opções desativa a automação até uma nova ativação.</small></p>
        <p id="dex-status" role="status">Nenhum Pokémon é ativado por padrão.</p>
        <div id="dex-regras"></div>
      </section>
      <section id="aba-tierlist" aria-labelledby="abrir-tierlist" hidden>
        <div class="tier-apresentacao">
          ${icone("rank")}
          <span>POKEPÉDIA · RANKS OFICIAIS</span>
          <h3>Tierlist de Pokémon</h3>
          <p>Explore os ranks e clique em um Pokémon para abrir sua ficha.</p>
          <a href="https://multipoke.io/pokepedia/guias/ranks" target="_blank" rel="noopener noreferrer">Como funcionam os ranks ↗</a>
        </div>
        <section id="tierlist-equipe" class="tier-equipe" aria-labelledby="tierlist-equipe-titulo">
          <div class="tier-equipe-cabecalho">
            <span id="tierlist-equipe-rank" class="tier-selo" aria-hidden="true">—</span>
            <div><h4 id="tierlist-equipe-titulo">Rank médio do time atual</h4>
              <p id="tierlist-equipe-status" role="status">Aguardando a equipe do treinador.</p></div>
          </div>
          <div id="tierlist-equipe-membros"></div>
          <details class="tier-metodo">
            <summary>Como calculamos o rank do time</summary>
            <p>D = 1, C = 2, B = 3, A = 4, S = 5 e SS = 6. Cada Pokémon da equipe tem o mesmo peso.
              A média é arredondada para o rank mais próximo, com 0,5 para cima. Cálculo da extensão com base nos ranks das espécies.</p>
          </details>
        </section>
        <input id="tierlist-busca" type="search" placeholder="Nome ou número na Pokédex" aria-label="Buscar Pokémon por nome ou número" autocomplete="off">
        <div id="tierlist-ranks" role="group" aria-label="Filtrar Pokémon por rank"></div>
        <p id="tierlist-status" role="status">Abra esta aba para consultar os ranks.</p>
        <button id="tierlist-tentar" type="button" hidden>Tentar novamente</button>
        <div id="tierlist-lista" aria-busy="false"></div>
      </section>
    </details>`;
  document.body.append(painel);

  const campo = id => interfaceLoja.getElementById(id);
  const lojaVisivel = () => campo("painel").open && !campo("aba-loja").hidden;
  const trocaHunts = criarTrocaHunts(campo, { formatar, treinador, podeInteragir: () => !ocupada });
  const atualizarAnalise = criarAnaliseHunts(campo, { texto, treinador, numero, formatar, trocaHunts });
  const atualizarTierlist = criarTierlist(campo, { normalizar });
  const atualizarLives = criarControleLives(campo);
  const atualizarPokedex = criarPokedexAutomatica(campo, { treinador, normalizar, podeInteragir: () => !ocupada && !trocaHunts.emTroca() });
  const abas = ["loja", "hunts", "troca", "tierlist", "pokedex"];
  for (const aba of abas) {
    campo(`abrir-${aba}`).addEventListener("click", () => {
      for (const nome of abas) {
        campo(`abrir-${nome}`).setAttribute("aria-pressed", String(nome === aba));
        campo(`aba-${nome}`).hidden = nome !== aba;
      }
      if (aba === "loja") void atualizarEstoque();
      else if (aba === "tierlist") void atualizarTierlist();
      else if (aba === "pokedex") void atualizarPokedex();
      else if (aba === "troca") { void atualizarLives(); void atualizarAnalise(); }
      else void atualizarAnalise();
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
      "aguardando-bola": "Autocaptura pausada · aguardando equipar a Poké Bola de reposição",
    };
    botaoCaptura.setAttribute("aria-pressed", String(Object.hasOwn(rotulos, estado)));
    botaoCaptura.textContent = rotulos[estado] ?? "Autocaptura desligada";
  }
  botaoCaptura.addEventListener("click", () => comandoCaptura("alternar"));
  new MutationObserver(atualizarBotaoCaptura).observe(raiz, { attributeFilter: ["data-multipoke-autocaptura"] });
  atualizarBotaoCaptura();
  const informar = mensagem => escrever(campo("mensagem"), mensagem);
  const camposCompra = [...tiposCompra.flatMap(tipo => [tipo, `${tipo}-min`, `${tipo}-qtd`]), "reserva"];
  const camposPokemon = ["pokemon-qualidade", "pokemon-iv", "pokemon-condicao"];
  const escolhasCompra = new Map();
  const regrasLoot = new Map();
  const objetosLoot = new Map();
  let estoqueLoot = new Map();
  let catalogo;
  let proximaConsultaCatalogo = 0;
  let sessao = null;
  let ocupada = false;
  let estoqueLido = false;
  let treinadorConfigurado = "";
  let interacoes = 0;
  let interacoesMochila = 0;
  let ultimaInteracao = -Infinity;
  const prazosTemporarios = new Map();
  for (const evento of ["pointerdown", "keydown"]) {
    document.addEventListener(evento, event => {
      if (!event.isTrusted) return;
      interacoes++;
      ultimaInteracao = performance.now();
      if (event.target.closest?.("#drawer, #nav-bag")) interacoesMochila++;
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
      // A disponibilidade de obtenção não determina se o loot pode ser vendido.
      // A Pokepédia usa o preço resumido e o texto novo de venda à Loja NPC.
      const descricao = texto(item, "p").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      const preco = numero(descricao.match(/^venda(?:\s*·\s*|\s+a loja npc por\s+)([\d.]+)\s+pokedollars(?:\s+cada(?:\.|$)|$)/)?.[1]);
      const vendavel = inteiro(preco, 1, Number.MAX_SAFE_INTEGER);
      const objeto = objetosLoot.get(`id:${id}`);
      itens.set(chaveLoot(`id:${id}`, nome), { id, nome, preco, vendavel, ...objeto });
    }
    if (!itens.size) throw new Error("A Pokepédia não apresentou o catálogo de loot esperado.");
    // Completa entradas ausentes sem substituir o preço já conferido na loja ou nos objetos.
    catalogo ??= new Map();
    for (const [chave, item] of itens) if (!catalogo.has(chave)) catalogo.set(chave, item);
  }

  const chaveLoot = (id, nome) => /^id:\d+$/.test(id) ? id : `${id}:${normalizar(nome)}`;
  const chaveRegras = () => `multipoke.auto-loja.loot.${treinadorConfigurado}`;
  const chaveCompra = id => `multipoke.auto-loja.compra.${treinadorConfigurado}.${id}`;
  const chavePokemon = id => `multipoke.auto-loja.pokemon.${treinadorConfigurado}.${id}`;

  document.addEventListener("multipoke:objetos-loot", event => {
    if (typeof event.detail !== "string" || event.detail.length > 2_000_000) return;
    let dados;
    try { dados = JSON.parse(event.detail); } catch { return; }
    if (!Array.isArray(dados) || dados.length > 10000 || !dados.every(item =>
      inteiro(item?.id, 1, Number.MAX_SAFE_INTEGER) && typeof item.nome === "string" && item.nome.length > 0 && item.nome.length <= 200 &&
      inteiro(item.preco, 0, Number.MAX_SAFE_INTEGER) && typeof item.vendavel === "boolean" && (!item.vendavel || item.preco > 0) &&
      (item.bloqueado === undefined || typeof item.bloqueado === "boolean")) ||
      new Set(dados.map(item => item.id)).size !== dados.length) return;
    objetosLoot.clear();
    for (const item of dados) objetosLoot.set(`id:${item.id}`, { id: String(item.id), nome: item.nome, preco: item.preco,
      vendavel: item.vendavel, bloqueado: item.bloqueado ?? (!item.vendavel && item.preco > 0) });
    if (!dados.length) return;
    catalogo ??= new Map();
    for (const [chave, item] of objetosLoot) {
      // Preço zero em suprimentos e moedas não transforma esses itens em loot.
      if (item.preco > 0 || catalogo.has(chave)) catalogo.set(chave, item);
    }
    mostrarCatalogo();
  });
  document.dispatchEvent(new Event("multipoke:consultar-objetos-loot"));

  function publicarReposicao() {
    raiz.dataset.multipokeTreinadorReposicao = treinadorConfigurado;
    for (const tipo of tiposCompra) {
      raiz.setAttribute(`data-multipoke-${tipo}-reposicao`, escolhasCompra.get(tipo) ?? "");
    }
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
    publicarReposicao();
  }

  function carregarRegras() {
    regrasLoot.clear();
    try {
      const salvas = JSON.parse(localStorage.getItem(chaveRegras()));
      for (const [chave, regra] of Object.entries(salvas ?? {})) {
        if (!["vender", "vender-acima-do-limite", "proteger"].includes(regra)) continue;
        const id = chave.match(/^id:(\d+)(?::|$)/)?.[1];
        const atual = id ? `id:${id}` : chave;
        // Preserva bloqueios legados, inclusive se houver duas regras para o mesmo ID.
        if (regrasLoot.get(atual) !== "proteger") regrasLoot.set(atual, regra);
      }
    } catch { /* As regras podem ser usadas nesta aba sem armazenamento. */ }
  }

  function produto(linha) {
    const id = linha.dataset.shopRow;
    const nome = texto(linha, ".shop-row-main strong");
    const chave = normalizar(nome);
    const tipo = id.startsWith("ball:") && bolas.has(chave) ? "bola"
      : id.startsWith("supply:") && pocoes.has(chave) ? "pocao"
      : id.startsWith("supply:") && revives.has(chave) ? "revive" : null;
    const estoque = numero(texto(linha, "[data-shop-owned]").match(/^([\d.]+) na mochila$/)?.[1]);
    const preco = numero(texto(linha, "[data-shop-price]").match(/^\$\s*([\d.]+)$/)?.[1]);
    return tipo && inteiro(estoque, 0, Number.MAX_SAFE_INTEGER) && inteiro(preco, 1, Number.MAX_SAFE_INTEGER)
      ? { id, tipo, nome, estoque, preco, linha } : null;
  }

  function pilha(caixa) {
    const linha = caixa.closest(".loot-ledger-row");
    const id = caixa.dataset.lootSelect;
    const nome = texto(linha, ".loot-identity strong");
    const objeto = objetosLoot.get(id);
    const precoLoja = numero(texto(linha, ".loot-identity small").match(/^\$\s*([\d.]+) cada$/)?.[1]);
    const preco = Number.isFinite(precoLoja) ? precoLoja : objeto?.preco;
    const controle = linha.querySelector("input[data-loot-sale-qty]");
    const maximo = Number(controle?.dataset.uiIntegerMax ?? controle?.max);
    const estoque = inteiro(maximo, 1, Number.MAX_SAFE_INTEGER) ? maximo
      : numero(texto(linha, ".loot-count strong").match(/^×\s*([\d.]+)$/)?.[1]);
    const digitado = controle?.type === "number" ? controle.valueAsNumber : numero(controle?.value);
    const chave = chaveLoot(id, nome);
    if (!/^id:\d+$/.test(id) || !nome || caixa.disabled || objeto?.bloqueado || !inteiro(preco, 1, Number.MAX_SAFE_INTEGER) ||
        !inteiro(estoque, 1, Number.MAX_SAFE_INTEGER)) return null;
    // Os controles da Loja NPC confirmam a disponibilidade e o preço efetivo da pilha.
    catalogo ??= new Map();
    catalogo.set(chave, { id: id.slice(3), nome, preco, vendavel: true });
    return { chave, nome, preco, estoque, qtd: inteiro(digitado, 1, estoque) ? digitado : estoque, caixa };
  }

  const seletorLoot = ".loot-ledger-row [data-loot-select]";
  const pilhas = () => Array.from(loja().querySelectorAll(seletorLoot), pilha).filter(Boolean);

  function produtoPorId(id) {
    const linha = loja().querySelector(`[data-shop-row="${CSS.escape(id)}"]`);
    return linha && produto(linha);
  }

  function mostrarEstoque() {
    const disponiveis = Array.from(loja().querySelectorAll("[data-shop-row]"), produto).filter(Boolean);
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
      if (select.value !== anterior && itens.some(item => item.id === anterior)) select.value = anterior;
      for (const [i, item] of itens.entries()) {
        const rotulo = `${item.nome} · ${formatar(item.estoque)} na mochila`;
        if (select.options[i + 1].text !== rotulo) select.options[i + 1].text = rotulo;
      }
    }
    if (loja().querySelector('[data-bag-sale-tab="loot"][aria-selected="true"], .loot-filters')) {
      const tamanho = catalogo?.size;
      estoqueLoot = new Map(pilhas().map(item => [item.chave, item.estoque]));
      if (catalogo?.size !== tamanho) mostrarCatalogo();
      for (const rotulo of campo("loot").querySelectorAll("[data-estoque-loot]")) atualizarRotuloLoot(rotulo);
    }
    const gold = saldo();
    escrever(campo("estoque-status"), Number.isFinite(gold) ? `Saldo na loja: ${formatar(gold)} Pokédollars.`
      : "Aguardando o saldo da loja.");
  }

  function atualizarRotuloLoot(rotulo) {
    const chave = rotulo.dataset.estoqueLoot;
    const item = catalogo.get(chave);
    const estoque = estoqueLoot.get(chave);
    const partes = [`#${item.id}`];
    if (Number.isFinite(item.preco)) partes.push(`${formatar(item.preco)} por unidade`);
    if (estoque) partes.push(`${formatar(estoque)} na loja`);
    if (!item.vendavel) partes.push(item.bloqueado ? "protegido pelas regras do jogo" : "sem preço de venda ao NPC no catálogo");
    else if (regrasLoot.get(chave) === "proteger") partes.push("venda bloqueada por você");
    else if (item.preco >= LIMITE_LOOT && regrasLoot.get(chave) !== "vender-acima-do-limite") partes.push("exige permissão explícita");
    escrever(rotulo, partes.join(" · "));
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
    if (!catalogo) {
      lista.textContent = "Catálogo de loot indisponível. A leitura será repetida automaticamente.";
      return;
    }
    const busca = normalizar(campo("buscar-loot").value.trim()).replace(/^#/, "");
    const modo = campo("modo-venda").value || "baratos";
    const linhas = document.createDocumentFragment();
    for (const [chave, item] of catalogo) {
      if (busca && !item.id.includes(busca) && !normalizar(item.nome).includes(busca)) continue;
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
      linhas.append(linha);
    }
    if (linhas.childElementCount) lista.replaceChildren(linhas);
    else lista.textContent = "Nenhum loot corresponde à busca.";
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
    const inicioMochila = interacoesMochila;
    const foco = interfaceLoja.activeElement ?? document.activeElement;
    if (!jogoDisponivel() || modal() ||
        (jogo("#drawer.open") && !(abertaPeloUsuario && aberta))) return;
    const gaveta = jogo("#drawer");
    const abrir = jogo("#nav-bag:not(:disabled)");
    if (!aberta) abrir?.click();
    return Promise.resolve().then(() => loja() && executar(aberta)).finally(() => {
      if (!aberta && inicioMochila === interacoesMochila && gaveta?.matches(".open") && !modal() &&
          (gaveta.classList.contains("bag-drawer") || abrir?.getAttribute("aria-expanded") === "true")) {
        gaveta.querySelector("#drawer-close")?.click();
        if (inicio === interacoes && foco?.isConnected) foco.focus({ preventScroll: true });
      }
    });
  }

  function confirmar(dialogo, titulo, rotulo, conferir) {
    if (!dialogo?.matches(".ui-confirm") || texto(dialogo, "h2") !== titulo) return false;
    const botao = dialogo.querySelector("button[data-confirm-accept]:not(:disabled)");
    if (!botao || botao.textContent.trim() !== rotulo || !conferir(dialogo)) {
      dialogo.querySelector("button[data-confirm-cancel]")?.click();
      return false;
    }
    botao.click();
    return true;
  }

  function confirmacaoOculta(tipo) {
    try { return localStorage.getItem(`multipoke-hide-sale-confirmation:${tipo}`) === "true"; }
    catch { return false; }
  }

  function comprovante(reservar, disparar, confere, atualizou) {
    return new Promise((resolve, reject) => {
      let area = jogo("#toast-area");
      if (!area) return reject(new Error("Área de comprovantes da loja indisponível."));
      let recebido = false;
      const lerAviso = no => {
        if (no.matches?.(".toast.good") && confere(no.textContent.trim())) recebido = true;
      };
      const terminar = erro => {
        clearInterval(checagem);
        clearTimeout(prazo);
        observador.disconnect();
        if (erro) reject(erro);
        else resolve(recebido);
      };
      const observador = new MutationObserver(mudancas => {
        for (const mudanca of mudancas) {
          for (const no of mudanca.addedNodes) lerAviso(no);
        }
      });
      const checagem = setInterval(() => {
        try {
          const atual = jogo("#toast-area");
          if (atual && atual !== area) {
            observador.disconnect();
            area = atual;
            for (const no of area.children) lerAviso(no);
            observador.observe(area, { childList: true });
          }
          if (recebido && loja() && atualizou()) terminar();
        } catch { /* A loja pode estar sendo redesenhada. */ }
      }, 100);
      const prazo = setTimeout(() => {
        const erro = new Error(recebido ? "Operação confirmada. Aguardando a atualização do estoque."
          : "Operação sem comprovante. Aguardando antes de conferir o estoque novamente.");
        terminar(erro);
      }, PRAZO_COMPROVANTE);
      observador.observe(area, { childList: true });
      try {
        reservar();
        const enviada = disparar();
        if (enviada === null) terminar(); // Operação adiada antes de ser enviada.
        else if (!enviada) terminar(new Error("A confirmação da loja divergiu dos itens ou valores esperados."));
      } catch (erro) { terminar(erro); }
    });
  }

  async function comprar(regra, reserva, reservar) {
    abaLoja("shop");
    const item = produtoPorId(regra.id);
    if (!item || item.tipo !== regra.tipo) throw new Error("O produto escolhido não aparece mais na loja.");
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
    const concluida = await comprovante(reservar, () => {
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
    () => produtoPorId(item.id)?.estoque > item.estoque);
    return aviso ?? (concluida ? `Comprou ${pedido}` : undefined);
  }

  async function vender(modo, reservar) {
    abaLoja("loot");
    const permitido = item => item && lootPermitido(item.chave, modo, item.preco);
    const alvo = new Map();
    const disponiveis = pilhas();
    for (const item of disponiveis) {
      if (permitido(item)) alvo.set(item.chave, item.caixa.dataset.lootSelect);
    }
    if (!alvo.size) {
      if (!disponiveis.length) return loja().querySelector(seletorLoot)
        ? "Não foi possível validar os dados das pilhas de loot da Loja NPC. Aguardando nova leitura."
        : "Nenhum loot vendável encontrado nos controles da Loja NPC.";
      const bloqueados = disponiveis.filter(item => regrasLoot.get(item.chave) === "proteger").length;
      const caros = disponiveis.filter(item => item.preco >= LIMITE_LOOT && regrasLoot.get(item.chave) !== "vender-acima-do-limite").length;
      return `Loot conferido: ${bloqueados} tipos bloqueados, ${caros} a partir de 10.000 sem autorização${modo === "marcados" ? "; demais itens exigem marcação individual" : ""}.`;
    }

    const limpar = () => loja()?.querySelector("[data-clear-loot-selection]:not(:disabled)");
    const marcadas = () => loja().querySelectorAll(`${seletorLoot}:checked`);
    limpar()?.click();
    if (!loja() || modal() || limpar() || marcadas().length) {
      throw new Error("Não foi possível limpar a seleção de loot antes da venda.");
    }

    const inicio = interacoes;
    try {
      // A loja pode recriar os controles após cada clique.
      for (const [chave, id] of alvo) {
        const caixa = loja()?.querySelector(`.loot-ledger-row [data-loot-select="${CSS.escape(id)}"]`);
        const item = caixa && pilha(caixa);
        if (item?.chave === chave) caixa.click();
      }
      const itens = Array.from(marcadas(), pilha);
      if (itens.length !== alvo.size || !itens.every(item => permitido(item) && alvo.has(item.chave)) ||
          new Set(itens.map(item => item.chave)).size !== alvo.size) {
        throw new Error("A seleção da loja mudou antes da venda.");
      }
      const total = itens.reduce((soma, item) => soma + item.qtd * item.preco, 0);
      const quantidade = itens.reduce((soma, item) => soma + item.qtd, 0);
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(quantidade)) throw new Error("Total da venda inválido.");
      const estoqueAntes = new Map(itens.map(item => [item.chave, item.estoque]));
      const botao = loja().querySelector("[data-bulk-sell-loot]:not(:disabled)");
      const concluida = await comprovante(reservar, () => {
        if (!botao || modal()) return false;
        botao.click();
        const dialogo = modal();
        if (!dialogo) return confirmacaoOculta("loot");
        return confirmar(dialogo, "Confirmar venda de loot", "Vender", dialogo => {
          const revisao = [...dialogo.querySelectorAll(".ui-confirm__items strong")].map(no => no.textContent.trim()).sort();
          const esperado = itens.map(item => `${item.nome} ×${formatar(item.qtd)}`).sort();
          return revisao.length === esperado.length && revisao.every((nome, i) => nome === esperado[i]) &&
            [...dialogo.querySelectorAll(".ui-confirm__details dd")].at(-1)?.textContent.trim() === `$ ${formatar(total)}`;
        });
      }, mensagem => mensagem === `${formatar(quantidade)} itens vendidos por ${formatar(total)} Pokédollars.`,
      () => !pilhas().some(atual => atual.estoque >= (estoqueAntes.get(atual.chave) ?? Infinity)));
      if (concluida) return `Vendeu ${formatar(quantidade)} loots por ${formatar(total)} Pokédollars`;
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
    if (!(qualidade > 0 && qualidade < QUALIDADE_LENDARIA)) return null;
    const iv = numero(texto(linha, ".pokemon-iv-total").match(/^(\d+)\/192$/)?.[1]);
    if (!inteiro(iv, 6, 192)) return null;
    const exigeAmbos = filtro.condicao !== "ou";
    const atendeQualidade = filtro.qualidade === null ? exigeAmbos : qualidade < filtro.qualidade;
    const atendeIv = filtro.iv === null ? exigeAmbos : iv < filtro.iv;
    if (!(exigeAmbos ? atendeQualidade && atendeIv : atendeQualidade || atendeIv)) return null;
    const preco = numero(texto(linha, ".pokemon-sale-price strong").match(/^\$\s*([\d.]+)$/)?.[1]);
    if (!inteiro(preco, 1, Number.MAX_SAFE_INTEGER)) return null;
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

  async function venderPokemon(filtro, continua, reservar) {
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
      if (limpar() || caixas().length) return "Venda de Pokémon aguardando a limpeza da seleção manual";
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
      const concluida = await comprovante(reservar, () => {
        if (!continuaVenda()) return null;
        const semDialogo = confirmacaoOculta("pokemon");
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
      if (concluida) return `Vendeu ${quantidade} Pokémon por ${formatar(preco)} Pokédollars`;
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

  function jogoDisponivel() {
    return navigator.onLine && jogo("#game-shell:not([inert])") &&
      !jogo("#connection-screen:not([hidden]), #starter-overlay:not([hidden]), #hunt-map-overlay:not([hidden]), body.pvp-mode");
  }

  function atualizarIndicador(aguardando = false) {
    const ativo = Boolean(sessao);
    const estado = campo("estado");
    estado.toggleAttribute("data-ativa", ativo);
    estado.toggleAttribute("data-aguardando", ativo && aguardando);
    escrever(estado, !ativo ? "Offline" : aguardando ? "Aguardando" : "Ativa");
  }

  function lerSessao() {
    try {
      const salva = JSON.parse(sessionStorage.getItem(chaveSessao));
      if (!salva || typeof salva.treinador !== "string" || !salva.treinador ||
          !Array.isArray(salva.compras) || salva.compras.length > tiposCompra.length ||
          !["", "baratos", "marcados"].includes(salva.modoVenda) ||
          !inteiro(salva.reserva, 0, 999_999_999)) return null;
      const compras = salva.compras.map(regra => {
        if (regra?.tipo !== undefined || typeof regra?.id !== "string") return regra;
        // Sessões antigas só compravam bolas e poções.
        return { ...regra, tipo: regra.id.startsWith("ball:") ? "bola" : "pocao" };
      });
      if (!compras.length && !salva.modoVenda && !salva.filtroPokemon) return null;
      if (!compras.every(compraValida) || new Set(compras.map(regra => regra.tipo)).size !== compras.length ||
          new Set(compras.map(regra => regra.id)).size !== compras.length ||
          (salva.filtroPokemon && !filtroPokemonValido(salva.filtroPokemon))) return null;
      return { ...salva, compras };
    } catch { return null; }
  }

  function definirSessao(configuracao) {
    sessao = configuracao && { ...configuracao, proximas: new Map(), avisos: new Map() };
    raiz.dataset.multipokeTreinadorReposicaoAtiva = sessao?.compras.length ? sessao.treinador : "";
    for (const tipo of tiposCompra) {
      const regra = sessao?.compras.find(regra => regra.tipo === tipo);
      raiz.setAttribute(`data-multipoke-${tipo}-reposicao-ativa`, regra?.id ?? "");
    }
    try {
      if (configuracao) sessionStorage.setItem(chaveSessao, JSON.stringify(configuracao));
      else sessionStorage.removeItem(chaveSessao);
    } catch { /* A configuração permanece ativa nesta página. */ }
    atualizarIndicador();
    campo("alternar").textContent = sessao ? "Pausar loja" : "Iniciar loja";
    campo("config").disabled = Boolean(sessao) || ocupada;
  }

  function pausar(mensagem) {
    definirSessao(null);
    informar(mensagem);
  }

  function aguardar(mensagem) {
    atualizarIndicador(true);
    informar(mensagem);
  }

  const chavePrazo = (atual, operacao) => `multipoke.auto-loja.prazo.${JSON.stringify([atual.treinador, operacao])}`;

  function lerPrazo(chave) {
    let salvo;
    try { salvo = Number(localStorage.getItem(chave)); } catch { /* Consulta a cópia desta página. */ }
    return Math.max(prazosTemporarios.get(chave) ?? 0, Number.isSafeInteger(salvo) ? salvo : 0);
  }

  function salvarPrazo(chave, prazo) {
    prazosTemporarios.set(chave, prazo);
    try { localStorage.setItem(chave, String(prazo)); } catch { /* O prazo continua valendo nesta página. */ }
  }

  async function operar(atual, operacao, rotulo, intervalo, executar) {
    const agora = Date.now();
    const chave = chavePrazo(atual, operacao);
    if (agora < (atual.proximas.get(operacao) ?? 0) || agora < lerPrazo(chave)) return;
    let reservou = false;
    try {
      const aviso = await executar(() => {
        salvarPrazo(chave, Date.now() + PRAZO_COMPROVANTE + ESPERA_OPERACAO_INCERTA);
        reservou = true;
      });
      atual.avisos.delete(operacao);
      if (reservou) salvarPrazo(chave, agora + intervalo);
      if (aviso) atual.avisos.set(operacao, aviso);
    } catch (erro) {
      atual.avisos.set(operacao, `${rotulo} · ${erro?.message || "Aguardando nova tentativa."}`);
    } finally {
      atual.proximas.set(operacao, agora + intervalo);
    }
  }

  async function ciclo() {
    const atual = sessao;
    if (!atual || ocupada) return;
    if (document.hidden) return aguardar("Aguardando a aba do jogo voltar a ficar visível.");
    const nome = treinador();
    if (!nome || !jogoDisponivel()) return aguardar("Aguardando o jogo e o treinador voltarem a ficar disponíveis.");
    if (nome !== atual.treinador) return pausar("Treinador mudou. Confira as regras antes de retomar.");
    sincronizarTreinador(nome);
    if (trocaHunts.emTroca()) return aguardar("Aguardando a conclusão da troca de hunt.");
    if (modal() || jogo("#drawer.open")) return aguardar("Aguardando o fechamento do menu ou da janela do jogo.");
    const foco = interfaceLoja.activeElement ?? document.activeElement;
    if (foco?.matches("input, textarea, select, [contenteditable='true']")) {
      return aguardar("Aguardando o término da interação com o jogo.");
    }
    if (performance.now() - ultimaInteracao < 1500) return;
    const inicio = interacoes;
    const continua = () => sessao === atual && treinador() === atual.treinador &&
      inicio === interacoes && !document.hidden && jogoDisponivel();
    const emCacada = cacada();
    const revive = atual.compras.find(regra => regra.tipo === "revive");
    const compras = emCacada ? atual.compras : revive ? [revive] : [];
    const modoVenda = emCacada && atual.modoVenda;
    const podeVenderPokemon = atual.filtroPokemon && (emCacada || huntAtiva());
    if (!compras.length && !modoVenda && !podeVenderPokemon) return aguardar("Aguardando uma caçada compatível com as operações escolhidas.");
    if (modoVenda && !catalogo && Date.now() >= proximaConsultaCatalogo) {
      void carregarCatalogo().then(mostrarCatalogo).catch(() => {});
    }
    atualizarIndicador();
    const agora = Date.now();
    const devida = operacao => agora >= (atual.proximas.get(operacao) ?? 0) &&
      agora >= lerPrazo(chavePrazo(atual, operacao));
    const comprasDevidas = compras.filter(regra => devida(regra.id));
    const lootDevido = modoVenda && devida("loot");
    const pokemonDevido = podeVenderPokemon && devida("pokemon");
    const precisaAbrirLoja = comprasDevidas.length || lootDevido || pokemonDevido;
    if (!precisaAbrirLoja) {
      if (modoVenda && !catalogo) informar("Aguardando o catálogo de loot.");
      return;
    }
    ocupada = true;
    try {
      await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, async lock => {
        if (!lock || !continua() || modal() || jogo("#drawer.open")) return;
        await comLoja(false, async () => {
          for (const regra of comprasDevidas) {
            if (!continua() || !loja() || modal()) return;
            if (regra.tipo !== "revive" && !cacada()) continue;
            const rotulo = `Reposição de ${rotulosCompra[regra.tipo]}`;
            await operar(atual, regra.id, rotulo, INTERVALO_ESTOQUE, reservar => comprar(regra, atual.reserva, reservar));
          }
          if (lootDevido && continua() && cacada() && loja() && !modal()) {
            await operar(atual, "loot", "Venda de loot", INTERVALO_VENDA, reservar => vender(modoVenda, reservar));
          }
          if (pokemonDevido && continua() && huntAtiva() && loja() && !modal()) {
            await operar(atual, "pokemon", "Venda de Pokémon", INTERVALO_VENDA,
              reservar => venderPokemon(atual.filtroPokemon, continua, reservar));
          }
          if (lojaVisivel() && continua() && loja() && !modal()) {
            mostrarEstoque();
            estoqueLido = true;
          }
        });
      });
      if (sessao === atual) informar([...atual.avisos.values()].join(" · ") ||
        (modoVenda && !catalogo ? "Aguardando o catálogo de loot." : "Aguardando reposição ou itens elegíveis para venda."));
    } catch (erro) {
      if (sessao === atual) aguardar(`Aguardando a loja ficar disponível. ${erro?.message || ""}`.trim());
    } finally {
      ocupada = false;
      campo("config").disabled = Boolean(sessao);
    }
  }

  function sincronizarTreinador(nome) {
    if (treinadorConfigurado !== nome) {
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
      const config = sessao?.treinador === nome ? sessao : null;
      campo("vender-pokemon").checked = Boolean(config?.filtroPokemon);
      campo("modo-venda").value = config?.modoVenda ?? "";
      if (config) {
        for (const { tipo, id, minimo, qtd } of config.compras) {
          escolhasCompra.set(tipo, id);
          campo(`${tipo}-min`).value = minimo;
          campo(`${tipo}-qtd`).value = qtd;
        }
        publicarReposicao();
        campo("reserva").value = config.reserva;
        if (config.filtroPokemon) {
          campo("pokemon-qualidade").value = String(config.filtroPokemon.qualidade ?? "").replace(".", ",");
          campo("pokemon-iv").value = config.filtroPokemon.iv ?? "";
          campo("pokemon-condicao").value = config.filtroPokemon.condicao;
        }
      }
      if (catalogo) mostrarCatalogo();
    }
  }

  async function atualizarEstoque() {
    if (!lojaVisivel() || ocupada || trocaHunts.emTroca() || document.hidden || !jogoDisponivel()) return;
    const nome = treinador();
    if (!nome) return;
    sincronizarTreinador(nome);
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
    if (!campo("aba-loja").hidden) void atualizarEstoque();
    else if (!campo("aba-tierlist").hidden && campo("painel").open) void atualizarTierlist();
    else if (!campo("aba-pokedex").hidden && campo("painel").open) void atualizarPokedex();
    else void atualizarAnalise();
  });
  for (const id of camposCompra) {
    const controle = campo(id);
    const seletor = controle.matches("select");
    controle.addEventListener(seletor ? "change" : "input", () => {
      if (!treinadorConfigurado || treinador() !== treinadorConfigurado) return;
      if (seletor) escolhasCompra.set(id, controle.value);
      else if (!controle.value || !controle.validity.valid) return;
      if (seletor) publicarReposicao();
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
    if (sessao) return pausar("Loja pausada.");
    if (ocupada) return;
    if (!estoqueLido || treinador() !== treinadorConfigurado) return informar("Aguarde a leitura automática do estoque.");
    const compras = tiposCompra.map(tipo => ({
      tipo,
      id: escolhasCompra.get(tipo) ?? campo(tipo).value,
      minimo: campo(`${tipo}-min`).valueAsNumber,
      qtd: campo(`${tipo}-qtd`).valueAsNumber,
    })).filter(regra => regra.id);
    const modoVenda = campo("modo-venda").value;
    if (modoVenda === "marcados" && ![...regrasLoot].some(([chave, regra]) => catalogo?.has(chave) ? lootPermitido(chave, modoVenda)
      : regra === "vender" || regra === "vender-acima-do-limite")) {
      return informar("Marque os itens de loot que quer vender.");
    }
    let filtroPokemon = null;
    if (campo("vender-pokemon").checked) {
      const entradaQualidade = campo("pokemon-qualidade").value.trim();
      const qualidade = entradaQualidade ? Number(entradaQualidade.replace(",", ".")) : null;
      const entradaIv = campo("pokemon-iv");
      const iv = entradaIv.value ? entradaIv.valueAsNumber : null;
      filtroPokemon = { qualidade, iv, condicao: campo("pokemon-condicao").value };
      if (entradaIv.validity.badInput || (entradaQualidade && !/^\d(?:[.,]\d{1,2})?$/.test(entradaQualidade)) ||
          !filtroPokemonValido(filtroPokemon)) {
        return informar("Preencha pelo menos um limite válido para Pokémon. Qualidade até 1,70 ou IV de 6 a 193.");
      }
    }
    if (!compras.length && !modoVenda && !filtroPokemon) return informar("Escolha uma reposição ou um modo de venda.");
    const reserva = campo("reserva").valueAsNumber;
    if ((compras.length && !inteiro(reserva, 0, 999_999_999)) ||
        !compras.every(compraValida)) {
      return informar("Confira os produtos, o estoque mínimo, a quantidade e a reserva.");
    }
    definirSessao({ treinador: treinadorConfigurado, compras, modoVenda, filtroPokemon, reserva: compras.length ? reserva : 0 });
    informar("Loja ativa. Reposição a cada 5 segundos e vendas a cada 30 segundos.");
    void ciclo();
  });

  const tentar = () => { if (sessao) void ciclo(); else void atualizarEstoque(); };
  const salva = lerSessao();
  if (salva) {
    definirSessao(salva);
    aguardar("Retomando a loja nesta aba.");
    tentar();
  }
  setInterval(tentar, INTERVALO_ESTOQUE);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tentar(); });
  window.addEventListener("online", tentar);
  window.addEventListener("pageshow", tentar);
})();
