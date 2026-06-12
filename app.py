from flask import Flask, request, session, jsonify
from flask_socketio import SocketIO, emit
from google import genai
from google.genai import types
from dotenv import load_dotenv
from uuid import uuid4
import os
import requests
import sys
import re

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

MODELO = "gemini-2.5-flash"

instrucoes = """
Você é um ex-piloto de corrida, ama carros e tem muito conhecimento sobre mecânica automotiva.

Seu objetivo é ajudar os usuários com informações sobre:
- carros;
- motos;
- manutenção;
- mecânica;
- peças;
- segurança no trânsito;
- pilotagem segura;
- dúvidas do dia a dia sobre veículos.

Se o usuário perguntar algo fora desse tema, responda:
"Não sei muito sobre isso, mas posso ajudar com informações sobre carros, motos e mecânica!"

Se o usuário usar palavrões ou palavras ofensivas, responda normalmente, mas comece com um aviso educado.
Se o usuário continuar sendo ofensivo, diga:
"Me desculpe, mas você não está sendo educado. Eu não posso continuar essa conversa assim."

Conteúdos sexuais também não são permitidos.
Mantenha um tom direto, confiável e com estilo de ex-piloto experiente.
"""

UNSPLASH_API_URL = "https://api.unsplash.com/search/photos"

client = genai.Client(api_key=os.getenv("GENAI_KEY"))

app = Flask(
    __name__,
    static_folder="chatbot-gemini-frontend-websocket",
    static_url_path=""
)
app.secret_key = "ch@tb07"

socketio = SocketIO(app, cors_allowed_origins="*")

active_chats = {}


def get_user_chat():
    if "session_id" not in session:
        session["session_id"] = str(uuid4())
        print(f"Nova sessão Flask criada: {session['session_id']}")

    session_id = session["session_id"]

    if session_id not in active_chats or active_chats[session_id] is None:
        print(f"Criando novo chat Gemini para session_id: {session_id}")

        chat_session = client.chats.create(
            model=MODELO,
            config=types.GenerateContentConfig(
                system_instruction=instrucoes
            )
        )

        active_chats[session_id] = chat_session
        print(f"Novo chat Gemini criado para {session_id}")

    return active_chats[session_id]


def montar_termo_busca(mensagem):
    stopwords = {
        "qual", "quais", "sobre", "para", "com", "uma", "uns", "umas",
        "mais", "menos", "isso", "essa", "esse", "aqui", "como", "porque",
        "por", "que", "de", "do", "da", "dos", "das", "o", "a", "os", "as",
        "me", "mostra", "mostrar", "explique", "explica", "fala", "fale",
        "tem", "pode", "posso", "quero", "preciso"
    }

    palavras = re.findall(r"[a-zA-ZÀ-ÿ0-9]+", mensagem.lower())
    filtradas = [p for p in palavras if p not in stopwords and len(p) > 2]

    if not filtradas:
        return "car mechanic"

    return " ".join(filtradas[:6])


def gerar_termo_visual_com_ia(mensagem):
    prompt = f"""
Transforme a pergunta abaixo em uma busca curta e específica para imagens no Unsplash.

Regras:
- Responda somente com o termo de busca.
- Use inglês.
- Foque em carros, motos, peças, manutenção ou mecânica.
- Seja específico.
- Não use frases longas.
- Máximo 8 palavras.

Pergunta: {mensagem}
"""

    try:
        resposta = client.models.generate_content(
            model=MODELO,
            contents=prompt
        )

        termo = resposta.text.strip().replace('"', "")
        return termo if termo else montar_termo_busca(mensagem)

    except Exception as e:
        print(f"Erro ao gerar termo visual com IA: {e}")
        return montar_termo_busca(mensagem)


