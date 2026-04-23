/* ============================================================
   AgBizu v2 – Pure HTML/JS/CSS – app.js
   Firebase Realtime Database (Namespace/Legacy Mode - file://)
   ============================================================ */
'use strict';

// ======================== FIREBASE SETUP ========================
const firebaseConfig = {
  apiKey: "AIzaSyASa8uMK4O1U_bQC5Ykl-OflJttFSJFNnM",
  authDomain: "orange-proof.firebaseapp.com",
  databaseURL: "https://orange-proof-default-rtdb.firebaseio.com",
  projectId: "orange-proof",
  storageBucket: "orange-proof.firebasestorage.app",
  messagingSenderId: "619099154724",
  appId: "1:619099154724:web:e61ff7ce22e29be929ebb1"
};

// Inicializa o Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ======================== STATE ========================
const S = {
  currentUser: null,
  userScale: null,
  events: [],
  transactions: [],
  soundsEnabled: true,
  currentDate: new Date(),
  selectedDate: null,
  viewMode: 'month',
  customSeq: [],
  editingEventId: null,
  forceScale: false,
  lastRenderedYear: null,
  lastModalClose: 0,
  financeType: 'expense',
  editingTransactionId: null,
  editingOccurrenceDate: null,
  showGlobalFinance: localStorage.getItem('agbizu_show_global_finance') !== 'false'
};

// ======================== AUDIO ========================
const audio = {};
function loadAudio() {
  try {
    audio.click = new Audio('click.mp3');
    audio.modal = audio.click;
    audio.click.preload = 'auto';
  } catch (e) { }
}
function play(key) {
  if (!S.soundsEnabled) return;
  try { const a = audio[key]; if (a) { a.currentTime = 0; a.play().catch(() => { }); } } catch (e) { }
}

// Global click listener for sounds and modal blocking
let mouseDownTarget = null;
document.addEventListener('mousedown', (e) => { mouseDownTarget = e.target; });

document.addEventListener('click', (e) => {
  const activeModal = document.querySelector('.modal-overlay:not(.hidden)');

  // Se houver modal aberto
  if (activeModal) {
    const sheet = activeModal.querySelector('.modal-sheet');
    // Se o clique (tanto o mousedown quanto o mouseup/click target) for fora do "papel" do modal
    if (sheet && !sheet.contains(e.target) && !sheet.contains(mouseDownTarget)) {
      e.preventDefault();
      e.stopPropagation();
      play('click');
      closeModal(activeModal.id);
      return;
    }
  }

  // Prevenção de cliques duplos/fantasmas (cooldown após fechar modais)
  if (Date.now() - S.lastModalClose < 300) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Som de clique global (caso não tenha sido capturado pelo modal acima)
  if (e.target.closest('button, a, .day-cell, .mini-month, .lp-flag-btn, .chip, #fab-wrapper, [role="button"]')) {
    play('click');
  }
}, true);

// ======================== OVERLAY CARREGAMENTO ========================
function showLoading(msgKey = 'loading_wait') {
  const msg = typeof i18n !== 'undefined' ? i18n.t(msgKey) : msgKey;
  let el = document.getElementById('firebase-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'firebase-loading';
    el.style.cssText = `position:fixed;inset:0;background:#ffffff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;gap:14px;font-family:Inter,sans-serif;`;
    el.innerHTML = `<img class="imgGif" src="aberturaGif.gif" style="width:200px;height:200px;object-fit:contain;"><p id="fb-load-msg" style="color:#374151;font-size:.95rem;font-weight:500;margin-top:10px;">${msg}</p>`;
    document.body.appendChild(el);
  } else {
    document.getElementById('fb-load-msg').textContent = msg;
    el.style.display = 'flex';
  }
}
function hideLoading() {
  const el = document.getElementById('firebase-loading');
  if (el) el.style.display = 'none';
}

// ======================== FIREBASE STORAGE ========================
function userRef(path = '') {
  return db.ref(`users/${S.currentUser}${path ? '/' + path : ''}`);
}

async function saveProfile() {
  if (!S.currentUser) return;
  await userRef().update({
    scale: S.userScale || null,
    sounds: S.soundsEnabled
  });
}

function startRealtimeSync() {
  try {
    console.log("[DEBUG] Iniciando startRealtimeSync");
    if (!S.currentUser) return;

    userRef('events').off();
    userRef('events').on('value', (snap) => {
      console.log("[DEBUG] Sincronizando eventos...");
      const raw = snap.exists() ? snap.val() : {};
      S.events = Object.entries(raw).map(([k, v]) => ({ id: k, ...v }));
      S.lastRenderedYear = null;
      refreshCalendar();
    });

    userRef('transactions').off();
    userRef('transactions').on('value', (snap) => {
      console.log("[DEBUG] Sincronizando transações...");
      const raw = snap.exists() ? snap.val() : {};
      S.transactions = Object.entries(raw).map(([k, t]) => ({
        ...t,
        id: k,
        amount: parseFloat(t.amount) || 0,
        checked: t.checked || false
      }));
      if (!$('modal-finances').classList.contains('hidden')) updateFinanceUI();
      S.lastRenderedYear = null;
      refreshCalendar();
    });
  } catch (e) {
    console.error("Error in startRealtimeSync:", e);
  }
}

// Inicia o carregamento logo ao carregar o script (apenas se já tiver idioma definido)
if (localStorage.getItem('agbizu_lang')) {
  showLoading();
}

// ======================== AUTH LOGIC (Unified with ViewGo) ========================
let isLoginMode = true;
let currentAuthStep = 1;

window.resetAuthUI = function () {
  isLoginMode = true;
  currentAuthStep = 1;

  // Resetar inputs
  const inputs = document.querySelectorAll('.login-footer input');
  inputs.forEach(i => i.value = '');

  // Resetar erro
  const errEl = $('login-error');
  if (errEl) errEl.textContent = '';

  // Resetar Hero (Logo/Titulo)
  const screen = $('login-screen');
  if (screen) screen.classList.remove('focused');

  // Aplicar estado visual (Forçar login mode)
  // Como toggleAuthMode inverte, vamos setar isLoginMode false e chamar toggle
  isLoginMode = false;
  toggleAuthMode();
};

window.toggleAuthMode = function () {
  isLoginMode = !isLoginMode;
  currentAuthStep = 1;
  goToAuthStep(1);

  const groupName = $('group-name');
  const groupConfirm = $('group-confirm');
  const emailGroup = $('group-email-step1');
  const passGroup = $('group-password');
  const btnSubmit = $('btn-login-submit');
  const btnNext = $('btn-auth-next');
  const btnToggle = $('txt-toggle');
  const forgotBtn = $('btn-forgot-pass');
  const stepsIndicator = $('auth-steps-indicator');
  const step3 = $('step-3');
  const step4 = $('step-4');
  const titleEl = $('auth-section-title');

  if (isLoginMode) {
    if (titleEl) {
      titleEl.setAttribute('data-i18n', 'login_header_access');
      titleEl.textContent = typeof i18n !== 'undefined' ? i18n.t('login_header_access') : 'Acesso à Conta';
    }

    // Login 2 steps: Email -> Password
    groupName.classList.add('hidden');
    groupConfirm.classList.add('hidden');
    emailGroup.classList.remove('hidden');
    passGroup.classList.remove('hidden');
    stepsIndicator.classList.add('hidden');
    step3.classList.add('hidden');
    if (step4) step4.classList.add('hidden');

    // Move Email to Step 1, Password to Step 2
    $('step-1').appendChild(emailGroup);
    $('step-2').appendChild(passGroup);

    btnSubmit.classList.add('hidden');
    btnNext.classList.remove('hidden');
    btnToggle.innerHTML = i18n.t('login_no_account') || 'Não tem uma conta? <span style="color: var(--primary);">Cadastre-se grátis.</span>';
    if (forgotBtn) forgotBtn.classList.remove('hidden');
  } else {
    if (titleEl) {
      titleEl.setAttribute('data-i18n', 'login_header_register');
      titleEl.textContent = typeof i18n !== 'undefined' ? i18n.t('login_header_register') : 'Criar Nova Conta';
    }

    // Register 4 steps: Name -> Email -> Password -> Confirm
    groupName.classList.remove('hidden');
    groupConfirm.classList.remove('hidden');
    emailGroup.classList.remove('hidden');
    passGroup.classList.remove('hidden');
    stepsIndicator.classList.remove('hidden');
    step3.classList.remove('hidden');
    if (step4) step4.classList.remove('hidden');

    // Move Name to Step 1, Email to Step 2, Password to Step 3, Confirm to Step 4
    $('step-1').appendChild(groupName);
    $('step-2').appendChild(emailGroup);
    $('step-3').appendChild(passGroup);
    $('step-4').appendChild(groupConfirm);

    btnSubmit.classList.add('hidden');
    btnNext.classList.remove('hidden');
    btnToggle.innerHTML = i18n.t('login_have_account') || 'Já tem uma conta? <span style="color: var(--primary);">Fazer login</span>';
    if (forgotBtn) forgotBtn.classList.add('hidden');
  }
  updateStepDots();
  $('login-error').textContent = '';
};

window.nextAuthStep = async function () {
  const maxSteps = isLoginMode ? 2 : 4;
  const errEl = $('login-error');
  errEl.textContent = '';

  // Regex para validação de e-mail real
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (currentAuthStep === 1) {
    if (isLoginMode) {
      if (!emailRegex.test($('inp-email').value)) {
        errEl.textContent = i18n.t('err_invalid_email');
        return;
      }
    } else {
      if ($('inp-name').value.trim().length < 3) {
        errEl.textContent = i18n.t('err_short_name');
        return;
      }
    }
  } else if (currentAuthStep === 2) {
    if (!isLoginMode) {
      if (!emailRegex.test($('inp-email').value)) {
        errEl.textContent = i18n.t('err_invalid_email');
        return;
      }
    }
  } else if (currentAuthStep === 3 && !isLoginMode) {
    if ($('inp-pass').value.length < 6) {
      errEl.textContent = i18n.t('login_err_pass');
      return;
    }
  }

  if (currentAuthStep < maxSteps) {
    currentAuthStep++;
    goToAuthStep(currentAuthStep);
  }
};

window.prevAuthStep = function () {
  if (currentAuthStep > 1) {
    currentAuthStep--;
    goToAuthStep(currentAuthStep);
  }
};

