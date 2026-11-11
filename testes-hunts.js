function criarTestesHunts(campo, { formatar, trocaHunts, historico, lerEstado, lerTotais, aoSolicitar }) {
  const DURACAO = 300;
  const ADAPTACAO = 60;
  const INTERVALO_LEITURA = 15_000;
  const botao = campo("hunt-testar");
  const repetir = campo("hunt-testar-repetir");
  let sessao;
  let ocupado = false;

  const informar = mensagem => {
    if (campo("hunt-teste-status").textContent !== mensagem) campo("hunt-teste-status").textContent = mensagem;
  };
  const formacao = estado => estado.equipe && JSON.stringify([estado.equipe.chave, estado.golpesAtivos]);
  const minutos = segundos => `${Math.floor(segundos / 60)}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
  const medicoesSalvas = quantidade => `${quantidade} ${quantidade === 1 ? "medição salva" : "medições salvas"}`;
  const quantidadeHunts = quantidade => `${quantidade} ${quantidade === 1 ? "hunt" : "hunts"}`;

  function podeMedir() {
    const foco = campo("painel").getRootNode().activeElement ?? document.activeElement;
    return document.hasFocus() && !document.hidden &&
      !foco?.matches("input, select, textarea, [contenteditable='true']") &&
      document.querySelector("#game-shell:not([inert])") &&
      !document.querySelector("dialog[open], #drawer.open, body.pvp-mode, #connection-screen:not([hidden]), " +
        "#starter-overlay:not([hidden]), #hunt-map-overlay:not([hidden]), #analyzer-insight:not([hidden])");
  }

  function encerrar(mensagem) {
    const atual = sessao;
    sessao = undefined;
    botao.textContent = "Iniciar testes nas hunts";
    repetir.disabled = false;
    if (atual?.reservou) trocaHunts.reservarTestes(false);
    atual?.liberar?.();
    informar(mensagem);
  }

  function suspenderJanela() {
    if (!sessao || sessao.pendente) return;
    sessao.base = null;
    informar("Teste aguardando a aba em foco e o jogo livre. A janela de cinco minutos será reiniciada.");
  }
  window.addEventListener("blur", suspenderJanela);
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspenderJanela(); });

  botao.addEventListener("click", () => {
    if (sessao) return encerrar(`Testes interrompidos. ${medicoesSalvas(sessao.resultados.length)}.`);
    if (trocaHunts.emTroca()) return informar("Aguarde a confirmação da troca de hunt antes de iniciar os testes.");
    const estado = lerEstado();
    if (!estado.equipe || !estado.contexto || !estado.cacada?.slug) {
      return informar("Entre em uma hunt regular e aguarde a leitura da equipe e dos golpes.");
    }
    const atual = {
      equipe: estado.equipe.chave, formacao: formacao(estado), origem: { slug: estado.cacada.slug, nome: estado.cacada.hunt },
      ultimaHunt: estado.cacada.slug,
      etapa: "preparar", resultados: [], ignoradas: 0, indice: 0, repetir: repetir.checked,
    };
    sessao = atual;
    repetir.disabled = true;
    botao.textContent = "Parar testes";
    campo("hunt-teste-resultados").replaceChildren();
    campo("hunt-teste-progresso").value = 0;
    informar("Preparando a lista de hunts e consultando as medições existentes...");
    void navigator.locks.request("multipoke-testes-hunts", { ifAvailable: true }, async lock => {
      if (sessao !== atual) return;
      if (!lock) return encerrar("Os controles de teste estão em uso em outra aba. Aguarde e tente novamente.");
      if (!trocaHunts.reservarTestes(true)) return encerrar("Aguarde a confirmação da troca de hunt antes de iniciar os testes.");
      atual.reservou = true;
      const fim = new Promise(resolve => { atual.liberar = resolve; });
      aoSolicitar();
      await fim;
    }).catch(() => { if (sessao === atual) encerrar("Não foi possível reservar os controles para os testes."); });
  });

  function confirmar(atual) {
    return sessao === atual && formacao(lerEstado()) === atual.formacao;
  }

  async function preparar(atual, estado) {
    const dados = await historico.ler(atual.equipe, estado.contexto);
    if (!confirmar(atual)) return;
    const hunts = await trocaHunts.listarParaTeste(() => confirmar(atual));
    if (!hunts || sessao !== atual) return informar("Aguardando o jogo livre e em foco para ler o menu Caçada.");
    if (!hunts.some(hunt => hunt.slug === atual.origem.slug)) {
      return encerrar("Inicie os testes a partir de uma hunt regular acessível no menu Caçada.");
    }
    const medidas = new Set(dados.rendimentos.map(item => item.area));
    atual.fila = [...new Map(hunts.map(hunt => [hunt.slug, hunt])).values()]
      .filter(hunt => atual.repetir || !medidas.has(hunt.slug))
      .sort((a, b) => Number(b.slug === estado.cacada.slug) - Number(a.slug === estado.cacada.slug) ||
        b.nivel - a.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
    atual.etapa = "viajar";
    campo("hunt-teste-progresso").max = Math.max(1, atual.fila.length);
    if (!atual.fila.length) encerrar("Todas as hunts acessíveis já têm medições para esta configuração. Marque a opção de repetir para testar novamente.");
    else informar(`${quantidadeHunts(atual.fila.length)} na fila · cinco minutos de coleta e até um minuto de adaptação por hunt.`);
  }

  async function viajar(atual, estado, retorno) {
    const alvo = retorno ? atual.origem : atual.fila[atual.indice];
    if (estado.cacada.slug === alvo.slug) {
      if (retorno) return concluir(atual);
      atual.alvo = alvo;
      atual.etapa = "medir";
      atual.proximaLeitura = 0;
      return;
    }
    const resultado = await trocaHunts.entrarParaTeste(alvo.slug, () => confirmar(atual));
    if (sessao !== atual) return;
    if (!resultado || resultado.estado === "intervalo") {
      return informar(`Aguardando a aba em foco, o time apto e o intervalo entre entradas para ${alvo.nome}.`);
    }
    if (resultado.estado === "indisponivel") {
      if (retorno) return concluir(atual, "A hunt de origem ficou indisponível para o retorno.");
      atual.ignoradas++;
      atual.indice++;
      campo("hunt-teste-progresso").value = atual.indice;
      return informar(`${alvo.nome} ficou indisponível. Seguindo para a próxima hunt.`);
    }
    atual.alvo = alvo;
    atual.entrada = { vence: Date.now() + 15_000, retorno };
    atual.etapa = "entrada";
    informar(`Entrando em ${alvo.nome}. Aguardando confirmação do jogo.`);
  }

  function confirmarEntrada(atual, estado) {
    if (estado.cacada.slug === atual.alvo.slug) {
      atual.ultimaHunt = estado.cacada.slug;
      if (atual.entrada.retorno) return concluir(atual);
      atual.etapa = "medir";
      atual.base = null;
      atual.proximaLeitura = 0;
    } else if (Date.now() >= atual.entrada.vence) {
      if (atual.entrada.retorno) return concluir(atual, "O jogo não confirmou o retorno à hunt de origem.");
      atual.ignoradas++;
      atual.indice++;
      atual.etapa = "viajar";
      informar(`Entrada em ${atual.alvo.nome} sem confirmação. Seguindo para a próxima hunt.`);
    }
  }

  function apresentarResultado(atual, medicao, variou) {
    const porHora = valor => Math.round(valor * 3600 / medicao.segundos);
    const resultado = {
      nome: medicao.hunt, xp: porHora(medicao.xp), drops: porHora(medicao.drops), abates: porHora(medicao.abates),
      ganhoXp: medicao.xp, ganhoDrops: medicao.drops, totalAbates: medicao.abates, segundos: medicao.segundos, variou,
    };
    atual.resultados.push(resultado);
    const fragmento = document.createDocumentFragment();
    for (const item of [...atual.resultados].sort((a, b) => b.xp - a.xp)) {
      const linha = document.createElement("div");
      linha.className = "hunt-resultado-teste";
      const titulo = document.createElement("strong");
      titulo.textContent = item.nome;
      const taxas = document.createElement("span");
      taxas.textContent = `${formatar(item.xp)} XP/h · ${formatar(item.drops)} Pokédollars/h em drops · ${formatar(item.abates)} abates/h`;
      const totais = document.createElement("small");
      totais.textContent = `Em ${minutos(item.segundos)} · +${formatar(item.ganhoXp)} XP · ${formatar(item.ganhoDrops)} em drops · ${formatar(item.totalAbates)} abates`;
      linha.append(titulo, taxas, totais);
      if (item.variou) {
        const nota = document.createElement("small");
        nota.textContent = "Níveis ou bônus variaram durante esta janela.";
        linha.append(nota);
      }
      fragmento.append(linha);
    }
    campo("hunt-teste-resultados").replaceChildren(fragmento);
  }

  async function salvar(atual) {
    const { medicao, variou } = atual.pendente;
    await historico.salvar(medicao);
    if (sessao !== atual) return;
    atual.pendente = null;
    apresentarResultado(atual, medicao, variou);
    atual.indice++;
    atual.base = null;
    atual.etapa = "viajar";
    campo("hunt-teste-progresso").value = atual.indice;
    informar(`${medicoesSalvas(atual.resultados.length)} de ${quantidadeHunts(atual.fila.length)}. Preparando a próxima área.`);
  }

  async function medir(atual, estado) {
    const cacada = estado.cacada;
    if (cacada.slug !== atual.alvo.slug) return encerrar("Testes interrompidos porque a hunt foi alterada fora da rodada.");
    if (atual.pendente) return salvar(atual);
    if (atual.base && (cacada.segundos < atual.base.segundos || cacada.abates < atual.base.abates)) atual.base = null;
    if (cacada.segundos < ADAPTACAO) {
      return informar(`${atual.alvo.nome} · adaptação de entrada · ${ADAPTACAO - cacada.segundos} s restantes.`);
    }
    const decorridos = atual.base ? cacada.segundos - atual.base.segundos : 0;
    informar(`${atual.indice + 1}/${atual.fila.length} · ${atual.alvo.nome} · coleta ${minutos(Math.min(DURACAO, decorridos))} / 5:00.`);
    if (Date.now() < (atual.proximaLeitura ?? 0)) return;
    await navigator.locks.request("multipoke-auto-loja", { ifAvailable: true }, async lock => {
      if (!lock || !confirmar(atual) || !podeMedir()) return;
      const leitura = lerEstado();
      if (leitura.cacada?.slug !== atual.alvo.slug || !Number.isSafeInteger(leitura.cacada.abates)) return;
      const totais = lerTotais();
      if (!totais) return informar("Aguardando os totais do Registro da Caçada para continuar o teste.");
      const amostra = { ...totais, segundos: leitura.cacada.segundos, abates: leitura.cacada.abates };
      const base = atual.base;
      atual.proximaLeitura = Date.now() + INTERVALO_LEITURA;
      if (!base || amostra.segundos - atual.ultimaLeitura > 45 || amostra.xp < base.xp ||
          amostra.drops < base.drops || amostra.abates < base.abates || amostra.segundos < base.segundos) {
        atual.base = { ...amostra, contexto: leitura.contexto, variou: false };
      }
      atual.ultimaLeitura = amostra.segundos;
      if (atual.base !== base || amostra.segundos - base.segundos < DURACAO) return;
      const variou = base.variou || base.contexto !== leitura.contexto;
      const contexto = variou ? JSON.stringify(["teste-variavel", base.contexto, leitura.contexto]) : base.contexto;
      atual.pendente = { variou, medicao: {
        equipe: atual.equipe, contexto, area: atual.alvo.slug, hunt: atual.alvo.nome,
        id: crypto.randomUUID(), data: Date.now(), legado: false, variouContexto: variou, segundos: amostra.segundos - base.segundos,
        abates: amostra.abates - base.abates, xp: amostra.xp - base.xp, drops: amostra.drops - base.drops,
      } };
      await salvar(atual);
    });
  }

  function concluir(atual, aviso = "") {
    const ignoradas = atual.ignoradas ? ` e ${quantidadeHunts(atual.ignoradas)} ${atual.ignoradas === 1 ? "ignorada" : "ignoradas"}` : "";
    const resumo = `Testes concluídos. ${medicoesSalvas(atual.resultados.length)}${ignoradas}.`;
    encerrar(`${resumo}${aviso ? ` ${aviso}` : ""}`);
  }

  async function atualizar(estado) {
    const atual = sessao;
    if (!atual?.reservou || ocupado) return;
    if (estado.equipe && formacao(estado) !== atual.formacao) return encerrar("Testes interrompidos porque o treinador, a equipe ou os golpes mudaram.");
    if (!estado.equipe || !estado.contexto || document.hidden || !document.hasFocus()) return suspenderJanela();
    if (!estado.cacada?.slug) return encerrar("Testes interrompidos ao sair da caçada regular.");
    if (atual.etapa !== "entrada" && estado.cacada.slug !== atual.ultimaHunt) {
      return encerrar("Testes interrompidos porque a hunt foi alterada fora da rodada.");
    }
    if (atual.base && estado.contexto !== atual.base.contexto) atual.base.variou = true;
    if (!podeMedir()) return informar("Aguardando os controles do jogo ficarem livres para continuar a leitura dos testes.");
    ocupado = true;
    try {
      if (atual.etapa === "preparar") await preparar(atual, estado);
      else if (atual.etapa === "entrada") confirmarEntrada(atual, estado);
      else if (atual.etapa === "medir") await medir(atual, estado);
      else {
        const retorno = atual.etapa === "retornar" || atual.indice >= atual.fila.length;
        if (retorno) atual.etapa = "retornar";
        await viajar(atual, estado, retorno);
      }
    } catch {
      if (sessao === atual) informar("Aguardando o registro e o banco local para continuar os testes. A medição será tentada novamente.");
    } finally { ocupado = false; }
  }

  return { ativa: () => Boolean(sessao), atualizar };
}
