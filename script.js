// --- BELMONTS: TECH ARENA - Core Logic (Ultra-Robust Edition) ---

// 1. Diagnostics & Logging
const ArenaLog = {
    info: (msg) => console.log(`%c[ARENA INFO]%c ${msg}`, "color: #00f2ff; font-weight: bold", "color: #fff"),
    warn: (msg) => console.warn(`[ARENA WARN] ${msg}`),
    err: (msg) => console.error(`[ARENA ERROR] ${msg}`)
};

window.onerror = function (msg, url, line) {
    ArenaLog.err(`Global Crash: ${msg} [Line: ${line}]`);
};

ArenaLog.info("SYSTEM SECURE: INITIALIZING KERNEL...");

// 2. Supabase - Defensive Initialization
let supabase = null;
try {
    const supabaseUrl = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
    const supabaseKey = 'sb_publishable_SBrp-zgLSnJAQb8_XAyECQ_Vj8zF5kN';
    if (window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        ArenaLog.info("SUPABASE: CONNECTED");
    } else {
        ArenaLog.warn("SUPABASE: SDK NOT DETECTED");
    }
} catch (e) {
    ArenaLog.err("SUPABASE: CONNECTION FATAL");
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
    // ... (rest of the questionsbank is kept internal for brevity)
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

function getCurrentPool() {
    return questionsBank[state.global.currentLevel] || [];
}

// 4. Sync Infrastructure
const SyncManager = {
    async joinPlayer(player) {
        if (!supabase) return;
        await supabase.from('players').upsert([player]);
    },
    async updateScore(playerId, points) {
        if (!supabase) return;
        const p = state.global.players.find(p => p.id === playerId);
        if (p) await supabase.from('players').update({ score: p.score + points }).eq('id', playerId);
    },
    async updateGameState(updates) {
        if (!supabase) return;
        await supabase.from('game_state').upsert([{ id: 'global', ...updates }]);
    },
    async kickPlayer(id) {
        if (!supabase) return;
        await supabase.from('players').update({ status: 'kicked' }).eq('id', id);
    },
    async resetGame() {
        if (!supabase) return;
        await supabase.from('players').update({ score: 0, status: 'active', answers: [] }).neq('id', 'temp');
        await this.updateGameState({ phase: 'lobby', current_level: 1, question_index: 0 });
    },
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
    },
    async loadPlayers() {
        if (!supabase) return;
        const { data } = await supabase.from('players').select('*').order('joinTime', { ascending: true });
        if (data) state.global.players = data;
        updateUI();
    },
    async loadGameState() {
        if (!supabase) return;
        const { data } = await supabase.from('game_state').select('*').eq('id', 'global').single();
        if (data) {
            state.global.phase = data.phase;
            state.global.currentLevel = data.current_level;
            state.global.questionIndex = data.question_index;
            updateUI();
        }
    }
};

// 5. UI Engine
const getEl = (id) => document.getElementById(id);

