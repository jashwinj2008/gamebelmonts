// --- BELMONTS: TECH ARENA - Core Logic ---

// Supabase Configuration
const supabaseUrl = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
const supabaseKey = 'sb_publishable_SBrp-zgLSnJAQb8_XAyECQ_Vj8zF5kN';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// Core State
const state = {
    playerName: '',
    playerId: '',
    userRole: null, // ADMIN or PARTICIPANT
    currentScreen: 'loading-screen',

    // Global State (Synced via StorageManager - Poll every 2s)
    global: {
        phase: 'lobby', // lobby | playing | show_answer | results
        currentLevel: 1,
        questionIndex: 0,
        players: [], // { id, name, score, joinTime, answers[], status }
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

const questions = [
    {
        q: "Which protocol is used for secure communication over the internet?",
        a: ["HTTP", "HTTPS", "FTP", "SMTP"],
        correct: 1
    },
    {
        q: "What does CSS stand for?",
        a: ["Creative Style Sheets", "Computer Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets"],
        correct: 2
    },
    {
        q: "Which language is primarily used for Android App development?",
        a: ["Kotlin", "Swift", "C#", "PHP"],
        correct: 0
    },
    {
        q: "What is the primary function of a Load Balancer?",
        a: ["Encrypt Data", "Store Cookies", "Distribute Traffic", "Compile Code"],
        correct: 2
    },
    {
        q: "Which data structure follows LIFO (Last In First Out)?",
        a: ["Queue", "Stack", "Linked List", "Tree"],
        correct: 1
    }
];

// Supabase Interaction Layer
const SyncManager = {
    async joinPlayer(player) {
        if (!supabase) return;
        const { error } = await supabase.from('players').upsert([player]);
        if (error) console.error("Join error:", error);
    },

    async updateScore(playerId, points) {
        if (!supabase) return;
        const p = state.global.players.find(p => p.id === playerId);
        if (!p) return;
        const newScore = p.score + points;
        const { error } = await supabase.from('players').update({ score: newScore }).eq('id', playerId);
        if (error) console.error("Update score error:", error);
    },

    async updateGameState(updates) {
        if (!supabase) return;
        const { error } = await supabase.from('game_state').upsert([{ id: 'global', ...updates }]);
        if (error) console.error("Update game state error:", error);
    },

    async kickPlayer(id) {
        if (!supabase) return;
        await supabase.from('players').update({ status: 'kicked' }).eq('id', id);
    },

    async resetGame() {
        if (!supabase) return;
        // Reset players
        await supabase.from('players').update({ score: 0, status: 'active', answers: [] }).neq('id', 'temp');
        // Reset state
        await this.updateGameState({ phase: 'lobby', current_level: 1, question_index: 0 });
    },

    subscribe() {
        if (!supabase) return;

        // Subscribe to Players
        supabase
            .channel('public:players')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, payload => {
                this.loadPlayers();
            })
            .subscribe();

        // Subscribe to Game State
        supabase
            .channel('public:game_state')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
                const data = payload.new;
                if (data && data.id === 'global') {
                    state.global.phase = data.phase;
                    state.global.currentLevel = data.current_level;
                    state.global.questionIndex = data.question_index;
                    updateUI();
                }
            })
            .subscribe();

        // Initial load
        this.loadPlayers();
        this.loadGameState();
    },

    async loadPlayers() {
        const { data, error } = await supabase.from('players').select('*').order('joinTime', { ascending: true });
        if (!error && data) {
            state.global.players = data;

            // Check if current player is kicked
            if (state.playerId && state.userRole === 'PARTICIPANT') {
                const me = data.find(p => p.id === state.playerId);
                if (!me || me.status === 'kicked') {
                    state.playerName = '';
                    state.playerId = '';
                    state.userRole = null;
                    location.reload();
                    return;
                }
            }
            updateUI();
        }
    },

    async loadGameState() {
        const { data, error } = await supabase.from('game_state').select('*').eq('id', 'global').single();
        if (!error && data) {
            state.global.phase = data.phase;
            state.global.currentLevel = data.current_level;
            state.global.questionIndex = data.question_index;
            updateUI();
        }
    }
};

// DOM Elements
const screens = document.querySelectorAll('.screen');
const appContainer = document.getElementById('app');

// Home/Role elements
const roleSelection = document.getElementById('role-selection');
const playerInputGroup = document.getElementById('player-input-group');
const roleAdmin = document.getElementById('role-admin');
const roleParticipant = document.getElementById('role-participant');
const playerNameInput = document.getElementById('player-name');
const startBtn = document.getElementById('start-battle');
const backToRoles = document.getElementById('back-to-roles');
const nameError = document.getElementById('name-error');

