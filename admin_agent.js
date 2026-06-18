// Configuração do Firebase (Herda do app.js / adm.js se disponível, mas aqui definimos localmente)
// Caso o firebase-app esteja carregado globalmente, apenas inicializamos se necessário.

let db;
let currentEditId = null;

async function initAdminAgent() {
    // Busca config do firebase do localStorage ou variáveis globais
    // Aqui assumimos que as variáveis de config já estão no ambiente ou usaremos as padrões do projeto
    const firebaseConfig = {
      apiKey: "AIzaSyASa8uMK4O1U_bQC5Ykl-OflJttFSJFNnM",
      authDomain: "orange-proof.firebaseapp.com",
      databaseURL: "https://orange-proof-default-rtdb.firebaseio.com",
      projectId: "orange-proof",
      storageBucket: "orange-proof.firebasestorage.app",
      messagingSenderId: "619099154724",
      appId: "1:619099154724:web:e61ff7ce22e29be929ebb1"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    db = firebase.database();
    loadIntents();
}

function loadIntents() {
    const listDiv = document.getElementById('intents-list');
    db.ref('admin/agent_intents').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            listDiv.innerHTML = `
                <div style="text-align: center; padding: 60px; opacity: 0.6;">
                    <span class="material-symbols-outlined" style="font-size: 64px; color: var(--primary);">psychology_alt</span>
                    <h3 style="margin-top:16px;">Nenhum gatilho personalizado</h3>
                    <p>Crie o primeiro comando para ensinar o Agente Bizu!</p>
                </div>`;
            return;
        }

        listDiv.innerHTML = '';
        Object.entries(data).forEach(([id, intent]) => {
            const card = document.createElement('div');
            card.className = 'intent-card';
            card.onclick = () => openEditModal(id, intent);

            card.innerHTML = `
                <div class="intent-header">
                    <div class="intent-trigger">${intent.trigger}</div>
                    <div class="intent-action-badge">${intent.action}</div>
                </div>
                ${intent.response ? `<div class="intent-response">${intent.response}</div>` : '<div style="font-size:0.8rem; opacity:0.5;">(Usa resposta padrão do sistema)</div>'}
                <div style="position: absolute; right: 20px; bottom: 20px; opacity: 0.3;">
                    <span class="material-symbols-outlined">edit</span>
                </div>
            `;
            listDiv.appendChild(card);
        });
    });
}

function openCreateModal() {
    currentEditId = null;
    document.getElementById('modal-title').innerText = "Novo Gatilho de Mensagem";
    document.getElementById('field-trigger').value = "";
    document.getElementById('field-action').value = "PLAIN_TEXT";
    document.getElementById('field-response').value = "";
    document.getElementById('btn-delete').classList.add('hidden');
    document.getElementById('intent-modal').classList.remove('hidden');
    toggleActionFields();
}

function openEditModal(id, intent) {
    currentEditId = id;
    document.getElementById('modal-title').innerText = "Editar Configuração";
    document.getElementById('field-trigger').value = intent.trigger;
    document.getElementById('field-action').value = intent.action;
    document.getElementById('field-response').value = intent.response || "";
    document.getElementById('btn-delete').classList.remove('hidden');
    document.getElementById('intent-modal').classList.remove('hidden');
    toggleActionFields();
}

function closeModal() {
    document.getElementById('intent-modal').classList.add('hidden');
}

