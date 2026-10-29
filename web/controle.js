/*
  Controle Wi-Fi - funcionamento da pagina do celular.
  Etapas 4 a 7 (controle, analogicos, jogador/cor, reconexao) e 5b (menu lateral,
  layouts em web/layouts/ e personalizacao salva no celular).
*/
"use strict";

const $ = (seletor) => document.querySelector(seletor);
const situacaoEl = $("#situacao");

/* ================= Armazenamento no celular ================= */
// O navegador pode recusar (aba anonima): tudo continua funcionando, so nao fica salvo
function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch (erro) {
    return null;
  }
}
function gravar(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch (erro) {}
}
function lerAjustes(chave) {
  try {
    return JSON.parse(ler(chave)) || {};
  } catch (erro) {
    return {};
  }
}
const CHAVE_ID = "controle-wifi-id";
const CHAVE_LAYOUT = "controle-wifi-layout";
const chavePersonalizacao = (idLayout) => `controle-wifi-personalizacao-${idLayout}`;

/* ================= Layouts (um arquivo por layout em web/layouts/) ================= */
const layouts = [];

// Chamado por cada arquivo de layout
function registrarLayout(config) {
  for (const grupo of config.grupos) {
    const x = Math.min(...grupo.pecas.map((p) => p.x));
    const y = Math.min(...grupo.pecas.map((p) => p.y));
    grupo.caixa = {
      x,
      y,
      w: Math.max(...grupo.pecas.map((p) => p.x + p.w)) - x,
      h: Math.max(...grupo.pecas.map((p) => p.y + p.h)) - y,
    };
  }
  layouts.push(config);
  layouts.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
}

async function carregarLayouts() {
  // O servidor lista os arquivos da pasta: layout novo = arquivo novo
  const nomes = await (await fetch("layouts/lista.json")).json();
  await Promise.all(nomes.map((nome) => new Promise((pronto) => {
    const script = document.createElement("script");
    script.src = `layouts/${nome}`;
    script.onload = script.onerror = pronto; // um arquivo com erro nao impede os outros
    document.head.append(script);
  })));
}

let layoutAtual = null;
let personalizacao = {}; // ajustes salvos do layout atual: id do grupo -> {cx, cy, escala, opacidade}

function aplicarLayout(id) {
  layoutAtual = layouts.find((l) => l.id === id) || layouts[0];
  gravar(CHAVE_LAYOUT, layoutAtual.id);
  personalizacao = lerAjustes(chavePersonalizacao(layoutAtual.id));
  renderizarControle();
}

/* ================= Medidas e posicao dos grupos ================= */
let medidas = { W: 844, H: 390, u: 1, faixa: 0 };

function medir() {
  const W = innerWidth;
  const H = innerHeight;
  const u = Math.min(W / 844, H / 390);
  // faixa: sobra acima do desenho em telas mais altas que 844x390 (o desenho fica centralizado)
  medidas = { W, H, u, faixa: (H - 390 * u) / 2 };
  document.documentElement.style.setProperty("--u", u + "px");
}

const TOQUE_MINIMO = 44; // px: nenhuma area de toque menor que isso
const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);

function menorLado(peca) {
  return peca.tipo === "direcional" ? peca.w / 3 : Math.min(peca.w, peca.h);
}

// Tamanho minimo (%) do grupo neste celular: 80%, ou mais se algum botao ficaria com menos de 44 px
function escalaMinima(grupo) {
  const menor = Math.min(...grupo.pecas.map(menorLado)) * medidas.u;
  return limitar(Math.ceil((TOQUE_MINIMO / menor) * 100 - 1e-6), 80, 150); // 1e-6: 110,0000001 -> 110
}

// Centro (px da tela), tamanho e opacidade de um grupo. Sem ajuste salvo, o grupo fica
// na posicao do desenho, preso ao lado indicado por "ancora" no arquivo do layout.
function geometria(grupo, ajuste = {}) {
  const { W, H, u, faixa } = medidas;
  const minima = escalaMinima(grupo);
  const escala = limitar(ajuste.escala ?? 100, minima, 150);
  const s = (u * escala) / 100;
  const caixa = grupo.caixa;
  const w = caixa.w * s;
  const h = caixa.h * s;
  const cxDesenho = caixa.x + caixa.w / 2;
  const cyDesenho = caixa.y + caixa.h / 2;
  let cx;
  if (ajuste.cx != null) cx = (ajuste.cx / 100) * W;
  else if (grupo.ancora === "esq") cx = cxDesenho * u;
  else if (grupo.ancora === "dir") cx = W - (844 - cxDesenho) * u;
  else cx = W / 2 + (cxDesenho - 422) * u;
  let cy = ajuste.cy != null ? (ajuste.cy / 100) * H : faixa + cyDesenho * u;
  // Nada sai da tela
  cx = limitar(cx, w / 2, W - w / 2);
  cy = limitar(cy, h / 2, H - h / 2);
  return { cx, cy, w, h, s, escala, minima, opacidade: ajuste.opacidade ?? 100 };
}

