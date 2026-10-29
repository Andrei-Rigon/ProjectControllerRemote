/*
  Layout "Simetrico" (estilo PS5) - tela 6 do Controle Wi-Fi.html.
  O PC continua recebendo um controle Xbox; "envia" faz a traducao:
  triangulo = Y, circulo = B, xis = A, quadrado = X, L1/R1 = LB/RB, L2/R2 = LT/RT,
  Create = View, Options = Menu, toque no touchpad = View, botao central = Guia.
  Formato igual ao de assimetrico.js (veja as instrucoes la).
*/
registrarLayout({
  id: "simetrico",
  nome: "Simétrico",
  descricao: "Estilo PS5: direcional no alto, os dois analógicos embaixo e touchpad no centro.",
  ordem: 2,
  miniatura: [
    { x: 30, y: 40, w: 36, h: 12, raio: 3, cor: "#3A414D" },
    { x: 42, y: 28, w: 12, h: 36, raio: 3, cor: "#3A414D" },
    { x: 84, y: 22, w: 58, h: 26, raio: 6, cor: "#3A414D" },
    { x: 172, y: 16, w: 14, h: 14, cor: "#2DD4BF" },
    { x: 154, y: 34, w: 14, h: 14, cor: "#F472B6" },
    { x: 190, y: 34, w: 14, h: 14, cor: "#F87171" },
    { x: 172, y: 52, w: 14, h: 14, cor: "#60A5FA" },
    { x: 62, y: 78, w: 38, h: 38, contorno: true },
    { x: 126, y: 78, w: 38, h: 38, contorno: true },
  ],
  grupos: [
    {
      id: "gatilhosEsq", nome: "Gatilhos esquerdos", ancora: "esq",
      pecas: [
        { tipo: "gatilho", forma: "gatilho", x: 24, y: 20, w: 76, h: 44, rotulo: "L2", envia: "esq" },
        { tipo: "botao", forma: "retangular", x: 110, y: 20, w: 76, h: 44, rotulo: "L1", envia: "LB" },
      ],
    },
    {
      id: "gatilhosDir", nome: "Gatilhos direitos", ancora: "dir",
      pecas: [
        { tipo: "botao", forma: "retangular", x: 658, y: 20, w: 76, h: 44, rotulo: "R1", envia: "RB" },
        { tipo: "gatilho", forma: "gatilho", x: 744, y: 20, w: 76, h: 44, rotulo: "R2", envia: "dir" },
      ],
    },
    {
      id: "direcional", nome: "Direcional", ancora: "esq",
      pecas: [{ tipo: "direcional", x: 40, y: 88, w: 132, h: 132 }],
    },
    {
      id: "analogicoEsq", nome: "Analógico esquerdo", ancora: "esq",
      pecas: [{ tipo: "analogico", x: 180, y: 234, w: 136, h: 136, pino: 58, envia: "esq" }],
    },
    {
      id: "touchpad", nome: "Touchpad", ancora: "meio",
      pecas: [{ tipo: "botao", forma: "touchpad", x: 334, y: 84, w: 176, h: 76, rotulo: "Touchpad", envia: "View" }],
    },
    {
      id: "createOptions", nome: "Create e Options", ancora: "meio",
      pecas: [
        { tipo: "botao", forma: "pilula", x: 340, y: 174, w: 76, h: 40, rotulo: "Create", envia: "View" },
        { tipo: "botao", forma: "pilula", x: 428, y: 174, w: 76, h: 40, rotulo: "Options", envia: "Menu" },
      ],
    },
    {
      id: "home", nome: "Botão central", ancora: "meio", fixo: true,
      pecas: [{ tipo: "botao", forma: "guia", x: 396, y: 228, w: 52, h: 52, rotulo: "{jogador}", fonte: 16, envia: "Guia" }],
    },
    {
      id: "acoes", nome: "Botões de ação", ancora: "dir",
      pecas: [
        { tipo: "botao", forma: "acao", x: 700, y: 80, w: 56, h: 56, icone: "triangulo", nome: "Triângulo", cor: "#2DD4BF", envia: "Y" },
        { tipo: "botao", forma: "acao", x: 644, y: 136, w: 56, h: 56, icone: "quadrado", nome: "Quadrado", cor: "#F472B6", envia: "X" },
        { tipo: "botao", forma: "acao", x: 756, y: 136, w: 56, h: 56, icone: "circulo", nome: "Círculo", cor: "#F87171", envia: "B" },
        { tipo: "botao", forma: "acao", x: 700, y: 192, w: 56, h: 56, icone: "xis", nome: "Xis", cor: "#60A5FA", envia: "A" },
      ],
    },
    {
      id: "analogicoDir", nome: "Analógico direito", ancora: "dir",
      pecas: [{ tipo: "analogico", x: 528, y: 234, w: 136, h: 136, pino: 58, envia: "dir" }],
    },
  ],
});
