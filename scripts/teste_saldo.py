"""Fase 1, passo 1 — descobre de onde sai o saldo de cada conta de anúncio.

SÓ LEITURA. Não altera nada em conta nenhuma. Imprime, por conta, o que cada
campo candidato devolve, para preencher a seção 7 do BRIEFING antes de
modelar `trafego.saldo_conta`.

Credenciais vêm das MESMAS variáveis de ambiente que a Vercel vai usar
(seção 5 do BRIEFING). Nada é lido de arquivo do projeto, nada é impresso.
    META_SYSTEM_USER_TOKEN
    GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN
Sem as do Google, tenta ~/google-ads.yaml (o que o scripts/configurar_credenciais.py
gera). Plataforma sem credencial é pulada com aviso.

Uso:
    python scripts/teste_saldo.py            # Meta e Google
    python scripts/teste_saldo.py meta       # só uma plataforma

A resposta bruta vai também para saida/saldo-<data>.json (pasta fora do git),
para comparar com o painel com calma.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v23.0"
SAIDA = Path(__file__).resolve().parent.parent / "saida"

# Campos candidatos a saldo na Meta. Valores monetários (amount_spent,
# spend_cap, balance) vêm em CENTAVOS da moeda da conta, como string.
META_CAMPOS = ",".join([
    "name", "account_id", "currency", "timezone_name", "account_status",
    "is_prepay_account", "amount_spent", "spend_cap", "balance",
    "funding_source",
])
# Pedido à parte: com "Ver desempenho" a Meta nega este campo (#10) e, se ele
# for junto na listagem, derruba a chamada inteira.
META_CAMPO_FUNDING = "funding_source_details"


def centavos(v):
    return None if v in (None, "") else int(v) / 100


def testar_meta():
    token = os.environ.get("META_SYSTEM_USER_TOKEN")
    if not token:
        print("\n[Meta] META_SYSTEM_USER_TOKEN ausente — pulando.")
        return []

    print("\n" + "=" * 70 + "\nMETA\n" + "=" * 70)
    contas, url = [], f"{GRAPH}/me/adaccounts"
    params = {"fields": META_CAMPOS, "limit": 100, "access_token": token}
    while url:
        r = requests.get(url, params=params, timeout=30)
        dados = r.json()
        if "error" in dados:
            # A mensagem da Graph API não contém o token.
            raise SystemExit(f"[Meta] erro: {dados['error'].get('message')}")
        contas += dados.get("data", [])
        url, params = dados.get("paging", {}).get("next"), None  # next já traz os params

    for c in contas:
        gasto, teto = centavos(c.get("amount_spent")), centavos(c.get("spend_cap"))
        r = requests.get(f"{GRAPH}/act_{c.get('account_id')}",
                         params={"fields": META_CAMPO_FUNDING, "access_token": token}, timeout=30).json()
        if "error" in r:
            c[META_CAMPO_FUNDING] = {"erro": r["error"].get("message")}
        else:
            c[META_CAMPO_FUNDING] = r.get(META_CAMPO_FUNDING)
        fsd = c.get(META_CAMPO_FUNDING) or {}
        print(f"\n▶ {c.get('name')}  (act_{c.get('account_id')}, {c.get('currency')}, {c.get('timezone_name')})")
        print(f"  status da conta ........ {c.get('account_status')}")
        print(f"  is_prepay_account ...... {c.get('is_prepay_account')}")
        print(f"  balance ................ {centavos(c.get('balance'))}")
        print(f"  amount_spent ........... {gasto}")
        print(f"  spend_cap .............. {teto}  (0/vazio = sem limite)")
        if teto and gasto is not None:
            print(f"  spend_cap − gasto ...... {round(teto - gasto, 2)}")
        if "erro" in fsd:
            print(f"  funding_source_details . NEGADO ({fsd['erro']})")
        print(f"  funding type ........... {fsd.get('type')}")
        print(f"  funding display_string . {fsd.get('display_string')!r}")
    return [{"plataforma": "meta", **c} for c in contas]


def cliente_google():
    from google.ads.googleads.client import GoogleAdsClient

    if os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN"):
        os.environ.setdefault("GOOGLE_ADS_USE_PROTO_PLUS", "True")
        return GoogleAdsClient.load_from_env()
    yaml = Path.home() / "google-ads.yaml"
    if yaml.exists():
        return GoogleAdsClient.load_from_storage(str(yaml))
    return None


def testar_google():
    cliente = cliente_google()
    if cliente is None:
        print("\n[Google] sem variáveis GOOGLE_ADS_* nem ~/google-ads.yaml — pulando.")
        return []

    print("\n" + "=" * 70 + "\nGOOGLE ADS\n" + "=" * 70)
    ga = cliente.get_service("GoogleAdsService")
    mcc = str(cliente.login_customer_id).replace("-", "")

    filhas = ga.search(customer_id=mcc, query="""
        SELECT customer_client.id, customer_client.descriptive_name,
               customer_client.currency_code, customer_client.time_zone,
               customer_client.status
        FROM customer_client
        WHERE customer_client.manager = FALSE AND customer_client.level >= 1""")

    resultado = []
    for linha in filhas:
        cc = linha.customer_client
        cid = str(cc.id)
        print(f"\n▶ {cc.descriptive_name}  ({cid}, {cc.currency_code}, {cc.time_zone}, {cc.status.name})")
        conta = {"plataforma": "google", "customer_id": cid, "nome": cc.descriptive_name,
                 "moeda": cc.currency_code, "status": cc.status.name,
                 "billing_setup": [], "account_budget": [], "erro": None}
        try:
            for b in ga.search(customer_id=cid, query="""
                    SELECT billing_setup.id, billing_setup.status,
                           billing_setup.payments_account_info.payments_account_name
                    FROM billing_setup"""):
                bs = b.billing_setup
                item = {"id": bs.id, "status": bs.status.name,
                        "payments_account": bs.payments_account_info.payments_account_name}
                conta["billing_setup"].append(item)
                print(f"  billing_setup .......... {item}")

            for a in ga.search(customer_id=cid, query="""
                    SELECT account_budget.id, account_budget.status, account_budget.name,
                           account_budget.approved_spending_limit_micros,
                           account_budget.approved_spending_limit_type,
                           account_budget.adjusted_spending_limit_micros,
                           account_budget.amount_served_micros,
                           account_budget.total_adjustments_micros,
                           account_budget.approved_start_date_time,
                           account_budget.approved_end_date_time
                    FROM account_budget"""):
                ab = a.account_budget
                limite = ab.adjusted_spending_limit_micros or ab.approved_spending_limit_micros
                item = {
                    "id": ab.id, "status": ab.status.name, "nome": ab.name,
                    "aprovado": ab.approved_spending_limit_micros / 1e6,
                    "tipo_limite": ab.approved_spending_limit_type.name,
                    "ajustado": ab.adjusted_spending_limit_micros / 1e6,
                    "gasto": ab.amount_served_micros / 1e6,
                    "ajustes": ab.total_adjustments_micros / 1e6,
                    "inicio": ab.approved_start_date_time,
                    "fim": ab.approved_end_date_time,
                    "restante": round((limite - ab.amount_served_micros) / 1e6, 2) if limite else None,
                }
                conta["account_budget"].append(item)
                print(f"  account_budget ......... {item}")

            if not conta["billing_setup"] and not conta["account_budget"]:
                print("  (nenhum billing_setup nem account_budget — provável pré-pago manual)")
        except Exception as e:  # GoogleAdsException: mensagem não carrega credencial
            conta["erro"] = str(getattr(e, "failure", e))
            print(f"  ERRO ................... {conta['erro']}")
        resultado.append(conta)
    return resultado


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # console do Windows quebra acento
    alvo = sys.argv[1].lower() if len(sys.argv) > 1 else "todas"
    dados = []
    if alvo in ("todas", "meta"):
        dados += testar_meta()
    if alvo in ("todas", "google"):
        dados += testar_google()

    if dados:
        SAIDA.mkdir(exist_ok=True)
        arq = SAIDA / f"saldo-{datetime.now():%Y%m%d-%H%M}.json"
        arq.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        print(f"\nBruto salvo em {arq}")


if __name__ == "__main__":
    main()
