"""
Etapa 1 - Teste do ambiente (Controle Wi-Fi)

Cria um controle Xbox 360 virtual, espera 5 segundos e depois, 10 vezes,
aperta o botao A e empurra o analogico esquerdo para a direita por meio
segundo, soltando em seguida.

Para conferir: Win + R > joy.cpl > selecione "Controller (XBOX 360 For Windows)"
> Propriedades.
"""

import time

import vgamepad as vg

ESPERA_INICIAL = 5   # segundos antes de comecar (tempo para abrir o joy.cpl)
REPETICOES = 10
TEMPO_APERTADO = 0.5  # segundos com A apertado e analogico para a direita
TEMPO_SOLTO = 0.5     # segundos com tudo solto entre uma repeticao e outra


def main():
    try:
        controle = vg.VX360Gamepad()
    except Exception as erro:
        print("Nao foi possivel criar o controle virtual.")
        print("Verifique se o driver ViGEmBus esta instalado.")
        print(f"Detalhe do erro: {erro!r}")
        return

    print("Controle Xbox 360 virtual criado.")
    print(f"Comecando em {ESPERA_INICIAL} segundos... abra o joy.cpl > Propriedades.")
    time.sleep(ESPERA_INICIAL)

    for i in range(1, REPETICOES + 1):
        print(f"[{i}/{REPETICOES}] A apertado + analogico esquerdo para a direita")
        controle.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
        controle.left_joystick_float(x_value_float=1.0, y_value_float=0.0)
        controle.update()
        time.sleep(TEMPO_APERTADO)

        controle.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
        controle.left_joystick_float(x_value_float=0.0, y_value_float=0.0)
        controle.update()
        time.sleep(TEMPO_SOLTO)

    controle.reset()
    controle.update()
    print("Teste concluido. O controle virtual some quando o script termina.")


if __name__ == "__main__":
    main()
