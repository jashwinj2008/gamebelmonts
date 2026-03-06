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

    // Participant flow - back to roles button
    const backToRolesBtn = document.getElementById('back-to-roles');
    if (backToRolesBtn) {
        backToRolesBtn.onclick = () => {
            const rs = document.getElementById('role-selection');
            const pi = document.getElementById('player-input-group');
            if (rs) rs.classList.remove('hidden');
            if (pi) pi.classList.add('hidden');
        };
    }

    // Participant flow - join battle
    const startBattleBtn = document.getElementById('start-battle');
    const playerNameInput = document.getElementById('player-name');
    const nameError = document.getElementById('name-error');

    if (startBattleBtn && playerNameInput) {
        startBattleBtn.onclick = () => {
            const name = playerNameInput.value.trim().toUpperCase();
            
            if (!name || name.length < 2) {
                if (nameError) {
                    nameError.textContent = 'NAME MUST BE AT LEAST 2 CHARACTERS';
                    nameError.classList.remove('hidden');
                }
                return;
            }

            // Check if name already exists
            const players = Storage.getPlayers();
            const nameExists = players.some(p => p.name.toUpperCase() === name);
            
            if (nameExists) {
                if (nameError) {
                    nameError.textContent = 'NAME ALREADY TAKEN BY ANOTHER PIRATE';
                    nameError.classList.remove('hidden');
                }
                return;
            }

            // Hide error
            if (nameError) nameError.classList.add('hidden');

            // Add player
            const newPlayer = {
                id: 'player-' + Date.now(),
                name: name,
                score: 0,
                joinedAt: Date.now()
            };
            players.push(newPlayer);
            Storage.savePlayers(players);

            // Store current player info
            localStorage.setItem('currentPlayer', JSON.stringify(newPlayer));

            // Show lobby
            showScreen('lobby-screen');
            ParticipantLobby.init();

            Toast.show(`Welcome, ${name}!`, 'success');
        };

        // Enter key to submit
        playerNameInput.onkeydown = (e) => {
            if (e.key === 'Enter') startBattleBtn.click();
        };
    }
}

// ============ PARTICIPANT LOBBY ============
const ParticipantLobby = {
    pollingInterval: null,
    currentPlayer: null,

    init() {
        this.currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        this.renderPlayerList();
        this.startPolling();
        this.checkGameState();
    },

    startPolling() {
        // Clear existing interval
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        // Poll every 2 seconds for updates
        this.pollingInterval = setInterval(() => {
            this.renderPlayerList();
            this.checkGameState();
        }, 2000);
    },

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    renderPlayerList() {
        const players = Storage.getPlayers();
        const listEl = document.getElementById('player-list');
        const countBadge = document.getElementById('participant-count-badge');

        if (countBadge) {
            countBadge.textContent = `UNITS DETECTED: ${players.length}`;
        }

        if (!listEl) return;

        if (players.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Waiting for players to join...</div>';
            return;
        }

        listEl.innerHTML = players.map((p, idx) => {
            const isCurrentPlayer = this.currentPlayer && p.id === this.currentPlayer.id;
            return `
                <div class="player-row ${isCurrentPlayer ? 'current-player' : ''}" style="animation-delay: ${idx * 0.05}s">
                    <span class="player-idx">#${(idx + 1).toString().padStart(2, '0')}</span>
                    <span class="player-name">${p.name}${isCurrentPlayer ? ' (YOU)' : ''}</span>
                    <span class="player-score">${p.score} PTS</span>
                </div>
            `;
        }).join('');
    },

    checkGameState() {
        const state = Storage.getGameState();

        // If admin started Level 1, switch to level screen
        if (state.phase === 'level1') {
            this.stopPolling();
            Level1.startLevel();
        }
    }
};

// Expose globally
window.ParticipantLobby = ParticipantLobby;

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

// ============ LEVEL 1 LOGIC ============