function goToAuthStep(step) {
  const wrapper = $('auth-step-wrapper');
  wrapper.style.transform = `translateX(-${(step - 1) * 100}%)`;

  const maxSteps = isLoginMode ? 2 : 4;
  const btnNext = $('btn-auth-next');
  const btnSubmit = $('btn-login-submit');
  const btnBack = $('btn-auth-back');

  btnBack.classList.toggle('hidden', step === 1);

  if (step === maxSteps) {
    btnNext.classList.add('hidden');
    btnSubmit.classList.remove('hidden');
    btnSubmit.querySelector('#txt-login-btn').textContent = isLoginMode ? i18n.t('login_btn') : i18n.t('login_btn_create');
  } else {
    btnNext.classList.remove('hidden');
    btnSubmit.classList.add('hidden');
  }

  updateStepDots();
}

function updateStepDots() {
  const dots = document.querySelectorAll('.step-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentAuthStep - 1);
    dot.classList.toggle('hidden', isLoginMode); // Hide dots in login mode if simplified
  });
}

window.toggleRecovery = function (show) {
  if (show) {
    hide('login-form');
    show('recovery-area');
  } else {
    show('login-form');
    hide('recovery-area');
  }
  $('login-error').textContent = '';
  $('recovery-error').textContent = '';
};


async function sendRecoveryEmail() {
  const email = $('inp-recovery-email').value;
  if (!email) {
    $('recovery-error').textContent = "Digite seu e-mail.";
    return;
  }
  showLoading('loading_connecting');
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    hideLoading();
    alert("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    toggleRecovery(false);
  } catch (error) {
    hideLoading();
    $('recovery-error').textContent = error.message;
  }
}

// Global Auth State Observer
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    console.log("User logged in:", user.uid);
    S.currentUser = user.uid;

    // Check if user has scale/sounds in Database
    try {
      const snap = await userRef().once('value');
      const data = snap.val() || {};
      S.userScale = data.scale || null;
      S.soundsEnabled = data.sounds !== undefined ? data.sounds : true;
      updateSoundIcon();

      // If new user, initialize basic entry
      if (!snap.exists()) {
        await userRef().update({
          email: user.email,
          displayName: user.displayName,
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
    }

    localStorage.setItem('agbizu_session', user.uid);
    initApp();
  } else {
    console.log("No user session.");
    logout(true); // silent logout
  }
});

function initApp() {
  try {
    console.log("[DEBUG] Início do initApp");
    // O cabeçalho deve ser mostrado sempre para que o menu (hambúrguer) esteja visível
    show('scale-bar');

    if (S.userScale) {
      if ($('scale-display')) $('scale-display').textContent = S.userScale.display;
      S.forceScale = false;
    }
    else {
      S.forceScale = true;
    }

    S.currentDate = new Date();
    setView('month');
    startRealtimeSync();

    hide('login-screen');
    show('app-screen');
    if ($('app-screen')) $('app-screen').style.display = 'flex';
    if (typeof window.showAgentFab === 'function') window.showAgentFab();

    if (typeof i18n !== 'undefined') i18n.applyToDOM();
    updateSoundIcon();
    runOnboardingFlow();
    hideLoading();
    console.log("[DEBUG] initApp finalizado com sucesso");
  } catch (err) {
    console.error("Critical error in initApp:", err);
    hideLoading();
  }
}

// Update the form submission
document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = $('inp-email').value;
  const pass = $('inp-pass').value;
  const name = $('inp-name').value;
  const confirm = $('inp-confirm').value;
  const errEl = $('login-error');

  errEl.textContent = '';

  const maxSteps = isLoginMode ? 2 : 4;
  if (currentAuthStep < maxSteps) {
    nextAuthStep();
    return;
  }

  if (isLoginMode) {
    if (!email || !pass) {
      errEl.textContent = i18n.t('err_fill_all');
      return;
    }
    if (!emailRegex.test(email)) {
      errEl.textContent = i18n.t('err_invalid_email');
      return;
    }
    showLoading('loading_connecting');
    try {
      await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (err) {
      hideLoading();
      errEl.textContent = i18n.t('login_err_wrong') || "E-mail ou senha incorretos.";
      console.error(err);
    }
  } else {
    if (!name || !email || !pass || !confirm) {
      errEl.textContent = i18n.t('err_fill_all');
      return;
    }
    if (!emailRegex.test(email)) {
      errEl.textContent = i18n.t('err_invalid_email');
      return;
    }
    if (pass !== confirm) {
      errEl.textContent = i18n.t('err_pass_mismatch');
      return;
    }
    if (pass.length < 6) {
      errEl.textContent = i18n.t('login_err_pass');
      return;
    }

    showLoading('loading_connecting');
    try {
      const result = await firebase.auth().createUserWithEmailAndPassword(email, pass);
      await result.user.updateProfile({ displayName: name });
    } catch (err) {
      hideLoading();
      if (err.code === 'auth/email-already-in-use') {
        errEl.textContent = i18n.t('err_email_exists');
        // Retroceder para a aba de e-mail automaticamente
        currentAuthStep = 2;
        goToAuthStep(2);
      } else {
        errEl.textContent = i18n.t('login_err_conn');
      }
      console.error(err);
    }
  }
};

async function logout(silent = false) {
  if (!silent) {
    closeModal('modal-logout');
    showLoading('loading_wait');
  }

  try {
    await firebase.auth().signOut();
  } catch (e) {
    console.error("Logout error:", e);
  }

  S.currentUser = null; S.userScale = null; S.events = []; S.transactions = []; S.customSeq = [];
  localStorage.removeItem('agbizu_session');

  if (!silent) {
    refreshCalendar();
    resetAuthUI();
    show('login-screen');
    hide('app-screen');
    if (typeof window.hideAgentFab === 'function') window.hideAgentFab();
    hideLoading();
  } else {
    // Mesmo em boot silencioso, precisamos estar no modo login e sem loader
    resetAuthUI();
    show('login-screen');
    hide('app-screen');
    hideLoading();
  }
}

// ======================== HOLIDAYS ========================
function isHoliday(date) {
  const holidays = typeof i18n !== 'undefined' ? i18n.t('holidays') : {};
  return holidays[toDateStr(date)] || null;
}

/** Returns the daily Bible messages for the current language */
function getMensagensDoDia() {
  if (typeof i18n !== 'undefined') {
    const msgs = i18n.t('daily_messages');
    if (Array.isArray(msgs)) return msgs;
  }
  // Fallback hardcoded PT (shouldn't reach here if i18n loaded)
  return [
    { dia: 1, versiculo: 'João 3:16', mensagem: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito...', reflexao: 'O amor de Deus é a base do evangelho.' },
    { dia: 2, versiculo: 'Salmos 23:1', mensagem: 'O Senhor é o meu pastor; nada me faltará.', reflexao: 'Deus cuida de nós em todos os momentos.' },
  ];
}

// ======================== SCALE LOGIC ========================
function isDayOff(date, scale) {
  if (!scale) return null;
  if (typeof scale === 'object' && scale.sequence) {
    const ref2 = new Date(scale.referenceDate);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(ref2.getFullYear(), ref2.getMonth(), ref2.getDate());
    const delta = Math.round((target - start) / 86400000);
    const seq = scale.sequence;
    const idx = ((delta % seq.length) + seq.length) % seq.length;
    return seq[idx] === 0;
  }
  return null;
}
function getWorkStatus(date, scale) {
  if (!scale) return null;
  const off = isDayOff(date, scale);
  return off === null ? null : { isOff: off };
}

// ======================== DATE HELPERS ========================
function toDateStr(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function normalizeDate(d) {
  const p = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d);
  return new Date(p.getFullYear(), p.getMonth(), p.getDate());
}
function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let i = first.getDay() - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), cur: false });
  for (let d = 1; d <= last.getDate(); d++) days.push({ date: new Date(year, month, d), cur: true });
  while (days.length < 42) {
    const n = days.length - (first.getDay() + last.getDate() - 1) + 1;
    days.push({ date: new Date(year, month + 1, n), cur: false });
  }
  return days;
}
function fmtMonthYear(date) {
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

// ======================== EVENTS ========================
function getEventsForDate(d) {
  const targetDate = normalizeDate(d);
  const targetStr = toDateStr(targetDate);
  const result = [];

  S.events.forEach(e => {
    const start = normalizeDate(e.date);
    if (targetDate < start) return;

    if (e.date === targetStr) {
      let finalItem = { ...e, isIgnored: !!(e.excludedDates && e.excludedDates[targetStr]), occurrenceDate: targetStr };
      if (e.overrides && e.overrides[targetStr]) {
        finalItem = { ...finalItem, ...e.overrides[targetStr] };
      }
      result.push(finalItem);
      return;
    }

    if (!e.recurrence || e.recurrence === 'none') return;

    let isOccurrence = false;
    if (e.recurrence === 'daily') isOccurrence = true;
    else if (e.recurrence === 'weekly') {
      const diffDays = Math.round((targetDate - start) / 86400000);
      isOccurrence = diffDays % 7 === 0;
    }
    else if (e.recurrence === 'monthly') {
      isOccurrence = targetDate.getDate() === start.getDate();
    }
    else if (e.recurrence === 'yearly') {
      isOccurrence = targetDate.getDate() === start.getDate() && targetDate.getMonth() === start.getMonth();
    }

    if (isOccurrence) {
      let finalItem = { ...e, isIgnored: !!(e.excludedDates && e.excludedDates[targetStr]), occurrenceDate: targetStr };
      // Aplicar sobreposição se existir para este dia
      if (e.overrides && e.overrides[targetStr]) {
        finalItem = { ...finalItem, ...e.overrides[targetStr] };
      }
      result.push(finalItem);
    }
  });
  return result;
}

function getTransactionsForDate(d) {
  const targetDate = normalizeDate(d);
  const targetStr = toDateStr(targetDate);
  const result = [];

  S.transactions.forEach(t => {
    const start = normalizeDate(t.date);
    if (targetDate < start) return;

    if (t.date === targetStr) {
      let finalItem = { ...t, isIgnored: !!(t.excludedDates && t.excludedDates[targetStr]), occurrenceDate: targetStr };
      if (t.overrides && t.overrides[targetStr]) {
        finalItem = { ...finalItem, ...t.overrides[targetStr] };
      }
      result.push(finalItem);
      return;
    }

    if (!t.recurrence || t.recurrence === 'none') return;

    let isOccurrence = false;
    if (t.recurrence === 'daily') isOccurrence = true;
    else if (t.recurrence === 'weekly') {
      const diffDays = Math.round((targetDate - start) / 86400000);
      isOccurrence = diffDays % 7 === 0;
    }
    else if (t.recurrence === 'monthly') {
      isOccurrence = targetDate.getDate() === start.getDate();
    }
    else if (t.recurrence === 'yearly') {
      isOccurrence = targetDate.getDate() === start.getDate() && targetDate.getMonth() === start.getMonth();
    }

    if (isOccurrence) {
      let finalItem = { ...t, isIgnored: !!(t.excludedDates && t.excludedDates[targetStr]), occurrenceDate: targetStr };
      if (t.overrides && t.overrides[targetStr]) {
        finalItem = { ...finalItem, ...t.overrides[targetStr] };
      }
      result.push(finalItem);
    }
  });
  return result;
}

async function addEvent(data) {
  const ev = { id: uid(), createdAt: new Date().toISOString(), ...data };
  S.events.push(ev);
  await userRef(`events/${ev.id}`).set(ev);
}

async function updateEvent(id, data) {
  const existing = S.events.find(e => e.id === id);
  if (!existing) return;
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  S.events = S.events.map(e => e.id === id ? updated : e);
  await userRef(`events/${id}`).set(updated);
}

async function deleteEvent(id) {
  await userRef(`events/${id}`).remove();
}

// Removido generateRecurring pois agora é virtual.
function uid() { return Date.now() + '-' + Math.random().toString(36).slice(2, 9); }

// ======================== DOM & RENDERING ========================
window.goToViewGo = () => { window.location.href = 'https://www.viewgo.com.br/login'; };
window.closeAnyModal = () => document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));

