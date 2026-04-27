'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyASa8uMK4O1U_bQC5Ykl-OflJttFSJFNnM",
  authDomain: "orange-proof.firebaseapp.com",
  databaseURL: "https://orange-proof-default-rtdb.firebaseio.com",
  projectId: "orange-proof",
  storageBucket: "orange-proof.firebasestorage.app",
  messagingSenderId: "619099154724",
  appId: "1:619099154724:web:e61ff7ce22e29be929ebb1"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let allUsers = {};
let currentModalUserId = null;

function checkAdminPass() {
    const input = document.getElementById('admin-pass');
    const error = document.getElementById('auth-error');
    if (input.value === '030225') {
        document.getElementById('auth-overlay').classList.add('hidden');
        loadDashboard();
    } else {
        error.classList.remove('hidden');
        input.value = '';
    }
}

// Allow Enter key to submit password
document.getElementById('admin-pass').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAdminPass();
});

async function loadDashboard() {
    try {
        const snap = await db.ref('users').once('value');
        allUsers = snap.val() || {};
        
        const userList = Object.entries(allUsers).map(([id, data]) => ({ id, ...data }));
        
        // Update stats
        document.getElementById('total-users-val').textContent = userList.length;
        
        let totalActionsCount = 0;
        userList.forEach(u => {
            if (u.stats && u.stats.actions) {
                Object.values(u.stats.actions).forEach(count => totalActionsCount += count);
            }
        });
        document.getElementById('total-actions-val').textContent = totalActionsCount;

        renderUserGrid(userList);
    } catch (e) {
        console.error("Erro ao carregar dashboard:", e);
        alert("Erro de permissão no Firebase. Verifique as regras do banco de dados.");
    }
}

function renderUserGrid(users) {
    const grid = document.getElementById('user-grid');
    grid.innerHTML = '';

    users.forEach(user => {
        const char = (user.displayName || user.email || '?').charAt(0).toUpperCase();
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <div class="user-avatar">${char}</div>
            <div class="user-info">
                <h3>${user.displayName || 'Sem Nome'}</h3>
                <p>${user.email || 'Sem Email'}</p>
            </div>
        `;
        card.onclick = () => openUserModal(user.id);
        grid.appendChild(card);
    });
}

function formatTime(seconds) {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    let res = '';
    if (h > 0) res += h + 'h ';
    if (m > 0 || h > 0) res += m + 'm ';
    res += s + 's';
    return res;
}

function openUserModal(userId) {
    const user = allUsers[userId];
    if (!user) return;

    document.getElementById('modal-user-avatar').textContent = (user.displayName || user.email || '?').charAt(0).toUpperCase();
    document.getElementById('modal-user-name-input').value = user.displayName || '';
    document.getElementById('modal-user-email').textContent = user.email || 'Sem Email';
    document.getElementById('modal-user-id').textContent = userId;
    document.getElementById('modal-user-created').textContent = user.createdAt ? new Date(user.createdAt).toLocaleString() : '--';
    document.getElementById('modal-user-scale').textContent = user.scale ? (user.scale.display || 'Configurada') : 'Não personalizada';

    // Stats
    const timeSpent = user.stats ? user.stats.timeSpent : 0;
    document.getElementById('modal-user-time').textContent = formatTime(timeSpent);

    const actionsContainer = document.getElementById('modal-user-actions');
    actionsContainer.innerHTML = '';
    
    if (user.stats && user.stats.actions) {
        Object.entries(user.stats.actions).sort((a,b) => b[1] - a[1]).forEach(([action, count]) => {
            const chip = document.createElement('div');
            chip.className = 'action-chip';
            chip.innerHTML = `
                <span>${action.replace(/_/g, ' ')}</span>
                <span class="action-count">${count}</span>
            `;
            actionsContainer.appendChild(chip);
        });
    } else {
        actionsContainer.innerHTML = '<p style="color: var(--text2); font-size: 0.8rem;">Nenhuma ação registrada ainda.</p>';
    }

    currentModalUserId = userId;
    document.getElementById('user-modal').classList.remove('hidden');
}

async function resetUserPassword() {
    if (!currentModalUserId) return;
    const user = allUsers[currentModalUserId];
    if (!user || !user.email) return;

    if (!confirm(`Deseja enviar um e-mail de redefinição de senha para ${user.email}?`)) return;

    try {
        await firebase.auth().sendPasswordResetEmail(user.email);
        alert("E-mail de redefinição enviado com sucesso!");
    } catch (e) {
        console.error("Erro ao enviar reset:", e);
        alert("Erro ao enviar e-mail: " + (e.message || "Tente novamente mais tarde."));
    }
}

async function saveUserInfo() {
    if (!currentModalUserId) return;
    const newName = document.getElementById('modal-user-name-input').value.trim();
    
    if (!newName) {
        alert("O nome não pode estar vazio.");
        return;
    }

    try {
        await db.ref(`users/${currentModalUserId}`).update({ displayName: newName });
        alert("Dados atualizados com sucesso!");
        loadDashboard(); // Recarrega a lista
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar alterações.");
    }
}

async function deleteUser() {
    if (!currentModalUserId) return;
    const user = allUsers[currentModalUserId];
    
    const confirmMsg = `ATENÇÃO: Isso apagará todos os dados de ${user.displayName || user.email} da base de dados.\n\nEsta ação NÃO pode ser desfeita. Deseja continuar?`;
    
    if (!confirm(confirmMsg)) return;

    try {
        await db.ref(`users/${currentModalUserId}`).remove();
        alert("Usuário removido da base de dados com sucesso!");
        closeUserModal();
        loadDashboard();
    } catch (e) {
        console.error("Erro ao deletar:", e);
        alert("Erro ao deletar usuário.");
    }
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

// Close modal on click outside
window.onclick = function(event) {
    const modal = document.getElementById('user-modal');
    if (event.target === modal) {
        closeUserModal();
    }
}
