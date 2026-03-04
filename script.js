// --- BELMONTS: TECH ARENA - Core Logic (God-Tier Robustness) ---

// 1. Diagnostics & Logging
const ArenaLog = {
    info: (msg) => console.log(`%c[ARENA INFO]%c ${msg}`, "color: #00f2ff; font-weight: bold", "color: #fff"),
    warn: (msg) => console.warn(`[ARENA WARN] ${msg}`),
    err: (msg) => console.error(`[ARENA ERROR] ${msg}`)
};

ArenaLog.info("SYSTEM SECURE: INITIALIZING KERNEL V2.1.1...");

// 2. Supabase - Defensive Initialization
let supabase = null;
try {
    const supabaseUrl = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
    const supabaseKey = 'sb_publishable_SBrp-zgLSnJAQb8_XAyECQ_Vj8zF5kN';
    if (window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        ArenaLog.info("SUPABASE: INSTANCE ACQUIRED");
    }
} catch (e) {
    ArenaLog.err("SUPABASE: FATAL INITIALIZATION ERROR");
}

// 3. Global State
const state = {
    playerName: '',
    playerId: '',
    userRole: null,
    currentScreen: 'loading-screen',
    global: {
        phase: 'lobby',
        currentLevel: 1,
        questionIndex: 0,
        players: [],
        lastUpdate: Date.now()
    }
};

const levels = [
    { id: 1, name: "Binary Challenge", color: "#00f2ff" },
    { id: 2, name: "Hardware Builder", color: "#bc13fe" },
    { id: 3, name: "Stack & Queue Battle", color: "#39ff14" },
    { id: 4, name: "Network Defender", color: "#ff003c" },
    { id: 5, name: "Tech Escape Room", color: "#ffd700" }
];

const questionsBank = {
    1: [
        { q: "What is the decimal value of the binary number 1010?", a: ["8", "10", "12", "14"], correct: 1 },
        { q: "Which of these is a bitwise operator in JavaScript?", a: ["&&", "||", "&", "!"], correct: 2 },
        { q: "How many bits are in 1 byte?", a: ["4", "8", "16", "32"], correct: 1 }
    ],
    2: [
        { q: "Which component is known as the 'brain' of the computer?", a: ["RAM", "GPU", "CPU", "SSD"], correct: 2 },
        { q: "What type of memory is volatile and lost when power is off?", a: ["ROM", "RAM", "HDD", "FLASH"], correct: 1 },
        { q: "Which port is commonly used for high-definition video and audio?", a: ["VGA", "USB-A", "HDMI", "PS/2"], correct: 2 }
    ],
    3: [
        { q: "Which data structure follows the FIFO (First In First Out) principle?", a: ["Stack", "Queue", "Tree", "Graph"], correct: 1 },
        { q: "What is the operation to add an element to a Stack?", a: ["Pop", "Push", "Enqueue", "Dequeue"], correct: 1 },
        { q: "In a Queue, where does 'Dequeue' happen?", a: ["Front", "Back", "Middle", "Random"], correct: 0 }
    ],
    4: [
        { q: "Which port is the default for HTTPS traffic?", a: ["80", "21", "25", "443"], correct: 3 },
        { q: "What does DNS stand for?", a: ["Data Network System", "Domain Name System", "Digital Node Service", "Direct Net Signal"], correct: 1 },
        { q: "Which layer of the OSI model handles routing?", a: ["Physical", "Data Link", "Network", "Transport"], correct: 2 }
    ],
    5: [
        { q: "What is the time complexity of a Binary Search algorithm?", a: ["O(n)", "O(n²)", "O(log n)", "O(1)"], correct: 2 },
        { q: "Which keyword is used to create a constant variable in ES6?", a: ["var", "let", "const", "static"], correct: 2 },
        { q: "What is the result of typeof null in JavaScript?", a: ["'null'", "'undefined'", "'object'", "'number'"], correct: 2 }
    ]
};

const getEl = (id) => document.getElementById(id);

// 4. UI Engine
function showScreen(screenId) {
    ArenaLog.info("DEBUG: Switching to screen -> " + screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
        s.style.opacity = '0';
    });
    const target = getEl(screenId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
        setTimeout(() => target.style.opacity = '1', 10);
        state.currentScreen = screenId;
        updateUI();
        ArenaLog.info("DEBUG: Screen switched to -> " + screenId);
    } else {
        ArenaLog.err("DEBUG: Screen element not found -> " + screenId);
    }
}

function updateUI() {
    try {
        if (state.currentScreen === 'admin-panel-screen') renderAdminData();
        if (state.userRole === 'PARTICIPANT' || state.playerId) syncParticipantScreen();
    } catch (e) {
        ArenaLog.err("UI UPDATE FAIL: " + e.message);
    }
}

