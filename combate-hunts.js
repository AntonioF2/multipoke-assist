function tiposCombateHunts() {
  // Relações de ataque da Pokepédia: fraquezas, resistências e imunidades.
  const gruposPorTipo = {
    NORMAL: ["", "ROCK STEEL", "GHOST"],
    FIRE: ["GRASS ICE BUG STEEL", "FIRE WATER ROCK DRAGON"],
    WATER: ["FIRE GROUND ROCK", "WATER GRASS DRAGON"],
    ELECTRIC: ["WATER FLYING", "ELECTRIC GRASS DRAGON", "GROUND"],
    GRASS: ["WATER GROUND ROCK", "FIRE GRASS POISON FLYING BUG DRAGON STEEL"],
    ICE: ["GRASS GROUND FLYING DRAGON", "FIRE WATER ICE STEEL"],
    FIGHTING: ["NORMAL ICE ROCK DARK STEEL", "POISON FLYING PSYCHIC BUG FAIRY", "GHOST"],
    POISON: ["GRASS FAIRY", "POISON GROUND ROCK GHOST", "STEEL"],
    GROUND: ["FIRE ELECTRIC POISON ROCK STEEL", "GRASS BUG", "FLYING"],
    FLYING: ["GRASS FIGHTING BUG", "ELECTRIC ROCK STEEL"],
    PSYCHIC: ["FIGHTING POISON", "PSYCHIC STEEL", "DARK"],
    BUG: ["GRASS PSYCHIC DARK", "FIRE FIGHTING POISON FLYING GHOST STEEL FAIRY"],
    ROCK: ["FIRE ICE FLYING BUG", "FIGHTING GROUND STEEL"],
    GHOST: ["PSYCHIC GHOST", "DARK", "NORMAL"],
    DRAGON: ["DRAGON", "STEEL", "FAIRY"],
    DARK: ["PSYCHIC GHOST", "FIGHTING DARK FAIRY"],
    STEEL: ["ICE ROCK FAIRY", "FIRE WATER ELECTRIC STEEL"],
    FAIRY: ["FIGHTING DRAGON DARK", "FIRE POISON STEEL"],
  };
  return Object.fromEntries(Object.entries(gruposPorTipo)
    .map(([tipo, grupos]) => [tipo, grupos.map(grupo => new Set(grupo.split(" ")))]));
}