function $(id) { return document.getElementById(id); }
function show(id) {
  const el = $(id);
  if (el) {
    el.classList.remove('hidden');
    if (el.classList.contains('form-error')) el.style.display = 'block';
  }
}
function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }
const catColor = (cat) => ({ evento: '#3b82f6', aniversario: '#ec4899', trabalho: '#22c55e', pessoal: '#a855f7', saude: '#ef4444', estudo: '#f59e0b' })[cat] || '#3b82f6';

function openModal(id) {
  $(id)?.classList.remove('hidden');
  play('modal');
  if (typeof window.hideAgentFab === 'function') window.hideAgentFab();
}

function closeModal(id) {
  const el = $(id); if (!el) return;

  const sheet = el.querySelector('.modal-sheet');
  if (sheet) {
    sheet.style.transform = 'translateY(0)'; // Reseta para a próxima abertura
    sheet.style.transition = '';
  }
  el.classList.add('hidden');
  S.lastModalClose = Date.now();

  // Show FAB only if NO other modal is open
  setTimeout(() => {
    const anyActiveModal = document.querySelector('.modal-overlay:not(.hidden)');
    const sideMenuOpen = document.getElementById('side-menu')?.classList.contains('active');
    if (!anyActiveModal && !sideMenuOpen && typeof window.showAgentFab === 'function') {
      window.showAgentFab();
    }
  }, 100);
}

function toggleSideMenu(open) {
  const menu = $('side-menu');
  const overlay = $('side-menu-overlay');
  const session = localStorage.getItem('agbizu_session');

  if (open) {
    menu.classList.add('active');
    overlay.classList.remove('hidden');
    if (session && typeof window.hideAgentFab === 'function') window.hideAgentFab();
    play('modal');
  } else {
    menu.classList.remove('active');
    overlay.classList.add('hidden');
    if (session && typeof window.showAgentFab === 'function') window.showAgentFab();
  }
}

window.closeAnyModal = () => {
  toggleSideMenu(false);
  ['modal-day', 'modal-event', 'modal-search', 'modal-scale', 'modal-logout', 'modal-onboarding-sound', 'modal-bible', 'modal-lang', 'modal-finances', 'modal-transaction', 'modal-confirm', 'modal-recurrence-choice'].forEach(closeModal);
};

window.showRecurrenceChoiceModal = function(onOnlyThis, onAll) {
  play('click');
  if (typeof i18n !== 'undefined') i18n.applyToDOM();
  
  $('btn-save-recurring-all').onclick = () => {
    closeModal('modal-recurrence-choice');
    onAll();
  };
  $('btn-save-recurring-instance').onclick = () => {
    closeModal('modal-recurrence-choice');
    onOnlyThis();
  };
  $('btn-cancel-recurring-choice').onclick = () => {
    closeModal('modal-recurrence-choice');
  };
  
  openModal('modal-recurrence-choice');
};

window.showConfirmModal = function (titleKey, descKey, onConfirm) {
  play('click');
  const t = (k) => typeof i18n !== 'undefined' ? (i18n.t(k) || k) : k;
  if ($('confirm-title')) $('confirm-title').textContent = t(titleKey);
  if ($('confirm-desc')) $('confirm-desc').textContent = t(descKey);

  if ($('btn-agree-confirm')) {
    let confirmed = false;
    $('btn-agree-confirm').onclick = async (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (confirmed) return;
      confirmed = true;
      closeModal('modal-confirm');
      if (onConfirm) await onConfirm();
    };
  }

  if ($('btn-cancel-confirm')) {
    $('btn-cancel-confirm').onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      closeModal('modal-confirm');
    };
  }

  openModal('modal-confirm');
};

function refreshCalendar() {
  if (S.viewMode === 'month') {
    renderMonthView();
    updateGlobalFinanceSummary();
  } else {
    renderYearView();
  }
}

function updateGlobalFinanceSummary() {
  const m = S.currentDate.getMonth();
  const y = S.currentDate.getFullYear();

  // Para o resumo global, precisamos considerar as recorrentes no mês
  let totalInc = 0, totalExp = 0;

  // Opção simplificada: iterar todos os dias do mês
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(y, m, i);
    const trs = getTransactionsForDate(d);
    trs.forEach(t => {
      if (t.isIgnored) return;
      if (t.type === 'income') totalInc += t.amount;
      else totalExp += t.amount;
    });
  }

  const incomeEl = $('glb-total-income');
  const expenseEl = $('glb-total-expenses');
  const balanceEl = $('glb-total-balance');

  if (incomeEl) incomeEl.textContent = formatVal(totalInc);
  if (expenseEl) expenseEl.textContent = formatVal(totalExp);
  if (balanceEl) balanceEl.textContent = formatVal(totalInc - totalExp);

  // Também atualiza o modal (caso esteja aberto)
  const finIncEl = $('fin-total-income');
  const finExpEl = $('fin-total-expenses');
  const finBalEl = $('fin-total-balance');

  if (finIncEl) finIncEl.textContent = formatVal(totalInc);
  if (finExpEl) finExpEl.textContent = formatVal(totalExp);
  if (finBalEl) finBalEl.textContent = formatVal(totalInc - totalExp);
}

function renderMonthView() {
  const y = S.currentDate.getFullYear();
  // Se mudou o ano, regera os 12 slides
  if (S.lastRenderedYear !== y) {
    initMonthSwiper(y);
    S.lastRenderedYear = y;
  }

  const m = S.currentDate.getMonth();
  const wrapper = $('month-slides-wrapper');
  if (wrapper) {
    wrapper.style.transform = `translateX(-${m * 100}%)`;
    $('month-title').textContent = fmtMonthYear(S.currentDate);
  }
}

function initMonthSwiper(year) {
  const wrapper = $('month-slides-wrapper');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  // Render weekday headers with i18n
  const wdEl = $('cal-weekdays');
  if (wdEl) {
    const wd = typeof i18n !== 'undefined' ? i18n.t('weekdays') : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    wdEl.innerHTML = wd.map(d => `<div>${d}</div>`).join('');
  }

  const dayMore = typeof i18n !== 'undefined' ? i18n.t('day_more') : 'mais';

  for (let m = 0; m < 12; m++) {
    const slide = document.createElement('div');
    slide.className = 'month-slide';
    const date = new Date(year, m, 1);
    const days = getDaysInMonth(year, m);
    const today = toDateStr(new Date());

    days.forEach(({ date: d, cur }) => {
      const ds = toDateStr(d);
      const ws = getWorkStatus(d, S.userScale);
      const evs = getEventsForDate(d);
      const trs = getTransactionsForDate(d);
      const cell = document.createElement('div');
      cell.className = 'day-cell' + (!cur ? ' other-month' : '') + (ds === today ? ' today' : '') + (cur && ws ? (ws.isOff ? ' off-day' : ' work-day') : '');

      let pillsHtml = '';
      const allItems = [
        ...evs.filter(e => !e.isIgnored).map(ev => ({ type: 'event', title: ev.title, time: ev.time, color: catColor(ev.category) })),
        ...trs.filter(t => !t.isIgnored).map(t => ({ type: 'finance', title: t.desc, amount: t.amount, color: t.type === 'income' ? '#16a34a' : '#dc2626' }))
      ];

      pillsHtml = allItems.slice(0, 2).map(item => {
        const text = item.type === 'event'
          ? (item.time ? item.time + ' ' : '') + item.title
          : (item.type === 'finance' ? (item.color === '#16a34a' ? '+' : '-') + ' ' + formatVal(item.amount) + ' ' + item.title : '');
        return `<div class="day-event-pill" style="background:${item.color}">${text}</div>`;
      }).join('');

      cell.innerHTML = `
        <div class="day-num"><span>${d.getDate()}</span>${(isHoliday(d) && cur ? '<span class="day-holiday-badge">F</span>' : '')}</div>
        ${(isHoliday(d) && cur ? `<div class="day-holiday-name">${isHoliday(d)}</div>` : '')}
        <div class="day-events-wrap">
          ${pillsHtml}
          ${(allItems.length > 2 ? `<div class="day-more">+${allItems.length - 2} ${dayMore}</div>` : '')}
        </div>
        ${(cur && ws && S.userScale ? `<div class="day-work-dot ${ws.isOff ? 'off' : 'work'}"></div>` : '')}
      `;
      cell.onclick = (e) => { e.stopPropagation(); play('click'); openDayModal(d); };
      slide.appendChild(cell);
    });
    wrapper.appendChild(slide);
  }
}