def search_car_image(search_term):
    try:
        unsplash_key = os.getenv("UNSPLASH_ACCESS_KEY")

        if not unsplash_key:
            print("AVISO: UNSPLASH_ACCESS_KEY não configurada no .env")
            return []

        headers = {
            "Authorization": f"Client-ID {unsplash_key}"
        }

        params = {
            "query": search_term,
            "per_page": 2,
            "orientation": "landscape",
            "content_filter": "high",
            "order_by": "relevant"
        }

        response = requests.get(
            UNSPLASH_API_URL,
            headers=headers,
            params=params,
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            images = []

            for result in data.get("results", []):
                images.append({
                    "url": result["urls"]["regular"],
                    "thumb": result["urls"]["thumb"],
                    "description": result.get("description") or result.get("alt_description") or search_term,
                    "photographer": result["user"]["name"],
                    "credit_url": result["user"]["links"]["html"]
                })

            return images

        print(f"Unsplash API error: {response.status_code}")
        print(response.text)
        return []

    except Exception as e:
        print(f"Erro ao buscar imagens: {e}")
        return []


@app.route("/")
def root():
    return jsonify({
        "api-websocket": "chatbot",
        "status": "ok"
    })


@socketio.on("connect")
def handle_connect():
    print(f"Cliente conectado: {request.sid}")

    try:
        get_user_chat()
        user_session_id = session.get("session_id", "N/A")

        emit("status_conexao", {
            "data": "Conectado com sucesso!",
            "session_id": user_session_id
        })

    except Exception as e:
        app.logger.error(
            f"Erro durante o evento connect para {request.sid}: {e}",
            exc_info=True
        )

        emit("erro", {
            "erro": "Falha ao inicializar a sessão de chat no servidor."
        })


@socketio.on("enviar_mensagem")
def handle_enviar_mensagem(data):
    try:
        mensagem_usuario = data.get("mensagem", "").strip()
        modo_resposta = data.get("modo_resposta", "curta")

        if not mensagem_usuario:
            emit("erro", {
                "erro": "Mensagem não pode ser vazia."
            })
            return

        user_chat = get_user_chat()

        if modo_resposta == "longa":
            instrucao_modo = """
Responda de forma detalhada, explicando causas, exemplos, cuidados e dicas práticas.
Organize a resposta em tópicos quando fizer sentido.
"""
        else:
            instrucao_modo = """
Responda de forma curta, direta ao ponto, sem enrolar.
Use no máximo 2 parágrafos curtos.
"""

        mensagem_final = f"""
{instrucao_modo}

Pergunta do usuário:
{mensagem_usuario}
"""

        resposta_gemini = user_chat.send_message(mensagem_final)

        resposta_texto = (
            resposta_gemini.text
            if hasattr(resposta_gemini, "text")
            else resposta_gemini.candidates[0].content.parts[0].text
        )

        termos_automotivos = [
            "carro", "carros", "moto", "motos", "motor", "motores",
            "peca", "peça", "pecas", "peças", "freio", "freios",
            "pneu", "pneus", "roda", "rodas", "suspensao", "suspensão",
            "direcao", "direção", "cambio", "câmbio", "embreagem",
            "filtro", "filtros", "oleo", "óleo", "escapamento",
            "bateria", "radiador", "turbo", "injecao", "injeção",
            "vela", "velas", "correia", "amortecedor", "amortecedores",
            "gasolina", "diesel", "etanol", "arrefecimento", "pastilha",
            "disco", "abs", "airbag", "alinhamento", "balanceamento",
            "transmissão", "transmissao", "mecânica", "mecanica",
            "oficina", "manutenção", "manutencao"
        ]

        mensagem_minuscula = mensagem_usuario.lower()

        tem_termo_automotivo = any(
            termo in mensagem_minuscula
            for termo in termos_automotivos
        )

        imagens_encontradas = []

        if tem_termo_automotivo:
            palavras_chave = montar_termo_busca(mensagem_usuario)

            print(f"Buscando imagens para: {palavras_chave}")

            imagens_encontradas = search_car_image(palavras_chave)

            print(f"Encontradas {len(imagens_encontradas)} imagens")

        emit("nova_mensagem", {
            "remetente": "bot",
            "texto": resposta_texto,
            "session_id": session.get("session_id"),
            "imagens": imagens_encontradas
        })

    except Exception as e:
        app.logger.error(
            f"Erro ao processar 'enviar_mensagem': {e}",
            exc_info=True
        )

        emit("erro", {
            "erro": f"Ocorreu um erro no servidor: {str(e)}"
        })


@socketio.on("disconnect")
def handle_disconnect():
    print(
        f"Cliente desconectado: {request.sid}, "
        f"session_id: {session.get('session_id', 'N/A')}"
    )


if __name__ == "__main__":
    print("=" * 50)
    print("Servidor do Chatbot Automotivo iniciando...")
    print("Porta: 5000")
    print(f"Gemini API: {'Configurada' if os.getenv('GENAI_KEY') else 'NÃO CONFIGURADA'}")
    print(f"Unsplash API: {'Configurada' if os.getenv('UNSPLASH_ACCESS_KEY') else 'NÃO CONFIGURADA'}")
    print("=" * 50)

    socketio.run(app, debug=True)