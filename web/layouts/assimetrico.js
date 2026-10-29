/*
  Layout "Assimetrico" (estilo Xbox) - tela 2 do Controle Wi-Fi.html.

  Como criar um layout novo: copie este arquivo para web/layouts/<nome>.js e mude
  os dados. Posicoes e tamanhos sao do desenho de 844x390. Cada grupo e um
  elemento que pode ser movido/redimensionado na Personalizacao; "ancora" diz de
  que lado da tela ele fica em celulares mais largos ou mais estreitos.
  "envia" e o comando Xbox que vai para o PC: nome do botao (A, B, X, Y, LB, RB,
  LS, RS, View, Menu, Guia), lado do gatilho (esq/dir) ou lado do analogico (esq/dir).
  O analogico ja aperta LS/RS com toque duplo.
*/
registrarLayout({
  id: "assimetrico",
  nome: "Assimétrico",
  descricao: "Estilo Xbox: analógico esquerdo no alto e direcional embaixo.",
  ordem: 1,
  // Miniatura do card na tela "Layout do controle" (px, caixa de 130 de altura)
  miniatura: [
    { x: 24, y: 18, w: 40, h: 40, contorno: true },
    { x: 66, y: 86, w: 36, h: 12, raio: 3, cor: "#3A414D" },
    { x: 78, y: 74, w: 12, h: 36, raio: 3, cor: "#3A414D" },
    { x: 98, y: 30, w: 14, h: 8, raio: 4, cor: "#3A414D" },
    { x: 118, y: 30, w: 14, h: 8, raio: 4, cor: "#3A414D" },
    { x: 165, y: 14, w: 14, h: 14, cor: "#FACC15" },
    { x: 147, y: 32, w: 14, h: 14, cor: "#60A5FA" },
    { x: 183, y: 32, w: 14, h: 14, cor: "#F87171" },
    { x: 165, y: 50, w: 14, h: 14, cor: "#4ADE80" },
    { x: 128, y: 74, w: 38, h: 38, contorno: true },
  ],
  grupos: [
    {
      id: "gatilhosEsq", nome: "Gatilhos esquerdos", ancora: "esq",
      pecas: [
        { tipo: "gatilho", forma: "gatilho", x: 24, y: 20, w: 76, h: 44, rotulo: "LT", envia: "esq" },
        { tipo: "botao", forma: "retangular", x: 110, y: 20, w: 76, h: 44, rotulo: "LB", envia: "LB" },
      ],
    },
    {
      id: "gatilhosDir", nome: "Gatilhos direitos", ancora: "dir",
      pecas: [
        { tipo: "botao", forma: "retangular", x: 658, y: 20, w: 76, h: 44, rotulo: "RB", envia: "RB" },
        { tipo: "gatilho", forma: "gatilho", x: 744, y: 20, w: 76, h: 44, rotulo: "RT", envia: "dir" },
      ],
    },
    {
      id: "analogicoEsq", nome: "Analógico esquerdo", ancora: "esq",
      pecas: [{ tipo: "analogico", x: 32, y: 84, w: 140, h: 140, pino: 60, envia: "esq" }],
    },
    {
      id: "direcional", nome: "Direcional", ancora: "esq",
      pecas: [{ tipo: "direcional", x: 184, y: 230, w: 132, h: 132 }],
    },
    {
      id: "guia", nome: "Guia", ancora: "meio", fixo: true,
      pecas: [{ tipo: "botao", forma: "guia", x: 392, y: 166, w: 60, h: 60, rotulo: "{jogador}", fonte: 18, envia: "Guia" }],
    },
    {
      id: "viewMenu", nome: "View e Menu", ancora: "meio",
      pecas: [
        { tipo: "botao", forma: "pilula", x: 342, y: 244, w: 72, h: 44, rotulo: "View", envia: "View" },
        { tipo: "botao", forma: "pilula", x: 430, y: 244, w: 72, h: 44, rotulo: "Menu", envia: "Menu" },
      ],
    },
    {
      id: "acoes", nome: "Botões A B X Y", ancora: "dir",
      pecas: [
        { tipo: "botao", forma: "acao", x: 700, y: 80, w: 56, h: 56, rotulo: "Y", cor: "#FACC15", envia: "Y" },
        { tipo: "botao", forma: "acao", x: 644, y: 136, w: 56, h: 56, rotulo: "X", cor: "#60A5FA", envia: "X" },
        { tipo: "botao", forma: "acao", x: 756, y: 136, w: 56, h: 56, rotulo: "B", cor: "#F87171", envia: "B" },
        { tipo: "botao", forma: "acao", x: 700, y: 192, w: 56, h: 56, rotulo: "A", cor: "#4ADE80", envia: "A" },
      ],
    },
    {
      id: "analogicoDir", nome: "Analógico direito", ancora: "dir",
      pecas: [{ tipo: "analogico", x: 536, y: 234, w: 136, h: 136, pino: 58, envia: "dir" }],
    },
  ],
});