function renderYearView() {
  const year = S.currentDate.getFullYear();
  $('year-title').textContent = String(year);
  const grid = $('year-grid');
  const summaryContainer = $('year-summary-container');
  grid.innerHTML = '';

  const today = toDateStr(new Date());
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  const wdMini = typeof i18n !== 'undefined' ? i18n.t('weekdays_mini') : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;

  let annualIncome = 0;
  let annualExpense = 0;
  const monthlyData = [];

  // 1. Calculate Monthly & Annual Totals
  for (let m = 0; m < 12; m++) {
    let mIncome = 0;
    let mExpense = 0;
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, m, day);
      const trs = getTransactionsForDate(d);
      trs.forEach(tr => {
        if (tr.isIgnored) return;
        if (tr.type === 'income') mIncome += tr.amount;
        else mExpense += tr.amount;
      });
    }

    annualIncome += mIncome;
    annualExpense += mExpense;
    monthlyData.push({ m, mIncome, mExpense, mBalance: mIncome - mExpense });
  }

  // 2. Render Year Summary Top Section
  if (summaryContainer) {
    const maxVal = Math.max(...monthlyData.map(d => Math.max(d.mIncome, d.mExpense, 100)));

    let chartHtml = monthlyData.map(d => {
      const incH = (d.mIncome / maxVal) * 100;
      const expH = (d.mExpense / maxVal) * 100;
      const mName = new Date(year, d.m, 1).toLocaleDateString(locale, { month: 'short' }).substring(0, 1);

      return `
        <div class="chart-column">
          <div class="chart-bars">
            <div class="chart-bar income" style="height: ${incH}%"></div>
            <div class="chart-bar expense" style="height: ${expH}%"></div>
          </div>
          <span class="chart-label">${mName}</span>
        </div>
      `;
    }).join('');

    summaryContainer.innerHTML = `
   

      <div class="year-chart-wrapper">
      
        <div class="year-chart-header">
          <div class="year-chart-title">${t('finance_title')} (${year})</div>
          
          <div class="year-chart-legend">
            <div class="legend-item"><div class="legend-dot income"></div><span>${t('finance_type_income')}</span></div>
            <div class="legend-item"><div class="legend-dot expense"></div><span>${t('finance_type_expense')}</span></div>
          </div>
        </div>
        <div class="year-chart-container">
          ${chartHtml}
        </div>
           <div class="year-summary-cards" style="margin-top: 20px;">
        <div class="year-summary-card income">
          <div class="label">${t('finance_income')}</div>
          <div class="value">${formatVal(annualIncome)}</div>
        </div>
        <div class="year-summary-card expense">
          <div class="label">${t('finance_expenses')}</div>
          <div class="value">${formatVal(annualExpense)}</div>
        </div>
        <div class="year-summary-card balance">
          <div class="label">${t('finance_balance')}</div>
          <div class="value">${formatVal(annualIncome - annualExpense)}</div>
        </div>
      </div>
      </div>
    `;
  }

  // 3. Render Month Cards
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(year, m, 1);
    const mData = monthlyData[m];
    const card = document.createElement('div');
    card.className = 'mini-month';

    let html = `<div class="mini-month-title">${monthDate.toLocaleDateString(locale, { month: 'long' })}</div><div class="mini-grid">`;
    wdMini.forEach(d => html += `<div class="mini-day-hdr">${d}</div>`);

    getDaysInMonth(year, m).forEach(({ date, cur }) => {
      const ds = toDateStr(date);
      const ws = getWorkStatus(date, S.userScale);
      let cls = 'mini-day' + (!cur ? ' other' : (ds === today ? ' today' : (isHoliday(date) ? ' holiday' : (ws ? (ws.isOff ? ' off-day' : ' work-day') : ''))));
      if (cur && getEventsForDate(date).filter(e => !e.isIgnored).length > 0) cls += ' has-event';
      html += `<div class="${cls}">${cur ? date.getDate() : ''}</div>`;
    });

    html += `</div>`; // Fechar mini-grid

    // Monthly Summary Pills
    html += `
      <div class="mini-month-fin">
        <div class="mini-fin-item inc">
          <span class="material-symbols-outlined" style="font-size: 10px;">arrow_upward</span>
          ${mData.mIncome > 0 ? (mData.mIncome >= 1000 ? (mData.mIncome / 1000).toFixed(1) + 'k' : mData.mIncome.toFixed(0)) : '0'}
        </div>
        <div class="mini-fin-item exp">
          <span class="material-symbols-outlined" style="font-size: 10px;">arrow_downward</span>
          ${mData.mExpense > 0 ? (mData.mExpense >= 1000 ? (mData.mExpense / 1000).toFixed(1) + 'k' : mData.mExpense.toFixed(0)) : '0'}
        </div>
        <div class="mini-fin-item bal" style="color: ${mData.mBalance >= 0 ? 'var(--green)' : 'var(--danger)'}">
          ${mData.mBalance >= 0 ? '+' : ''}${mData.mBalance !== 0 ? (Math.abs(mData.mBalance) >= 1000 ? (Math.abs(mData.mBalance) / 1000).toFixed(1) + 'k' : Math.abs(mData.mBalance).toFixed(0)) : '0'}
        </div>
      </div>
    `;

    card.innerHTML = html;
    card.onclick = () => { play('click'); S.currentDate = monthDate; setView('month'); };
    grid.appendChild(card);
  }
}

function setView(mode) {
  S.viewMode = mode;
  ['month', 'year'].forEach(m => { $(`view-${m}`).classList.toggle('active', mode === m); $(`btn-view-${m}`).classList.toggle('active', mode === m); });
  refreshCalendar();
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ======================== MODALS & ACTIONS ========================
function buildEventItem(ev, withActions = true) {
  const wrap = document.createElement('div');
  wrap.className = 'event-item';
  wrap.innerHTML = `
    <div class="event-stripe" style="background:${catColor(ev.category)}"></div>
    <div class="event-body">
      <div class="event-title">${escHtml(ev.title)}</div>
      <div class="event-meta">
        ${ev.time ? `<span class="material-symbols-outlined" style="font-size:16px;">schedule</span> <span>${ev.time}</span>` : ''}
        ${ev.category ? `<span style="opacity:0.8;">• ${ev.category}</span>` : ''}
        ${ev.recurrence && ev.recurrence !== 'none' ? '<span class="material-symbols-outlined" style="font-size:16px;">sync</span>' : ''}
      </div>
      ${ev.description ? `<div class="event-meta" style="margin-top:4px; font-size:0.65rem; opacity:0.8;">${escHtml(ev.description)}</div>` : ''}
    </div>
    ${withActions ? `
    <div class="event-actions">
      <button class="btn btn-ghost btn-icon-sm" onclick="editEvent('${ev.id}')">
        <span class="material-symbols-outlined" style="font-size:20px;">edit</span>
      </button>
      <button class="btn btn-ghost btn-icon-sm" onclick="delEvent('${ev.id}')">
        <span class="material-symbols-outlined" style="font-size:20px; color:var(--danger);">delete</span>
      </button>
    </div>` : ''}
  `;
  if (!withActions) {
    wrap.onclick = () => { closeModal('modal-search'); openEventForm(ev); };
  }
  return wrap;
}

function openDayModal(d) {
  S.selectedDate = d;
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  $('day-modal-title').textContent = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  $('day-modal-weekday').textContent = d.toLocaleDateString(locale, { weekday: 'long' });

  const ws = getWorkStatus(d, S.userScale);
  const statusEl = $('day-work-status');
  statusEl.innerHTML = '';
  if (ws && S.userScale) {
    statusEl.innerHTML = `
      <div class="work-badge-large ${ws.isOff ? 'off' : 'work'}">
        <span class="material-symbols-outlined">${ws.isOff ? 'home' : 'work'}</span>
        ${ws.isOff ? 'Folga' : 'Trabalho'}
      </div>
    `;
  }

  // Eventos
  const evs = getEventsForDate(d);
  const evList = $('day-events-list');
  evList.innerHTML = evs.length ? '' : `<p class="empty-state">${typeof i18n !== 'undefined' ? i18n.t('search_no_results') : 'Sem eventos'}</p>`;
  evs.forEach(ev => {
    const color = catColor(ev.category || 'evento');
    const iconName = ({ evento: 'event', aniversario: 'cake', trabalho: 'work', pessoal: 'person', saude: 'favorite', estudo: 'school' })[ev.category] || 'event';
    
    const div = document.createElement('div');
    div.className = 'event-item';
    div.style = `
      position: relative;
      padding: 12px 16px;
      padding-left: 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid ${color};
      border-radius: 16px;
      margin-bottom: 12px;
      cursor: pointer;
      opacity: ${ev.isIgnored ? '0.5' : '1'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <div style="display:flex; align-items:center; gap:10px; flex: 1; overflow: hidden;">
          <span class="material-symbols-outlined" style="font-size:20px; color:${color}; flex-shrink: 0;">${iconName}</span>
          <div class="event-item-title" style="font-size:1.05rem; font-weight:800; color:var(--text); text-decoration: ${ev.isIgnored ? 'line-through' : 'none'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${ev.title}
          </div>
        </div>
        
        ${ev.time ? `
          <div style="display:flex; align-items:center; gap:4px; font-size:0.8rem; color:var(--primary); font-weight:700; background: var(--primary-lt); padding: 4px 10px; border-radius: 20px; flex-shrink: 0; margin-left: 10px;">
            <span class="material-symbols-outlined" style="font-size:14px;">schedule</span>
            ${ev.time}
          </div>
        ` : ''}
      </div>

      ${ev.description ? `
        <div style="font-size:0.85rem; color:var(--text2); line-height:1.5; background: rgba(0,0,0,0.02); padding: 10px; border-radius: 12px; margin-bottom: 8px; border-left: 2px solid var(--border);">
          ${ev.description}
        </div>
      ` : ''}
      
      <div style="display:flex; justify-content:between; align-items:center; margin-top:4px;">
         <div style="flex:1;">
            ${ev.isIgnored ? `
              <div style="display:flex; align-items:center; gap:4px; color:var(--danger); font-size:0.7rem; font-weight:700;">
                <span class="material-symbols-outlined" style="font-size:14px;">event_busy</span>
                DESCONSIDERADO
              </div>
            ` : ''}
         </div>
         <div style="display:flex; align-items:center; gap:4px; opacity: 0.5;">
            <span class="material-symbols-outlined" style="font-size:12px;">calendar_today</span>
            <span style="font-size:0.65rem; font-weight:600;">${new Date(ev.date + 'T12:00:00').toLocaleDateString()}</span>
         </div>
      </div>
    `;
    div.onclick = () => { closeModal('modal-day'); S.editingEventId = ev.id; openEventForm(ev, d); };
    evList.appendChild(div);
  });

  // Finanças
  const trs = getTransactionsForDate(d);
  const trList = $('day-finance-list');
  trList.innerHTML = trs.length ? '' : `<p class="empty-state">${typeof i18n !== 'undefined' ? i18n.t('finance_empty') : 'Sem finanças'}</p>`;
  trs.forEach(t => {
    const isChecked = !!t.checked;
    const color = t.type === 'income' ? '#16a34a' : '#dc2626';
    const bgColor = t.type === 'income' ? '#dcfce7' : '#fee2e2';
    
    const div = document.createElement('div');
    div.className = 'finance-item' + (isChecked ? ' checked' : '');
    div.style = `
      display:flex; 
      align-items:center; 
      gap:12px; 
      padding: 12px 16px; 
      background: var(--surface); 
      border: 1px solid var(--border); 
      border-radius: 16px; 
      margin-bottom: 8px; 
      cursor:pointer; 
      opacity: ${t.isIgnored ? '0.4' : (isChecked ? '0.7' : '1')}; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      transition: all 0.2s;
    `;
    
    div.innerHTML = `
      <button class="btn btn-ghost btn-icon-sm" onclick="window.toggleTransactionStatus('${t.id}', event)" style="color: ${isChecked ? 'var(--primary)' : 'var(--text3)'}; padding: 0; width: 32px; height: 32px; flex-shrink: 0;">
        <span class="material-symbols-outlined" style="font-size:24px; font-variation-settings: 'FILL' ${isChecked ? 1 : 0}">${isChecked ? 'check_circle' : 'radio_button_unchecked'}</span>
      </button>
      
      <div style="background:${bgColor}; color:${color}; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink: 0;">
        <span class="material-symbols-outlined" style="font-size:20px;">${t.type === 'income' ? 'trending_up' : 'trending_down'}</span>
      </div>
      
      <div style="flex:1; overflow: hidden;">
        <div style="font-size:0.95rem; font-weight:750; color:var(--text); text-decoration: ${(isChecked || t.isIgnored) ? 'line-through' : 'none'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${t.desc}
        </div>
        <div style="font-size:0.75rem; color:var(--text3); font-weight:600;">${t.type === 'income' ? 'Receita' : 'Despesa'}</div>
      </div>
      
      <div style="text-align:right; flex-shrink: 0;">
        <div style="font-size:1rem; font-weight:800; color:${color}; text-decoration: ${(isChecked || t.isIgnored) ? 'line-through' : 'none'};">
          ${t.type === 'income' ? '+' : '-'} ${formatVal(t.amount)}
        </div>
        ${t.isIgnored ? '<span class="material-symbols-outlined" style="font-size: 16px; color: var(--text3); display: block; margin-left: auto;">event_busy</span>' : ''}
      </div>
    `;
    div.onclick = (e) => {
      if (e.target.closest('button')) return;
      closeModal('modal-day');
      window.openTransactionForm(d, t);
    };
    trList.appendChild(div);
  });

  openModal('modal-day');
}

window.editEvent = (id) => { closeModal('modal-day'); openEventForm(S.events.find(e => e.id === id)); };
window.delEvent = async (id) => {
  showLoading('loading_deleting');
  await deleteEvent(id);
  S.events = S.events.filter(e => e.id !== id);
  S.lastRenderedYear = null;
  refreshCalendar();
  hideLoading();
};

function openEventForm(evt, clickedDate = null) {
  const isNew = !evt;
  S.editingEventId = isNew ? null : evt.id;
  S.editingOccurrenceDate = clickedDate ? toDateStr(clickedDate) : (evt ? evt.date : toDateStr(new Date()));
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;
  
  $('event-modal-title').textContent = evt ? t('edit_event') : t('new_event');
  $('evt-title').value = evt?.title || '';
  $('evt-desc').value = evt?.description || '';
  $('evt-time').value = evt?.time || '';
  
  const displayDate = clickedDate || (evt?.date ? new Date(evt.date + 'T12:00:00') : (S.selectedDate || new Date()));
  $('evt-date').value = toDateStr(displayDate);
  $('evt-recurrence').value = evt?.recurrence || 'none';
  
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === (evt?.category || 'evento')));
  
  if (evt) show('btn-delete-event'); else hide('btn-delete-event');
  updateWorkBadge($('evt-date').value);

  const recArea = $('event-recurring-options');
  const btnIgnore = $('btn-ignore-event-instance');
  
  if (evt && recArea && btnIgnore) {
    if (evt.recurrence && evt.recurrence !== 'none') {
      recArea.classList.remove('hidden');
      const isIgnored = evt.excludedDates && evt.excludedDates[$('evt-date').value];
      const recType = evt.recurrence || 'daily';
      const i18nKey = (isIgnored ? 'consider_instance_' : 'ignore_instance_') + recType;
      
      const span = btnIgnore.querySelector('[data-i18n]');
      if (span) {
        span.setAttribute('data-i18n', i18nKey);
        if (typeof i18n !== 'undefined') span.innerHTML = i18n.t(i18nKey);
      }
      if (typeof i18n !== 'undefined') i18n.applyToDOM();
      
      btnIgnore.style.color = isIgnored ? 'var(--primary)' : 'var(--danger)';
      btnIgnore.style.borderColor = isIgnored ? 'var(--primary-lt)' : 'var(--danger-lt)';
      const icon = btnIgnore.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isIgnored ? 'event_available' : 'event_busy';
    } else {
      recArea.classList.add('hidden');
    }
  } else {
    // Modo Novo ou elementos não encontrados
    if (recArea) recArea.classList.add('hidden');
  }

  openModal('modal-event');
}

