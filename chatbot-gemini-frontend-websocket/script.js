const URL_BACKEND = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    let userSessionId = null;

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

    function iniciarConversa() {
        if (socket && socket.connected) {
            addMessageToChat('Status', 'A conversa já está conectada.', 'status');
            return;
        }

        socket = io(URL_BACKEND);

        socket.on('connect', () => {
            console.log('Conectado ao servidor Socket.IO! SID:', socket.id);

            atualizarStatus('Conectado', true);
            addMessageToChat('Status', 'Conectado ao servidor de chat.', 'status');
            setChatEnabled(true);
            messageInput.focus();
        });

        socket.on('disconnect', () => {
            console.log('Desconectado do servidor Socket.IO.');

            removerPensando();
            atualizarStatus('Desconectado', false);
            addMessageToChat('Status', 'Você foi desconectado.', 'status');
            setChatEnabled(false);
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

            addMessageToChat('Erro', data.erro || 'Erro desconhecido.', 'error');
            setChatEnabled(true);
            messageInput.focus();
        });
    }

    function encerrarConversa() {
        if (socket && socket.connected) {
            removerPensando();
            socket.disconnect();
            setChatEnabled(false);
            atualizarStatus('Desconectado', false);
            addMessageToChat('Status', 'Conversa encerrada pelo usuário.', 'status');
        } else {
            addMessageToChat('Status', 'A conversa já está desconectada.', 'status');
        }
    }

    function limparTela() {
        removerPensando();
        chatBox.innerHTML = '';
        addMessageToChat('Status', 'Tela limpa.', 'status');
    }

    function sendMessageToServer() {
        const messageText = messageInput.value.trim();

        if (messageText === '') {
            return;
        }

        if (socket && socket.connected) {
            addMessageToChat('user', messageText);

            messageInput.value = '';
            setChatEnabled(false);
            mostrarPensando();

            socket.emit('enviar_mensagem', {
                mensagem: messageText,
                modo_resposta: modoResposta ? modoResposta.value : 'curta'
            });
        } else {
            addMessageToChat('Erro', 'Não conectado ao servidor.', 'error');
        }
    }

    setChatEnabled(false);
    atualizarStatus('Desconectado', false);
    addMessageToChat('Status', 'Clique em "Iniciar conversa" para começar.', 'status');

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