/* ================= Desenho das pecas ================= */
const ICONES = {
  triangulo: '<path d="M12 4l8 14H4z"/>',
  quadrado: '<rect x="5" y="5" width="14" height="14"/>',
  circulo: '<circle cx="12" cy="12" r="8"/>',
  xis: '<path d="M6 6l12 12M18 6L6 18"/>',
  Cima: '<path d="M6 15l6-6 6 6"/>',
  Esquerda: '<path d="M15 6l-6 6 6 6"/>',
  Direita: '<path d="M9 6l6 6-6 6"/>',
  Baixo: '<path d="M6 9l6 6 6-6"/>',
};
const icone = (nome) => `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome]}</svg>`;

let jogador = null;
let pcNome = location.hostname;
const rotuloJogador = () => (jogador === null ? "–" : `J${jogador}`);

function criarPeca(peca, caixa) {
  let el;
  if (peca.tipo === "analogico") {
    el = document.createElement("div");
    el.className = "peca analogico";
    el.dataset.analogico = peca.envia;
    el.style.setProperty("--p", peca.pino);
    el.innerHTML = '<div class="pino"></div>';
  } else if (peca.tipo === "direcional") {
    el = document.createElement("div");
    el.className = "peca direcional";
    for (const seta of ["Cima", "Esquerda", "Direita", "Baixo"]) {
      const botao = document.createElement("button");
      botao.dataset.btn = seta;
      botao.setAttribute("aria-label", seta);
      botao.innerHTML = icone(seta);
      el.append(botao);
    }
    el.insertAdjacentHTML("beforeend", '<span class="centro"></span>');
  } else {
    el = document.createElement("button");
    el.className = `peca forma-${peca.forma}`;
    if (peca.tipo === "gatilho") el.dataset.gatilho = peca.envia;
    else el.dataset.btn = peca.envia;
    if (peca.icone) {
      el.innerHTML = icone(peca.icone);
    } else if (peca.rotulo === "{jogador}") {
      el.dataset.rotuloJogador = "";
      el.textContent = rotuloJogador();
    } else {
      el.textContent = peca.rotulo;
    }
    el.setAttribute("aria-label", peca.nome || (peca.rotulo === "{jogador}" ? peca.envia : peca.rotulo));
    if (peca.cor) el.style.color = peca.cor;
    if (peca.fonte) el.style.setProperty("--f", peca.fonte);
  }
  el.style.setProperty("--x", peca.x - caixa.x);
  el.style.setProperty("--y", peca.y - caixa.y);
  el.style.setProperty("--w", peca.w);
  el.style.setProperty("--h", peca.h);
  return el;
}

// fator: 1 no controle; menor que 1 na tela de personalizacao (desenho reduzido da tela)
function criarGrupo(grupo, geo, fator) {
  const el = document.createElement("div");
  el.className = "grupo";
  el.dataset.grupo = grupo.id;
  for (const peca of grupo.pecas) el.append(criarPeca(peca, grupo.caixa));
  posicionarGrupo(el, geo, fator);
  return el;
}

function posicionarGrupo(el, geo, fator = 1) {
  el.style.left = `${(geo.cx - geo.w / 2) * fator}px`;
  el.style.top = `${(geo.cy - geo.h / 2) * fator}px`;
  el.style.width = `${geo.w * fator}px`;
  el.style.height = `${geo.h * fator}px`;
  el.style.setProperty("--s", `${geo.s * fator}px`);
  el.style.opacity = geo.opacidade / 100;
}

function renderizarControle() {
  soltarTudo();
  soltadores.length = 0;
  const alvo = $("#pecas");
  alvo.innerHTML = "";
  if (!layoutAtual) return;
  for (const grupo of layoutAtual.grupos) {
    alvo.append(criarGrupo(grupo, geometria(grupo, personalizacao[grupo.id]), 1));
  }
  ligarEntradas(alvo);
}