function updateWorkBadge(ds) {
  const ws = getWorkStatus(new Date(ds + 'T12:00:00'), S.userScale);
  const b = $('event-work-badge');
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;
  if (ws && S.userScale) {
    b.className = 'work-badge ' + (ws.isOff ? 'off' : 'work');
    b.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">${ws.isOff ? 'home' : 'work'}</span> ${ws.isOff ? t('badge_off') : t('badge_work')}`;
    b.classList.remove('hidden');
  } else b.classList.add('hidden');
}

let isSavingEvent = false;
async function saveEventForm(e) {
  e.preventDefault();
  if (isSavingEvent) return;
  const tEl = $('evt-title'), dEl = $('evt-date'), errT = $('err-title');
  const title = tEl.value.trim(), date = dEl.value;

  // Resetar erros
  errT.classList.add('hidden');
  tEl.classList.remove('field-error');

  if (!title) {
    errT.classList.remove('hidden');
    tEl.classList.add('field-error');
    tEl.focus();
    return;
  }
  if (!date) return;

  isSavingEvent = true;
  const data = { title, date, description: $('evt-desc').value.trim(), time: $('evt-time').value, category: document.querySelector('.cat-btn.active')?.dataset.cat || 'evento', recurrence: $('evt-recurrence').value };
  
  const original = S.editingEventId ? S.events.find(e => e.id === S.editingEventId) : null;
  const isRecurring = original && original.recurrence && original.recurrence !== 'none';
  const shouldAsk = isRecurring; 
  const isEditingVirtual = isRecurring && S.editingOccurrenceDate !== original.date;

  const performAllSave = async () => {
    showLoading('loading_saving');
    const saveData = { ...data };
    if (isEditingVirtual && original) {
       saveData.date = original.date;
    }
    if (S.editingEventId) await updateEvent(S.editingEventId, saveData); else await addEvent(saveData);
    finishSave();
  };

  const performInstanceSave = async () => {
    try {
      showLoading('loading_saving');
      if (original) {
        const overrideData = {
          title: data.title,
          description: data.description,
          time: data.time,
          category: data.category,
          date: data.date 
        };
        if (!original.overrides) original.overrides = {};
        original.overrides[S.editingOccurrenceDate] = overrideData;
        await userRef(`events/${original.id}/overrides/${S.editingOccurrenceDate}`).set(overrideData);
      }
      finishSave();
    } catch (err) {
      console.error("Erro ao salvar sobreposição:", err);
      alert("Erro ao aplicar edição específica.");
      hideLoading();
      isSavingEvent = false;
    }
  };

  const finishSave = () => {
    S.lastRenderedYear = null;
    refreshCalendar();
    hideLoading();
    closeModal('modal-event');
    play('click');
    setTimeout(() => isSavingEvent = false, 500);
  };

  if (shouldAsk) {
    window.showRecurrenceChoiceModal(performInstanceSave, performAllSave);
    isSavingEvent = false; 
    return;
  }

  showLoading('loading_saving');
  if (S.editingEventId) await updateEvent(S.editingEventId, data); else await addEvent(data);
  finishSave();
}

// Limpar erro ao digitar
document.addEventListener('DOMContentLoaded', () => {
  if ($('evt-title')) {
    $('evt-title').oninput = () => {
      $('err-title').classList.add('hidden');
      $('evt-title').classList.remove('field-error');
    };
  }
});

// ======================== SCALE SETUP ========================
function openScaleModal() {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Se já tem escala, projetamos ela para os 30-31 dias do mês
  if (S.userScale && S.userScale.sequence) {
    S.customSeq = [];
    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(startOfMonth);
      d.setDate(1 + i);
      const ws = getWorkStatus(d, S.userScale);
      S.customSeq.push(ws.isOff ? 'F' : 'T');
    }
  } else {
    S.customSeq = new Array(daysInMonth).fill(null);
  }

  const errEl = $('scale-error');
  if (errEl) { errEl.textContent = ''; hide('scale-error'); }

  renderScalePreview();
  openModal('modal-scale');
}

function renderScalePreview() {
  const wrap = $('scale-weekday-grid');
  wrap.innerHTML = '';
  const dayNames = typeof i18n !== 'undefined' ? i18n.t('weekdays') : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';

  const now = new Date();
  const currentMonthName = now.toLocaleDateString(locale, { month: 'long' });
  const todayStr = toDateStr(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = startOfMonth.getDay();

  let html = `
    <div class="scale-month-block">
      <div class="scale-month-name" style="text-transform: capitalize;">${currentMonthName}</div>
      <div class="scale-mini-grid">
  `;

  // Headers
  dayNames.forEach(d => html += `<div class="scale-hdr">${d}</div>`);

  // Offset days
  for (let i = 0; i < offset; i++) {
    html += `<div class="scale-day" style="opacity: 0; pointer-events: none;"></div>`;
  }

  // Actual days
  for (let idx = 0; idx < S.customSeq.length; idx++) {
    const st = S.customSeq[idx];
    const date = new Date(startOfMonth);
    date.setDate(1 + idx);
    const isToday = toDateStr(date) === todayStr;

    html += `
      <div class="scale-day ${st === 'T' ? 'work-explicit' : (st === 'F' ? 'off-explicit' : '')} ${isToday ? 'scale-today-marker' : ''}" 
           onclick="toggleScaleDay(${idx})">
        ${date.getDate()}
      </div>`;
  }

  html += `</div></div>`;
  wrap.innerHTML = html;

  // Habilita o botão sempre para podermos clicar e mostrar erro
  $('btn-save-scale').disabled = false;
  // Limpa o erro se o usuário começar a interagir
  hide('scale-error');
}

window.toggleScaleDay = (idx) => { play('click'); const s = S.customSeq[idx]; S.customSeq[idx] = s === 'T' ? 'F' : (s === 'F' ? 'T' : 'T'); renderScalePreview(); };

window.modifyWeeks = (delta) => {
  play('click');
  if (delta > 0) {
    for (let i = 0; i < 7; i++) S.customSeq.push(null);
  } else {
    if (S.customSeq.length > 7) S.customSeq.splice(-7);
  }
  renderScalePreview();
};

window.applyPreset = (type) => {
  play('click');
  const presets = {
    '4_serv': 'FTFTFTFTFFF FTFTFTFTFFF'.replace(/ /g, '').split(''), // Exemplo aproximado
    '5_serv': 'FTFTFTFTFTFFF FTFTFTFTFTFFF'.replace(/ /g, '').split(''),
    'dobradinha': 'FTFTFFTTFTFTTF'.split(''),
    'admin': 'FTTTTTF'.split(''),
    '12x36': 'TF'.split(''),
    '24x72': 'TFFF'.split('')
  };

  const base = presets[type];
  if (!base) return;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Preenche o mês inteiro repetindo o padrão
  S.customSeq = [];
  for (let i = 0; i < daysInMonth; i++) {
    S.customSeq.push(base[i % base.length]);
  }

  renderScalePreview();
};

async function saveScale() {
  const errEl = $('scale-error');
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;
  errEl.textContent = '';
  hide('scale-error');

  const seqFull = S.customSeq.map(s => s === 'T' ? 1 : 0);
  const incomplete = S.customSeq.some(x => x === null);
  if (incomplete) {
    errEl.textContent = t('scale_err_incomplete');
    show('scale-error');
    return;
  }

  if (seqFull.every(v => v === 0)) {
    errEl.textContent = t('scale_err_seq');
    show('scale-error');
    return;
  }

  const seq = getShortestPattern(seqFull);

  // A referência agora é o dia 1 do mês atual
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth(), 1);
  ref.setHours(0, 0, 0, 0);

  const display = seq.length <= 7 ? (seq.filter(v => v === 1).length + 'x' + seq.filter(v => v === 0).length) : 'Escala Custom';
  S.userScale = { sequence: seq, referenceDate: ref.getTime(), display };
  S.forceScale = false;

  showLoading('loading_saving');
  await saveProfile();
  hideLoading();

  $('scale-display').textContent = S.userScale.display;
  show('scale-bar');
  closeModal('modal-scale');
  S.lastRenderedYear = null;
  refreshCalendar();
  runOnboardingFlow();
}