// REST OF LOGIC (Sync, Admin, etc.) - Simplified if necessary but kept robust
const SyncManager = {
    async joinPlayer(player) { try { if (supabase) await supabase.from('players').upsert([player]); } catch (e) { } },
    async updateScore(pId, points) { try { if (supabase) { const p = state.global.players.find(x => x.id === pId); if (p) await supabase.from('players').update({ score: p.score + points }).eq('id', pId); } } catch (e) { } },
    async updateGameState(upd) { try { if (supabase) await supabase.from('game_state').upsert([{ id: 'global', ...upd }]); } catch (e) { } },
    async kickPlayer(id) { try { if (supabase) await supabase.from('players').update({ status: 'kicked' }).eq('id', id); } catch (e) { } },
    async loadPlayers() { try { if (supabase) { const { data } = await supabase.from('players').select('*').order('joinTime', { ascending: true }); if (data) state.global.players = data; updateUI(); } } catch (e) { } },
    async loadGameState() { try { if (supabase) { const { data } = await supabase.from('game_state').select('*').eq('id', 'global').single(); if (data) { state.global.phase = data.phase; state.global.currentLevel = data.current_level; state.global.questionIndex = data.question_index; updateUI(); } } } catch (e) { } },
    subscribe() {
        if (!supabase) return;
        supabase.channel('players_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => this.loadPlayers()).subscribe();
        supabase.channel('state_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
            const d = payload.new;
            if (d && d.id === 'global') {
                state.global.phase = d.phase;
                state.global.currentLevel = d.current_level;
                state.global.questionIndex = d.question_index;
                updateUI();
            }
        }).subscribe();
        this.loadPlayers();
        this.loadGameState();
    }
};

function renderAdminData() {
    const s = getEl('stat-game-status');
    const l = getEl('stat-current-level');
    const tp = getEl('stat-total-players');
    const hs = getEl('stat-highest-score');

    if (s) {
        s.innerText = state.global.phase.toUpperCase();
        s.className = `stat-value ${state.global.phase}`;
    }
    if (l) l.innerText = state.global.currentLevel;
    if (tp) tp.innerText = state.global.players.length;

    let maxSc = 0;
    if (state.global.players.length > 0) {
        maxSc = Math.max(...state.global.players.map(p => p.score));
    }
    if (hs) hs.innerText = maxSc;

    document.querySelectorAll('.level-card').forEach(c => {
        if (parseInt(c.dataset.level) === state.global.currentLevel) c.classList.add('selected');
        else c.classList.remove('selected');
    });

    const list = getEl('admin-player-list');
    if (list) {
        list.innerHTML = '';
        state.global.players.filter(p => p.status === 'active').forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${p.name}</td><td>${p.score}</td><td>${state.global.currentLevel}</td><td>Playing</td><td><button class="neon-button small red outline" onclick="SyncManager.kickPlayer('${p.id}')">Remove</button></td>`;
            list.appendChild(row);
        });
    }

    const liveBoard = getEl('live-leaderboard-list');
    if (liveBoard) {
        liveBoard.innerHTML = '';
        const sorted = [...state.global.players].sort((a, b) => b.score - a.score);
        sorted.forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${p.name}</td><td>${p.score}</td><td>${Math.floor(p.score / 100)}</td><td>--</td>`;
            liveBoard.appendChild(row);
        });
    }
}

function syncParticipantScreen() {
    const g = state.global;
    if (g.phase === 'lobby' && (state.currentScreen !== 'lobby-screen' && state.currentScreen !== 'home-screen')) showScreen('lobby-screen');
    else if (g.phase === 'playing' && state.currentScreen !== 'quiz-screen') showScreen('quiz-screen');
}

