# Controle Wi-Fi

Transforma o celular em controle de Xbox para o PC, pela rede Wi-Fi (até 4 jogadores).

## Git clone

```
git clone URL-DO-REPOSITORIO
```

## Instalações

- **Python 3.11 ou mais novo**: https://www.python.org/downloads/windows/ (na instalação, marque **"Add python.exe to PATH"**)
- **Driver ViGEmBus**: instalado junto com as bibliotecas (aceite o pedido de administrador). Só se não instalar sozinho: https://github.com/nefarius/ViGEmBus/releases

## Acesse a pasta do projeto

```
cd ProjetoControle
```

## Comando para iniciar

Na primeira vez, instale as bibliotecas:

```
python -m pip install -r requirements.txt
```

Para iniciar:

```
python servidor.py
```

No celular (mesma rede Wi-Fi), abra o endereço que aparecer no terminal. Na primeira vez, permita o Python no Firewall do Windows.