const Level1 = {
    // Puzzle configuration
    totalTime: 480, // 8 minutes in seconds
    windows: {
        early: { start: 0, end: 160 },
        mid: { start: 161, end: 320 },
        late: { start: 321, end: 480 }
    },
    
    // Correct solution order (line IDs)
    correctOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    
    // Code pieces data
    pieces: [
        { id: 1, code: 'scores = [72, 45, 88, 60, 95, 33, 78, 55]', indent: 0 },
        { id: 2, code: 'scores.sort()', indent: 0 },
        { id: 3, code: 'lowest = scores[0]', indent: 0 },
        { id: 4, code: 'highest = scores[-1]', indent: 0 },
        { id: 5, code: 'total = 0', indent: 0 },
        { id: 6, code: 'for score in scores:', indent: 0 },
        { id: 7, code: '    total = total + score', indent: 1 },
        { id: 8, code: 'average = total / len(scores)', indent: 0 },
        { id: 9, code: 'print(lowest, highest, average)', indent: 0 }
    ],
    
    expectedOutput: '33 95 65.75',
    
    // Runtime state
    timerInterval: null,
    elapsedSeconds: 0,
    playerScore: 0,
    playerName: 'AGENT',
    attempts: 0,
    solutionOrder: [], // IDs of pieces in solution slots
    isCompleted: false,
    
    // Initialize Level 1
    init() {
        this.resetState();
        this.loadPlayerInfo();
        this.renderPiecesInBank();
        this.setupDragAndDrop();
        this.bindEvents();
        this.startTimer();
    },
    
    resetState() {
        this.elapsedSeconds = 0;
        this.attempts = 0;
        this.solutionOrder = [null, null, null, null, null, null, null, null, null];
        this.isCompleted = false;
        
        // Clear solution slots
        const slots = document.querySelectorAll('.solution-slot');
        slots.forEach(slot => {
            slot.innerHTML = `<span class="slot-num">${slot.dataset.slot}</span>`;
            slot.classList.remove('filled');
        });
        
        // Hide popups
        document.getElementById('success-popup').style.display = 'none';
        document.getElementById('error-popup').style.display = 'none';
        document.getElementById('level-complete-overlay').style.display = 'none';
    },
    
    loadPlayerInfo() {
        // Get player info from localStorage or Supabase
        const players = Storage.getPlayers();
        // For demo, use first player or default
        if (players.length > 0) {
            this.playerName = players[0].name || 'AGENT';
            this.playerScore = players[0].score || 0;
        }
        
        document.getElementById('level-codename').textContent = this.playerName;
        document.getElementById('level-score').textContent = `${this.playerScore} PTS`;
    },
    
    // Shuffle array using Fisher-Yates algorithm
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },
    
    renderPiecesInBank() {
        const bank = document.getElementById('piece-bank');
        bank.innerHTML = '';
        
        const shuffledPieces = this.shuffleArray(this.pieces);
        
        shuffledPieces.forEach(piece => {
            const el = this.createPieceElement(piece);
            bank.appendChild(el);
        });
    },
    
    createPieceElement(piece) {
        const el = document.createElement('div');
        el.className = 'code-piece';
        el.dataset.pieceId = piece.id;
        el.draggable = true;
        el.innerHTML = `
            <span class="drag-handle">⋮⋮</span>
            <span class="code-text">${piece.code}</span>
        `;
        return el;
    },
    
    setupDragAndDrop() {
        // Desktop drag events
        document.addEventListener('dragstart', (e) => this.handleDragStart(e));
        document.addEventListener('dragend', (e) => this.handleDragEnd(e));
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        
        // Touch events for mobile
        this.setupTouchDrag();
    },
    
    setupTouchDrag() {
        let draggedElement = null;
        let touchClone = null;
        let startSlot = null;
        
        document.addEventListener('touchstart', (e) => {
            const piece = e.target.closest('.code-piece');
            if (!piece) return;
            
            draggedElement = piece;
            startSlot = piece.closest('.solution-slot');
            
            // Create a clone for visual feedback
            touchClone = piece.cloneNode(true);
            touchClone.style.position = 'fixed';
            touchClone.style.pointerEvents = 'none';
            touchClone.style.zIndex = '9999';
            touchClone.style.opacity = '0.8';
            touchClone.style.width = piece.offsetWidth + 'px';
            document.body.appendChild(touchClone);
            
            piece.classList.add('dragging');
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (!draggedElement || !touchClone) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            touchClone.style.left = touch.clientX - 50 + 'px';
            touchClone.style.top = touch.clientY - 25 + 'px';
            
            // Highlight nearest slot
            const slots = document.querySelectorAll('.solution-slot');
            slots.forEach(slot => slot.classList.remove('highlight'));
            
            const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
            const slot = elementUnder?.closest('.solution-slot');
            if (slot) slot.classList.add('highlight');
            
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            if (!draggedElement) return;
            
            const touch = e.changedTouches[0];
            const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // Check if dropped on solution slot
            const targetSlot = elementUnder?.closest('.solution-slot');
            const bank = elementUnder?.closest('.piece-bank');
            
            if (targetSlot) {
                this.placePieceInSlot(draggedElement, targetSlot, startSlot);
            } else if (bank) {
                this.returnPieceToBank(draggedElement, startSlot);
            }
            
            // Cleanup
            draggedElement.classList.remove('dragging');
            if (touchClone) touchClone.remove();
            document.querySelectorAll('.solution-slot').forEach(s => s.classList.remove('highlight'));
            
            draggedElement = null;
            touchClone = null;
            startSlot = null;
        });
    },
    
    handleDragStart(e) {
        const piece = e.target.closest('.code-piece');
        if (!piece) return;
        
        piece.classList.add('dragging');
        e.dataTransfer.setData('text/plain', piece.dataset.pieceId);
        e.dataTransfer.setData('fromSlot', piece.closest('.solution-slot')?.dataset.slot || '');
    },
    
    handleDragEnd(e) {
        const piece = e.target.closest('.code-piece');
        if (piece) piece.classList.remove('dragging');
        
        document.querySelectorAll('.solution-slot').forEach(s => s.classList.remove('highlight'));
        document.querySelector('.solution-area')?.classList.remove('drag-over');
    },
    
    handleDragOver(e) {
        e.preventDefault();
        
        const slot = e.target.closest('.solution-slot');
        const solutionArea = e.target.closest('.solution-area');
        
        if (slot) {
            document.querySelectorAll('.solution-slot').forEach(s => s.classList.remove('highlight'));
            slot.classList.add('highlight');
        }
        
        if (solutionArea) {
            solutionArea.classList.add('drag-over');
        }
    },
    
    handleDragLeave(e) {
        const slot = e.target.closest('.solution-slot');
        if (slot) slot.classList.remove('highlight');
        
        const solutionArea = e.target.closest('.solution-area');
        if (solutionArea && !solutionArea.contains(e.relatedTarget)) {
            solutionArea.classList.remove('drag-over');
        }
    },
    
    handleDrop(e) {
        e.preventDefault();
        
        const pieceId = e.dataTransfer.getData('text/plain');
        const fromSlotNum = e.dataTransfer.getData('fromSlot');
        
        const piece = document.querySelector(`.code-piece[data-piece-id="${pieceId}"]`);
        if (!piece) return;
        
        const targetSlot = e.target.closest('.solution-slot');
        const bank = e.target.closest('.piece-bank');
        const fromSlot = fromSlotNum ? document.querySelector(`.solution-slot[data-slot="${fromSlotNum}"]`) : null;
        
        if (targetSlot) {
            this.placePieceInSlot(piece, targetSlot, fromSlot);
        } else if (bank) {
            this.returnPieceToBank(piece, fromSlot);
        }
        
        document.querySelector('.solution-area')?.classList.remove('drag-over');
    },
    
    placePieceInSlot(piece, targetSlot, fromSlot) {
        const pieceId = parseInt(piece.dataset.pieceId);
        const targetSlotNum = parseInt(targetSlot.dataset.slot) - 1;
        
        // If target slot already has a piece, swap or return to bank
        const existingPiece = targetSlot.querySelector('.code-piece');
        if (existingPiece && existingPiece !== piece) {
            if (fromSlot) {
                // Swap pieces
                fromSlot.appendChild(existingPiece);
                const fromSlotNum = parseInt(fromSlot.dataset.slot) - 1;
                this.solutionOrder[fromSlotNum] = parseInt(existingPiece.dataset.pieceId);
            } else {
                // Return existing piece to bank
                document.getElementById('piece-bank').appendChild(existingPiece);
                existingPiece.classList.remove('placed');
            }
        }
        
        // Clear from slot if moving from another slot
        if (fromSlot) {
            const fromSlotNum = parseInt(fromSlot.dataset.slot) - 1;
            this.solutionOrder[fromSlotNum] = null;
            fromSlot.classList.remove('filled');
            // Re-add slot number
            if (!fromSlot.querySelector('.slot-num')) {
                const numSpan = document.createElement('span');
                numSpan.className = 'slot-num';
                numSpan.textContent = fromSlot.dataset.slot;
                fromSlot.prepend(numSpan);
            }
        }
        
        // Place piece in target slot
        targetSlot.appendChild(piece);
        piece.classList.add('placed');
        targetSlot.classList.add('filled');
        this.solutionOrder[targetSlotNum] = pieceId;
        
        // Mark piece in bank as placed (faded)
        const bankPiece = document.querySelector(`#piece-bank .code-piece[data-piece-id="${pieceId}"]`);
        if (bankPiece) bankPiece.classList.add('placed');
    },
    
    returnPieceToBank(piece, fromSlot) {
        const pieceId = parseInt(piece.dataset.pieceId);
        
        if (fromSlot) {
            const fromSlotNum = parseInt(fromSlot.dataset.slot) - 1;
            this.solutionOrder[fromSlotNum] = null;
            fromSlot.classList.remove('filled');
            
            // Re-add slot number
            if (!fromSlot.querySelector('.slot-num')) {
                const numSpan = document.createElement('span');
                numSpan.className = 'slot-num';
                numSpan.textContent = fromSlot.dataset.slot;
                fromSlot.prepend(numSpan);
            }
        }
        
        document.getElementById('piece-bank').appendChild(piece);
        piece.classList.remove('placed');
    },
    
    bindEvents() {
        document.getElementById('btn-run-code')?.addEventListener('click', () => this.runCode());
        document.getElementById('btn-clear-code')?.addEventListener('click', () => this.clearSolution());
    },
    
    startTimer() {
        this.updateTimerDisplay();
        this.updateWindowProgress();
        
        this.timerInterval = setInterval(() => {
            if (this.isCompleted) {
                clearInterval(this.timerInterval);
                return;
            }
            
            this.elapsedSeconds++;
            this.updateTimerDisplay();
            this.updateWindowProgress();
            
            // Auto-submit at 480 seconds
            if (this.elapsedSeconds >= this.totalTime) {
                clearInterval(this.timerInterval);
                this.autoSubmit();
            }
        }, 1000);
    },
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.elapsedSeconds / 60);
        const seconds = this.elapsedSeconds % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('level-timer').textContent = display;
        
        // Update window label
        const windowLabel = document.getElementById('window-label');
        const currentWindow = this.getCurrentWindow();
        
        windowLabel.className = `window-label ${currentWindow}`;
        windowLabel.textContent = currentWindow.toUpperCase();
    },
    
    updateWindowProgress() {
        const segments = {
            early: document.getElementById('seg-early'),
            mid: document.getElementById('seg-mid'),
            late: document.getElementById('seg-late')
        };
        
        const currentWindow = this.getCurrentWindow();
        
        // Reset all segments
        Object.values(segments).forEach(seg => {
            seg.classList.remove('active', 'completed');
        });
        
        if (this.elapsedSeconds <= this.windows.early.end) {
            // Early window active
            segments.early.classList.add('active');
            const percent = (this.elapsedSeconds / this.windows.early.end) * 100;
            segments.early.querySelector('.seg-fill').style.width = `${percent}%`;
        } else if (this.elapsedSeconds <= this.windows.mid.end) {
            // Mid window active
            segments.early.classList.add('completed');
            segments.mid.classList.add('active');
            const elapsed = this.elapsedSeconds - this.windows.early.end;
            const duration = this.windows.mid.end - this.windows.early.end;
            const percent = (elapsed / duration) * 100;
            segments.mid.querySelector('.seg-fill').style.width = `${percent}%`;
        } else {
            // Late window active
            segments.early.classList.add('completed');
            segments.mid.classList.add('completed');
            segments.late.classList.add('active');
            const elapsed = this.elapsedSeconds - this.windows.mid.end;
            const duration = this.windows.late.end - this.windows.mid.end;
            const percent = (elapsed / duration) * 100;
            segments.late.querySelector('.seg-fill').style.width = `${percent}%`;
        }
    },
    
    getCurrentWindow() {
        if (this.elapsedSeconds <= this.windows.early.end) return 'early';
        if (this.elapsedSeconds <= this.windows.mid.end) return 'mid';
        return 'late';
    },
    
    clearSolution() {
        const bank = document.getElementById('piece-bank');
        const slots = document.querySelectorAll('.solution-slot');
        
        slots.forEach((slot, idx) => {
            const piece = slot.querySelector('.code-piece');
            if (piece) {
                bank.appendChild(piece);
                piece.classList.remove('placed');
            }
            slot.classList.remove('filled');
            slot.innerHTML = `<span class="slot-num">${idx + 1}</span>`;
        });
        
        this.solutionOrder = [null, null, null, null, null, null, null, null, null];
    },
    
    runCode() {
        // Check if all pieces are placed
        const placedCount = this.solutionOrder.filter(id => id !== null).length;
        if (placedCount < 9) {
            Toast.show('PLACE ALL PIECES BEFORE RUNNING', 'error');
            return;
        }
        
        this.attempts++;
        
        // Check if order is correct
        const isCorrect = this.solutionOrder.every((id, idx) => id === this.correctOrder[idx]);
        
        if (isCorrect) {
            this.handleSuccess();
        } else {
            this.handleError();
        }
    },
    
    handleSuccess() {
        this.isCompleted = true;
        clearInterval(this.timerInterval);
        
        // Flash green
        document.getElementById('screen-level-one').classList.add('flash-green');
        setTimeout(() => {
            document.getElementById('screen-level-one').classList.remove('flash-green');
        }, 500);
        
        // Calculate points
        const points = this.calculatePoints();
        
        // Update popup
        const currentWindow = this.getCurrentWindow();
        document.getElementById('window-result').className = `window-result ${currentWindow}`;
        document.getElementById('window-result').textContent = currentWindow.toUpperCase();
        document.getElementById('pts-base').textContent = points.base;
        document.getElementById('pts-bonus').textContent = `+${points.bonus}`;
        document.getElementById('pts-penalty').textContent = `-${points.penalty}`;
        document.getElementById('pts-total').textContent = points.total;
        
        // Show success popup
        document.getElementById('success-popup').style.display = 'block';
        
        // Update player score
        this.playerScore += points.total;
        document.getElementById('level-score').textContent = `${this.playerScore} PTS`;
        
        // Save to localStorage
        this.saveProgress();
        
        // Show level complete after 3 seconds
        setTimeout(() => {
            document.getElementById('success-popup').style.display = 'none';
            document.getElementById('final-score').textContent = `${this.playerScore} POINTS`;
            document.getElementById('level-complete-overlay').style.display = 'flex';
        }, 3000);
    },
    
    handleError() {
        // Flash red
        document.getElementById('screen-level-one').classList.add('flash-red');
        setTimeout(() => {
            document.getElementById('screen-level-one').classList.remove('flash-red');
        }, 500);
        
        // Deduct points
        this.playerScore = Math.max(0, this.playerScore - 10);
        document.getElementById('level-score').textContent = `${this.playerScore} PTS`;
        
        // Show error popup
        document.getElementById('error-popup').style.display = 'block';
        
        // Hide after 2 seconds
        setTimeout(() => {
            document.getElementById('error-popup').style.display = 'none';
        }, 2000);
        
        // Save updated score
        this.saveProgress();
    },
    
    calculatePoints() {
        const currentWindow = this.getCurrentWindow();
        let base = 100;
        let bonus = 0;
        let penalty = this.attempts > 1 ? (this.attempts - 1) * 10 : 0;
        
        // Window bonuses
        if (currentWindow === 'early') {
            bonus = 50;
        } else if (currentWindow === 'mid') {
            bonus = 25;
        } else {
            bonus = 0;
        }
        
        // Time-based bonus within window
        const windowData = this.windows[currentWindow];
        const timeInWindow = this.elapsedSeconds - windowData.start;
        const windowDuration = windowData.end - windowData.start;
        const timeBonus = Math.floor((1 - timeInWindow / windowDuration) * 20);
        bonus += Math.max(0, timeBonus);
        
        const total = Math.max(0, base + bonus - penalty);
        
        return { base, bonus, penalty, total };
    },
    
    autoSubmit() {
        // Auto-submit whatever arrangement exists
        const placedCount = this.solutionOrder.filter(id => id !== null).length;
        
        if (placedCount === 9) {
            this.runCode();
        } else {
            // Not all pieces placed - automatic fail
            this.isCompleted = true;
            Toast.show('TIME UP! Level failed.', 'error');
            
            setTimeout(() => {
                document.getElementById('final-score').textContent = `${this.playerScore} POINTS`;
                document.getElementById('level-complete-overlay').style.display = 'flex';
            }, 2000);
        }
    },
    
    saveProgress() {
        // Update player in localStorage
        const players = Storage.getPlayers();
        if (players.length > 0) {
            players[0].score = this.playerScore;
            players[0].level1Completed = this.isCompleted;
            Storage.savePlayers(players);
        }
        
        // TODO: Sync with Supabase when integrated
    },
    
    // Called by admin to start level for all players
    startLevel() {
        this.init();
        showScreen('screen-level-one');
    }
};

// Admin function to start Level 1
function adminStartLevel() {
    const state = Storage.getGameState();
    state.phase = 'level1';
    state.currentLevel = 1;
    Storage.saveGameState(state);
    
    // For local testing, start the level
    Level1.startLevel();
    
    Toast.show('Level 1 Started!', 'success');
}

// Expose Level1 globally
window.Level1 = Level1;
window.adminStartLevel = adminStartLevel;