// Admin Elements
const adminPasswordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const tabIndicator = document.querySelector('.tab-indicator');
const levelCards = document.querySelectorAll('.level-card');
const statusBadge = document.getElementById('status-badge');
const activeLevelLabel = document.getElementById('active-level-label');
const adminPlayerList = document.getElementById('admin-player-list');
const adminLeaderboard = document.getElementById('admin-leaderboard');

// General/Participant elements
const timerBar = document.getElementById('timer-bar');
const questionText = document.getElementById('question-text');
const answerGrid = document.getElementById('answer-grid');
const scoreDisplay = document.getElementById('current-score');
const leaderboard = document.getElementById('leaderboard');
const playerList = document.getElementById('player-list');
const participantCountBadge = document.getElementById('participant-count-badge');
const miniRoster = document.getElementById('mini-roster');
const personalRankBox = document.getElementById('personal-rank-box');

// --- NAVIGATION ---
function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    state.currentScreen = screenId;
}

// --- PARTICIPANT JOIN LOGIC ---
function validateAndJoin() {
    const name = playerNameInput.value.trim();

    // Reset errors
    nameError.classList.add('hidden');
    playerNameInput.classList.remove('wrong-auth');

    // Basic Validation
    if (name.length < 2) {
        showJoinError("NAME TOO SHORT (MIN 2 CHARS)");
        return;
    }
    if (name.length > 20) {
        showJoinError("NAME TOO LONG (MAX 20 CHARS)");
        return;
    }

    // Duplicate Check — load from storage without side effects
    const stored = localStorage.getItem(StorageManager.KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        const isDuplicate = parsed.players.some(p => p.name.toLowerCase() === name.toLowerCase() && p.status === 'active');
        if (isDuplicate) {
            showJoinError('NAME ALREADY TAKEN BY ANOTHER PIRATE');
            return;
        }
        state.global = parsed; // safe to update now
    }

    // Success - Create Participant
    state.playerName = name;
    state.playerId = 'P-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    state.userRole = 'PARTICIPANT';

    const newPlayer = {
        id: state.playerId,
        name: state.playerName,
        score: 0,
        joinTime: Date.now(),
        answers: [],
        status: 'active'
    };

    SyncManager.joinPlayer(newPlayer);
    showScreen('lobby-screen');
}

function showJoinError(msg) {
    nameError.innerText = msg;
    nameError.classList.remove('hidden');
    playerNameInput.classList.add('wrong-auth');
    setTimeout(() => playerNameInput.classList.remove('wrong-auth'), 400);
}

// --- ADMIN LOGIC ---
loginBtn.onclick = () => {
    const pwd = adminPasswordInput.value;
    if (pwd === '9500') {
        state.userRole = 'ADMIN';
        showScreen('admin-panel-screen');
        updateTabIndicator();
    } else {
        adminPasswordInput.classList.add('wrong-auth');
        setTimeout(() => adminPasswordInput.classList.remove('wrong-auth'), 400);
    }
};

document.getElementById('cancel-admin').onclick = () => showScreen('home-screen');

tabButtons.forEach(btn => {
    btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        updateTabIndicator();
        renderAdminData();
    };
});

function updateTabIndicator() {
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        tabIndicator.style.width = activeBtn.offsetWidth + 'px';
        tabIndicator.style.left = activeBtn.offsetLeft + 'px';
    }
}

levelCards.forEach(card => {
    card.onclick = () => {
        const level = parseInt(card.dataset.level);
        SyncManager.updateGameState({
            current_level: level,
            phase: 'lobby',
            question_index: 0
        });
    };
});

document.getElementById('admin-start').onclick = () => {
    SyncManager.updateGameState({ phase: 'playing', question_index: 0 });
};

document.getElementById('admin-show').onclick = () => {
    SyncManager.updateGameState({ phase: 'show_answer' });
};

document.getElementById('admin-next').onclick = () => {
    if (state.global.questionIndex < questions.length - 1) {
        SyncManager.updateGameState({
            question_index: state.global.questionIndex + 1,
            phase: 'playing'
        });
    } else {
        SyncManager.updateGameState({ phase: 'results' });
    }
};

document.getElementById('admin-stop').onclick = () => {
    SyncManager.updateGameState({ phase: 'lobby' });
};

document.getElementById('admin-reset').onclick = () => {
    if (confirm('REBOOT SYSTEM: Clear all scores and reset game?')) {
        SyncManager.resetGame();
    }
};

