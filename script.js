// --- BELMONTS: TECH ARENA - Core Logic (Robust Edition) ---

// 1. Diagnostics & Logging
const ArenaLog = {
    info: (msg) => console.log(`%c[ARENA INFO]%c ${msg}`, "color: #00f2ff; font-weight: bold", "color: #fff"),
    warn: (msg) => console.warn(`[ARENA WARN] ${msg}`),
    err: (msg) => console.error(`[ARENA ERROR] ${msg}`)
};

window.onerror = function (msg, url, line) {
    ArenaLog.err(`Global Crash: ${msg} [Line: ${line}]`);
    const loading = document.getElementById('loading-screen');
    if (loading && loading.classList.contains('active')) {
        setTimeout(() => {
            loading.style.display = 'none';
            const home = document.getElementById('home-screen');
            if (home) {
                home.classList.add('active');
                home.style.display = 'flex';
            }
        }, 3000);
    }
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
        ArenaLog.warn("SUPABASE: SDK NOT DETECTED (Script Load Failure?)");
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
        if (!supabase) return ArenaLog.warn("OFFLINE: JOIN SKIPPED");
        const { error } = await supabase.from('players').upsert([player]);
        if (error) ArenaLog.err("SYNC JOIN FAILURE: " + error.message);
    },
    async updateScore(playerId, points) {
        if (!supabase) return;
        const p = state.global.players.find(p => p.id === playerId);
        if (p) {
            const { error } = await supabase.from('players').update({ score: p.score + points }).eq('id', playerId);
            if (error) ArenaLog.err("SYNC SCORE FAILURE");
        }
    },
    async updateGameState(updates) {
        if (!supabase) {
            Object.assign(state.global, updates);
            updateUI();
            return;
        }
        const { error } = await supabase.from('game_state').upsert([{ id: 'global', ...updates }]);
        if (error) ArenaLog.err("SYNC STATE FAILURE: " + error.message);
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
        ArenaLog.info("CHANNELS: BINDING REALTIME...");

        supabase.channel('players_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => this.loadPlayers())
            .subscribe((status) => ArenaLog.info("PLAYERS CHANNEL: " + status));

        supabase.channel('state_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
                const d = payload.new;
                if (d && d.id === 'global') {
                    ArenaLog.info("STATE SYNC: " + d.phase);
                    state.global.phase = d.phase;
                    state.global.currentLevel = d.current_level;
                    state.global.questionIndex = d.question_index;
                    updateUI();
                }
            })
            .subscribe((status) => ArenaLog.info("STATE CHANNEL: " + status));

        this.loadPlayers();
        this.loadGameState();
    },
    async loadPlayers() {
        if (!supabase) return;
        const { data, error } = await supabase.from('players').select('*').order('joinTime', { ascending: true });
        if (error) return ArenaLog.err("LOAD PLAYERS FAILURE");
        if (data) state.global.players = data;
        updateUI();
    },
    async loadGameState() {
        if (!supabase) return;
        const { data, error } = await supabase.from('game_state').select('*').eq('id', 'global').single();
        if (error) ArenaLog.warn("GAME STATE NOT FOUND - INITIALIZING...");
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
    ArenaLog.info("SCREEN -> " + screenId);
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
    getEl('status-badge').innerText = state.global.phase.toUpperCase();
    getEl('active-level-label').innerText = levels.find(l => l.id === state.global.currentLevel)?.name || 'NONE';

    // Levels
    document.querySelectorAll('.level-card').forEach(card => {
        if (parseInt(card.dataset.level) === state.global.currentLevel) card.classList.add('selected');
        else card.classList.remove('selected');
    });

    // Roster
    const list = getEl('admin-player-list');
    if (list) {
        list.innerHTML = '';
        state.global.players.filter(p => p.status === 'active').forEach((p, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.score}</td><td><button class="text-link red" onclick="SyncManager.kickPlayer('${p.id}')">KICK</button></td>`;
            list.appendChild(row);
        });
    }

    // Scores
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

    getEl('question-text').innerText = q.q;
    const grid = getEl('answer-grid');
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

function showResults() {
    showScreen('result-screen');
    const sorted = [...state.global.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === state.playerId) + 1;
    const box = getEl('personal-rank-box');
    if (box) box.innerHTML = `<h2>RANK: ${myRank || 'N/A'}</h2>`;
}

// 6. Controller Bindings
function bindEvents() {
    ArenaLog.info("BINDING EVENT LISTENERS...");

    const safeBind = (id, fn) => { const el = getEl(id); if (el) el.onclick = fn; };

    // Navigation
    safeBind('role-admin', () => showScreen('admin-login-screen'));
    safeBind('cancel-admin', () => showScreen('home-screen'));
    safeBind('role-participant', () => {
        getEl('role-selection').classList.add('hidden');
        getEl('player-input-group').classList.remove('hidden');
    });
    safeBind('back-to-roles', () => {
        getEl('player-input-group').classList.add('hidden');
        getEl('role-selection').classList.remove('hidden');
    });

    // Login
    safeBind('login-btn', () => {
        const pass = getEl('admin-password').value;
        if (pass === '9500') {
            state.userRole = 'ADMIN';
            showScreen('admin-panel-screen');
            initAdminTerminal();
        } else {
            getEl('admin-password').classList.add('wrong-auth');
            setTimeout(() => getEl('admin-password').classList.remove('wrong-auth'), 500);
        }
    });

    // Battle
    safeBind('start-battle', () => {
        const name = getEl('player-name').value.trim();
        if (name.length < 2) return;
        state.playerName = name;
        state.playerId = 'P-' + Date.now();
        state.userRole = 'PARTICIPANT';
        SyncManager.joinPlayer({
            id: state.playerId, name: name, score: 0, joinTime: Date.now(), status: 'active'
        });
        showScreen('lobby-screen');
    });

    // Admin Panel
    safeBind('admin-start', () => SyncManager.updateGameState({ phase: 'playing', question_index: 0 }));
    safeBind('admin-show', () => SyncManager.updateGameState({ phase: 'show_answer' }));
    safeBind('admin-stop', () => SyncManager.updateGameState({ phase: 'lobby' }));
    safeBind('admin-reset', () => { if (confirm("RESET ARENA?")) SyncManager.resetGame(); });
    safeBind('admin-next', () => {
        const next = state.global.questionIndex + 1;
        if (next < getCurrentPool().length) SyncManager.updateGameState({ question_index: next, phase: 'playing' });
        else SyncManager.updateGameState({ phase: 'results' });
    });
    safeBind('add-player-btn', () => {
        const name = getEl('manual-player-name').value.trim();
        if (name) SyncManager.joinPlayer({ id: 'M-' + Date.now(), name: name, score: 0, joinTime: Date.now(), status: 'active' });
    });
}

function initAdminTerminal() {
    const tabs = document.querySelectorAll('.tab-btn');
    const indicator = document.querySelector('.tab-indicator');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            getEl(tab.dataset.tab).classList.add('active');
            if (indicator) {
                indicator.style.width = tab.offsetWidth + 'px';
                indicator.style.left = tab.offsetLeft + 'px';
            }
        };
    });

    document.querySelectorAll('.level-card').forEach(card => {
        card.onclick = () => {
            SyncManager.updateGameState({ current_level: parseInt(card.dataset.level) });
        };
    });
}

// 7. Initialize
function initArena() {
    ArenaLog.info("ARENA BOOT SEQUENCE START...");

    // FX
    const ptn = getEl('particles-container');
    if (ptn) {
        ptn.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const p = document.createElement('div');
            Object.assign(p.style, { position: 'absolute', left: Math.random() * 100 + '%', top: Math.random() * 100 + '%', width: '2px', height: '2px', background: '#00f2ff' });
            ptn.appendChild(p);
        }
    }

    bindEvents();
    if (supabase) SyncManager.subscribe();

    setTimeout(() => {
        const loader = getEl('loading-screen');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
                getEl('app').style.display = 'block';
                showScreen('home-screen');
            }, 800);
        }
    }, 2000);
}

window.SyncManager = SyncManager;
window.addEventListener('DOMContentLoaded', initArena);