// Ao girar/redimensionar: so move os grupos, sem recriar (nao solta o que o dedo segura)
function reposicionarControle() {
  if (!layoutAtual) return;
  for (const grupo of layoutAtual.grupos) {
    const el = $(`#pecas [data-grupo="${grupo.id}"]`);
    if (el) posicionarGrupo(el, geometria(grupo, personalizacao[grupo.id]));
  }
}

/* ================= Toques -> comandos ================= */
const soltadores = [];
let pausado = false; // menu, layouts ou personalizacao abertos: nenhum comando vai ao PC
const COMANDOS = new Set(["botao", "gatilho", "analogico"]);

// Dois elementos podem mandar o mesmo comando (Create e touchpad = View): o PC so
// recebe "soltou" quando nenhum deles estiver mais apertado
const segurando = new Map();
function segurar(tipo, nome, estado) {
  const chave = `${tipo}:${nome}`;
  const antes = segurando.get(chave) || 0;
  const depois = Math.max(0, antes + (estado ? 1 : -1));
  segurando.set(chave, depois);
  if (antes > 0 === depois > 0) return;
  if (tipo === "botao") enviar({ tipo: "botao", btn: nome, estado: depois > 0 ? 1 : 0 });
  else enviar({ tipo: "gatilho", lado: nome, valor: depois > 0 ? 1 : 0 });
}

// Cada dedo fica preso a peca que tocou (pointer capture): da para apertar
// varias ao mesmo tempo, e a peca solta quando o dedo sai da tela.
function ligar(el, mudar) {
  let apertado = false;
  const definir = (estado) => {
    if (apertado === estado) return;
    apertado = estado;
    el.classList.toggle("apertado", estado);
    mudar(estado);
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (pausado) return; // com menu/edicao aberto o toque nem conta (senao a contagem desencontra)
    el.setPointerCapture(e.pointerId);
    definir(true);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((nome) =>
    el.addEventListener(nome, () => definir(false))
  );
  soltadores.push(() => definir(false));
}

function soltarTudo() {
  soltadores.forEach((soltar) => soltar());
}

function ligarEntradas(alvo) {
  alvo.querySelectorAll("[data-btn]").forEach((el) =>
    ligar(el, (estado) => segurar("botao", el.dataset.btn, estado))
  );
  alvo.querySelectorAll("[data-gatilho]").forEach((el) =>
    ligar(el, (estado) => segurar("gatilho", el.dataset.gatilho, estado))
  );
  alvo.querySelectorAll("[data-analogico]").forEach(ligarAnalogico);
}

// Analogicos: o dedo e medido a partir do centro do circulo. x vai de -1 (esquerda)
// a 1 (direita) e y de -1 (baixo) a 1 (cima), como no controle Xbox.
const arredondar = (v) => Math.round(v * 1000) / 1000;

// Sensibilidade dos analogicos: salva no celular, vale para todos os layouts
const CHAVE_SENSIBILIDADE = "controle-wifi-sensibilidade";
const SENSIBILIDADE_PADRAO = { sensibilidade: 1, curva: 1, zonaMorta: 0.05 };
function lerSensibilidade() {
  const salvo = lerAjustes(CHAVE_SENSIBILIDADE);
  return {
    esq: { ...SENSIBILIDADE_PADRAO, ...salvo.esq },
    dir: { ...SENSIBILIDADE_PADRAO, ...salvo.dir },
  };
}
let sensibilidade = lerSensibilidade();

// Zona morta, curva e sensibilidade aplicadas sobre a distancia do centro (0 a 1),
// sem mudar a direcao do dedo. x e y chegam e saem de -1 a 1.
function ajustarAnalogico(x, y, ajuste) {
  const distancia = Math.min(1, Math.hypot(x, y));
  if (distancia === 0 || distancia < ajuste.zonaMorta) return { x: 0, y: 0 };
  let m = (distancia - ajuste.zonaMorta) / (1 - ajuste.zonaMorta);
  m = Math.pow(m, ajuste.curva);
  m = Math.min(1, m * ajuste.sensibilidade);
  return { x: arredondar((x / distancia) * m), y: arredondar((y / distancia) * m) };
}

function ligarAnalogico(base) {
  const pino = base.querySelector(".pino");
  const lado = base.dataset.analogico;
  let dedo = null;      // pointerId do dedo que esta neste analogico
  let centro, alcance;  // em px da tela, medidos ao tocar
  let atual = { x: 0, y: 0 };
  let enviado = { x: 0, y: 0 };
  let quadroPedido = false;

  function enviarAgora() {
    if (atual.x === enviado.x && atual.y === enviado.y) return;
    enviado = atual;
    enviar({ tipo: "analogico", lado, x: atual.x, y: atual.y });
  }

  function mover(e) {
    let dx = e.clientX - centro.x;
    let dy = e.clientY - centro.y;
    const distancia = Math.hypot(dx, dy);
    if (distancia > alcance) {
      dx *= alcance / distancia;
      dy *= alcance / distancia;
    }
    pino.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; // o pino segue o dedo
    atual = ajustarAnalogico(dx / alcance, -dy / alcance, sensibilidade[lado]); // o PC recebe o valor ajustado
    // No maximo uma mensagem por quadro de tela (~60 por segundo)
    if (!quadroPedido) {
      quadroPedido = true;
      requestAnimationFrame(() => {
        quadroPedido = false;
        enviarAgora();
      });
    }
  }

  function soltar() {
    if (dedo === null) return;
    dedo = null;
    base.classList.remove("ativo");
    pino.style.transform = "";
    atual = { x: 0, y: 0 };
    enviarAgora(); // na hora: com a pagina escondida o proximo quadro nao chega
  }

  base.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (dedo !== null || pausado) return;
    dedo = e.pointerId;
    base.setPointerCapture(e.pointerId);
    const r = base.getBoundingClientRect();
    centro = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    alcance = (r.width - pino.offsetWidth) / 2;
    base.classList.add("ativo");
    mover(e);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === dedo) mover(e);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((nome) =>
    base.addEventListener(nome, (e) => {
      if (e.pointerId === dedo) soltar();
    })
  );
  soltadores.push(soltar);
}