document.getElementById('add-player-btn').onclick = () => {
    const input = document.getElementById('manual-player-name');
    const name = input.value.trim();
    if (name) {
        SyncManager.joinPlayer({
            id: 'M-' + Date.now(),
            name,
            score: 0,
            joinTime: Date.now(),
            answers: [],
            status: 'active'
        });
        input.value = '';
    }
};

function kickPlayer(id) {
    SyncManager.kickPlayer(id);
}
window.kickPlayer = kickPlayer;

// --- CORE UI UPDATES ---
function updateUI() {
    const g = state.global;

    if (state.currentScreen === 'admin-panel-screen') {
        renderAdminData();
    }

    if (state.userRole === 'PARTICIPANT') {
        syncParticipantScreen();
    }
}

function renderAdminData() {
    const g = state.global;

    statusBadge.innerText = g.phase.toUpperCase();
    statusBadge.className = `badge ${g.phase}`;
    activeLevelLabel.innerText = levels.find(l => l.id === g.currentLevel)?.name || 'NONE';

    levelCards.forEach(c => {
        c.classList.toggle('selected', parseInt(c.dataset.level) === g.currentLevel);
    });

    // Tab 2: Players
    adminPlayerList.innerHTML = '';
    const activeUnits = g.players.filter(p => p.status === 'active').sort((a, b) => a.joinTime - b.joinTime);
    activeUnits.forEach((p, idx) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${idx + 1}</td>
            <td>${p.name}</td>
            <td>${p.score}</td>
            <td><button class="text-link red" onclick="kickPlayer('${p.id}')">KICK</button></td>
        `;
        adminPlayerList.appendChild(row);
    });

    // Tab 3: Scores
    adminLeaderboard.innerHTML = '';
    const scoreSorted = [...activeUnits].sort((a, b) => b.score - a.score);
    const maxScore = Math.max(...scoreSorted.map(p => p.score), 1);
    scoreSorted.forEach((p, idx) => {
        const bar = document.createElement('div');
        bar.className = 'score-row';
        const pct = (p.score / maxScore) * 100;
        bar.innerHTML = `
            <div class="score-info">
                <span>${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : '#' + (idx + 1)} ${p.name}</span>
                <span>${p.score}</span>
            </div>
            <div class="score-bar-bg">
                <div class="score-bar-fill" style="width: ${pct}%"></div>
            </div>
        `;
        adminLeaderboard.appendChild(bar);
    });
}

function syncParticipantScreen() {
    // Only sync if player has actually joined the game (has a valid ID)
    if (!state.playerId) return;

    const g = state.global;

    // Auto-switch sections
    if (g.phase === 'lobby' && state.currentScreen !== 'lobby-screen') {
        showScreen('lobby-screen');
    } else if (g.phase === 'playing' && state.currentScreen !== 'quiz-screen') {
        showScreen('quiz-screen');
        initLocalQuestion();
    } else if (g.phase === 'results' && state.currentScreen !== 'result-screen') {
        showResults();
    }

    // Lobby Updates
    if (state.currentScreen === 'lobby-screen') {
        const activeUnits = g.players.filter(p => p.status === 'active').sort((a, b) => a.joinTime - b.joinTime);
        participantCountBadge.innerText = `UNITS DETECTED: ${activeUnits.length}`;
        playerList.innerHTML = '';
        activeUnits.forEach((p, idx) => {
            const entry = document.createElement('div');
            entry.className = 'player-entry';
            entry.innerHTML = `<span>${idx + 1}</span><span class="name">${p.name}</span><span class="score">${p.score}</span>`;
            playerList.appendChild(entry);
        });
    }

    // Quiz & Mini Leaderboard
    if (state.currentScreen === 'quiz-screen') {
        const localQIndex = parseInt(answerGrid.dataset.qIndex || -1);
        if (localQIndex !== g.questionIndex) {
            initLocalQuestion();
        }
        renderMiniLeaderboard();
    }
}

function renderMiniLeaderboard() {
    const activeUnits = state.global.players.filter(p => p.status === 'active').sort((a, b) => b.score - a.score).slice(0, 8);
    miniRoster.innerHTML = '';
    activeUnits.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = `mini-item ${p.id === state.playerId ? 'me' : ''}`;
        item.innerHTML = `<span>#${idx + 1} ${p.name}</span><span>${p.score}</span>`;
        miniRoster.appendChild(item);
    });
}

// --- PARTICIPANT QUIZ LOGIC ---
let localTimerInterval = null;