window.setOnboardingSound = (enabled) => {
  S.soundsEnabled = enabled;
  updateSoundIcon();
  localStorage.setItem('agbizu_onboarding_sound', 'done');
  saveProfile();
  closeModal('modal-onboarding-sound');
  play('click');
};

// ======================== SEARCH ========================
function renderSearch(query) {
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  const q = query.toLowerCase();
  const results = S.events.filter(ev => {
    const d = new Date(ev.date + 'T12:00:00');
    return (
      ev.title.toLowerCase().includes(q) ||
      (ev.description || '').toLowerCase().includes(q) ||
      (ev.category || '').toLowerCase().includes(q) ||
      d.toLocaleDateString(locale).includes(q)
    );
  }).sort((a, b) => a.date.localeCompare(b.date));

  const el = $('search-results');
  el.innerHTML = '';
  if (!q) { el.innerHTML = `<div class="no-events">${t('search_empty')}</div>`; return; }
  if (!results.length) { el.innerHTML = `<div class="no-events">${t('search_no_results')}</div>`; return; }

  const seen = new Set();
  results.forEach(ev => {
    const rootId = ev.parentEventId || ev.id;
    if (seen.has(rootId)) return;
    seen.add(rootId);
    el.appendChild(buildEventItem(ev, false));
  });
}

// Mensagem Diária e Onboarding Sequencial
function runOnboardingFlow() {
  // 1. Escala Obrigatória
  if (S.forceScale) {
    setTimeout(() => { openScaleModal(); }, 400);
    return;
  }

  // 2. Mensagem Bíblica Diária
  const showedBible = checkDailyMessage();
  if (showedBible) return;

  // 3. Onboarding de Som
  checkOnboardingSound();
}

window.checkOnboardingSound = () => {
  if (!localStorage.getItem('agbizu_onboarding_sound')) {
    openModal('modal-onboarding-sound');
  }
};

function checkDailyMessage() {
  const today = toDateStr(new Date());
  const lastDate = localStorage.getItem('agbizu_last_msg_date');
  if (lastDate === today) return false;

  const dayOfMonth = new Date().getDate();
  const msgs = getMensagensDoDia();
  const msg = msgs.find(m => m.dia === dayOfMonth) || msgs[0];

  $('bible-verse-ref').textContent = msg.versiculo;
  $('bible-message').textContent = `“${msg.mensagem}”`;
  $('bible-reflection').textContent = msg.reflexao;

  openModal('modal-bible');
  localStorage.setItem('agbizu_last_msg_date', today);
  return true;
}

function updateSoundIcon() { $('icon-sound-on').classList.toggle('hidden', !S.soundsEnabled); $('icon-sound-off').classList.toggle('hidden', S.soundsEnabled); }