const defaultResponses = {
    'PLAIN_TEXT': "Olá {userName}, como posso ajudar? 😊",
    'CREATE_EVENT': "Agendado com sucesso {userName}! O evento '{title}' foi marcado para o dia {date} às {time}. ✅",
    'LIST_EVENTS': "Aqui estão seus compromissos para o dia {date}, {userName}: 📅",
    'DELETE_EVENT': "Tudo certo! Acabei de cancelar o evento '{title}' do dia {date}. 🗑️",
    'SCALE_CHECK': "Aqui está o resumo da sua escala para os próximos 7 dias, {userName}: 📊",
    'SCALE_DATE_CHECK': "Verificando a escala do dia {date} para você, {userName}! 📅",
    'NEXT_OFF': "Sua próxima folga será no dia {date}. Aproveite o descanso, {userName}! 🏖️",
    'FINANCIAL_LOG': "Lançamento de {amount} realizado! Salvei '{title}' no mês de {month}. 💰",
    'SYSTEM_JOKE': "Com certeza, {userName}! Aqui vai uma: 😂",
    'SYSTEM_MOVIE': "Boa ideia, {userName}! Tenho uma ótima sugestão de filme: 🎬",
    'SYSTEM_BIBLE': "Aqui está uma palavra para o seu coração hoje, {userName}: 🙏",
    'SYSTEM_MOTIVATION': "Mantenha o foco, {userName}! Lembre-se disto: 💡",
    'SYSTEM_HELP': "Estou aqui para ajudar, {userName}! Veja o que eu posso fazer: 🦾"
};

function toggleActionFields() {
    const action = document.getElementById('field-action').value;
    const hintsDiv = document.getElementById('variable-hints');
    const labelResp = document.getElementById('label-response');
    const textarea = document.getElementById('field-response');
    
    // Preenchimento automático sempre que a ação muda
    if (defaultResponses[action]) {
        textarea.value = defaultResponses[action];
    }
    
    // Atualiza hints de variáveis com base na ação
    let hints = ['{userName}'];
    
    if (action === 'CREATE_EVENT') {
        hints.push('{title}', '{date}', '{time}');
        labelResp.innerText = "Resposta confirmando o agendamento";
    } else if (action === 'LIST_EVENTS') {
        hints.push('{date}', '{count}');
        labelResp.innerText = "Resposta antes de listar os eventos";
    } else if (action === 'DELETE_EVENT') {
        hints.push('{title}', '{date}');
        labelResp.innerText = "Resposta de confirmação de exclusão";
    } else if (action === 'FINANCIAL_LOG') {
        hints.push('{amount}', '{title}', '{month}');
        labelResp.innerText = "Resposta confirmando o lançamento";
    } else if (action === 'SCALE_DATE_CHECK') {
        hints.push('{date}', '{userName}');
        labelResp.innerText = "Resposta enquanto verifica a data informada pelo usuário";
    } else if (action === 'NEXT_OFF') {
        hints.push('{date}');
        labelResp.innerText = "Resposta sobre a próxima folga";
    } else if (action.startsWith('SYSTEM_')) {
        labelResp.innerText = "Resposta que acompanha a ação do sistema (Opcional)";
    } else {
        labelResp.innerText = "Resposta Customizada";
    }
    
    hintsDiv.innerHTML = hints.map(h => `<span class="variable-tag" onclick="insertVar('${h}')">${h}</span>`).join('');
}

function insertVar(v) {
    const textarea = document.getElementById('field-response');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + v + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + v.length, start + v.length);
}

function saveIntent() {
    const trigger = document.getElementById('field-trigger').value.trim();
    const action = document.getElementById('field-action').value;
    const response = document.getElementById('field-response').value.trim();

    if (!trigger) {
        alert("O gatilho é obrigatório!");
        return;
    }

    const payload = {
        trigger: trigger,
        action: action,
        response: response,
        updatedAt: new Date().toISOString()
    };

    if (currentEditId) {
        db.ref('admin/agent_intents/' + currentEditId).update(payload);
    } else {
        db.ref('admin/agent_intents').push(payload);
    }

    closeModal();
}

function deleteIntent() {
    if (!currentEditId) return;
    if (confirm("Tem certeza que deseja apagar este gatilho?")) {
        db.ref('admin/agent_intents/' + currentEditId).remove();
        closeModal();
    }
}

// Inicializa ao carregar
window.onload = initAdminAgent;