/* ================= Conexao ================= */
// O id do celular e criado uma vez e guardado: depois de uma queda ele volta
// como o mesmo jogador, se voltar dentro de TEMPO_RESERVA.
const TEMPO_RESERVA = 10000;     // ms; igual ao TEMPO_RESERVA do servidor.py
const SEM_RESPOSTA = 3000;       // ms sem pong = conexao perdida
const CODIGO_SUBSTITUIDA = 4001; // o servidor fecha assim quando o mesmo id conecta em outra aba
const id = idDoCelular();
let ws = null;
let estado = "conectando";       // conectando, conectado, perdido, cheio, substituido, saiu
let latencia = null;
let ultimoPong = 0;
let inicioPerda = 0;
let tentativa = null;            // timer da proxima tentativa de reconexao

function idDoCelular() {
  let valor = ler(CHAVE_ID);
  if (!valor) {
    valor = Array.from({ length: 12 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    gravar(CHAVE_ID, valor);
  }
  return valor;
}

function enviar(msg) {
  if (pausado && COMANDOS.has(msg.tipo)) return;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function definirJogador(numero) {
  jogador = numero;
  document.body.dataset.jogador = numero;
  $("#selo").textContent = rotuloJogador();
  $("#nome").textContent = `Jogador ${numero}`;
  document.querySelectorAll("[data-rotulo-jogador]").forEach((el) => (el.textContent = rotuloJogador()));
  atualizarMenu();
}

function mostrarConectado() {
  situacaoEl.textContent = `Conectado a ${pcNome}` + (latencia === null ? "" : ` · ${latencia} ms`);
}

function atualizarMenu() {
  $("#menu-selo").textContent = rotuloJogador();
  $("#menu-pc").textContent = estado === "conectado" ? `Conectado a ${pcNome}` : situacaoEl.textContent;
}

function mudarEstado(novo) {
  estado = novo;
  document.body.className = novo;
  if (novo === "conectado") {
    mostrarConectado();
  } else if (novo === "conectando") {
    situacaoEl.textContent = "Conectando…";
  } else if (novo === "perdido") {
    situacaoEl.textContent = "Reconectando…";
  } else if (novo === "cheio") {
    $("#nome").textContent = "Sala cheia";
    situacaoEl.textContent = "Já tem 4 jogadores — tente de novo depois";
  } else {
    situacaoEl.textContent = "Desconectado";
  }
  atualizarAviso();
  atualizarMenu();
}

function atualizarAviso() {
  const titulo = $("#aviso-titulo");
  const texto = $("#aviso-texto");
  const principal = $("#aviso-principal");
  if (estado === "perdido") {
    const resta = Math.max(0, 1 - (Date.now() - inicioPerda) / TEMPO_RESERVA);
    $("#aviso-progresso").style.width = `${resta * 100}%`;
    titulo.textContent = "Conexão perdida";
    principal.textContent = "Tentar agora";
    texto.textContent = `Tentando reconectar a ${pcNome}… ` + (
      jogador === null ? "" :
      resta > 0 ? `Sua vaga de Jogador ${jogador} fica reservada por alguns segundos.` :
      "A vaga reservada expirou: ao voltar, você entra como um novo jogador."
    );
  } else if (estado === "substituido") {
    titulo.textContent = "Aberto em outra aba";
    texto.textContent = "Este controle foi aberto em outra aba ou janela deste celular.";
    principal.textContent = "Usar aqui";
  } else if (estado === "saiu") {
    titulo.textContent = "Você saiu";
    texto.textContent = "O controle foi desconectado do PC.";
    principal.textContent = "Entrar de novo";
  }
}

function fecharAtual() {
  if (!ws) return;
  const antiga = ws;
  ws = null; // a partir daqui os eventos dela sao ignorados
  antiga.close();
}

function agendarTentativa(espera) {
  clearTimeout(tentativa);
  tentativa = setTimeout(conectar, espera);
}

function conectar() {
  clearTimeout(tentativa);
  fecharAtual();
  const socket = new WebSocket(`ws://${location.host}/ws`);
  ws = socket;
  // Com o Wi-Fi desligado a tentativa pode ficar parada: desiste em 3 s e tenta de novo
  const limite = setTimeout(() => {
    if (socket === ws && socket.readyState !== WebSocket.OPEN) socket.close();
  }, 3000);

  socket.onopen = () => {
    clearTimeout(limite);
    ultimoPong = Date.now();
    enviar({ tipo: "entrar", id, nome: "Jogador" });
  };

  socket.onmessage = (evento) => {
    if (socket !== ws) return;
    const msg = JSON.parse(evento.data);
    if (msg.tipo === "pong") {
      ultimoPong = Date.now();
      latencia = ultimoPong - msg.t;
      if (estado === "conectado") mostrarConectado();
    } else if (msg.tipo === "bem_vindo") {
      if (msg.pc) pcNome = msg.pc;
      definirJogador(msg.jogador);
      mudarEstado("conectado");
    } else if (msg.tipo === "cheio") {
      mudarEstado("cheio");
    }
  };

  socket.onclose = (evento) => {
    clearTimeout(limite);
    if (socket !== ws) return;
    ws = null;
    if (evento.code === CODIGO_SUBSTITUIDA) {
      mudarEstado("substituido");
    } else if (estado === "perdido") {
      agendarTentativa(1000);
    } else if (estado === "conectando" || estado === "conectado") {
      perderConexao();
    }
  };
}

function perderConexao() {
  if (estado === "perdido") return;
  soltarTudo();
  inicioPerda = Date.now();
  mudarEstado("perdido");
  fecharAtual();
  agendarTentativa(500);
}

// Ping a cada segundo (mede a latencia); sem resposta por SEM_RESPOSTA, a conexao caiu
setInterval(() => enviar({ tipo: "ping", t: Date.now() }), 1000);
setInterval(() => {
  if (estado === "conectado" && Date.now() - ultimoPong > SEM_RESPOSTA) perderConexao();
  if (estado === "perdido") atualizarAviso();
}, 250);

$("#aviso-principal").addEventListener("click", () => {
  if (estado !== "perdido") mudarEstado("conectando");
  conectar();
});
$("#aviso-sair").addEventListener("click", () => {
  clearTimeout(tentativa);
  fecharAtual();
  mudarEstado("saiu");
});

/* ================= Menu, layouts e personalizacao (telas 4, 5 e 7) ================= */
function mostrarTela(nome) {
  // Saindo do controle: solta tudo antes de parar de enviar comandos
  if (nome && !pausado) soltarTudo();
  pausado = Boolean(nome);
  if (nome) document.body.dataset.tela = nome;
  else delete document.body.dataset.tela;
}

$("#abrir-menu").addEventListener("click", () => mostrarTela("menu"));
$("#menu-fechar").addEventListener("click", () => mostrarTela(""));
$("#menu-fora").addEventListener("click", () => mostrarTela(""));
$("#menu-layout").addEventListener("click", () => abrirLayouts());
$("#menu-personalizar").addEventListener("click", () => abrirPersonalizacao());
$("#menu-sensibilidade").addEventListener("click", () => abrirSensibilidade());
$("#menu-desconectar").addEventListener("click", () => {
  mostrarTela("");
  enviar({ tipo: "sair" }); // o servidor libera a vaga na hora
  clearTimeout(tentativa);
  fecharAtual();
  mudarEstado("saiu");
});

// ----- Tela 5: layout do controle -----
let layoutEscolhido = null;

function abrirLayouts() {
  layoutEscolhido = layoutAtual.id;
  montarCartoes();
  mostrarTela("layouts");
}

function miniatura(formas) {
  return formas.map((f) => {
    const raio = f.raio != null ? `calc(${f.raio} * var(--u))` : "999px";
    const pintura = f.contorno ? "border: calc(2 * var(--u)) solid var(--cor-jogador)" : `background: ${f.cor}`;
    return `<span style="left: calc(${f.x} * var(--u)); top: calc(${f.y} * var(--u)); width: calc(${f.w} * var(--u));` +
      ` height: calc(${f.h} * var(--u)); border-radius: ${raio}; ${pintura}"></span>`;
  }).join("");
}

function montarCartoes() {
  const lista = $("#cartoes");
  lista.innerHTML = "";
  for (const layout of layouts) {
    const cartao = document.createElement("button");
    cartao.className = "cartao" + (layout.id === layoutEscolhido ? " escolhido" : "");
    cartao.innerHTML = `<span class="mini">${miniatura(layout.miniatura)}</span>
      <span class="linha"><span class="nome"></span>${layout.id === layoutAtual.id ? '<span class="em-uso">Em uso</span>' : ""}</span>
      <span class="descricao"></span>`;
    cartao.querySelector(".nome").textContent = layout.nome;
    cartao.querySelector(".descricao").textContent = layout.descricao;
    cartao.addEventListener("click", () => {
      layoutEscolhido = layout.id;
      montarCartoes();
    });
    lista.append(cartao);
  }
  lista.insertAdjacentHTML("beforeend", `<div class="cartao-mais">
    <svg class="icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
    <b>Mais modelos</b><small>Espaço para novos layouts, ex.: retrô, só botões, volante</small></div>`);
}

$("#layouts-voltar").addEventListener("click", () => mostrarTela("menu"));
$("#layouts-aplicar").addEventListener("click", () => {
  if (layoutEscolhido !== layoutAtual.id) aplicarLayout(layoutEscolhido);
  mostrarTela("");
});

// ----- Tela 7: personalizacao -----
let trabalho = {};       // ajustes em edicao (so viram a personalizacao ao tocar em Salvar)
let selecionado = null;  // id do grupo selecionado
let fatorMini = 1;       // tamanho do desenho da tela / tamanho da tela de verdade

const grupoPorId = (idGrupo) => layoutAtual.grupos.find((g) => g.id === idGrupo);
const arred = (v) => Math.round(v * 10) / 10;

function abrirPersonalizacao() {
  trabalho = JSON.parse(JSON.stringify(personalizacao));
  const editaveis = layoutAtual.grupos.filter((g) => !g.fixo);
  selecionado = (editaveis.find((g) => g.id === "analogicoEsq") || editaveis[0]).id;
  mostrarTela("personalizar");
  montarMini();
}

// Desenho reduzido da tela, com a mesma proporcao do celular: posicoes em % batem com o controle
function montarMini() {
  const area = $("#pers-area").getBoundingClientRect();
  const { W, H } = medidas;
  fatorMini = Math.min(area.width / W, area.height / H);
  const mini = $("#mini");
  mini.style.width = `${W * fatorMini}px`;
  mini.style.height = `${H * fatorMini}px`;
  mini.innerHTML = "";
  // O topo (jogador e menu) e fixo: aparece so como referencia
  const topo = $("#topo").getBoundingClientRect();
  const fantasma = document.createElement("div");
  fantasma.className = "topo-fantasma";
  fantasma.textContent = "Topo fixo";
  Object.assign(fantasma.style, {
    left: `${topo.left * fatorMini}px`,
    top: `${topo.top * fatorMini}px`,
    width: `${topo.width * fatorMini}px`,
    height: `${topo.height * fatorMini}px`,
  });
  mini.append(fantasma);
  for (const grupo of layoutAtual.grupos) {
    const el = criarGrupo(grupo, geometria(grupo, trabalho[grupo.id]), fatorMini);
    el.classList.add(grupo.fixo ? "fixo" : "editavel");
    if (!grupo.fixo) ligarArrasto(el, grupo);
    mini.append(el);
  }
  selecionar(selecionado);
}

function selecionar(idGrupo) {
  selecionado = idGrupo;
  document.querySelectorAll("#mini .grupo").forEach((el) =>
    el.classList.toggle("selecionado", el.dataset.grupo === idGrupo)
  );
  atualizarPainel();
}

// 100% = encostado no alto da tela, 0% = encostado embaixo
function alturaNaTela(geo) {
  const sobra = medidas.H - geo.h;
  return sobra > 0 ? Math.round(100 * (1 - (geo.cy - geo.h / 2) / sobra)) : 50;
}

function atualizarPainel() {
  const grupo = grupoPorId(selecionado);
  const geo = geometria(grupo, trabalho[grupo.id]);
  $("#pers-nome").textContent = grupo.nome;
  const tamanho = $("#pers-tamanho");
  tamanho.min = geo.minima;
  tamanho.value = geo.escala;
  $("#v-tamanho").textContent = `${geo.escala}%`;
  $("#pers-altura").value = alturaNaTela(geo);
  $("#v-altura").textContent = `${alturaNaTela(geo)}%`;
  $("#pers-opacidade").value = geo.opacidade;
  $("#v-opacidade").textContent = `${geo.opacidade}%`;
}

function ajustar(mudanca) {
  const grupo = grupoPorId(selecionado);
  trabalho[grupo.id] = { ...trabalho[grupo.id], ...mudanca };
  posicionarGrupo($(`#mini [data-grupo="${grupo.id}"]`), geometria(grupo, trabalho[grupo.id]), fatorMini);
  atualizarPainel();
}

function ligarArrasto(el, grupo) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    selecionar(grupo.id);
    el.setPointerCapture(e.pointerId);
    const inicio = geometria(grupo, trabalho[grupo.id]);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const mover = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const cx = inicio.cx + (ev.clientX - x0) / fatorMini;
      const cy = inicio.cy + (ev.clientY - y0) / fatorMini;
      // geometria() segura o grupo dentro da tela; grava essa posicao em % da tela
      const geo = geometria(grupo, { ...trabalho[grupo.id], cx: (cx / medidas.W) * 100, cy: (cy / medidas.H) * 100 });
      trabalho[grupo.id] = { ...trabalho[grupo.id], cx: arred((geo.cx / medidas.W) * 100), cy: arred((geo.cy / medidas.H) * 100) };
      posicionarGrupo(el, geo, fatorMini);
      atualizarPainel();
    };
    const fim = () => {
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
  });
}