document.addEventListener('DOMContentLoaded', () => {
  // Apply i18n on first load
  if (typeof i18n !== 'undefined') {
    i18n.applyToDOM();
    // Re-render calendar on lang change
    document.addEventListener('langchange', () => {
      S.lastRenderedYear = null;
      if (S.currentUser) {
        refreshCalendar();
        // FIX: Only reopen the day modal if it was already open
        const dayModal = $('modal-day');
        if (dayModal && !dayModal.classList.contains('hidden') && S.selectedDate) {
          openDayModal(S.selectedDate);
        }
      }
    });
  }

  loadAudio();

  // ---- Listeners de Teclado/Foco no Login ----
  const loginScr = $('login-screen');
  const loginInputs = [$('inp-email'), $('inp-pass'), $('inp-name'), $('inp-confirm')];
  loginInputs.forEach(inp => {
    if (inp) {
      inp.onfocus = () => loginScr.classList.add('focused');
      // Removido o loginScr.classList.remove('focused') no onblur para manter o topo oculto
    }
  });

  $('btn-new-event').onclick = () => { window.closeAnyModal(); S.selectedDate = new Date(); openEventForm(); };
  $('btn-add-from-day').onclick = () => { closeModal('modal-day'); openEventForm(); };
  $('btn-toggle-sound').onclick = () => { S.soundsEnabled = !S.soundsEnabled; updateSoundIcon(); saveProfile(); };
  if ($('btn-logout')) $('btn-logout').onclick = () => { window.closeAnyModal(); openModal('modal-logout'); };
  if ($('btn-confirm-logout')) $('btn-confirm-logout').onclick = () => logout();
  if ($('btn-cancel-logout')) $('btn-cancel-logout').onclick = () => closeModal('modal-logout');
  if ($('btn-close-bible')) {
    $('btn-close-bible').onclick = () => {
      closeModal('modal-bible');
      runOnboardingFlow();
    };
  }

  $('btn-open-menu').onclick = () => toggleSideMenu(true);
  $('btn-close-menu').onclick = () => toggleSideMenu(false);
  $('side-menu-overlay').onclick = () => toggleSideMenu(false);
  $('btn-lang-picker').onclick = () => { window.closeAnyModal(); window.openLangPicker(); };

  $('btn-scale-settings').onclick = () => openScaleModal();
  $('btn-view-month').onclick = () => setView('month');
  $('btn-view-year').onclick = () => setView('year');
  if ($('month-title')) {
    $('month-title').style.cursor = 'pointer';
    $('month-title').onclick = () => setView('year');
  }
  if ($('btn-prev-month')) $('btn-prev-month').onclick = () => { S.currentDate.setDate(1); S.currentDate.setMonth(S.currentDate.getMonth() - 1); refreshCalendar(); };
  if ($('btn-next-month')) $('btn-next-month').onclick = () => { S.currentDate.setDate(1); S.currentDate.setMonth(S.currentDate.getMonth() + 1); refreshCalendar(); };
  if ($('btn-prev-month-abs')) $('btn-prev-month-abs').onclick = () => { S.currentDate.setDate(1); S.currentDate.setMonth(S.currentDate.getMonth() - 1); refreshCalendar(); };
  if ($('btn-next-month-abs')) $('btn-next-month-abs').onclick = () => { S.currentDate.setDate(1); S.currentDate.setMonth(S.currentDate.getMonth() + 1); refreshCalendar(); };
  window.goToToday = () => {
    S.currentDate = new Date();
    setView('month');
    refreshCalendar();
    toggleSideMenu(false);
  };
  if ($('btn-today')) $('btn-today').onclick = goToToday;
  if ($('btn-go-home')) $('btn-go-home').onclick = goToToday;

  const swiper = $('month-swiper');
  const wrapper = $('month-slides-wrapper');

  if (swiper && wrapper) {
    let startX = 0, currentTranslate = 0, isDragging = false;

    swiper.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      isDragging = true;
      wrapper.style.transition = 'none';
    }, { passive: true });

    swiper.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const diff = e.touches[0].clientX - startX;
      const m = S.currentDate.getMonth();
      const translate = -(m * wrapper.offsetWidth) + diff;
      wrapper.style.transform = `translateX(${translate}px)`;
    }, { passive: true });

    swiper.addEventListener('touchend', e => {
      if (!isDragging) return;
      isDragging = false;
      const diff = e.changedTouches[0].clientX - startX;
      wrapper.style.transition = '';

      if (Math.abs(diff) > swiper.offsetWidth / 5) {
        S.currentDate.setDate(1);
        if (diff > 0) S.currentDate.setMonth(S.currentDate.getMonth() - 1);
        else S.currentDate.setMonth(S.currentDate.getMonth() + 1);
      }
      refreshCalendar();
    }, { passive: true });
  }
  if ($('btn-prev-year')) $('btn-prev-year').onclick = () => { S.currentDate.setFullYear(S.currentDate.getFullYear() - 1); renderYearView(); };
  if ($('btn-next-year')) $('btn-next-year').onclick = () => { S.currentDate.setFullYear(S.currentDate.getFullYear() + 1); renderYearView(); };
  if ($('btn-back-to-month')) $('btn-back-to-month').onclick = () => setView('month');
  if ($('event-form')) $('event-form').onsubmit = saveEventForm;
  if ($('btn-close-day')) $('btn-close-day').onclick = () => closeModal('modal-day');
  if ($('btn-close-event')) $('btn-close-event').onclick = () => closeModal('modal-event');
  if ($('btn-cancel-event')) $('btn-cancel-event').onclick = () => closeModal('modal-event');
  if ($('btn-delete-event')) {
    let clickedDel = false;
    $('btn-delete-event').onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (clickedDel) return;
      clickedDel = true;
      if (S.editingEventId) {
        closeModal('modal-event');
        window.showConfirmModal('confirm_delete_title', 'confirm_delete_desc', async () => {
          await window.delEvent(S.editingEventId);
        });
      }
      setTimeout(() => clickedDel = false, 500); // Libera após 500ms
    };
  }
  if ($('btn-open-scale')) $('btn-open-scale').onclick = () => { toggleSideMenu(false); openScaleModal(); };
  if ($('btn-close-scale')) $('btn-close-scale').onclick = () => closeModal('modal-scale');
  if ($('btn-save-scale')) $('btn-save-scale').onclick = () => saveScale();
  if ($('btn-clear-seq')) $('btn-clear-seq').onclick = () => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    S.customSeq = new Array(daysInMonth).fill(null);
    renderScalePreview();
  };
  if ($('evt-date')) $('evt-date').onchange = (e) => updateWorkBadge(e.target.value);
  document.querySelectorAll('.cat-btn').forEach(b => b.onclick = () => { document.querySelectorAll('.cat-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); });

  // ---- Pesquisa ----
  if ($('btn-search')) {
    $('btn-search').onclick = () => {
      window.closeAnyModal();
      if ($('btn-clear-search')) $('btn-clear-search').onclick = () => { if ($('search-input')) $('search-input').value = ''; renderSearch(''); };
      play('click'); $('search-input').value = ''; renderSearch('');
      openModal('modal-search');
      setTimeout(() => $('search-input').focus(), 400);
    };
  }
  if ($('search-input')) $('search-input').oninput = e => renderSearch(e.target.value);
  if ($('btn-close-search')) $('btn-close-search').onclick = () => closeModal('modal-search');

  // ---- Financeira ----
  if ($('btn-open-finances')) $('btn-open-finances').onclick = () => { toggleSideMenu(false); play('click'); openFinances(); };
  if ($('btn-close-finances')) $('btn-close-finances').onclick = () => closeModal('modal-finances');
  if ($('btn-add-transaction')) $('btn-add-transaction').onclick = () => { closeModal('modal-finances'); window.openTransactionForm(); };
  if ($('btn-close-transaction')) $('btn-close-transaction').onclick = () => closeModal('modal-transaction');
  if ($('btn-delete-transaction')) {
    let clickedDelTrans = false;
    $('btn-delete-transaction').onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (clickedDelTrans) return;
      clickedDelTrans = true;
      if (S.editingTransactionId) {
        // Modal de confirmação já é chamado em window.deleteTransaction
        window.deleteTransaction(S.editingTransactionId);
        closeModal('modal-transaction');
      }
      setTimeout(() => clickedDelTrans = false, 500);
    };
  }

  window.updateGlobalFinanceVisibility = function () {
    const container = $('finance-global-summary-container');
    const iconVisible = $('icon-finance-visible');
    const iconHidden = $('icon-finance-hidden');

    if (S.showGlobalFinance) {
      if (container) container.style.display = 'block';
      if (iconVisible) iconVisible.classList.remove('hidden');
      if (iconHidden) iconHidden.classList.add('hidden');
    } else {
      if (container) container.style.display = 'none';
      if (iconVisible) iconVisible.classList.add('hidden');
      if (iconHidden) iconHidden.classList.remove('hidden');
    }
    localStorage.setItem('agbizu_show_global_finance', S.showGlobalFinance);
  };

  window.updateGlobalFinanceVisibility();

  if ($('btn-toggle-global-finance')) {
    $('btn-toggle-global-finance').onclick = () => {
      S.showGlobalFinance = !S.showGlobalFinance;
      window.updateGlobalFinanceVisibility();
      play('click');

    };
  }

  if ($('btn-close-global-finance')) {
    $('btn-close-global-finance').onclick = () => {
      S.showGlobalFinance = false;
      window.updateGlobalFinanceVisibility();
      play('click');
    };
  }

  if ($('finance-global-summary')) {
    $('finance-global-summary').style.cursor = 'pointer';
    $('finance-global-summary').onclick = () => {
      play('click');
      openFinances();
    };
  }

  window.setTransType = (type) => {
    S.financeType = type;
    const incBtn = $('trans-type-income');
    const expBtn = $('trans-type-expense');
    if (type === 'income') {
      if (incBtn) incBtn.classList.add('active');
      if (expBtn) expBtn.classList.remove('active');
    } else {
      if (expBtn) expBtn.classList.add('active');
      if (incBtn) incBtn.classList.remove('active');
    }
  };

  if ($('trans-type-income')) $('trans-type-income').onclick = () => { window.setTransType('income'); play('click'); };
  if ($('trans-type-expense')) $('trans-type-expense').onclick = () => { window.setTransType('expense'); play('click'); };

  if ($('transaction-form')) {
    let isSavingTrans = false;
    $('transaction-form').onsubmit = async (e) => {
      e.preventDefault();
      if (isSavingTrans) return;
      play('click');
      const transId = S.editingTransactionId || Date.now().toString();
      const transAmount = parseFloat($('trans-amount').value) || 0;
      const transDateValue = $('trans-date').value;
      const transDescValue = $('trans-desc').value || 'Transação';

      const saveDataLocal = {
        id: transId,
        type: S.financeType,
        desc: transDescValue,
        amount: transAmount,
        date: transDateValue,
        recurrence: $('trans-recurrence')?.value || 'none'
      };

      const original = S.editingTransactionId ? S.transactions.find(t => t.id === S.editingTransactionId) : null;
      const isRecurring = original && original.recurrence && original.recurrence !== 'none';
      const shouldAsk = isRecurring;
      const isEditingVirtual = isRecurring && S.editingOccurrenceDate !== original.date;

      const finishTransSave = () => {
        S.lastRenderedYear = null;
        refreshCalendar();
        if (!$('modal-finances').classList.contains('hidden')) updateFinanceUI();
        hideLoading();
        closeModal('modal-transaction');
        setTimeout(() => isSavingTrans = false, 500);
      };

      const performAllSave = async () => {
        showLoading('loading_saving');
        const finalData = { ...saveDataLocal };
        if (isEditingVirtual && original) {
           finalData.date = original.date;
        }
        const idx = S.transactions.findIndex(t => t.id === transId);
        if (idx !== -1) S.transactions[idx] = finalData; else S.transactions.push(finalData);
        await userRef(`transactions/${transId}`).set(finalData);
        finishTransSave();
      };

      const performInstanceSave = async () => {
        try {
          showLoading('loading_saving');
          if (original) {
            const overrideData = {
              desc: saveDataLocal.desc,
              amount: saveDataLocal.amount,
              type: saveDataLocal.type,
              date: saveDataLocal.date
            };
            if (!original.overrides) original.overrides = {};
            original.overrides[S.editingOccurrenceDate] = overrideData;
            await userRef(`transactions/${original.id}/overrides/${S.editingOccurrenceDate}`).set(overrideData);
          }
          finishTransSave();
        } catch (err) {
          console.error("Erro ao salvar sobreposição de transação:", err);
          alert("Erro ao processar transação.");
          hideLoading();
        }
      };

      try {
        if (shouldAsk) {
          window.showRecurrenceChoiceModal(performInstanceSave, performAllSave);
          isSavingTrans = false;
        } else {
          isSavingTrans = true;
          await performAllSave();
        }
      } catch (err) {
        hideLoading();
        console.error("Error saving transaction:", err);
        alert("Erro ao salvar transação. Verifique sua conexão.");
        isSavingTrans = false;
      }
    };
  }

  if ($('btn-add-fin-from-day')) {
    $('btn-add-fin-from-day').onclick = () => {
      console.log("[DEBUG] Botão 'Nova Transação' clicado");
      play('click');
      const d = S.selectedDate || new Date();
      console.log("[DEBUG] Data selecionada:", d);

      console.log("[DEBUG] Tentando fechar modal-day");
      closeModal('modal-day');

      console.log("[DEBUG] Chamando window.openTransactionForm");
      window.openTransactionForm(d);
    };
  } else {
    console.warn("[DEBUG] Elemento 'btn-add-fin-from-day' NÃO encontrado no DOM durante registro");
  }

  if ($('btn-ignore-event-instance')) {
    $('btn-ignore-event-instance').onclick = () => {
      const dateStr = $('evt-date').value;
      const eventId = $('evt-id').value;
      if (eventId && dateStr) window.ignoreEventInstance(eventId, dateStr);
    };
  }

  if ($('btn-ignore-trans-instance')) {
    $('btn-ignore-trans-instance').onclick = () => {
      const dateStr = $('trans-date').value;
      const transId = S.editingTransactionId;
      if (transId && dateStr) window.ignoreTransactionInstance(transId, dateStr);
    };
  }
  document.querySelectorAll('.modal-sheet').forEach(sheet => {
    const overlay = sheet.parentElement;
    const overlayId = overlay.id;
    let startY = 0, currentY = 0, isDragging = false;

    const startDrag = (e) => {
      if (e.target.closest('button, input, select')) return;

      // Se clicou no overlay, só inicia se for NO FUNDO (área escura)
      if (e.currentTarget === overlay && e.target !== overlay) return;

      startY = e.clientY; currentY = 0;
      isDragging = true;
      sheet.style.transition = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    const onMove = (e) => {
      if (!isDragging) return;
      currentY = e.clientY - startY;
      if (currentY > 0) {
        e.preventDefault();
        sheet.style.transform = `translateY(${currentY}px)`;
      }
    };

    const onUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (currentY < 10 && e.target === overlay) {
        // Tratado pelo document.click global para evitar ghost clicks
      } else if (currentY > 60) { // Arraste profundo
        sheet.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => closeModal(overlayId), 180);
      } else { // Arraste curto (volta)
        sheet.style.transition = 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        sheet.style.transform = 'translateY(0)';
      }
      currentY = 0;
    };

    // Registrar alças: Barra cinza, Cabeçalho e o próprio Fundo (Overlay)
    const handle = sheet.querySelector('.modal-handle');
    const header = sheet.querySelector('.modal-header');

    if (handle) handle.addEventListener('pointerdown', startDrag);
    if (header) header.addEventListener('pointerdown', startDrag);
    overlay.addEventListener('pointerdown', startDrag);

    // Impedir que o toque dentro do conteúdo do modal cause conflito de scroll/drag no fundo
    sheet.addEventListener('pointerdown', (e) => {
      if (e.target !== handle && !header.contains(e.target)) e.stopPropagation();
    }, { passive: true });
  });

  // ---- Inteligência de Teclado (Mobile) ----
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const updateKeyboard = () => {
      // Diferença entre a tela total e a área visível (teclado)
      const h = window.innerHeight - vv.height;
      document.documentElement.style.setProperty('--keyboard-h', (h > 60 ? h : 0) + 'px');

      // Auto-scroll para o campo focado
      const active = document.activeElement;
      if (h > 60 && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        setTimeout(() => active.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
      }
    };
    vv.addEventListener('resize', updateKeyboard);
    vv.addEventListener('scroll', updateKeyboard);
  }
});
// ======================== FINANCE LOGIC ========================
function updateFinanceUI() {
  const m = S.currentDate.getMonth();
  const y = S.currentDate.getFullYear();
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  const monthName = new Date(y, m, 1).toLocaleDateString(locale, { month: 'long' });

  if ($('finance-month-label')) {
    $('finance-month-label').textContent = (typeof i18n !== 'undefined' ? i18n.t('finance_month_summary') : 'Resumo de') + ' ' + monthName;
  }

  let totalInc = 0, totalExp = 0;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const allForMonth = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(y, m, i);
    const trs = getTransactionsForDate(d);
    trs.forEach(t => {
      if (t.isIgnored) return;
      if (t.type === 'income') totalInc += t.amount;
      else totalExp += t.amount;
      if (!allForMonth.some(x => x.id === t.id)) {
        allForMonth.push(t);
      }
    });
  }

  const finIncEl = $('fin-total-income');
  const finExpEl = $('fin-total-expenses');
  const finBalEl = $('fin-total-balance');

  if (finIncEl) finIncEl.textContent = formatVal(totalInc);
  if (finExpEl) finExpEl.textContent = formatVal(totalExp);
  if (finBalEl) finBalEl.textContent = formatVal(totalInc - totalExp);

  renderFinanceList(allForMonth);
}

