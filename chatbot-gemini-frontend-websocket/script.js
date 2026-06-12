const URL_BACKEND = "https://chat-bot-veiculos.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    let userSessionId = null;
    let isConnecting = false;
    let manualDisconnect = false;
    let wasConnectedOnce = false;
    let lastStatusText = '';
    let lastStatusTime = 0;

    const chatBox = document.getElementById('chat-box');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const connectionStatus = document.getElementById('connection-status');
    const iniciarBtn = document.getElementById('iniciarBtn');
    const encerrarBtn = document.getElementById('encerrarBtn');
    const limparBtn = document.getElementById('limparBtn');
    const modoResposta = document.getElementById('modo-resposta');

    function renderMarkdown(text) {
        if (typeof marked !== 'undefined') {
            return marked.parse(text || '');
        }

        return text || '';
    }

    function criarGaleriaImagens(imagens) {
        if (!Array.isArray(imagens) || imagens.length === 0) {
            return null;
        }

        const gallery = document.createElement('div');
        gallery.className = 'image-gallery';

        imagens.slice(0, 2).forEach((img) => {
            const item = document.createElement('a');
            item.className = 'gallery-item';
            item.href = img.url || img.thumb || '#';
            item.target = '_blank';
            item.rel = 'noopener noreferrer';

            const image = document.createElement('img');
            image.src = img.thumb || img.url;
            image.alt = img.description || 'Imagem automotiva';
            image.loading = 'lazy';

            const credit = document.createElement('div');
            credit.className = 'photo-credit';
            credit.textContent = img.photographer
                ? `Foto: ${img.photographer}`
                : 'Imagem relacionada';

            item.appendChild(image);
            item.appendChild(credit);
            gallery.appendChild(item);
        });

        return gallery;
    }

    function mostrarPensando() {
        removerPensando();

        const div = document.createElement('div');
        div.className = 'message bot-message thinking-message';
        div.id = 'thinking-message';

        div.innerHTML = `
            <span class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </span>
        `;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function removerPensando() {
        const thinking = document.getElementById('thinking-message');

        if (thinking) {
            thinking.remove();
        }
    }

    function addMessageToChat(sender, text, type = 'normal', imagens = []) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');

        let nomeRemetente = sender;

        if (sender.toLowerCase() === 'user') {
            messageElement.classList.add('user-message');
            nomeRemetente = 'Você';
        } else if (sender.toLowerCase() === 'bot') {
            messageElement.classList.add('bot-message');
            nomeRemetente = 'Bot';
        } else {
            messageElement.classList.add('status-message');
        }

        if (type === 'error') {
            messageElement.classList.add('error-text');
            nomeRemetente = 'Erro';
        } else if (type === 'status') {
            messageElement.classList.add('status-text');
            nomeRemetente = 'Status';
        }

        if (Array.isArray(imagens) && imagens.length > 0) {
            messageElement.classList.add('has-gallery');
        }

        const senderSpan = document.createElement('strong');
        senderSpan.textContent = `${nomeRemetente}: `;
        messageElement.appendChild(senderSpan);

        const textSpan = document.createElement('span');

        if (type === 'normal') {
            textSpan.innerHTML = renderMarkdown(text);
        } else {
            textSpan.textContent = text;
        }

        messageElement.appendChild(textSpan);

        const gallery = criarGaleriaImagens(imagens);
        if (gallery) {
            messageElement.appendChild(gallery);
        }

        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function addStatusMessage(text) {
        const now = Date.now();

        if (text === lastStatusText && now - lastStatusTime < 1500) {
            return;
        }

        lastStatusText = text;
        lastStatusTime = now;

        addMessageToChat('Status', text, 'status');
    }

    function addErrorMessage(text) {
        addMessageToChat('Erro', text, 'error');
    }

    function setChatEnabled(enabled) {
        messageInput.disabled = !enabled;
        sendButton.disabled = !enabled;
    }

    function atualizarStatus(texto, online) {
        connectionStatus.textContent = texto;

        if (online) {
            connectionStatus.className = 'status-online';
        } else {
            connectionStatus.className = 'status-offline';
        }
    }

    function limparSocketAntigo() {
        if (!socket) {
            return;
        }

        socket.removeAllListeners();

        if (socket.io) {
            socket.io.removeAllListeners();
        }

        socket.disconnect();
        socket = null;
    }

    function iniciarConversa() {
        if (socket && socket.connected) {
            addStatusMessage('A conversa já está conectada.');
            return;
        }

        if (isConnecting) {
            addStatusMessage('Já estou tentando conectar. Segura o capacete aí...');
            return;
        }

        limparSocketAntigo();

        manualDisconnect = false;
        isConnecting = true;

        atualizarStatus('Conectando...', false);
        addStatusMessage('Conectando ao servidor de chat...');

        socket = io(URL_BACKEND, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 4000,
            timeout: 10000
        });

        socket.on('connect', () => {
            console.log('Conectado ao servidor Socket.IO! SID:', socket.id);

            isConnecting = false;
            manualDisconnect = false;

            atualizarStatus('Conectado', true);
            setChatEnabled(true);
            messageInput.focus();

            if (wasConnectedOnce) {
                addStatusMessage('Reconectado ao servidor de chat.');
            } else {
                addStatusMessage('Conectado ao servidor de chat.');
                wasConnectedOnce = true;
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('Desconectado do servidor Socket.IO. Motivo:', reason);

            removerPensando();
            isConnecting = false;

            atualizarStatus('Desconectado', false);
            setChatEnabled(false);

            if (manualDisconnect || reason === 'io client disconnect') {
                return;
            }

            if (reason === 'io server disconnect') {
                addStatusMessage('Servidor encerrou a conexão. Clique em "Iniciar conversa" para reconectar.');
                return;
            }

            addStatusMessage(`Você foi desconectado. Tentando reconectar... Motivo: ${reason}`);
        });

        socket.on('connect_error', (err) => {
            console.error('Erro de conexão:', err.message);

            isConnecting = false;
            atualizarStatus('Erro de conexão', false);
            setChatEnabled(false);

            addErrorMessage(`Falha na conexão: ${err.message}`);
        });

        socket.io.on('reconnect_attempt', (attempt) => {
            console.log(`Tentando reconectar... tentativa ${attempt}`);

            atualizarStatus('Reconectando...', false);
            addStatusMessage(`Tentando reconectar... tentativa ${attempt}`);
        });

        socket.io.on('reconnect', () => {
            console.log('Reconectado com sucesso.');

            isConnecting = false;
            manualDisconnect = false;

            atualizarStatus('Conectado', true);
            setChatEnabled(true);
            messageInput.focus();

            addStatusMessage('Reconexão feita com sucesso.');
        });

        socket.io.on('reconnect_error', (err) => {
            console.error('Erro ao reconectar:', err.message);

            atualizarStatus('Reconectando...', false);
        });

        socket.io.on('reconnect_failed', () => {
            console.error('Falha definitiva na reconexão.');

            isConnecting = false;
            atualizarStatus('Desconectado', false);
            setChatEnabled(false);

            addErrorMessage('Não consegui reconectar ao servidor. Verifique se o backend está rodando.');
        });

        socket.on('status_conexao', (data) => {
            if (data.session_id) {
                userSessionId = data.session_id;
                console.log('Sessão do usuário:', userSessionId);
            }
        });

        socket.on('nova_mensagem', (data) => {
            removerPensando();

            addMessageToChat(
                data.remetente || 'bot',
                data.texto || '',
                'normal',
                data.imagens || []
            );

            setChatEnabled(true);
            messageInput.focus();
        });

        socket.on('erro', (data) => {
            removerPensando();

            addErrorMessage(data.erro || 'Erro desconhecido.');
            setChatEnabled(true);
            messageInput.focus();
        });
    }

    function encerrarConversa() {
        if (socket && socket.connected) {
            manualDisconnect = true;
            removerPensando();

            socket.disconnect();

            setChatEnabled(false);
            atualizarStatus('Desconectado', false);
            addStatusMessage('Conversa encerrada pelo usuário.');
            return;
        }

        if (socket) {
            manualDisconnect = true;
            limparSocketAntigo();
            setChatEnabled(false);
            atualizarStatus('Desconectado', false);
            addStatusMessage('Conversa encerrada pelo usuário.');
            return;
        }

        addStatusMessage('A conversa já está desconectada.');
    }

    function limparTela() {
        removerPensando();
        chatBox.innerHTML = '';
        addStatusMessage('Tela limpa.');
    }

    function sendMessageToServer() {
        const messageText = messageInput.value.trim();

        if (messageText === '') {
            return;
        }

        if (!socket || !socket.connected) {
            addErrorMessage('Não conectado ao servidor. Clique em "Iniciar conversa".');
            return;
        }

        addMessageToChat('user', messageText);

        messageInput.value = '';
        setChatEnabled(false);
        mostrarPensando();

        socket.emit('enviar_mensagem', {
            mensagem: messageText,
            modo_resposta: modoResposta ? modoResposta.value : 'curta'
        });
    }

    setChatEnabled(false);
    atualizarStatus('Desconectado', false);
    addStatusMessage('Clique em "Iniciar conversa" para começar.');

    iniciarBtn.addEventListener('click', iniciarConversa);
    encerrarBtn.addEventListener('click', encerrarConversa);
    limparBtn.addEventListener('click', limparTela);
    sendButton.addEventListener('click', sendMessageToServer);

    messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendMessageToServer();
        }
    });
});