$("#pers-tamanho").addEventListener("input", (e) => ajustar({ escala: Number(e.target.value) }));
$("#pers-opacidade").addEventListener("input", (e) => ajustar({ opacidade: Number(e.target.value) }));
$("#pers-altura").addEventListener("input", (e) => {
  const grupo = grupoPorId(selecionado);
  const geo = geometria(grupo, trabalho[grupo.id]);
  const cy = geo.h / 2 + (1 - Number(e.target.value) / 100) * (medidas.H - geo.h);
  ajustar({ cy: arred((cy / medidas.H) * 100) });
});
$("#pers-restaurar").addEventListener("click", () => {
  trabalho = {};
  montarMini();
});
$("#pers-salvar").addEventListener("click", () => {
  personalizacao = trabalho;
  gravar(chavePersonalizacao(layoutAtual.id), Object.keys(trabalho).length ? JSON.stringify(trabalho) : null);
  renderizarControle();
  mostrarTela("");
});
$("#pers-voltar").addEventListener("click", () => mostrarTela("menu")); // sai sem salvar

// ----- Sensibilidade dos analogicos -----
let sensTrabalho = null; // valores em edicao (so valem ao tocar em Salvar)
let sensLado = "esq";    // aba aberta
let testeDedo = { x: 0, y: 0 };