function openFinances() {
  updateFinanceUI();
  openModal('modal-finances');
}

function formatVal(v) {
  const locale = typeof i18n !== 'undefined' ? i18n.t('locale') : 'pt-BR';
  const cur = locale === 'pt-BR' ? 'BRL' : 'USD';
  return v.toLocaleString(locale, { style: 'currency', currency: cur });
}

function renderFinanceList(list) {
  const container = $('finance-list');
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = `<p style="text-align:center; opacity:0.5; margin-top:20px;" data-i18n="finance_empty">${typeof i18n !== 'undefined' ? i18n.t('finance_empty') : 'Sem transações'}</p>`;
    return;
  }

  list.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(t => {
    const isChecked = !!t.checked;
    const div = document.createElement('div');
    div.className = 'finance-item' + (isChecked ? ' checked' : '');
    div.style = `display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--surface); border:1px solid var(--border); border-radius:12px; opacity: ${isChecked ? '0.6' : '1'}; transition: all 0.2s;`;
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="btn btn-ghost btn-icon-sm" onclick="window.toggleTransactionStatus('${t.id}', event)" style="color: ${isChecked ? 'var(--primary)' : 'var(--text3)'}; padding: 0; width: 28px; height: 28px;">
          <span class="material-symbols-outlined" style="font-size:22px; font-variation-settings: 'FILL' ${isChecked ? 1 : 0}">${isChecked ? 'check_circle' : 'radio_button_unchecked'}</span>
        </button>
        <div style="background:${t.type === 'income' ? '#dcfce7' : '#fee2e2'}; color:${t.type === 'income' ? '#166534' : '#991b1b'}; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <span class="material-symbols-outlined" style="font-size:18px;">${t.type === 'income' ? 'trending_up' : 'trending_down'}</span>
        </div>
        <div>
          <div style="font-size:0.8rem; font-weight:700; color:var(--text); text-decoration: ${isChecked ? 'line-through' : 'none'};">${t.desc}</div>
          <div style="font-size:0.65rem; color:var(--text2);">${new Date(t.date + 'T12:00:00').toLocaleDateString()}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:0.85rem; font-weight:700; color:${t.type === 'income' ? '#16a34a' : '#dc2626'}; text-decoration: ${isChecked ? 'line-through' : 'none'};">
          ${t.type === 'income' ? '+' : '-'} ${formatVal(t.amount)}
        </div>
        <button class="btn btn-ghost btn-icon-sm" onclick="window.deleteTransaction('${t.id}')" style="display:none;">
          <span class="material-symbols-outlined" style="font-size:18px; color:var(--text3);">delete</span>
        </button>
      </div>
    `;
    div.onclick = (e) => {
      // Se clicou no botão de excluir, não abre o formulário
      if (e.target.closest('button')) return;
      play('click');
      closeModal('modal-finances');
      window.openTransactionForm(null, t);
    };
    container.appendChild(div);
  });
}

window.openTransactionForm = function (d = null, trans = null) {
  console.log("[DEBUG] openTransactionForm executada", { d, trans });
  const form = $('transaction-form');
  if (!form) return;

  form.reset();
  S.editingTransactionId = trans ? trans.id : null;
  S.editingOccurrenceDate = d ? toDateStr(d) : (trans ? trans.date : toDateStr(new Date()));
  const t = (k) => typeof i18n !== 'undefined' ? i18n.t(k) : k;
  const titleEl = document.querySelector('#modal-transaction .modal-title');
  const btnDel = $('btn-delete-transaction');

  if (trans) {
    // Modo Edição
    if (titleEl) titleEl.textContent = t('finance_edit') || 'Editar Transação';
    if (btnDel) btnDel.classList.remove('hidden');
    if ($('trans-desc')) $('trans-desc').value = trans.desc || '';
    if ($('trans-amount')) $('trans-amount').value = trans.amount || 0;
    // Se for ocorrência recorrente, d terá a data clicada
    const displayDate = d || (trans.date ? new Date(trans.date + 'T12:00:00') : new Date());
    if ($('trans-date')) $('trans-date').value = toDateStr(displayDate);
    if ($('trans-recurrence')) $('trans-recurrence').value = trans.recurrence || 'none';
    window.setTransType(trans.type || 'expense');

    // Mostrar botão de "Desconsiderar" para qualquer transação recorrente
    const recArea = $('trans-recurring-options');
    const btnIgnore = $('btn-ignore-trans-instance');
    if (recArea && btnIgnore) {
      if (trans.recurrence && trans.recurrence !== 'none') {
        recArea.classList.remove('hidden');
        // Toggle texto conforme estado e recorrência
        const isIgnored = trans.excludedDates && trans.excludedDates[$('trans-date').value];
        const recType = trans.recurrence || 'monthly';
        const i18nKey = (isIgnored ? 'consider_instance_' : 'ignore_instance_') + recType;

        const span = btnIgnore.querySelector('[data-i18n]');
        if (span) {
          span.setAttribute('data-i18n', i18nKey);
          if (typeof i18n !== 'undefined') span.innerHTML = i18n.t(i18nKey);
        }
        if (typeof i18n !== 'undefined') i18n.applyToDOM();

        btnIgnore.style.color = isIgnored ? 'var(--primary)' : 'var(--danger)';
        btnIgnore.style.borderColor = isIgnored ? 'var(--primary-lt)' : 'var(--danger-lt)';
        const icon = btnIgnore.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = isIgnored ? 'event_available' : 'event_busy';
      } else {
        recArea.classList.add('hidden');
      }
    }
  } else {
    // Modo Novo
    if (titleEl) titleEl.textContent = t('finance_add') || 'Nova Transação';
    if (btnDel) btnDel.classList.add('hidden');
    if ($('trans-date')) $('trans-date').value = toDateStr(d || new Date());
    if ($('trans-recurring-options')) $('trans-recurring-options').classList.add('hidden');
    window.setTransType('expense');
  }

  openModal('modal-transaction');
};

window.deleteTransaction = function (id) {
  window.showConfirmModal('confirm_delete_title', 'confirm_delete_trans_desc', async () => {
    play('click');
    showLoading('loading_deleting');
    await userRef(`transactions/${id}`).remove();
    S.transactions = S.transactions.filter(t => t.id !== id);
    S.lastRenderedYear = null;
    refreshCalendar();
    hideLoading();
    // Atualiza a UI financeira silenciosamente se o modal estiver aberto
    if (!$('modal-finances').classList.contains('hidden')) updateFinanceUI();
  });
};

window.toggleTransactionStatus = async function (id, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const t = S.transactions.find(x => x.id === id);
  if (!t) return;

  const newState = !t.checked;
  t.checked = newState;

  try {
    await userRef(`transactions/${id}`).update({ checked: newState });
    if (!$('modal-finances').classList.contains('hidden')) updateFinanceUI();
    if (!$('modal-day').classList.contains('hidden') && S.selectedDate) openDayModal(S.selectedDate);
    // Opcional: refreshCalendar() se quiser atualizar os dots no fundo, mas pode ser pesado
  } catch (err) {
    console.error("Error toggling transaction status:", err);
  }
};

function getShortestPattern(arr) {
  const n = arr.length;
  // Patterns like 2, 3, 4, 12/36, etc.
  for (let len = 1; len <= Math.floor(n / 2); len++) {
    let match = true;
    for (let i = len; i < n; i++) {
      if (arr[i] !== arr[i % len]) { match = false; break; }
    }
    if (match) return arr.slice(0, len);
  }

  // Weekly patterns (7 or 14 days) even if n is 30/31
  for (let len of [7, 14]) {
    if (n >= len * 2) {
      let match = true;
      for (let i = len; i < n; i++) {
        if (arr[i] !== arr[i % len]) { match = false; break; }
      }
      if (match) return arr.slice(0, len);
    }
  }
  return arr;
}
window.ignoreEventInstance = async function (id, dateStr) {
  const event = S.events.find(e => e.id === id);
  if (!event) return;
  const isCurrentlyIgnored = !!(event.excludedDates && event.excludedDates[dateStr]);

  try {
    showLoading('loading_saving');
    if (!event.excludedDates) event.excludedDates = {};

    if (isCurrentlyIgnored) {
      delete event.excludedDates[dateStr];
      await userRef(`events/${id}/excludedDates/${dateStr}`).remove();
    } else {
      event.excludedDates[dateStr] = true;
      await userRef(`events/${id}/excludedDates/${dateStr}`).set(true);
    }

    refreshCalendar();
    hideLoading();
    closeModal('modal-event');
  } catch (err) {
    hideLoading();
    console.error("Error toggling ignore status for event:", err);
  }
};

window.ignoreTransactionInstance = async function (id, dateStr) {
  const t = S.transactions.find(x => x.id === id);
  if (!t) return;
  const isCurrentlyIgnored = !!(t.excludedDates && t.excludedDates[dateStr]);

  try {
    showLoading('loading_saving');
    if (!t.excludedDates) t.excludedDates = {};

    if (isCurrentlyIgnored) {
      delete t.excludedDates[dateStr];
      await userRef(`transactions/${id}/excludedDates/${dateStr}`).remove();
    } else {
      t.excludedDates[dateStr] = true;
      await userRef(`transactions/${id}/excludedDates/${dateStr}`).set(true);
    }

    S.lastRenderedYear = null;
    refreshCalendar();
    if (!$('modal-finances').classList.contains('hidden')) updateFinanceUI();
    hideLoading();
    closeModal('modal-transaction');
  } catch (err) {
    hideLoading();
    console.error("Error toggling ignore status for transaction:", err);
  }
};
