// --- ADMIN PANEL LOGIC ---
const ADMIN_PASSWORD = '9500';

// LOCALSTORAGE KEYS
const STORAGE_KEYS = {
    GAMESTATE: 'cgl-gamestate',
    PLAYERS: 'cgl-players'
};

// INITIAL DEFAULT STATE
const DEFAULT_GAMESTATE = {
    phase: 'lobby',
    currentLevel: 1,
    currentQuestion: 0,
    questionStartTime: null
};

// --- HELPER: LOCALSTORAGE ---
const Storage = {
    getGameState() {
        const saved = localStorage.getItem(STORAGE_KEYS.GAMESTATE);
        return saved ? JSON.parse(saved) : DEFAULT_GAMESTATE;
    },
    saveGameState(state) {
        localStorage.setItem(STORAGE_KEYS.GAMESTATE, JSON.stringify(state));
    },
    getPlayers() {
        const saved = localStorage.getItem(STORAGE_KEYS.PLAYERS);
        return saved ? JSON.parse(saved) : [];
    },
    savePlayers(players) {
        localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    }
};

// --- HELPER: TOAST SYSTEM ---
const Toast = {
    show(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }
};

// 4. UI Engine - UPDATED
function showScreen(screenId) {
    console.log("Switching to screen -> " + screenId);

    // Hide all divs whose id starts with screen-
    const allScreens = document.querySelectorAll('div[id^="screen-"]');
    allScreens.forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });

    // Also hide legacy screens if any
    const legacyScreens = document.querySelectorAll('.screen');
    legacyScreens.forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        target.classList.add('active');

        // Initial refresh if it's the admin panel
        if (screenId === 'screen-admin-panel') {
            AdminController.refreshAll();
        }
    } else {
        console.error("Screen element not found -> " + screenId);
    }
}