// 1.5 -> "1,5"; tira o "-0,00" de valores quase zero
function decimal(valor, casas) {
  const n = Math.abs(valor) < 0.5 * 10 ** -casas ? 0 : valor;
  return n.toFixed(casas).replace(".", ",");
}

function abrirSensibilidade() {
  sensTrabalho = JSON.parse(JSON.stringify(sensibilidade));
  sensLado = "esq";
  testeDedo = { x: 0, y: 0 };
  mostrarTela("sensibilidade");
  atualizarSensibilidade();
}

function atualizarSensibilidade() {
  const ajuste = sensTrabalho[sensLado];
  document.querySelectorAll("#sens-abas button").forEach((aba) => {
    aba.classList.toggle("ativa", aba.dataset.lado === sensLado);
    aba.setAttribute("aria-selected", aba.dataset.lado === sensLado);
  });
  $("#sens-sensibilidade").value = ajuste.sensibilidade;
  $("#v-sensibilidade").textContent = `${decimal(ajuste.sensibilidade, 1)}x`;
  $("#sens-curva").value = ajuste.curva;
  $("#v-curva").textContent = decimal(ajuste.curva, 1);
  $("#sens-zona").value = Math.round(ajuste.zonaMorta * 100);
  $("#v-zona").textContent = `${Math.round(ajuste.zonaMorta * 100)}%`;
  $("#teste-area").style.setProperty("--zona", ajuste.zonaMorta);
  desenharTeste();
}

