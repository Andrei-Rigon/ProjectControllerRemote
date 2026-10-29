"""
Controle Wi-Fi - Servidor (Etapa 5b: menu, layouts e personalizacao)

Serve a pagina do celular em http://IP-DO-PC:8765 (com os arquivos da pasta
web/: layouts e fontes) e recebe as mensagens pelo WebSocket em /ws,
imprimindo cada uma no terminal. Responde "ping" com "pong" para o celular
medir a latencia.

Cada celular que manda "entrar" recebe o menor numero livre (1 a 4) e um
controle Xbox 360 virtual so dele; o 5o recebe "cheio". Se a conexao cai,
o controle fica reservado por TEMPO_RESERVA segundos: se o mesmo id voltar,
reaproveita o mesmo numero e controle; senao, o controle some e a vaga
fica livre ("sair" libera na hora). A cada INTERVALO_LATENCIA segundos
imprime a latencia media de cada jogador conectado.

Rodar: python servidor.py
Parar: Ctrl + C
"""

import asyncio
import email.utils
import json
import math
import socket
import time
from datetime import datetime
from http import HTTPStatus
from pathlib import Path

import vgamepad as vg
from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosedError
from websockets.http11 import Response

PORTA = 8765
PASTA_WEB = (Path(__file__).parent / "web").resolve()
NOME_PC = socket.gethostname()
# Arquivos da pasta web/ que podem ser entregues ao celular (extensao -> tipo)
TIPOS_ARQUIVO = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
}
INTERVALO_LOG_ANALOGICO = 0.2  # segundos entre linhas impressas de cada analogico
MAX_JOGADORES = 4  # limite de controles XInput no Windows
TEMPO_RESERVA = 10  # segundos que a vaga fica guardada quando a conexao cai
CODIGO_SUBSTITUIDA = 4001  # fechamento da conexao antiga quando o mesmo id conecta de novo
INTERVALO_LATENCIA = 30  # segundos entre as linhas de latencia media no terminal


class Sessao:
    """Um jogador: numero, controle virtual e a conexao atual (None enquanto caido)."""

    def __init__(self, id_celular, jogador, controle):
        self.id = id_celular
        self.jogador = jogador
        self.controle = controle
        self.websocket = None
        self.origem = ""
        self.remocao = None  # tarefa que remove o controle se ele nao voltar a tempo
        self.latencias = []  # medidas (s) desde a ultima linha de latencia media


sessoes = {}  # id do celular -> Sessao
jogadores = {}  # numero do jogador (1 a 4) -> Sessao
tarefas_soltas = set()  # o asyncio so guarda referencia fraca das tarefas criadas

# Nome do botao no protocolo -> botao do controle Xbox
BOTOES = {
    "A": vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
    "B": vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
    "X": vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
    "Y": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
    "LB": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
    "RB": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
    "LS": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_THUMB,   # clique do analogico esquerdo (L3)
    "RS": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_THUMB,  # clique do analogico direito (R3)
    "View": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
    "Menu": vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
    "Guia": vg.XUSB_BUTTON.XUSB_GAMEPAD_GUIDE,
    "Cima": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
    "Baixo": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
    "Esquerda": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
    "Direita": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
}