// --- ADMIN PANEL CONTROLLER ---
const AdminController = {
    activeTab: 'control',
    pollingInterval: null,

    init() {
        this.bindEvents();
        this.startPolling();
        this.setupStorageSync();
    },

    bindEvents() {
        // Tab Switching
        const tabBtns = document.querySelectorAll('.admin-tab-btn');
        if (tabBtns) {
            tabBtns.forEach(btn => {
                btn.onclick = (e) => this.switchTab(e.target.dataset.tab);
            });
        }

        // Level Selection
        const levelCards = document.querySelectorAll('.level-card');
        if (levelCards) {
            levelCards.forEach(card => {
                card.onclick = () => this.setLevel(parseInt(card.dataset.level));
            });
        }

        // Control Buttons
        if (document.getElementById('btn-start-level')) document.getElementById('btn-start-level').onclick = () => this.startLevel();
        if (document.getElementById('btn-show-answer')) document.getElementById('btn-show-answer').onclick = () => this.showAnswer();
        if (document.getElementById('btn-next-q')) document.getElementById('btn-next-q').onclick = () => this.nextQuestion();
        if (document.getElementById('btn-stop-level')) document.getElementById('btn-stop-level').onclick = () => this.stopLevel();
        if (document.getElementById('btn-reset-game')) document.getElementById('btn-reset-game').onclick = () => this.resetEntireGame();

        // Player Management
        if (document.getElementById('btn-add-player')) document.getElementById('btn-add-player').onclick = () => this.handleAddPlayer();
        const addPlayerInput = document.getElementById('add-player-name');
        if (addPlayerInput) {
            addPlayerInput.onkeydown = (e) => {
                if (e.key === 'Enter') this.handleAddPlayer();
            };
        }
    },

    setupStorageSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEYS.GAMESTATE || e.key === STORAGE_KEYS.PLAYERS) {
                this.refreshAll();
            }
        });
    },

    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(() => {
            this.refreshStats();
            if (this.activeTab === 'leaderboard') this.renderLeaderboard();
        }, 2000);
    },

    switchTab(tabId) {
        this.activeTab = tabId;
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
        this.refreshAll();
    },

    setLevel(lvl) {
        const ns = Storage.getGameState();
        ns.currentLevel = lvl;
        ns.currentQuestion = 0;
        ns.phase = 'lobby';
        Storage.saveGameState(ns);
        this.refreshAll();
        Toast.show(`Level ${lvl} Selected`);
    },

    startLevel() {
        const ns = Storage.getGameState();
        ns.phase = 'playing';
        ns.currentQuestion = 0;
        ns.questionStartTime = Date.now();
        Storage.saveGameState(ns);
        this.refreshAll();
        Toast.show("Level Started!", "success");
    },

    showAnswer() {
        const ns = Storage.getGameState();
        ns.phase = 'show_answer';
        Storage.saveGameState(ns);
        this.refreshAll();
        Toast.show("Answers Revealed");
    },

    nextQuestion() {
        const ns = Storage.getGameState();
        if (ns.currentQuestion < 9) {
            ns.currentQuestion++;
            ns.phase = 'playing';
            ns.questionStartTime = Date.now();
            Storage.saveGameState(ns);
            this.refreshAll();
            Toast.show(`Advanced to Question ${ns.currentQuestion + 1}`);
        } else {
            ns.phase = 'results';
            Storage.saveGameState(ns);
            this.refreshAll();
            Toast.show("Level Completed - View Results", "success");
        }
    },

    stopLevel() {
        const ns = Storage.getGameState();
        ns.phase = 'lobby';
        Storage.saveGameState(ns);
        this.refreshAll();
        Toast.show("Level Stopped", "error");
    },

    resetEntireGame() {
        if (confirm("DANGER: This will wipe ALL players, scores, and reset the game state. Proceed?")) {
            Storage.saveGameState(DEFAULT_GAMESTATE);
            Storage.savePlayers([]);
            this.refreshAll();
            Toast.show("System Purged - Game Reset", "error");
        }
    },

    handleAddPlayer() {
        const input = document.getElementById('add-player-name');
        if (!input) return;
        const name = input.value.trim().toUpperCase();
        if (!name) return;

        const players = Storage.getPlayers();
        if (players.some(p => p.name === name)) {
            Toast.show("Name already exists in roster", "error");
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 400);
            return;
        }

        const newPlayer = {
            id: 'PL-' + Math.random().toString(36).substr(2, 9),
            name: name,
            score: 0,
            answers: {},
            joinedAt: Date.now()
        };

        players.push(newPlayer);
        Storage.savePlayers(players);
        input.value = '';
        this.refreshAll();
        Toast.show(`${name} joined the crew`);
    },

    kickPlayer(id) {
        let players = Storage.getPlayers();
        players = players.filter(p => p.id !== id);
        Storage.savePlayers(players);
        this.refreshAll();
        Toast.show("Player removed from roster", "error");
    },

    refreshAll() {
        this.refreshStats();
        this.renderRoster();
        this.renderLeaderboard();
        this.updateLevelCards();
    },

    refreshStats() {
        const gs = Storage.getGameState();
        const players = Storage.getPlayers();
        const levelNames = ["Binary Challenge", "Hardware Builder", "Stack/Queue Battle", "Network Defender", "Tech Escape Room"];

        // Top Bar
        if (document.getElementById('admin-player-count')) document.getElementById('admin-player-count').textContent = players.length;
        if (document.getElementById('admin-level-info')) document.getElementById('admin-level-info').textContent = `L${gs.currentLevel} / Q${gs.currentQuestion + 1}`;

        const badge = document.getElementById('admin-status-badge');
        const badgeText = document.getElementById('admin-status-text');
        if (badge && badgeText) {
            badge.className = `admin-status-badge ${gs.phase.replace('_', '-')}`;
            badgeText.textContent = gs.phase.toUpperCase().replace('_', ' ');
        }

        // Info Box
        if (document.getElementById('info-level-name')) document.getElementById('info-level-name').textContent = levelNames[gs.currentLevel - 1] || "---";
        if (document.getElementById('info-q-num')) document.getElementById('info-q-num').textContent = `${gs.currentQuestion + 1} / 10`;
        if (document.getElementById('info-p-count')) document.getElementById('info-p-count').textContent = players.length;
        if (document.getElementById('info-phase')) document.getElementById('info-phase').textContent = gs.phase.toUpperCase().replace('_', ' ');
    },

    updateLevelCards() {
        const gs = Storage.getGameState();
        document.querySelectorAll('.level-card').forEach(card => {
            card.classList.toggle('active', parseInt(card.dataset.level) === gs.currentLevel);
        });
    },

    renderRoster() {
        const list = document.getElementById('admin-roster-list');
        if (!list) return;
        const players = Storage.getPlayers().sort((a, b) => a.joinedAt - b.joinedAt);

        if (players.length === 0) {
            list.innerHTML = '<div class="empty-state">No crew members registered.</div>';
            return;
        }

        list.innerHTML = players.map((p, idx) => `
            <div class="player-row" style="animation-delay: ${idx * 0.05}s">
                <div class="player-idx">#${(idx + 1).toString().padStart(2, '0')}</div>
                <div class="player-name-cell">${p.name}</div>
                <div class="player-score-cell">${p.score} PTS</div>
                <button class="kick-btn" onclick="AdminController.kickPlayer('${p.id}')">KICK</button>
            </div>
        `).join('');
    },

    renderLeaderboard() {
        const list = document.getElementById('admin-lb-list');
        if (!list) return;
        const players = Storage.getPlayers().sort((a, b) => b.score - a.score);
        const maxScore = players.length > 0 ? Math.max(...players.map(p => p.score), 1) : 1;

        if (players.length === 0) {
            list.innerHTML = '<div class="empty-state">Leaderboard is empty.</div>';
            return;
        }

        list.innerHTML = players.map((p, idx) => {
            const rankClass = idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : 'rn';
            const med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
            const width = (p.score / maxScore) * 100;

            return `
                <div class="lb-row ${rankClass}" style="animation-delay: ${idx * 0.05}s">
                    <div class="lb-rank ${rankClass}">${med || (idx + 1)}</div>
                    <div style="flex: 1">
                        <div class="lb-name">${p.name}</div>
                        <div class="lb-bar-wrap">
                            <div class="lb-bar ${rankClass}" style="width: ${width}%"></div>
                        </div>
                    </div>
                    <div class="lb-score-unit">
                        <div class="lb-score">${p.score}</div>
                        <div class="lb-score-label">POINTS</div>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// --- CORE NAVIGATION & INIT ---
function initNavigation() {
    // Admin login redirect logic
    if (window.location.search.includes('admin=1')) {
        showScreen('screen-admin-login');
    }

    // Wiring existing Admin card on home screen
    const roleCards = document.querySelectorAll('.role-card');
    roleCards.forEach(card => {
        if (card.innerText.includes('ADMIN') || card.innerText.includes('Control the Battle')) {
            card.onclick = () => showScreen('screen-admin-login');
        }

        if (card.innerText.includes('PARTICIPANT')) {
            card.onclick = () => {
                const rs = document.getElementById('role-selection');
                const pi = document.getElementById('player-input-group');
                if (rs) rs.classList.add('hidden');
                if (pi) pi.classList.remove('hidden');
            };
        }
    });

    // Login logic
    const loginBtn = document.getElementById('login-btn');
    const adminPw = document.getElementById('admin-password');
    if (loginBtn && adminPw) {
        loginBtn.onclick = () => {
            const pwd = adminPw.value;
            if (pwd === ADMIN_PASSWORD) {
                showScreen('screen-admin-panel');
            } else {
                Toast.show("Invalid Access Code", "error");
                const frame = document.getElementById('admin-login-frame');
                if (frame) {
                    frame.classList.add('shake');
                    setTimeout(() => frame.classList.remove('shake'), 400);
                }
            }
        };
    }
}

// Global expose
window.AdminController = AdminController;
window.showScreen = showScreen;

document.addEventListener('DOMContentLoaded', () => {
    AdminController.init();
    initNavigation();

    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.style.display = 'none';

        const app = document.getElementById('app');
        if (app) app.style.display = 'flex';

        showScreen('home-screen');
    }, 2000); // Reduced delay for faster dev feedback
});