// Area de teste: mostra o dedo e o que seria enviado ao PC (nao envia nada)
function desenharTeste() {
  const saida = ajustarAnalogico(testeDedo.x, testeDedo.y, sensTrabalho[sensLado]);
  const colocar = (el, p) => {
    el.style.left = `${50 + p.x * 50}%`;
    el.style.top = `${50 - p.y * 50}%`;
  };
  colocar($("#teste-dedo"), testeDedo);
  colocar($("#teste-saida"), saida);
  $("#v-dedo").textContent = `x ${decimal(testeDedo.x, 2)}  y ${decimal(testeDedo.y, 2)}`;
  $("#v-saida").textContent = `X ${decimal(saida.x, 2)}  Y ${decimal(saida.y, 2)}`;
}

function moverTeste(e) {
  const r = $("#teste-area").getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const distancia = Math.hypot(x, y);
  if (distancia > 1) {
    x /= distancia;
    y /= distancia;
  }
  testeDedo = { x, y };
  desenharTeste();
}

const areaTeste = $("#teste-area");
areaTeste.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  areaTeste.setPointerCapture(e.pointerId);
  moverTeste(e);
});
areaTeste.addEventListener("pointermove", (e) => {
  if (areaTeste.hasPointerCapture(e.pointerId)) moverTeste(e);
});
["pointerup", "pointercancel"].forEach((nome) =>
  areaTeste.addEventListener(nome, () => {
    testeDedo = { x: 0, y: 0 }; // soltou: volta ao centro, como um analogico
    desenharTeste();
  })
);