function showScreen(screenId) {
    ArenaLog.info("SWITCHING SCREEN -> " + screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = getEl(screenId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
        state.currentScreen = screenId;
        updateUI();
    }
}

function updateUI() {
    if (state.currentScreen === 'admin-panel-screen') renderAdminData();
    if (state.userRole === 'PARTICIPANT' || state.playerId) syncParticipantScreen();
}

function renderAdminData() {
    const statusBadge = getEl('status-badge');
    const levelLabel = getEl('active-level-label');
    if (statusBadge) statusBadge.innerText = state.global.phase.toUpperCase();
    if (levelLabel) levelLabel.innerText = levels.find(l => l.id === state.global.currentLevel)?.name || 'NONE';

    document.querySelectorAll('.level-card').forEach(card => {
        if (parseInt(card.dataset.level) === state.global.currentLevel) card.classList.add('selected');
        else card.classList.remove('selected');
    });

    const list = getEl('admin-player-list');
    if (list) {
        list.innerHTML = '';
        state.global.players.filter(p => p.status === 'active').forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.score}</td><td><button class="text-link red" onclick="SyncManager.kickPlayer('${p.id}')">KICK</button></td>`;
            list.appendChild(row);
        });
    }

    const board = getEl('admin-leaderboard');
    if (board) {
        board.innerHTML = '';
        const sorted = [...state.global.players].sort((a, b) => b.score - a.score);
        sorted.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'score-row';
            const percent = Math.min(100, (p.score / 1500) * 100);
            row.innerHTML = `
                <div class="score-info"><span>${i + 1}. ${p.name}</span><span>${p.score} XP</span></div>
                <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${percent}%"></div></div>
            `;
            board.appendChild(row);
        });
    }
}

function syncParticipantScreen() {
    const g = state.global;
    if (g.phase === 'lobby' && state.currentScreen !== 'lobby-screen' && state.currentScreen !== 'home-screen') showScreen('lobby-screen');
    else if (g.phase === 'playing' && state.currentScreen !== 'quiz-screen') {
        showScreen('quiz-screen');
        initLocalQuestion();
    }
    else if (g.phase === 'results' && state.currentScreen !== 'result-screen') showResults();

    if (state.currentScreen === 'lobby-screen') {
        const list = getEl('player-list');
        if (list) {
            list.innerHTML = '';
            g.players.filter(p => p.status === 'active').forEach((p, i) => {
                const item = document.createElement('div');
                item.className = 'player-entry';
                item.innerHTML = `<span>${i + 1}</span><span class="name">${p.name}</span><span class="score">${p.score}</span>`;
                list.appendChild(item);
            });
        }
        const badge = getEl('participant-count-badge');
        if (badge) badge.innerText = `UNITS: ${g.players.length}`;
    }
}

function initLocalQuestion() {
    const pool = getCurrentPool();
    const q = pool[state.global.questionIndex];
    if (!q) return;

    const qText = getEl('question-text');
    if (qText) qText.innerText = q.q;

    const grid = getEl('answer-grid');
    if (grid) {
        grid.innerHTML = '';
        grid.dataset.answered = 'false';
        q.a.forEach((ans, i) => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.innerText = ans;
            btn.onclick = () => {
                if (grid.dataset.answered === 'true') return;
                grid.dataset.answered = 'true';
                if (i === q.correct) {
                    btn.classList.add('correct');
                    SyncManager.updateScore(state.playerId, 100);
                } else {
                    btn.classList.add('wrong');
                }
            };
            grid.appendChild(btn);
        });
    }
}

function showResults() {
    showScreen('result-screen');
    const sorted = [...state.global.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === state.playerId) + 1;
    const box = getEl('personal-rank-box');
    if (box) box.innerHTML = `<h2>RANK: ${myRank || 'OFFLINE'}</h2>`;
}

// 6. Navigation Logic - GLOBAL DELEGATION
function initNavigation() {
    ArenaLog.info("NAV: INITIALIZING GLOBAL DELEGATOR...");

    document.addEventListener('click', (e) => {
        const target = e.target.closest('[id], .tab-btn, .level-card');
        if (!target) return;

        const id = target.id;
        ArenaLog.info("NAV EVENT: " + id + " (Class: " + target.className + ")");

        // Role Selection
        if (id === 'role-admin') showScreen('admin-login-screen');
        if (id === 'role-participant') {
            const sel = getEl('role-selection');
            const inc = getEl('player-input-group');
            if (sel) sel.classList.add('hidden');
            if (inc) inc.classList.remove('hidden');
        }
        if (id === 'back-to-roles') {
            const sel = getEl('role-selection');
            const inc = getEl('player-input-group');
            if (sel) sel.classList.remove('hidden');
            if (inc) inc.classList.add('hidden');
        }
        if (id === 'cancel-admin') showScreen('home-screen');

        // Admin Login
        if (id === 'login-btn') {
            const passEl = getEl('admin-password');
            if (passEl && passEl.value === '9500') {
                state.userRole = 'ADMIN';
                showScreen('admin-panel-screen');
            } else if (passEl) {
                passEl.classList.add('wrong-auth');
                setTimeout(() => passEl.classList.remove('wrong-auth'), 500);
            }
        }

        // Participant Join
        if (id === 'start-battle') {
            const nameEl = getEl('player-name');
            const name = nameEl ? nameEl.value.trim() : "";
            if (name.length >= 2) {
                state.playerName = name;
                state.playerId = 'P-' + Date.now();
                state.userRole = 'PARTICIPANT';
                SyncManager.joinPlayer({ id: state.playerId, name: name, score: 0, joinTime: Date.now(), status: 'active' });
                showScreen('lobby-screen');
            }
        }

        // Admin Tabs
        if (target.classList.contains('tab-btn')) {
            const tabs = document.querySelectorAll('.tab-btn');
            const panes = document.querySelectorAll('.tab-pane');
            const indicator = document.querySelector('.tab-indicator');

            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            target.classList.add('active');
            const pane = getEl(target.dataset.tab);
            if (pane) pane.classList.add('active');

            if (indicator) {
                indicator.style.width = target.offsetWidth + 'px';
                indicator.style.left = target.offsetLeft + 'px';
            }
            renderAdminData();
        }

        // Level Cards
        if (target.classList.contains('level-card')) {
            const lvl = parseInt(target.dataset.level);
            SyncManager.updateGameState({ current_level: lvl });
        }

        // Battle Commands
        if (id === 'admin-start') SyncManager.updateGameState({ phase: 'playing', question_index: 0 });
        if (id === 'admin-show') SyncManager.updateGameState({ phase: 'show_answer' });
        if (id === 'admin-stop') SyncManager.updateGameState({ phase: 'lobby' });
        if (id === 'admin-next') {
            const next = state.global.questionIndex + 1;
            if (next < getCurrentPool().length) SyncManager.updateGameState({ question_index: next, phase: 'playing' });
            else SyncManager.updateGameState({ phase: 'results' });
        }
        if (id === 'admin-reset') {
            if (confirm("PURGE SESSION DATA?")) SyncManager.resetGame();
        }
        if (id === 'add-player-btn') {
            const nameIn = getEl('manual-player-name');
            if (nameIn && nameIn.value.trim()) {
                SyncManager.joinPlayer({ id: 'M-' + Date.now(), name: nameIn.value.trim(), score: 0, joinTime: Date.now(), status: 'active' });
                nameIn.value = '';
            }
        }
    });
}

// 7. Initialization
function initArena() {
    if (window.ARENA_INITIALIZED) return;
    window.ARENA_INITIALIZED = true;

    ArenaLog.info("ARENA BOOT SEQUENCE START...");

    // Particles
    const ptn = getEl('particles-container');
    if (ptn) {
        ptn.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            Object.assign(p.style, { position: 'absolute', left: Math.random() * 100 + '%', top: Math.random() * 100 + '%', width: '2px', height: '2px', background: '#00f2ff', boxShadow: '0 0 5px #00f2ff' });
            ptn.appendChild(p);
        }
    }

    initNavigation();
    if (supabase) SyncManager.subscribe();

    // Fade Out Loader
    setTimeout(() => {
        const loader = getEl('loading-screen');
        const app = getEl('app');
        if (app) app.style.display = 'block';
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
                showScreen('home-screen');
            }, 800);
        } else {
            showScreen('home-screen');
        }
    }, 2000);
}

// Bulletproof Startup
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initArena();
} else {
    window.addEventListener('DOMContentLoaded', initArena);
}

// Final Emergency Fallback (Force reveal after 4s)
setTimeout(() => {
    const loader = getEl('loading-screen');
    if (loader && loader.style.display !== 'none') {
        ArenaLog.warn("EMERGENCY REVEAL TRIGGERED");
        initArena();
        loader.style.display = 'none';
        const app = getEl('app');
        if (app) app.style.display = 'block';
        showScreen('home-screen');
    }
}, 4000);

window.SyncManager = SyncManager;
window.state = state;