function nomeCombateHunts(nome) {
  return nome.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function lerGolpesHunts(membros) {
  const grupos = new Map([...document.querySelectorAll("#skills .skill-group[data-pokemon-id]")]
    .map(grupo => [grupo.dataset.pokemonId, grupo]));
  return membros.map(({ id }) => {
    const botoes = grupos.get(id)?.querySelectorAll("button.skill[data-active-slot]");
    if (!botoes?.length) return null;
    const golpes = [];
    for (const botao of botoes) {
      if (botao.dataset.empty === "true" || botao.dataset.locked === "true") continue;
      const campos = botao.getAttribute("aria-label")?.match(/, nível [\d.]+: ([^,]+), ([^,]+), (Físico|Especial|Status), ([^,]+),/);
      if (!campos) return null;
      const [, nome, tipo, categoria, poder] = campos;
      golpes.push({ nome, tipo, categoria, poder });
    }
    return golpes;
  });
}

function criarModeloCombateHunts(pagina, { texto, decimal, numero }) {
  const relacoesHunts = tiposCombateHunts();
  const atributos = ["hp", "atk", "def", "spAtk", "spDef", "speed"];
  const especies = new Map();
  const golpesExtras = new Map();
  let indice;
  let indiceGolpes;

  function comCache(cache, chave, carregar) {
    if (!cache.has(chave)) {
      const promessa = carregar().catch(() => {
        if (cache.get(chave) === promessa) cache.delete(chave);
        return null;
      });
      cache.set(chave, promessa);
    }
    return cache.get(chave);
  }

  function limparCache() {
    especies.clear();
    golpesExtras.clear();
    indice = undefined;
    indiceGolpes = undefined;
  }

  function lerGolpe(linha, nome) {
    const tipo = linha.querySelector("td [data-type]");
    const categoria = texto(linha, "td:nth-child(4)");
    const poder = numero(texto(linha, "td:nth-child(5)").match(/^([\d.]+)$/)?.[1]);
    const recarga = decimal(texto(linha, "td:nth-child(6)").match(/^([\d.,]+)(?:\s|$)/)?.[1]);
    const precisao = decimal(texto(linha, "td:nth-child(7)").match(/^([\d.,]+)%$/)?.[1]);
    if (!nome || !relacoesHunts[tipo?.dataset.type] || !["Físico", "Especial", "Status"].includes(categoria) ||
        !(recarga > 0)) throw new Error("Ficha de golpe indisponível.");
    return {
      nome, tipo: tipo.dataset.type, rotuloTipo: tipo.textContent.trim(), categoria, poder, recarga,
      precisao: Number.isFinite(precisao) ? precisao / 100 : 1,
    };
  }

  function carregarEspecie(id) {
    return comCache(especies, id, () => cacheDadosHunts(`especie/${id}`, async () => {
      const ficha = await pagina(`/pokepedia/pokemon/${id}`);
      const nome = texto(ficha, "h1");
      const tipos = [...ficha.querySelectorAll(".entry-meta .type-badge[data-type]")].map(no => no.dataset.type);
      const base = Object.fromEntries(atributos.map(atributo => [
        atributo, numero(ficha.querySelector(`#atributos [data-stat="${atributo}"] meter`)?.getAttribute("value")),
      ]));
      if (!nome || !tipos.length || tipos.some(tipo => !relacoesHunts[tipo]) ||
          atributos.some(atributo => !Number.isSafeInteger(base[atributo]) || base[atributo] < 0)) {
        throw new Error("Ficha de combate indisponível.");
      }
      const golpes = [...ficha.querySelectorAll("#golpes tbody tr")].map(linha => ({
        ...lerGolpe(linha, texto(linha, "td:nth-child(2) a")),
        nivel: numero(texto(linha, "th").match(/^Lv\. ([\d.]+)$/)?.[1]),
      }));
      if (!golpes.length || golpes.some(golpe => !Number.isSafeInteger(golpe.nivel) || golpe.nivel < 1)) {
        throw new Error("Repertório de golpes indisponível.");
      }
      return { tipos, base, golpes };
    }));
  }

  async function carregarGolpeExtra(golpe) {
    indiceGolpes ??= cacheDadosHunts("indice-golpes", async () => {
      const paginaGolpes = await pagina("/pokepedia/golpes");
      return [...paginaGolpes.querySelectorAll("a.entry-main[href^='/pokepedia/golpes/']")].map(link => [
        nomeCombateHunts(texto(link, "h2")), link.getAttribute("href"),
      ]);
    }, linhas => linhas.length > 0).then(linhas => new Map(linhas)).catch(() => { indiceGolpes = undefined; return null; });
    const url = (await indiceGolpes)?.get(nomeCombateHunts(golpe.nome));
    if (!/^\/pokepedia\/golpes\/[\w-]+$/.test(url)) return null;
    const opcoes = await comCache(golpesExtras, url, () => cacheDadosHunts(`golpe/${url.split("/").at(-1)}`, async () => {
      const ficha = await pagina(url);
      return [...ficha.querySelectorAll("tbody tr")].map(linha => lerGolpe(linha, golpe.nome));
    }, linhas => linhas.length > 0));
    return opcoes?.find(opcao => opcao.rotuloTipo === golpe.tipo && opcao.categoria === golpe.categoria &&
      opcao.poder === numero(golpe.poder.match(/^Poder ([\d.]+)$/)?.[1])) ??
      opcoes?.find(opcao => opcao.rotuloTipo === golpe.tipo && opcao.categoria === golpe.categoria);
  }

  function statsNoNivel(especie, nivel) {
    const escala = nivel <= 1000 ? nivel : 1000 + 20 * (nivel - 1000);
    // Referência pública com qualidade 1,00, IV 16 e sem bônus do indivíduo.
    return Object.fromEntries(atributos.map(atributo => [atributo,
      Math.floor((2 * especie.base[atributo] + 15) * escala / 100) + (atributo === "hp" ? escala + 10 : 5),
    ]));
  }

  async function carregarEquipe(membros, niveis, golpesAtivos) {
    if (golpesAtivos.some(golpes => !golpes)) return null;
    indice ??= cacheDadosHunts("indice-especies", async () => {
      const paginaEspecies = await pagina("/pokepedia/pokemon");
      return [...paginaEspecies.querySelectorAll("article[data-filter-name][data-filter-number]")].map(no => [
        nomeCombateHunts(no.dataset.filterName), no.dataset.filterNumber,
      ]);
    }, linhas => linhas.length > 0).then(linhas => new Map(linhas)).catch(() => { indice = undefined; return null; });
    const nomes = await indice;
    if (!nomes) return null;
    const equipe = await Promise.all(membros.map(async (membro, i) => {
      const nome = nomeCombateHunts(membro.nome);
      const id = nomes.get(nome) ?? nomes.get(nome.replace(/^(?:(?:shiny|holo)\s+)+/, ""));
      if (!/^\d+$/.test(id)) return null;
      const especie = await carregarEspecie(id);
      if (!especie) return null;
      const golpes = await Promise.all(golpesAtivos[i].map(async golpe => {
        const poder = numero(golpe.poder.match(/^Poder ([\d.]+)$/)?.[1]);
        const ficha = especie.golpes.find(opcao => nomeCombateHunts(opcao.nome) === nomeCombateHunts(golpe.nome) &&
          opcao.rotuloTipo === golpe.tipo && opcao.categoria === golpe.categoria) ??
          (poder > 0 ? await carregarGolpeExtra(golpe) : null);
        if (!ficha && poder > 0) return null;
        return { ...ficha, poder };
      }));
      if (golpes.some(golpe => !golpe)) return null;
      return { tipos: especie.tipos, stats: statsNoNivel(especie, niveis[i]), golpes };
    }));
    return equipe.every(Boolean) && equipe.some(membro => membro.golpes.some(golpe => golpe.poder > 0)) ? equipe : null;
  }

  function modificador(tipo, atacante, defensor) {
    const [fracos, resistentes, imunes] = relacoesHunts[tipo];
    if (defensor.tipos.some(alvo => imunes?.has(alvo))) return 0;
    const fraquezas = defensor.tipos.filter(alvo => fracos.has(alvo)).length;
    const resistencias = defensor.tipos.filter(alvo => resistentes.has(alvo)).length;
    return (1 + (atacante.tipos.includes(tipo) ? 0.5 : 0) + fraquezas) * 0.5 ** resistencias;
  }

  function ataques(atacante, defensor, pressao = 1) {
    const valores = atacante.golpes.filter(golpe => golpe.poder > 0).map(golpe => {
      const fator = modificador(golpe.tipo, atacante, defensor);
      const fisico = golpe.categoria === "Físico";
      const ataque = atacante.stats[fisico ? "atk" : "spAtk"];
      const defesa = defensor.stats[fisico ? "def" : "spDef"];
      const dano = fator === 0 ? 0 : Math.max(1,
        Math.round(golpe.poder / 256 * ataque ** 2 / (ataque + defesa) * fator * pressao)) * golpe.precisao;
      const speed = atacante.stats.speed;
      const recarga = Math.max(1, golpe.recarga * (1 - 0.15 * speed / (speed + 200)));
      return { dano, frequencia: 1 / recarga };
    }).sort((a, b) => b.dano - a.dano);
    let acoes = 1;
    let dps = 0;
    for (const golpe of valores) {
      const frequencia = Math.min(acoes, golpe.frequencia);
      dps += golpe.dano * frequencia;
      acoes -= frequencia;
    }
    return dps;
  }

  function compararEncontro(especie, encontro, equipe, hunt) {
    const nivel = Math.round((encontro.minimo + encontro.maximo) / 2);
    const golpes = especie.golpes.filter(golpe => golpe.nivel <= nivel).sort((a, b) =>
      (b.poder || 0) - (a.poder || 0) || Number(a.categoria === "Status") - Number(b.categoria === "Status") ||
      a.recarga - b.recarga).slice(0, 4);
    const selvagem = { ...especie, stats: statsNoNivel(especie, nivel), golpes };
    let dps = 0;
    let risco = 0;
    for (const membro of equipe) {
      dps += ataques(membro, selvagem);
      risco += ataques(selvagem, membro, hunt.pressao) / membro.stats.hp / equipe.length;
    }
    const tempo = Math.max(1, selvagem.stats.hp / dps);
    // Aproxima o deslocamento e penaliza a exposição ao dano recebido durante o combate.
    const custoBase = hunt.ritmo + tempo;
    const custo = dps > 0 ? custoBase * (1 + Math.min(1, tempo * risco)) : Infinity;
    return { peso: encontro.peso, custo, custoBase };
  }

  async function comparar(hunt, equipe) {
    if (!hunt.encontros.length || hunt.encontros.some(({ id, peso, minimo, maximo }) =>
      !id || !(peso > 0) || !(minimo > 0) || maximo < minimo || !Number.isFinite(maximo))) return null;
    const encontros = await Promise.all(hunt.encontros.map(async encontro => {
      const especie = await carregarEspecie(encontro.id);
      return especie && compararEncontro(especie, encontro, equipe, hunt);
    }));
    if (encontros.some(encontro => !encontro)) return null;
    const peso = encontros.reduce((soma, encontro) => soma + encontro.peso, 0);
    const custo = encontros.reduce((soma, encontro) => soma + encontro.peso * encontro.custo, 0) / peso;
    const custoBase = encontros.reduce((soma, encontro) => soma + encontro.peso * encontro.custoBase, 0) / peso;
    return { custo, pressaoAlta: Number.isFinite(custo) && custo >= 1.25 * custoBase };
  }

  return { carregarEquipe, comparar, limparCache };
}
