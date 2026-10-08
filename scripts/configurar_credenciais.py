"""Gera o refresh token do Google Ads e configura as credenciais localmente.

Rode no SEU terminal (nao pelo Claude):
    python scripts\\configurar_credenciais.py

O que faz:
1. Pede o developer token e o ID da MCC (digitacao oculta).
2. Abre o navegador para voce autorizar com a conta Google da MCC.
3. Grava C:\\Users\\<voce>\\google-ads.yaml (fora de qualquer repositorio).
4. Registra o MCP "google-ads" no Claude Code, so para esta pasta.

Nenhum segredo e impresso na tela nem salvo dentro do projeto.
"""

import getpass
import json
import subprocess
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPE = ["https://www.googleapis.com/auth/adwords"]
YAML_PATH = Path.home() / "google-ads.yaml"
MCP_EXE = Path.home() / ".local" / "bin" / "google-ads-mcp.exe"
PASTA_PROJETO = Path(__file__).resolve().parent.parent


def main():
    # Arrastar o arquivo para o PowerShell cola "& 'C:\...\x.json'": tira o & e as aspas.
    json_path = input("Caminho do JSON do cliente OAuth (baixado do Cloud): ").strip()
    json_path = json_path.removeprefix("&").strip().strip("'\"")
    dados = json.loads(Path(json_path).read_text(encoding="utf-8"))
    if "installed" not in dados:
        raise SystemExit("Esse JSON nao e do tipo 'App para computador'. Crie uma credencial desse tipo.")
    client_id = dados["installed"]["client_id"]
    client_secret = dados["installed"]["client_secret"]

    developer_token = getpass.getpass("Developer token (oculto): ").strip()
    mcc_id = input("ID da MCC (10 digitos): ").strip().replace("-", "")
    if not (mcc_id.isdigit() and len(mcc_id) == 10):
        raise SystemExit("ID da MCC precisa ter 10 digitos.")

    print("\nAbrindo o navegador. Entre com a conta Google que administra a MCC.")
    flow = InstalledAppFlow.from_client_secrets_file(json_path, scopes=SCOPE)
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    if not creds.refresh_token:
        raise SystemExit("O Google nao devolveu refresh token. Revogue o acesso do app na conta e rode de novo.")

    YAML_PATH.write_text(
        f"developer_token: {developer_token}\n"
        f"client_id: {client_id}\n"
        f"client_secret: {client_secret}\n"
        f"refresh_token: {creds.refresh_token}\n"
        f"login_customer_id: {mcc_id}\n"
        "use_proto_plus: True\n",
        encoding="utf-8",
    )
    print(f"Credenciais gravadas em {YAML_PATH}")

    subprocess.run(["claude", "mcp", "remove", "google-ads", "-s", "local"],
                   cwd=PASTA_PROJETO, capture_output=True, shell=True)
    resultado = subprocess.run(
        ["claude", "mcp", "add", "google-ads", "-s", "local",
         "-e", f"GOOGLE_ADS_DEVELOPER_TOKEN={developer_token}",
         "-e", f"GOOGLE_ADS_CLIENT_ID={client_id}",
         "-e", f"GOOGLE_ADS_CLIENT_SECRET={client_secret}",
         "-e", f"GOOGLE_ADS_REFRESH_TOKEN={creds.refresh_token}",
         "-e", f"GOOGLE_ADS_LOGIN_CUSTOMER_ID={mcc_id}",
         "--", str(MCP_EXE)],
        cwd=PASTA_PROJETO, capture_output=True, text=True, shell=True,
    )
    if resultado.returncode == 0:
        print("MCP 'google-ads' registrado no Claude Code para a pasta trafego-resili.")
    else:
        print("Falhou ao registrar o MCP. Me mostre esta mensagem (nao contem segredo):")
        print(resultado.stderr.replace(developer_token, "***").replace(client_secret, "***"))

    print("\nPronto. Abra o Claude Code dentro de C:\\PROJETOS\\trafego-resili.")


if __name__ == "__main__":
    main()