// 5. Global Click Delegator
function initNavigation() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[id], .sidebar-btn, .tab-btn, .level-card');
        if (!target) return;
        const id = target.id;
        ArenaLog.info("CLICK DETECTED ON: " + (id || target.className || target.tagName));

        if (id === 'role-admin' || target.closest('#role-admin')) {
            ArenaLog.info("ADMIN ROLE SELECTED");
            showScreen('admin-login-screen');
        }
        if (id === 'role-participant' || target.closest('#role-participant')) {
            ArenaLog.info("PARTICIPANT ROLE SELECTED");
            getEl('role-selection')?.classList.add('hidden');
            getEl('player-input-group')?.classList.remove('hidden');
        }
        if (id === 'back-to-roles') {
            getEl('player-input-group')?.classList.add('hidden');
            getEl('role-selection')?.classList.remove('hidden');
        }
        if (id === 'cancel-admin') showScreen('home-screen');
        if (id === 'login-btn') {
            const p = getEl('admin-password');
            if (p?.value === '9500') { state.userRole = 'ADMIN'; showScreen('admin-panel-screen'); }
            else { p?.classList.add('wrong-auth'); setTimeout(() => p?.classList.remove('wrong-auth'), 500); }
        }
        if (id === 'start-battle') {
            const n = getEl('player-name')?.value.trim();
            if (n?.length >= 2) {
                state.playerName = n; state.playerId = 'P-' + Date.now(); state.userRole = 'PARTICIPANT';
                SyncManager.joinPlayer({ id: state.playerId, name: n, score: 0, joinTime: Date.now(), status: 'active' });
                showScreen('lobby-screen');
            }
        }
        // Tabs
        if (target.classList.contains('sidebar-btn') && !target.classList.contains('danger-text')) {
            document.querySelectorAll('.sidebar-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            target.classList.add('active');
            const pane = getEl(target.dataset.tab);
            if (pane) pane.classList.add('active');
            renderAdminData();
        }
        // Levels
        if (target.classList.contains('level-card')) {
            SyncManager.updateGameState({ current_level: parseInt(target.dataset.level) });
        }
        // Admin Cmds
        if (id === 'ctrl-start') SyncManager.updateGameState({ phase: 'playing', question_index: 0 });
        if (id === 'ctrl-pause') SyncManager.updateGameState({ phase: 'paused' });
        if (id === 'ctrl-restart') SyncManager.updateGameState({ phase: 'playing', question_index: state.global.questionIndex });
        if (id === 'ctrl-skip' || id === 'admin-next') {
            const next = state.global.questionIndex + 1;
            if (next < questionsBank[state.global.currentLevel].length) SyncManager.updateGameState({ question_index: next, phase: 'playing' });
            else SyncManager.updateGameState({ phase: 'results' });
        }
        if (id === 'ctrl-end') {
            if (confirm("Are you sure you want to end the game?")) {
                SyncManager.updateGameState({ phase: 'lobby' });
            }
        }
        if (id === 'admin-logout') showScreen('home-screen');
    });
}

// 6. Initialization Sequence (Bulletproof)
function initArena() {
    if (window.ARENA_INITIALIZED) return;
    window.ARENA_INITIALIZED = true;
    ArenaLog.info("BOOT SEQUENCE INITIATED");

    initNavigation();
    if (supabase) SyncManager.subscribe();

    const finishStartup = () => {
        ArenaLog.info("FINISHING STARTUP...");
        const loader = getEl('loading-screen');
        const app = getEl('app');
        if (app) app.style.display = 'flex';
        if (loader) {
            setTimeout(() => {
                loader.classList.remove('active');
                loader.style.display = 'none';
                showScreen('home-screen');
            }, 800);
        } else {
            showScreen('home-screen');
        }
    };

    // Give it 2 seconds for effect, then reveal
    setTimeout(finishStartup, 2000);
}

// Startup Trigger
if (document.readyState === 'complete' || document.readyState === 'interactive') initArena();
else window.addEventListener('DOMContentLoaded', initArena);

// Final Safety Net
setTimeout(() => {
    const loader = getEl('loading-screen');
    if (loader && loader.style.display !== 'none' && loader.style.opacity !== '0') {
        ArenaLog.warn("SAFETY NET TRIGGERED");
        initArena();
        loader.style.display = 'none';
        const app = getEl('app');
        if (app) app.style.display = 'flex';
        showScreen('home-screen');
    }
}, 5000);

window.SyncManager = SyncManager;
window.state = state;
window.showScreen = showScreen;

// Add debugging logs to identify issues
ArenaLog.info("DEBUG: Script loaded and initialized.");

// Enhance forceRevealArena function
function forceRevealArena() {
    ArenaLog.info("DEBUG: forceRevealArena triggered.");
    var loader = document.getElementById('loading-screen');
    if (loader) {
        loader.classList.remove('active');
        loader.style.display = 'none';
        ArenaLog.info("DEBUG: Loading screen hidden.");
    } else {
        ArenaLog.warn("DEBUG: Loading screen element not found.");
    }

    var app = document.getElementById('app');
    if (app) {
        app.style.display = 'flex';
        ArenaLog.info("DEBUG: App screen displayed.");
    } else {
        ArenaLog.warn("DEBUG: App element not found.");
    }

    if (typeof showScreen === 'function') {
        showScreen('home-screen');
        ArenaLog.info("DEBUG: showScreen('home-screen') called.");
    } else {
        ArenaLog.err("DEBUG: showScreen function not defined.");
    }
}

// Add a check for Supabase initialization
if (!supabase) {
    ArenaLog.err("DEBUG: Supabase instance not initialized.");
} else {
    ArenaLog.info("DEBUG: Supabase instance initialized successfully.");
}