def ip_local():
    """Descobre o IP do PC na rede local (o que o celular deve digitar)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # nao envia nada, so escolhe a placa de rede
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def agora():
    return datetime.now().strftime("%H:%M:%S")


def responder(corpo, extensao):
    """Resposta HTTP 200 com o conteudo de um arquivo (texto ou binario, como as fontes)."""
    cabecalhos = Headers([
        ("Date", email.utils.formatdate(usegmt=True)),
        ("Connection", "close"),
        ("Content-Length", str(len(corpo))),
        ("Content-Type", TIPOS_ARQUIVO[extensao]),
        ("Cache-Control", "no-cache"),  # o celular sempre pega a versao mais nova
    ])
    return Response(HTTPStatus.OK.value, HTTPStatus.OK.phrase, cabecalhos, corpo)


def servir_pagina(conexao, requisicao):
    """Entrega os arquivos da pasta web/; deixa passar so o WebSocket em /ws."""
    caminho = requisicao.path.split("?", 1)[0]
    if caminho == "/ws":
        return None
    if caminho == "/layouts/lista.json":
        # Para criar um layout novo basta por um arquivo .js em web/layouts/
        nomes = sorted(p.name for p in (PASTA_WEB / "layouts").glob("*.js"))
        return responder(json.dumps(nomes).encode(), ".json")
    if caminho == "/":
        caminho = "/index.html"
    arquivo = (PASTA_WEB / caminho.lstrip("/")).resolve()
    # So arquivos de dentro da pasta web/ (nada de "../servidor.py") e de tipos conhecidos
    if PASTA_WEB not in arquivo.parents or arquivo.suffix not in TIPOS_ARQUIVO or not arquivo.is_file():
        return conexao.respond(HTTPStatus.NOT_FOUND, "Nao encontrado\n")
    return responder(arquivo.read_bytes(), arquivo.suffix)


def criar_controle(origem):
    try:
        controle = vg.VX360Gamepad()
    except Exception as erro:
        print(f"{agora()} [!] {origem} nao foi possivel criar o controle virtual: {erro!r}")
        return None
    return controle


def reenviar_estado(controle):
    """Reenvia o estado atual do controle. O driver ignora um envio igual ao anterior,
    entao manda antes uma variacao minima no eixo (1 de 32767, imperceptivel)."""
    lx = controle.report.sThumbLX
    controle.report.sThumbLX = lx + 1 if lx < 32767 else lx - 1
    controle.update()
    controle.report.sThumbLX = lx
    controle.update()


async def firmar_estado_inicial(sessao):
    """O primeiro envio de um controle recem-criado pode se perder enquanto o Windows
    ainda o reconhece; ai os analogicos aparecem ~10% fora do centro ate a primeira
    jogada. Reforca o estado algumas vezes no comeco para evitar isso."""
    for espera in (0.1, 0.4, 1.0):
        await asyncio.sleep(espera)
        if sessao.controle is None:
            return
        reenviar_estado(sessao.controle)


def vaga_livre():
    """Menor numero de jogador ainda nao usado, ou None se ja tem MAX_JOGADORES."""
    for jogador in range(1, MAX_JOGADORES + 1):
        if jogador not in jogadores:
            return jogador
    return None


def em_jogo():
    nomes = [f"J{n}" + ("(caiu)" if s.websocket is None else "") for n, s in sorted(jogadores.items())]
    return " ".join(nomes) or "ninguem"


def apertar_botao(controle, msg, origem):
    botao = BOTOES.get(msg.get("btn"))
    if botao is None:
        print(f"{agora()} [!] {origem} botao desconhecido: {msg.get('btn')!r}")
        return
    if msg.get("estado"):
        controle.press_button(button=botao)
    else:
        controle.release_button(button=botao)
    controle.update()


def numero(valor, minimo, maximo):
    """Converte para float dentro de [minimo, maximo]; None se nao for um numero valido."""
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(valor):
        return None
    return min(max(valor, minimo), maximo)


def mover_gatilho(controle, msg, origem):
    valor = numero(msg.get("valor", 0), 0.0, 1.0)
    if valor is None:
        print(f"{agora()} [!] {origem} valor de gatilho invalido: {msg.get('valor')!r}")
        return
    if msg.get("lado") == "esq":
        controle.left_trigger_float(value_float=valor)
    elif msg.get("lado") == "dir":
        controle.right_trigger_float(value_float=valor)
    else:
        print(f"{agora()} [!] {origem} lado de gatilho desconhecido: {msg.get('lado')!r}")
        return
    controle.update()


def mover_analogico(controle, msg, origem):
    x = numero(msg.get("x", 0), -1.0, 1.0)
    y = numero(msg.get("y", 0), -1.0, 1.0)
    if x is None or y is None:
        print(f"{agora()} [!] {origem} valor de analogico invalido: x={msg.get('x')!r} y={msg.get('y')!r}")
        return
    if msg.get("lado") == "esq":
        controle.left_joystick_float(x_value_float=x, y_value_float=y)
    elif msg.get("lado") == "dir":
        controle.right_joystick_float(x_value_float=x, y_value_float=y)
    else:
        print(f"{agora()} [!] {origem} lado de analogico desconhecido: {msg.get('lado')!r}")
        return
    controle.update()


def deve_imprimir(msg, ultimo_log):
    """Ao arrastar, cada analogico manda dezenas de mensagens por segundo: imprime
    no maximo uma a cada INTERVALO_LOG_ANALOGICO, e sempre a volta ao centro."""
    if msg.get("tipo") != "analogico":
        return True
    lado = msg.get("lado")
    if msg.get("x") == 0 and msg.get("y") == 0:
        ultimo_log.pop(lado, None)
        return True
    instante = time.monotonic()
    if instante - ultimo_log.get(lado, 0) >= INTERVALO_LOG_ANALOGICO:
        ultimo_log[lado] = instante
        return True
    return False


def em_segundo_plano(corrotina):
    tarefa = asyncio.create_task(corrotina)
    tarefas_soltas.add(tarefa)
    tarefa.add_done_callback(tarefas_soltas.discard)


async def entrar(websocket, msg, origem):
    """Liga a conexao a um jogador: o mesmo de antes (se o id voltou) ou um novo.
    Devolve a Sessao, ou None se a sala estiver cheia."""
    ip, porta = websocket.remote_address[:2]
    id_celular = str(msg.get("id") or origem)[:64]
    sessao = sessoes.get(id_celular)

    if sessao is not None:
        if sessao.remocao is not None:
            sessao.remocao.cancel()
            sessao.remocao = None
        antiga = sessao.websocket
        sessao.websocket = websocket
        sessao.origem = f"J{sessao.jogador} {ip}:{porta}"
        if antiga is not None:
            # Voltou antes de a conexao antiga ser dada como perdida: a nova assume
            em_segundo_plano(antiga.close(CODIGO_SUBSTITUIDA, "conectado de novo"))
        print(f"{agora()} [+] {sessao.origem} voltou como Jogador {sessao.jogador} | em jogo: {em_jogo()}")
    else:
        jogador = vaga_livre()
        if jogador is None:
            print(f"{agora()} [!] {origem} recusado: ja tem {MAX_JOGADORES} jogadores")
            await websocket.send(json.dumps({"tipo": "cheio"}))
            await websocket.close()
            return None
        controle = criar_controle(origem)
        if controle is None:
            return None
        sessao = Sessao(id_celular, jogador, controle)
        sessao.websocket = websocket
        sessao.origem = f"J{jogador} {ip}:{porta}"
        sessoes[id_celular] = sessao
        jogadores[jogador] = sessao
        em_segundo_plano(firmar_estado_inicial(sessao))
        print(f"{agora()} [+] {sessao.origem} entrou como Jogador {jogador} | em jogo: {em_jogo()}")

    await websocket.send(json.dumps({"tipo": "bem_vindo", "jogador": sessao.jogador, "pc": NOME_PC}))
    return sessao


def cair(sessao):
    """A conexao caiu: solta tudo e guarda a vaga por TEMPO_RESERVA segundos."""
    sessao.websocket = None
    sessao.controle.reset()  # nada fica apertado no jogo enquanto ele nao volta
    sessao.controle.update()
    sessao.remocao = asyncio.create_task(remover_se_nao_voltar(sessao))
    print(f"{agora()} [~] {sessao.origem} caiu: vaga reservada por {TEMPO_RESERVA} s | em jogo: {em_jogo()}")


async def remover_se_nao_voltar(sessao):
    await asyncio.sleep(TEMPO_RESERVA)
    sessao.remocao = None
    remover(sessao, f"nao voltou em {TEMPO_RESERVA} s")


def remover(sessao, motivo):
    """Tira o jogador: remove o controle do Windows e libera o numero."""
    if sessao.remocao is not None:
        sessao.remocao.cancel()
        sessao.remocao = None
    sessao.websocket = None
    del sessoes[sessao.id]
    del jogadores[sessao.jogador]
    sessao.controle.reset()  # nada fica apertado no jogo
    sessao.controle.update()
    # A vgamepad so remove o controle do Windows quando o objeto e apagado
    sessao.controle = None
    print(f"{agora()} [-] {sessao.origem} {motivo}: controle removido, vaga livre | em jogo: {em_jogo()}")


async def relatar_latencia():
    """Imprime a latencia media (e a pior) de cada jogador conectado. A latencia e
    medida pela biblioteca a cada ping automatico (ida e volta celular <-> PC)."""
    while True:
        await asyncio.sleep(INTERVALO_LATENCIA)
        partes = []
        for n, sessao in sorted(jogadores.items()):
            if sessao.latencias:
                media = sum(sessao.latencias) / len(sessao.latencias) * 1000
                pior = max(sessao.latencias) * 1000
                partes.append(f"J{n} {media:.0f} ms (pior {pior:.0f})")
                sessao.latencias.clear()
        if partes:
            print(f"{agora()} [i] latencia media nos ultimos {INTERVALO_LATENCIA} s: {', '.join(partes)}")


async def atender(websocket):
    """Uma chamada por celular conectado; dura enquanto a conexao estiver aberta."""
    ip, porta = websocket.remote_address[:2]
    origem = f"{ip}:{porta}"
    sessao = None
    ultimo_log = {}  # lado do analogico -> instante da ultima linha impressa
    print(f"{agora()} [+] conectou: {origem}")
    try:
        async for texto in websocket:
            try:
                msg = json.loads(texto)
            except json.JSONDecodeError:
                msg = None
            if not isinstance(msg, dict):
                print(f"{agora()} [!] {origem} mensagem invalida: {texto!r}")
                continue

            if msg.get("tipo") == "ping":
                # Responde sem imprimir: chega um ping por segundo
                await websocket.send(json.dumps({"tipo": "pong", "t": msg.get("t")}))
                if sessao is not None and sessao.websocket is websocket and websocket.latency > 0:
                    sessao.latencias.append(websocket.latency)
                continue

            if deve_imprimir(msg, ultimo_log):
                print(f"{agora()} {origem} -> {texto}")

            if msg.get("tipo") == "entrar" and sessao is None:
                sessao = await entrar(websocket, msg, origem)
                if sessao is None:
                    break
                origem = sessao.origem
            elif sessao is None or sessao.websocket is not websocket:
                continue  # ainda nao entrou, ou outra conexao assumiu este jogador
            elif msg.get("tipo") == "sair":
                # "Desconectar" no menu: libera a vaga na hora, sem reserva
                remover(sessao, "saiu pelo menu")
                sessao = None
                break
            elif msg.get("tipo") == "botao":
                apertar_botao(sessao.controle, msg, origem)
            elif msg.get("tipo") == "gatilho":
                mover_gatilho(sessao.controle, msg, origem)
            elif msg.get("tipo") == "analogico":
                mover_analogico(sessao.controle, msg, origem)
    except ConnectionClosedError:
        pass  # celular caiu sem se despedir (Wi-Fi, aba fechada...)
    finally:
        # Se o mesmo celular ja conectou de novo, a conexao nova e que cuida do jogador
        if sessao is not None and sessao.websocket is websocket:
            cair(sessao)
        print(f"{agora()} [-] desconectou: {origem}")


async def main():
    # Ping a cada 2 s com 3 s de tolerancia, e so 1 s esperando a despedida de quem
    # sumiu: percebe um celular com o Wi-Fi desligado em ~6 s (o padrao da biblioteca
    # levaria ate 50 s)
    async with serve(atender, "0.0.0.0", PORTA, process_request=servir_pagina,
                     ping_interval=2, ping_timeout=3, close_timeout=1) as servidor:
        em_segundo_plano(relatar_latencia())
        print("Servidor do Controle Wi-Fi rodando.")
        print(f"No celular (mesma rede Wi-Fi), abra: http://{ip_local()}:{PORTA}")
        print("Para parar: Ctrl + C")
        await servidor.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Servidor encerrado.")