document.querySelectorAll("#sens-abas button").forEach((aba) =>
  aba.addEventListener("click", () => {
    sensLado = aba.dataset.lado;
    atualizarSensibilidade();
  })
);
$("#sens-sensibilidade").addEventListener("input", (e) => {
  sensTrabalho[sensLado].sensibilidade = Number(e.target.value);
  atualizarSensibilidade();
});
$("#sens-curva").addEventListener("input", (e) => {
  sensTrabalho[sensLado].curva = Number(e.target.value);
  atualizarSensibilidade();
});
$("#sens-zona").addEventListener("input", (e) => {
  sensTrabalho[sensLado].zonaMorta = Number(e.target.value) / 100;
  atualizarSensibilidade();
});
$("#sens-restaurar").addEventListener("click", () => {
  sensTrabalho = { esq: { ...SENSIBILIDADE_PADRAO }, dir: { ...SENSIBILIDADE_PADRAO } }; // os dois analogicos
  atualizarSensibilidade();
});
$("#sens-salvar").addEventListener("click", () => {
  sensibilidade = sensTrabalho;
  gravar(CHAVE_SENSIBILIDADE, JSON.stringify(sensibilidade));
  mostrarTela("");
});
$("#sens-voltar").addEventListener("click", () => mostrarTela("menu")); // sai sem salvar

/* ================= Geral ================= */
// Se a pagina sair da tela (notificacao, troca de app), nada fica apertado
document.addEventListener("visibilitychange", () => {
  if (document.hidden) soltarTudo();
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("resize", () => {
  medir();
  reposicionarControle();
  if (document.body.dataset.tela === "personalizar") montarMini();
});

// Botao dos tres pontos: liga/desliga a tela cheia (o iPhone nao permite em paginas)
$("#tela-cheia").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      await screen.orientation.lock("landscape");
    }
  } catch (erro) {
    // sem suporte a tela cheia ou a travar a orientacao: segue normal
  }
});

async function iniciar() {
  medir();
  mudarEstado("conectando");
  try {
    await carregarLayouts();
  } catch (erro) {
    // sem a lista de layouts o controle fica vazio; o aviso abaixo explica
  }
  if (layouts.length) aplicarLayout(ler(CHAVE_LAYOUT));
  else situacaoEl.textContent = "Erro ao carregar os layouts";
  conectar();
}

iniciar();