function initLocalQuestion() {
    const g = state.global;
    const q = questions[g.questionIndex];
    answerGrid.dataset.qIndex = g.questionIndex;
    answerGrid.dataset.answered = 'false';

    questionText.innerText = q.q;
    answerGrid.innerHTML = '';
    q.a.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = ans;
        btn.onclick = () => submitAnswer(idx);
        answerGrid.appendChild(btn);
    });

    startLocalTimer();
    updateScoreDisplay();
}

function startLocalTimer() {
    clearInterval(localTimerInterval);
    let timeLeft = 15;
    timerBar.style.width = '100%';
    localTimerInterval = setInterval(() => {
        timeLeft -= 0.1;
        timerBar.style.width = (timeLeft / 15) * 100 + '%';
        state.currentTimeLeft = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(localTimerInterval);
            if (answerGrid.dataset.answered === 'false') submitAnswer(-1);
        }
    }, 100);
}

function submitAnswer(idx) {
    if (answerGrid.dataset.answered === 'true') return;
    answerGrid.dataset.answered = 'true';
    clearInterval(localTimerInterval);

    const g = state.global;
    const q = questions[g.questionIndex];
    const buttons = answerGrid.querySelectorAll('.answer-btn');

    // Save answer in global array
    const me = state.global.players.find(p => p.id === state.playerId);
    if (me) {
        me.answers[g.questionIndex] = idx;
    }

    if (idx === q.correct) {
        if (idx !== -1) buttons[idx].classList.add('correct');
        const points = Math.ceil(state.currentTimeLeft * 10);
        SyncManager.updateScore(state.playerId, points);
    } else {
        if (idx !== -1) buttons[idx].classList.add('wrong');
        buttons[q.correct].classList.add('correct');
    }
}

// removed local update functions, using SyncManager instead

function showResults() {
    showScreen('result-screen');
    const sorted = [...state.global.players].filter(p => p.status === 'active').sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === state.playerId) + 1;

    // Personal Rank Box
    personalRankBox.innerHTML = `
        <span class="rank-text">FINAL SYSTEM RANK</span>
        <span class="rank-number">${myRank}</span>
        <span class="rank-medal">${myRank <= 3 ? ['🥇', '🥈', '🥉'][myRank - 1] : '🎖️'}</span>
    `;

    // Full Leaderboard
    leaderboard.innerHTML = '';
    const maxScore = Math.max(...sorted.map(p => p.score), 1);
    sorted.forEach((res, idx) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item ${idx === 0 ? 'top' : ''}`;
        const pct = (res.score / maxScore) * 100;
        item.innerHTML = `
            <div class="score-info">
                <span>#${idx + 1} ${res.name}</span>
                <span>${res.score}</span>
            </div>
            <div class="score-bar-bg">
                <div class="score-bar-fill" style="width: ${pct}%"></div>
            </div>
        `;
        leaderboard.appendChild(item);
    });
}

// --- INITIALIZATION & EVENTS ---
roleAdmin.onclick = () => showScreen('admin-login-screen');
roleParticipant.onclick = () => {
    state.userRole = 'PARTICIPANT';
    roleSelection.classList.add('hidden');
    playerInputGroup.classList.remove('hidden');
};

backToRoles.onclick = () => {
    roleSelection.classList.remove('hidden');
    playerInputGroup.classList.add('hidden');
    nameError.classList.add('hidden');
};

startBtn.onclick = validateAndJoin;

document.getElementById('play-again').onclick = () => {
    // Soft reset for results - simply reload
    location.reload();
};

function initLoading() {
    initParticles();

    // Initialize Supabase Sync
    SyncManager.subscribe();

    setTimeout(() => {
        const loadingImg = document.querySelector('.loading-image');
        if (loadingImg) {
            if (loadingImg.complete) {
                loadingImg.classList.add('loaded');
            } else {
                loadingImg.onload = () => loadingImg.classList.add('loaded');
            }
        }

        document.getElementById('loading-screen').classList.add('fade-out');
        setTimeout(() => {
            showScreen('home-screen');
        }, 1000);
    }, 4000);
}

function initParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        Object.assign(p.style, {
            position: 'absolute', left: Math.random() * 100 + '%', top: Math.random() * 100 + '%',
            width: '2px', height: '2px', background: 'var(--neon-blue)', borderRadius: '50%',
            boxShadow: '0 0 5px var(--neon-blue)', animation: `float ${5 + Math.random() * 5}s infinite linear`
        });
        container.appendChild(p);
    }
}

initLoading();


