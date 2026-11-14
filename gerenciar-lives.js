const gerenciadorLives = (() => {
  const ALARME = "multipoke-lives";
  const INTERVALO_RETOMADA = 30_000;
  const PRAZO_BONUS = 120_000;
  const INTERVALO_CANAL = 300_000;
  const RETOMAVEIS = ["ready", "paused", "blocked"];
  const FALHAS = [...RETOMAVEIS, "loading", "validating", "error"];
  let fila = Promise.resolve();
  const serializar = executar => {
    const pedido = fila.catch(() => {}).then(executar);
    fila = pedido.catch(() => {});
    return pedido;
  };
  const chave = privado => privado ? "privado" : "normal";
  const ler = async privado => await transacaoHunts(["lives"], "readonly", transacao =>
    pedidoHunts(transacao.objectStore("lives").get(chave(privado)))) ??
    { chave: chave(privado), ativa: false, status: "Automação de lives desligada." };
  const salvar = estado => transacaoHunts(["lives"], "readwrite", transacao =>
    pedidoHunts(transacao.objectStore("lives").put(estado)));
  const jogo = aba => /^https:\/\/multipoke\.io\/jogar\/?(?:[?#].*)?$/.test(aba?.pendingUrl || aba?.url || "");
  const armarInicio = (estado, recuperacao = false) => {
    estado.ciclo = crypto.randomUUID();
    estado.inicioEm = Date.now();
    estado.documento = null;
    estado.iniciar = true;
    estado.pausaManual = false;
    estado.apresentada = false;
    estado.tentativas = 0;
    estado.retomadaPendente = false;
    if (recuperacao) estado.ultimaRecuperacao = Date.now();
    else { estado.ultimaRecuperacao = 0; estado.falhaEm = null; }
  };

  async function lerEstadoSala(aba) {
    const [leitura] = await chrome.scripting.executeScript({ target: { tabId: aba.id, frameIds: [0] },
      func: () => ({ estado: document.querySelector("[data-watch-status]")?.dataset.state ?? "",
        manualEm: Number(document.documentElement.dataset.multipokeLivePausaManual ?? 0) }) }).catch(() => []);
    return leitura;
  }

  function registrarReproducao(estado, leitura, dados = {}) {
    const agora = Date.now();
    const reproducao = leitura.result.estado;
    if (!/^[a-z-]{1,30}$/.test(reproducao)) return;
    if (estado.documento && estado.documento !== leitura.documentId) armarInicio(estado);
    estado.documento = leitura.documentId;
    const anterior = estado.reproducao;
    estado.reproducao = reproducao;
    if (descricoes[reproducao]) estado.status = descricoes[reproducao];
    const manual = dados.manual === true && (dados.ciclo === estado.ciclo ||
      Number.isSafeInteger(dados.manualEm) && dados.manualEm >= estado.inicioEm);
    if (manual || Number.isSafeInteger(leitura.result.manualEm) && leitura.result.manualEm >= estado.inicioEm) {
      estado.pausaManual = true; estado.iniciar = false;
    }
    if (["active", "validating"].includes(reproducao) && !manual && !leitura.result.manualEm) estado.pausaManual = false;
    if (dados.ciclo === estado.ciclo && Number.isSafeInteger(dados.tentativas) && dados.tentativas >= 0 && dados.tentativas <= 2) {
      estado.tentativas = Math.max(estado.tentativas ?? 0, dados.tentativas);
    }
    if (["active", "guest-playing"].includes(reproducao)) {
      estado.iniciar = false; estado.falhaEm = null; estado.retomadaPendente = false;
    } else if (reproducao === "validating") estado.iniciar = false;
    if (estado.pausaManual || !FALHAS.includes(reproducao)) estado.falhaEm = null;
    else estado.falhaEm ??= agora;
    if (reproducao === "paused" && ["active", "validating"].includes(anterior)) estado.retomadaPendente = true;
    if ((estado.tentativas ?? 0) >= 2 || agora - (estado.inicioEm ?? 0) >= 60_000) estado.iniciar = false;
    if (!estado.pausaManual && estado.canal?.startsWith("twitch:") && RETOMAVEIS.includes(reproducao) && !estado.iniciar &&
        agora - (estado.ultimaRecuperacao ?? 0) >= INTERVALO_RETOMADA &&
        (estado.retomadaPendente || agora - (estado.inicioEm ?? 0) >= INTERVALO_RETOMADA)) {
      armarInicio(estado, true);
      estado.documento = leitura.documentId;
    }
    if (estado.pausaManual) estado.status = "Transmissão pausada por você. A retomada automática está suspensa nesta sala.";
    if (anterior !== reproducao && ["ended", "offline"].includes(reproducao)) {
      estado.descartados = { ...estado.descartados, [estado.canal]: agora + INTERVALO_CANAL };
    }
  }

  const falhaPersistente = estado => !estado.pausaManual && estado.canal?.startsWith("twitch:") &&
    FALHAS.includes(estado.reproducao) && Number.isFinite(estado.falhaEm) && Date.now() - estado.falhaEm >= PRAZO_BONUS;

  function sala(aba) {
    try {
      const url = new URL(aba?.pendingUrl || aba?.url);
      const canal = url.searchParams.get("channel");
      const plataforma = url.searchParams.get("provider") ?? "twitch";
      if (url.origin !== "https://multipoke.io" || url.pathname !== "/live-watch.html" ||
          url.searchParams.getAll("channel").length !== 1 || url.searchParams.getAll("provider").length > 1 ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(canal ?? "") || !["twitch", "kick"].includes(plataforma)) return;
      return { canal, plataforma, chave: `${plataforma}:${canal}` };
    } catch { return; }
  }

  async function garantirAlarme() {
    const ativas = (await Promise.all([ler(false), ler(true)])).some(estado => estado.ativa);
    if (ativas && !await chrome.alarms.get(ALARME)) await chrome.alarms.create(ALARME, { periodInMinutes: 1 });
    else if (!ativas) await chrome.alarms.clear(ALARME);
  }

  // Consulta somente o catálogo que o próprio jogo apresenta. O player oficial
  // continua responsável por reprodução, vínculo e validação do bônus.
  async function consultarCatalogo() {
    if (location.origin !== "https://multipoke.io" || !/^\/jogar\/?$/.test(location.pathname)) return null;
    const resposta = await fetch("/api/live", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!Array.isArray(dados.channels) || dados.stale === true) return null;
    return dados.channels.filter(item => item?.available !== false).map(item => {
      const canal = String(item.channelId ?? item.providerUserId ?? "");
      const plataforma = item.provider ?? "twitch";
      return { canal, plataforma, nome: String(item.displayName || item.login || canal).slice(0, 120) };
    }).filter(item => /^[A-Za-z0-9_-]{1,100}$/.test(item.canal) && ["twitch", "kick", "tiktok"].includes(item.plataforma));
  }

  const descricoes = {
    ready: "Live aberta. Inicie a transmissão na janela oficial se o navegador solicitar.",
    validating: "Vídeo em reprodução. O jogo está conferindo o bônus.",
    active: "O player oficial confirmou o bônus de XP.",
    paused: "Transmissão pausada. Retome na janela da live para continuar assistindo.",
    blocked: "Reprodução bloqueada pelo navegador. Clique em Iniciar transmissão na janela da live.",
    narrow: "Aumente a janela da live para permitir a reprodução.",
    error: "O player informou uma falha. Confira a janela da live.",
    unsupported: "A janela Kick já aberta exige a atividade manual indicada pelo jogo para o bônus.",
    "guest-ready": "Conecte sua Twitch na janela oficial para receber o bônus.",
    "guest-playing": "Vídeo aberto sem bônus. Conecte sua Twitch na janela oficial.",
    "guest-paused": "Conecte sua Twitch e retome a transmissão na janela oficial.",
  };

  async function instalarMonitor(aba) {
    if (!sala(aba)) return;
    await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["observar-live.js"] }).catch(() => {});
  }

  async function apresentarSala(estado, aba) {
    const atual = await chrome.tabs.get(aba.id).catch(() => null);
    if (atual?.id !== estado.abaLive || sala(atual)?.chave !== estado.canal) return;
    const janela = await chrome.windows.get(atual.windowId);
    if (estado.apresentada && (janela.state !== "minimized" || !estado.iniciar || estado.pausaManual)) return;
    // Restaura antes de pedir foco: uma sala oculta pode impedir o início do player.
    if (janela.state === "minimized") await chrome.windows.update(janela.id, { state: "normal" });
    if (!atual.active) await chrome.tabs.update(atual.id, { active: true });
    if (!janela.focused || janela.state === "minimized") await chrome.windows.update(janela.id, { focused: true });
    estado.apresentada = true;
  }

  async function reconciliar(privado, forcar = false) {
    const estado = await ler(privado);
    if (!estado.ativa) return estado;
    const anterior = estado.abaLive ? await chrome.tabs.get(estado.abaLive).catch(() => null) : null;
    const perdeuJanela = Boolean(estado.abaLive) && !sala(anterior);
    const consultarAgora = forcar || !estado.ciclo || perdeuJanela || estado.aguardaJogo || Date.now() - (estado.consulta ?? 0) >= 60_000;
    const abas = (await chrome.tabs.query({ url: "https://multipoke.io/*" })).filter(aba => Boolean(aba.incognito) === privado);
    const jogos = abas.filter(jogo);
    const origem = jogos.find(aba => aba.id === estado.abaJogo) ?? jogos[0];
    if (!origem) {
      estado.aguardaJogo = true;
      estado.status = "Abra o jogo para retomar a seleção automática de lives.";
      await salvar(estado); return estado;
    }
    estado.aguardaJogo = false;
    estado.abaJogo = origem.id;
    const salas = abas.filter(aba => sala(aba));
    let atual = salas.find(aba => aba.id === estado.abaLive);
    if (!atual) {
      atual = salas[0];
      estado.abaLive = atual?.id ?? null;
      estado.canal = atual ? sala(atual).chave : null;
      estado.reproducao = "";
      armarInicio(estado);
    }
    if (atual && estado.canal !== sala(atual).chave) {
      estado.canal = sala(atual).chave; estado.reproducao = ""; armarInicio(estado);
    }
    if (!estado.ciclo) armarInicio(estado);
    const reproducaoAnterior = estado.reproducao;
    if (atual) {
      const leitura = await lerEstadoSala(atual);
      if (leitura?.result?.estado) registrarReproducao(estado, leitura);
      await apresentarSala(estado, atual);
      await salvar(estado);
      await instalarMonitor(atual);
    }
    const terminou = ["ended", "offline"].includes(estado.reproducao);
    const falhou = falhaPersistente(estado);
    if (!consultarAgora && atual && !(terminou && reproducaoAnterior !== estado.reproducao)) return estado;
    estado.consulta = Date.now();
    let canais;
    try {
      const [resultado] = await chrome.scripting.executeScript({ target: { tabId: origem.id }, func: consultarCatalogo });
      canais = resultado?.result;
    } catch { canais = null; }
    if (!Array.isArray(canais)) {
      estado.status = "Não foi possível confirmar as lives ao vivo. Aguardando nova consulta e mantendo o canal atual.";
      await salvar(estado); return estado;
    }
    const descartados = Object.fromEntries(Object.entries(estado.descartados ?? {}).filter(([, prazo]) => prazo > Date.now()));
    estado.descartados = descartados;
    const dadosAtual = sala(atual);
    if (falhou) descartados[estado.canal] = Date.now() + INTERVALO_CANAL;
    const disponivel = dados => dados && canais.some(item => `${item.plataforma}:${item.canal}` === dados.chave);
    if (atual && disponivel(dadosAtual) && !terminou && !falhou) {
      estado.abaLive = atual.id;
      estado.canal = dadosAtual.chave;
      estado.status = estado.pausaManual ? "Transmissão pausada por você. A retomada automática está suspensa nesta sala."
        : dadosAtual.plataforma === "kick" ? descricoes.unsupported
        : descricoes[estado.reproducao] || "Uma janela MultiPoke TV já está aberta. Nenhuma outra será criada.";
      await salvar(estado);
      return estado;
    }
    const elegiveis = canais.filter(item => item.plataforma === "twitch" && !descartados[`twitch:${item.canal}`]);
    const candidatas = salas.filter(aba => aba.id !== atual?.id && elegiveis.some(item => sala(aba)?.chave === `twitch:${item.canal}`));
    const leituras = await Promise.all(candidatas.map(async aba => ({ aba, leitura: await lerEstadoSala(aba) })));
    const prioridade = { active: 4, validating: 3, ready: 2, paused: 1, blocked: 1 };
    const outra = leituras.filter(item => !item.leitura?.result?.manualEm &&
      (falhou ? prioridade[item.leitura?.result?.estado] : !["ended", "offline"].includes(item.leitura?.result?.estado)))
      .sort((a, b) => (prioridade[b.leitura?.result?.estado] ?? 0) - (prioridade[a.leitura?.result?.estado] ?? 0))[0]?.aba;
    if (outra) {
      estado.abaLive = outra.id;
      estado.canal = sala(outra).chave;
      estado.reproducao = "";
      armarInicio(estado);
      estado.status = falhou ? "Trocando para outra sala já aberta após falha persistente do bônus."
        : "Reaproveitando outra janela MultiPoke TV já aberta.";
      await apresentarSala(estado, outra);
      await salvar(estado);
      if (atual) {
        const antiga = await chrome.tabs.get(atual.id).catch(() => null);
        if (sala(antiga)?.chave === dadosAtual?.chave) await chrome.tabs.remove(atual.id).catch(() => {});
      }
      await instalarMonitor(outra);
      return estado;
    }
    // Uma sala não adotada (por exemplo, pausada manualmente) não deve ser duplicada.
    const proximo = elegiveis.find(item => !candidatas.some(aba => sala(aba)?.chave === `twitch:${item.canal}`));
    if (!proximo) {
      estado.status = falhou ? "O bônus não foi confirmado. Sem outro canal elegível; mantendo a sala e as tentativas de retomada."
        : "Nenhuma live Twitch elegível disponível. Aguardando uma nova transmissão.";
      await salvar(estado); return estado;
    }
    const url = `https://multipoke.io/live-watch.html?channel=${encodeURIComponent(proximo.canal)}`;
    // Confere novamente antes de abrir: a navegação de outra janela pode ter
    // ocorrido durante a consulta. Nunca fecha uma aba que saiu da sala oficial.
    const recentes = (await chrome.tabs.query({ url: "https://multipoke.io/live-watch.html*" }))
      .filter(aba => Boolean(aba.incognito) === privado && sala(aba));
    const preservada = recentes.find(aba => aba.id === atual?.id) ?? recentes[0];
    if (!atual && preservada) {
      estado.abaLive = preservada.id;
      estado.canal = sala(preservada).chave;
      estado.reproducao = "";
      armarInicio(estado);
      estado.consulta = 0;
      await salvar(estado);
      return reconciliar(privado, true);
    }
    if (atual && (!preservada || preservada.id !== atual.id || sala(preservada)?.chave !== dadosAtual?.chave)) {
      estado.abaLive = null; estado.consulta = 0;
      await salvar(estado); return estado;
    }
    let aba;
    if (preservada) {
      aba = await chrome.tabs.update(preservada.id, { url });
    } else {
      const janela = await chrome.windows.create({ url, type: "popup", width: 960, height: 760,
        state: "normal", focused: true, incognito: privado });
      aba = janela.tabs?.[0];
      if (!aba) aba = (await chrome.tabs.query({ windowId: janela.id }))[0];
    }
    estado.abaLive = aba.id;
    estado.canal = `twitch:${proximo.canal}`;
    estado.reproducao = "loading";
    armarInicio(estado);
    estado.status = `Abrindo ${proximo.nome} no player oficial. Aguardando reprodução real.`;
    await apresentarSala(estado, aba);
    await salvar(estado);
    await instalarMonitor(aba);
    return estado;
  }

  const publico = estado => ({ ativa: estado.ativa, status: estado.status });
  async function mensagem(dados, remetente) {
    const aba = remetente.tab;
    const privado = Boolean(aba.incognito);
    if (dados.acao === "estado" && sala(aba)) {
      const estado = await ler(privado);
      if (!estado.ativa || estado.abaLive !== aba.id || estado.canal !== sala(aba).chave) return { iniciar: false };
      const atual = await chrome.tabs.get(aba.id).catch(() => null);
      if (sala(atual)?.chave !== sala(aba).chave) return { iniciar: false };
      const leitura = await lerEstadoSala(atual);
      if (!leitura || (remetente.documentId && leitura.documentId !== remetente.documentId) || leitura.result.estado !== dados.estado) return { iniciar: false };
      const mudou = estado.reproducao !== dados.estado;
      registrarReproducao(estado, leitura, dados);
      const dentroPrazo = Date.now() - (estado.inicioEm ?? 0) < 60_000;
      const iniciar = estado.iniciar && !estado.pausaManual && dentroPrazo &&
        RETOMAVEIS.includes(estado.reproducao) && sala(aba).plataforma === "twitch";
      if (iniciar) {
        await apresentarSala(estado, atual);
        estado.status = estado.reproducao === "paused" ? "Restaurando a live pelo botão Retomar transmissão."
          : "Tentando iniciar a live pelo botão Iniciar transmissão.";
      }
      await salvar(estado);
      if (mudou && ["ended", "offline"].includes(estado.reproducao) ||
          falhaPersistente(estado) && Date.now() - (estado.consulta ?? 0) >= 60_000) {
        const depois = await reconciliar(privado, true);
        if (depois.abaLive !== aba.id || depois.canal !== estado.canal || depois.ciclo !== estado.ciclo) return { iniciar: false };
      }
      return { iniciar, ciclo: estado.ciclo };
    }
    if (!jogo(aba)) throw new Error("Abra o jogo para configurar as lives.");
    let estado = await ler(privado);
    if (dados.acao === "configurar") {
      if (typeof dados.ativa !== "boolean") throw new Error("Opção de lives inválida.");
      estado.ativa = dados.ativa;
      estado.abaJogo = aba.id;
      estado.consulta = 0;
      if (estado.ativa) armarInicio(estado);
      else { estado.iniciar = false; estado.status = "Automação desligada. A janela da live permanece sob seu controle."; }
      await salvar(estado);
      await garantirAlarme();
      if (estado.ativa) estado = await reconciliar(privado, true);
    } else if (dados.acao === "consultar") {
      await garantirAlarme();
      if (estado.ativa) estado = await reconciliar(privado);
    } else throw new Error("Operação de lives desconhecida.");
    return publico(estado);
  }

  const verificar = (forcar = false) => serializar(async () => {
    await garantirAlarme();
    for (const privado of [false, true]) {
      try { await reconciliar(privado, forcar); }
      catch (erro) {
        const estado = await ler(privado);
        estado.status = `Aguardando nova tentativa de seleção da live. ${erro.message || ""}`.trim();
        await salvar(estado);
      }
    }
  });
  chrome.alarms.onAlarm.addListener(alarme => { if (alarme.name === ALARME) void verificar(); });
  chrome.runtime.onStartup.addListener(() => void verificar(true));
  chrome.runtime.onInstalled.addListener(() => void verificar(true));
  chrome.runtime.onMessage.addListener((dados, remetente, responder) => {
    if (dados?.tipo !== "multipoke:lives" || remetente.id !== chrome.runtime.id || !remetente.tab || remetente.frameId !== 0 ||
        (!jogo(remetente.tab) && !sala(remetente.tab))) return;
    serializar(() => mensagem(dados, remetente)).then(resultado => responder({ ok: true, resultado }),
      erro => responder({ ok: false, erro: erro.message }));
    return true;
  });
  void serializar(garantirAlarme);
  return { verificar };
})();
