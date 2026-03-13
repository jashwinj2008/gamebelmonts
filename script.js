// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxvb3VzbmJwbW1qcnduZndrcXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzEzMjksImV4cCI6MjA4ODE0NzMyOX0.DtM-AStgzVXPZNJWer4SYof4ZCfWheneI0oCuz_k6XI';
// Initialize Supabase client
let supabaseClient = null;
let databaseReady = false;

// Initialize Supabase when available
function initializeSupabase() {
    if (typeof window !== 'undefined' && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            databaseReady = true;
            console.log('✅ Supabase connected successfully');
            
            // Test connection
            testConnection();
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error.message);
            showDatabaseError('Supabase initialization failed');
        }
    } else {
        console.error('❌ Supabase library not loaded');
        showDatabaseError('Database library not loaded');
    }
}

// Test database connection
async function testConnection() {
    try {
        const { data, error } = await supabaseClient
            .from('game_sessions')
            .select('*')
            .limit(1);
            
        if (error) {
            throw error;
        }
        
        console.log('✅ Database connection verified');
        Toast.show('🌐 Connected to cloud database', 'success');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        databaseReady = false;
        showDatabaseError('Database connection failed');
    }
}

// Show database error
function showDatabaseError(message) {
    setTimeout(() => {
        if (typeof Toast !== 'undefined' && Toast.show) {
            Toast.show('❌ DATABASE ERROR: ' + message, 'error');
        }
        
        // Show error overlay
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); color: #ff4444; display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: monospace;">
                <div style="text-align: center; padding: 20px; background: #1a1a1a; border: 2px solid #ff4444; border-radius: 10px;">
                    <h2>🚨 DATABASE CONNECTION ERROR</h2>
                    <p>Could not connect to Supabase database</p>
                    <p><strong>Required:</strong> Run database migration first</p>
                    <p>Check console for details</p>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #ff4444; color: white; border: none; padding: 10px 20px; margin-top: 10px; cursor: pointer;">DISMISS</button>
                </div>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }, 1000);
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', initializeSupabase);

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

// --- HYBRID STORAGE: SUPABASE + LOCALSTORAGE ---
// --- SUPABASE-ONLY STORAGE: NO LOCALSTORAGE FALLBACKS ---
const Storage = {
    // Current room code (for multi-room support)
    // Cache values for convenience (but always prefer reading from localStorage for the latest state)
    currentRoomCode: localStorage.getItem('currentRoomCode') || 'DEMO01',

    getRoomCode() {
        return localStorage.getItem('currentRoomCode') || this.currentRoomCode || 'DEMO01';
    },

    getSessionId() {
        return localStorage.getItem('gameSessionId') || `session-${this.getRoomCode()}`;
    },

    setRoomCode(roomCode) {
        this.currentRoomCode = roomCode;
        localStorage.setItem('currentRoomCode', roomCode);

        // Use a consistent session ID per room so all players share the same session
        const sessionId = `session-${roomCode}`;
        localStorage.setItem('gameSessionId', sessionId);
        this.sessionId = sessionId;
    },
    
    async getGameState() {
        if (!databaseReady || !supabaseClient) {
            throw new Error('Database not ready - run migration first');
        }
        
        try {
            const { data, error } = await supabaseClient
                .from('game_sessions')
                .select('game_state')
                .eq('session_id', this.getSessionId())
                .single();
                
            if (error) {
                if (error.code === 'PGRST116') {
                    // No data found, create default session for this room
                    await this.saveGameState(DEFAULT_GAMESTATE);
                    return DEFAULT_GAMESTATE;
                }
                throw error;
            }
            
            return data.game_state || DEFAULT_GAMESTATE;
        } catch (error) {
            console.error('❌ Failed to get game state:', error.message);
            throw new Error('Database connection failed');
        }
    },
    
    async saveGameState(state) {
        if (!databaseReady || !supabaseClient) {
            throw new Error('Database not ready - run migration first');
        }
        
        try {
            const basePayload = {
                session_id: this.getSessionId(),
                game_state: state,
                updated_at: new Date().toISOString()
            };

            let result = await supabaseClient
                .from('game_sessions')
                .upsert(basePayload, {
                    onConflict: 'session_id',
                    ignoreDuplicates: false
                });

            if (result.error) {
                throw result.error;
            }

            console.log('✅ Game state saved to database');
        } catch (error) {
            console.error('❌ Failed to save game state:', error.message);
            throw new Error('Database save failed');
        }
    },
    
    async getPlayers() {
        if (!databaseReady || !supabaseClient) {
            throw new Error('Database not ready - run migration first');
        }
        
        try {
            const { data, error } = await supabaseClient
                .from('players')
                .select('player_data')
                .eq('session_id', this.getSessionId())
                .order('created_at', { ascending: true });
                
            if (error) {
                throw error;
            }
            
            // Extract player objects from player_data column
            return (data || []).map(row => row.player_data);
        } catch (error) {
            // If table is missing, treat as empty roster
            if (error && (error.code === 'PGRST205' || (error.message && error.message.includes('players')))) {
                return [];
            }
            console.error('❌ Failed to get players:', error.message);
            throw new Error('Database connection failed');
        }
    },
    
    async savePlayers(players) {
        if (!databaseReady || !supabaseClient) {
            throw new Error('Database not ready - run migration first');
        }
        
        try {
            if (!Array.isArray(players)) {
                throw new Error('Players must be an array');
            }
            
            // Clear existing players for this session
            const { error: deleteError } = await supabaseClient
                .from('players')
                .delete()
                .eq('session_id', this.getSessionId());
                
            if (deleteError) {
                console.warn('Warning deleting existing players:', deleteError.message);
            }

            // Insert new players using upsert to handle duplicates
            if (players.length > 0) {
                const playersData = players.map(player => ({
                    player_id: player.id,
                    name: player.name,
                    session_id: this.getSessionId(),
                    player_data: player
                }));
                
                const { error } = await supabaseClient
                    .from('players')
                    .upsert(playersData, {
                        onConflict: 'player_id,session_id'
                    });
                    
                if (error) {
                    throw error;
                }
            }
            
            console.log(`✅ Saved ${players.length} players to database`);
        } catch (error) {
            console.error('❌ Failed to save players:', error.message);
            throw new Error('Database save failed');
        }
    },
    
    async savePlayerScore(playerId, playerName, level, score, timeSpent, details = {}) {
        if (!databaseReady || !supabaseClient) {
            console.warn('Database not ready - score not saved');
            return;
        }

        try {
            // Ensure a valid level value (database requires NOT NULL)
            let resolvedLevel = typeof level === 'number' ? level : null;
            if (resolvedLevel === null) {
                try {
                    const gameState = await this.getGameState();
                    resolvedLevel = gameState?.currentLevel || 1;
                } catch (e) {
                    resolvedLevel = 1;
                }
            }

            const { error } = await supabaseClient
                .from('player_scores')
                .insert({
                    player_id: playerId,
                    player_name: playerName,
                    session_id: this.getSessionId(),
                    level: resolvedLevel,
                    score,
                    time_spent: timeSpent,
                    score_details: details,
                    completed_at: new Date().toISOString()
                });

            if (error) {
                throw error;
            }

            console.log(`✅ Saved score for ${playerName}: L${resolvedLevel} = ${score} pts`);
        } catch (error) {
            console.error('❌ Failed to save player score:', error.message);
        }
    }
};

// --- HELPER: TOAST SYSTEM ---
const Toast = {
    show(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = '✓';
        if (type === 'error') icon = '❌';
        else if (type === 'warning') icon = '⚠️';
        else if (type === 'info') icon = 'ℹ️';
        
        toast.innerHTML = `<span>${icon}</span> ${message}`;
        container.appendChild(toast);
        
        // Auto-remove after delay (longer for errors)
        const delay = type === 'error' ? 5000 : 2500;
        setTimeout(() => toast.remove(), delay);
    }
};

// 4. UI Engine - UPDATED
function stopAllLevels() {
    // Call any known level stop handlers to ensure timers are cleared
    if (typeof Level1 !== 'undefined' && typeof Level1.handleAdminStop === 'function') {
        Level1.handleAdminStop();
    }
    if (typeof Level2 !== 'undefined' && typeof Level2.stopLevel === 'function') {
        Level2.stopLevel();
    }
    if (typeof Level3 !== 'undefined' && typeof Level3.stopLevel === 'function') {
        Level3.stopLevel();
    }
    if (typeof Level4 !== 'undefined' && typeof Level4.stopLevel === 'function') {
        Level4.stopLevel();
    }
    if (typeof Level5 !== 'undefined' && typeof Level5.stopLevel === 'function') {
        Level5.stopLevel();
    }
}

function showScreen(screenId) {
    const legacyMapping = {
        'level1-screen': 'screen-level-one',
        'level2-screen': 'screen-level-two',
        'level3-screen': 'screen-level-three',
        'level4-screen': 'screen-level-four',
        'level5-screen': 'screen-level-five'
    };

    const resolvedId = legacyMapping[screenId] || screenId;
    // If the target screen is already active, do nothing (avoids log spam)
    const currentActive = document.querySelector('.screen.active');
    if (currentActive && currentActive.id === resolvedId) {
        return;
    }

    console.log("Switching to screen -> " + resolvedId);

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

    const target = document.getElementById(resolvedId);
    if (target) {
        target.style.display = 'flex';
        target.classList.add('active');

        // Initial refresh if it's the admin panel
        if (resolvedId === 'screen-admin-panel') {
            AdminController.refreshAll();
        }
    } else {
        console.error("Screen element not found -> " + resolvedId);
    }
}

// --- ADMIN PANEL CONTROLLER ---
const AdminController = {
    activeTab: 'control',
    pollingInterval: null,
    activityLog: [],
    playerStats: new Map(),
    lastPlayerCount: 0,
    lastGameState: null,
    animationQueue: [],

    init() {
        this.bindEvents();
        this.startPolling();
        this.setupStorageSync();
        this.initRealTimeFeatures();
        this.createActivityLog();
        this.startLiveTimer();
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

        // Session Management
        if (document.getElementById('btn-create-session')) document.getElementById('btn-create-session').onclick = () => this.createGameSession();
        const sessionNameInput = document.getElementById('session-name');
        if (sessionNameInput) {
            sessionNameInput.onkeydown = (e) => {
                if (e.key === 'Enter') this.createGameSession();
            };
        }

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
        this.pollingInterval = setInterval(async () => {
            await this.refreshStats();
            await this.detectChanges();
            if (this.activeTab === 'leaderboard') await this.renderLeaderboard();
            if (this.activeTab === 'players') await this.renderRoster();
            this.updateLiveIndicators();
        }, 1000);  // Faster polling for real-time feel
    },

    initRealTimeFeatures() {
        // Add activity log container to control tab if it doesn't exist
        const controlTab = document.getElementById('tab-control');
        if (controlTab && !document.getElementById('activity-log-container')) {
            const logHTML = `
                <div class="admin-section-label">LIVE ACTIVITY LOG</div>
                <div id="activity-log-container" class="activity-log-container">
                    <div id="activity-log" class="activity-log"></div>
                </div>
            `;
            const dangerZone = controlTab.querySelector('.danger-zone');
            dangerZone.insertAdjacentHTML('beforebegin', logHTML);
        }

        // Add live stats indicators
        this.addLiveStatsBar();
    },

    addLiveStatsBar() {
        const topbar = document.querySelector('.admin-topbar-right');
        if (topbar && !document.getElementById('live-stats-bar')) {
            const statsHTML = `
                <div id="live-stats-bar" class="live-stats-bar">
                    <div class="live-stat">
                        <span class="live-stat-icon">⚡</span>
                        <span id="activity-indicator" class="live-stat-value">IDLE</span>
                    </div>
                </div>
            `;
            topbar.insertAdjacentHTML('afterbegin', statsHTML);
        }
    },

    switchTab(tabId) {
        this.activeTab = tabId;
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
        
        // Load data for specific tabs
        if (tabId === 'sessions') {
            this.loadGameSessions();
        } else {
            this.refreshAll();
        }
    },

    async setLevel(lvl) {
        try {
            const ns = await Storage.getGameState();
            ns.currentLevel = lvl;
            ns.currentQuestion = 0;
            ns.phase = 'lobby';
            await Storage.saveGameState(ns);
            this.refreshAll();
            Toast.show(`Level ${lvl} Selected`);
        } catch (error) {
            Toast.show(`Failed to set level: ${error.message}`, 'error');
        }
    },

    async startLevel() {
        try {
            const ns = await Storage.getGameState();
            ns.phase = 'playing';
            ns.currentQuestion = 0;
            ns.questionStartTime = Date.now();
            await Storage.saveGameState(ns);
            this.refreshAll();
            this.logActivity(`🏁 Level ${ns.currentLevel} started - Battle begins!`);
            Toast.show("Level Started!", "success");
        } catch (error) {
            Toast.show(`Failed to start level: ${error.message}`, 'error');
            this.logActivity(`⚠️ Failed to start level: ${error.message}`);
        }
    },

    async showAnswer() {
        try {
            const ns = await Storage.getGameState();
            ns.phase = 'show_answer';
            await Storage.saveGameState(ns);
            this.refreshAll();
            this.logActivity(`💡 Answer revealed for Q${ns.currentQuestion + 1}`);
            Toast.show("Answers Revealed");
        } catch (error) {
            Toast.show(`Failed to show answer: ${error.message}`, 'error');
        }
    },

    async nextQuestion() {
        try {
            const ns = await Storage.getGameState();
            if (ns.currentQuestion < 9) {
                ns.currentQuestion++;
                ns.phase = 'playing';
                ns.questionStartTime = Date.now();
                await Storage.saveGameState(ns);
                this.refreshAll();
                this.logActivity(`➡️ Advanced to Question ${ns.currentQuestion + 1}`);
                Toast.show(`Advanced to Question ${ns.currentQuestion + 1}`);
            } else {
                ns.phase = 'results';
                await Storage.saveGameState(ns);
                this.refreshAll();
                this.logActivity(`🎯 Level ${ns.currentLevel} completed - Results ready`);
                Toast.show("Level Completed - View Results", "success");
            }
        } catch (error) {
            Toast.show(`Failed to advance question: ${error.message}`, 'error');
        }
    },

    async stopLevel() {
        try {
            const ns = await Storage.getGameState();
            ns.phase = 'lobby';
            await Storage.saveGameState(ns);
            this.refreshAll();
            this.logActivity(`🛑 Level ${ns.currentLevel} stopped by admin`);
            Toast.show("Level Stopped", "error");
        } catch (error) {
            Toast.show(`Failed to stop level: ${error.message}`, 'error');
        }
    },

    async resetEntireGame() {
        if (confirm("DANGER: This will wipe ALL players, scores, and reset the game state. Proceed?")) {
            try {
                await Storage.saveGameState(DEFAULT_GAMESTATE);
                await Storage.savePlayers([]);
                this.refreshAll();
                Toast.show("System Purged - Game Reset", "success");
            } catch (error) {
                Toast.show(`Failed to reset game: ${error.message}`, 'error');
            }
        }
    },

    async handleAddPlayer() {
        const input = document.getElementById('add-player-name');
        if (!input) return;
        const name = input.value.trim().toUpperCase();
        if (!name) return;

        try {
            const players = await Storage.getPlayers();
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
            await Storage.savePlayers(players);
            input.value = '';
            this.refreshAll();
            this.logActivity(`👥 Admin added player: ${name}`);
            Toast.show(`${name} joined the crew`);
        } catch (error) {
            Toast.show(`Failed to add player: ${error.message}`, 'error');
            this.logActivity(`⚠️ Failed to add player ${name}: ${error.message}`);
        }
    },

    async kickPlayer(id) {
        try {
            let players = await Storage.getPlayers();
            const playerName = players.find(p => p.id === id)?.name || 'Unknown';
            players = players.filter(p => p.id !== id);
            await Storage.savePlayers(players);
            this.refreshAll();
            this.logActivity(`🙅 Admin kicked player: ${playerName}`);
            Toast.show("Player removed from roster", "warning");
        } catch (error) {
            Toast.show(`Failed to kick player: ${error.message}`, 'error');
        }
    },

    async refreshAll() {
        try {
            await this.refreshStats();
            await this.renderRoster();
            await this.renderLeaderboard();
            await this.updateLevelCards();
        } catch (error) {
            console.error('Failed to refresh admin data:', error.message);
        }
    },

    // NEW DYNAMIC FEATURES
    async detectChanges() {
        try {
            const currentGs = await Storage.getGameState();
            const players = await Storage.getPlayers();
            
            // Track player count changes
            if (this.lastPlayerCount !== players.length) {
                if (this.lastPlayerCount < players.length) {
                    // New player joined
                    const newPlayers = players.slice(this.lastPlayerCount);
                    newPlayers.forEach(player => {
                        this.logActivity(`🏆 ${player.name} joined the battle!`);
                        this.playerStats.set(player.id, { 
                            lastSeen: Date.now(), 
                            lastScore: player.score,
                            joinedAt: player.joinedAt 
                        });
                    });
                } else if (this.lastPlayerCount > players.length) {
                    // Player left or was kicked
                    this.logActivity(`🙅 A player left the battle`);
                }
                this.lastPlayerCount = players.length;
            }
            
            if (this.lastGameState) {
                // Detect phase changes
                if (currentGs.phase !== this.lastGameState.phase) {
                    this.logActivity(`🔄 Game phase changed: ${this.lastGameState.phase} → ${currentGs.phase}`);
                }
                
                // Detect level changes
                if (currentGs.currentLevel !== this.lastGameState.currentLevel) {
                    this.logActivity(`⬆️ Level changed: ${this.lastGameState.currentLevel} → ${currentGs.currentLevel}`);
                }
                
                // Detect question changes
                if (currentGs.currentQuestion !== this.lastGameState.currentQuestion) {
                    this.logActivity(`➡️ Question advanced: Q${this.lastGameState.currentQuestion + 1} → Q${currentGs.currentQuestion + 1}`);
                }
            }
            
            // Update player activity tracking
            players.forEach(player => {
                if (this.playerStats.has(player.id)) {
                    const stats = this.playerStats.get(player.id);
                    if (player.score !== stats.lastScore) {
                        const diff = player.score - stats.lastScore;
                        this.logActivity(`💯 ${player.name} scored ${diff > 0 ? '+' : ''}${diff} points`);
                        this.animateScoreChange(player.id, diff);
                        stats.lastScore = player.score;
                    }
                    stats.lastSeen = Date.now();
                } else {
                    // Initialize new player tracking
                    this.playerStats.set(player.id, { 
                        lastSeen: Date.now(), 
                        lastScore: player.score,
                        joinedAt: player.joinedAt || Date.now()
                    });
                }
            });
            
            this.lastGameState = { ...currentGs };
        } catch (error) {
            console.warn('Error detecting changes:', error.message);
        }
    },

    logActivity(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        this.activityLog.unshift({ time: timestamp, message, id: Date.now() });
        if (this.activityLog.length > 10) this.activityLog = this.activityLog.slice(0, 10);
        this.updateActivityLog();
    },

    updateActivityLog() {
        const logEl = document.getElementById('activity-log');
        if (!logEl) return;
        
        logEl.innerHTML = this.activityLog.map(entry => `
            <div class="activity-entry" style="animation: slideInRight 0.3s ease">
                <span class="activity-time">${entry.time}</span>
                <span class="activity-message">${entry.message}</span>
            </div>
        `).join('');
    },

    animateScoreChange(playerId, diff) {
        const changeEl = document.getElementById(`score-change-${playerId}`);
        if (changeEl) {
            changeEl.textContent = diff > 0 ? `+${diff}` : diff;
            changeEl.className = `score-change ${diff > 0 ? 'score-positive' : 'score-negative'} score-animate`;
            setTimeout(() => {
                changeEl.className = 'score-change';
                changeEl.textContent = '';
            }, 2000);
        }
    },

    startLiveTimer() {
        setInterval(() => {
            this.updateLiveTimer();
        }, 1000);
    },

    async updateLiveTimer() {
        try {
            const gs = await Storage.getGameState();
            if (gs.phase === 'playing' && gs.questionStartTime) {
                const elapsed = Date.now() - gs.questionStartTime;
                const remaining = Math.max(0, (8 * 60 * 1000) - elapsed); // 8 minutes
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                
                const timerEl = document.getElementById('live-timer');
                if (timerEl) {
                    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    timerEl.className = remaining < 60000 ? 'live-timer urgent' : 'live-timer';
                }
            }
        } catch (error) {
            // Ignore timer errors
        }
    },

    updateQuestionProgress(currentQ, phase) {
        const progressEl = document.getElementById('question-progress');
        if (!progressEl && phase === 'playing') {
            // Create progress bar if it doesn't exist
            const infoBox = document.querySelector('.admin-info-box');
            if (infoBox) {
                infoBox.insertAdjacentHTML('afterend', `
                    <div class="question-progress-container">
                        <div class="progress-label">Question Progress</div>
                        <div class="progress-bar-container">
                            <div id="question-progress" class="progress-bar"></div>
                            <span id="live-timer" class="live-timer">8:00</span>
                        </div>
                    </div>
                `);
            }
        }
        
        if (progressEl) {
            const progress = ((currentQ + 1) / 10) * 100;
            progressEl.style.width = `${progress}%`;
            progressEl.style.transition = 'width 0.5s ease';
        }
    },

    updateLiveIndicators() {
        const activityIndicator = document.getElementById('activity-indicator');
        if (activityIndicator) {
            const activeCount = Array.from(this.playerStats.values())
                .filter(stats => Date.now() - stats.lastSeen < 10000).length;
            
            if (activeCount === 0) {
                activityIndicator.textContent = 'IDLE';
                activityIndicator.className = 'live-stat-value idle';
            } else {
                activityIndicator.textContent = `${activeCount} ACTIVE`;
                activityIndicator.className = 'live-stat-value active';
            }
        }
    },

    createActivityLog() {
        this.logActivity('🚀 Admin panel initialized - monitoring started');
        // Initialize player tracking from existing players
        this.initializePlayerTracking();
    },
    
    async initializePlayerTracking() {
        try {
            const players = await Storage.getPlayers();
            this.lastPlayerCount = players.length;
            players.forEach(player => {
                this.playerStats.set(player.id, {
                    lastSeen: Date.now(),
                    lastScore: player.score || 0,
                    joinedAt: player.joinedAt || Date.now()
                });
            });
            console.log(`🎯 Initialized tracking for ${players.length} existing players`);
        } catch (error) {
            console.warn('Failed to initialize player tracking:', error.message);
        }
    },

    // ===== SESSION MANAGEMENT METHODS =====
    async createGameSession() {
        const nameInput = document.getElementById('session-name');
        const descInput = document.getElementById('session-description');
        const maxParticipantsInput = document.getElementById('session-max-participants');
        
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        const description = descInput ? descInput.value.trim() : '';
        const maxParticipants = parseInt(maxParticipantsInput?.value) || 50;
        
        if (!name) {
            Toast.show('Session name is required', 'error');
            return;
        }
        
        try {
            // Generate room code
            const roomCode = this.generateRoomCode();
            
            // Create game room
            const { error: roomError } = await supabaseClient
                .from('game_rooms')
                .insert({
                    room_code: roomCode,
                    room_name: name,
                    description: description,
                    max_participants: maxParticipants,
                    room_status: 'waiting'
                });
            
            if (roomError) {
                throw roomError;
            }
            
            // Create associated game session
            const sessionId = `session-${roomCode}-${Date.now()}`;
            const { error: sessionError } = await supabaseClient
                .from('game_sessions')
                .insert({
                    session_id: sessionId,
                    room_code: roomCode,
                    game_state: {
                        phase: 'lobby',
                        currentLevel: 1,
                        currentQuestion: 0,
                        questionStartTime: null
                    }
                });
            
            if (sessionError) {
                throw sessionError;
            }
            
            // Clear form
            nameInput.value = '';
            if (descInput) descInput.value = '';
            if (maxParticipantsInput) maxParticipantsInput.value = '50';
            
            // Refresh sessions display
            await this.loadGameSessions();
            
            this.logActivity(`🎮 Created new game section: ${name} (${roomCode})`);
            Toast.show(`Game section "${name}" created with code: ${roomCode}`, 'success');
            
        } catch (error) {
            console.error('Failed to create session:', error);
            Toast.show(`Failed to create session: ${error.message}`, 'error');
        }
    },
    
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';  
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },
    
    async loadGameSessions() {
        try {
            const list = document.getElementById('admin-sessions-list');
            if (!list) return;
            
            const { data: rooms, error } = await supabaseClient
                .from('game_rooms')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                throw error;
            }
            
            if (!rooms || rooms.length === 0) {
                list.innerHTML = '<div class="empty-state">No game sections created yet.</div>';
                return;
            }
            
            list.innerHTML = rooms.map(room => this.renderSessionCard(room)).join('');
            
        } catch (error) {
            console.error('Failed to load sessions:', error);
            const list = document.getElementById('admin-sessions-list');
            if (list) {
                list.innerHTML = '<div class="empty-state error">Failed to load game sections</div>';
            }
        }
    },
    
    renderSessionCard(room) {
        const statusClass = room.room_status;
        const createdTime = new Date(room.created_at).toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        return `
            <div class="session-card ${room.room_status === 'active' ? 'active' : ''}" data-room-code="${room.room_code}">
                <div class="session-card-header">
                    <div class="session-name">${room.room_name}</div>
                    <div class="session-code">${room.room_code}</div>
                </div>
                <div class="session-info">
                    <span class="session-participants">${room.current_participants || 0}/${room.max_participants} participants</span>
                    <span class="session-status ${statusClass}">${room.room_status}</span>
                </div>
                ${room.description ? `<div class="session-description">${room.description}</div>` : ''}
                <div class="session-info">
                    <span>Created: ${createdTime}</span>
                </div>
                <div class="session-actions">
                    <button class="session-btn select" onclick="AdminController.selectGameSession('${room.room_code}')">
                        SELECT & CONTROL
                    </button>
                    <button class="session-btn delete" onclick="AdminController.deleteGameSession('${room.room_code}')">
                        DELETE
                    </button>
                </div>
            </div>
        `;
    },
    
    async selectGameSession(roomCode) {
        try {
            // Switch to this room's session
            Storage.currentRoomCode = roomCode;
            // Update the session ID to match this room
            const sessionId = `session-${roomCode}-admin`;
            Storage.sessionId = sessionId;
            
            // Update room status to active
            const { error } = await supabaseClient
                .from('game_rooms')
                .update({ room_status: 'active' })
                .eq('room_code', roomCode);
                
            if (error) {
                throw error;
            }
            
            // Switch to control tab
            this.switchTab('control');
            await this.refreshAll();
            
            this.logActivity(`🎮 Selected game section: ${roomCode}`);
            Toast.show(`Now controlling game section: ${roomCode}`, 'success');
            
        } catch (error) {
            console.error('Failed to select session:', error);
            Toast.show(`Failed to select session: ${error.message}`, 'error');
        }
    },
    
    async deleteGameSession(roomCode) {
        if (!confirm(`Delete game section ${roomCode}? This will remove all associated data.`)) {
            return;
        }
        
        try {
            const { error } = await supabaseClient
                .from('game_rooms')
                .delete()
                .eq('room_code', roomCode);
                
            if (error) {
                throw error;
            }
            
            await this.loadGameSessions();
            this.logActivity(`🗑️ Deleted game section: ${roomCode}`);
            Toast.show(`Game section ${roomCode} deleted`, 'warning');
            
        } catch (error) {
            console.error('Failed to delete session:', error);
            Toast.show(`Failed to delete session: ${error.message}`, 'error');
        }
    },

    async refreshStats() {
        try {
            const gs = await Storage.getGameState();
            const players = await Storage.getPlayers();
            const levelNames = ["Binary Challenge", "Hardware Builder", "Stack/Queue Battle", "Network Defender", "Tech Escape Room"];

            // Animate player count changes
            const playerCountEl = document.getElementById('admin-player-count');
            if (playerCountEl) {
                if (this.lastPlayerCount !== players.length) {
                    playerCountEl.classList.add('stat-changed');
                    setTimeout(() => playerCountEl.classList.remove('stat-changed'), 500);
                    this.lastPlayerCount = players.length;
                }
                playerCountEl.textContent = players.length;
            }

            if (document.getElementById('admin-level-info')) document.getElementById('admin-level-info').textContent = `L${gs.currentLevel} / Q${gs.currentQuestion + 1}`;

            // Animated status badge
            const badge = document.getElementById('admin-status-badge');
            const badgeText = document.getElementById('admin-status-text');
            if (badge && badgeText) {
                const newPhase = gs.phase.replace('_', '-');
                if (!badge.classList.contains(newPhase)) {
                    badge.className = `admin-status-badge ${newPhase} phase-transition`;
                    setTimeout(() => badge.classList.remove('phase-transition'), 300);
                }
                badgeText.textContent = gs.phase.toUpperCase().replace('_', ' ');
            }

            // Info Box with animations
            this.updateInfoBoxAnimated('info-level-name', levelNames[gs.currentLevel - 1] || "---");
            this.updateInfoBoxAnimated('info-q-num', `${gs.currentQuestion + 1} / 10`);
            this.updateInfoBoxAnimated('info-p-count', players.length);
            this.updateInfoBoxAnimated('info-phase', gs.phase.toUpperCase().replace('_', ' '));

            // Update progress indicator
            this.updateQuestionProgress(gs.currentQuestion, gs.phase);
        } catch (error) {
            console.warn('Failed to refresh stats:', error.message);
        }
    },

    updateInfoBoxAnimated(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (element && element.textContent !== newValue.toString()) {
            element.classList.add('info-updated');
            element.textContent = newValue;
            setTimeout(() => element.classList.remove('info-updated'), 300);
        }
    },

    async updateLevelCards() {
        try {
            const gs = await Storage.getGameState();
            document.querySelectorAll('.level-card').forEach(card => {
                card.classList.toggle('active', parseInt(card.dataset.level) === gs.currentLevel);
            });
        } catch (error) {
            console.warn('Failed to update level cards:', error.message);
        }
    },

    async renderRoster() {
        try {
            const list = document.getElementById('admin-roster-list');
            if (!list) return;
            const players = (await Storage.getPlayers()).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

            if (players.length === 0) {
                list.innerHTML = '<div class="empty-state">No crew members registered.</div>';
                return;
            }

            list.innerHTML = players.map((p, idx) => {
                const isOnline = this.isPlayerActive(p.id);
                const statusIcon = isOnline ? '🟢' : '⚫';
                const lastSeen = this.getPlayerLastSeen(p.id);
                const joinTime = p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString('en-US', { hour12: false, timeStyle: 'short' }) : 'Unknown';
                
                return `
                    <div class="player-row ${isOnline ? 'player-online' : 'player-offline'}" style="animation-delay: ${idx * 0.05}s">
                        <div class="player-idx">${statusIcon} #${(idx + 1).toString().padStart(2, '0')}</div>
                        <div class="player-info-cell">
                            <div class="player-name-cell">${p.name || 'Unknown'}</div>
                            <div class="player-activity">
                                <span class="activity-status">${lastSeen}</span>
                                <span class="join-time">Joined: ${joinTime}</span>
                            </div>
                        </div>
                        <div class="player-score-cell">
                            <div class="score-value">${p.score || 0} PTS</div>
                            <div class="score-change" id="score-change-${p.id}"></div>
                        </div>
                        <button class="kick-btn" onclick="AdminController.kickPlayer('${p.id}')">KICK</button>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to render roster:', error.message);
            const list = document.getElementById('admin-roster-list');
            if (list) {
                list.innerHTML = '<div class="empty-state error">Error loading player roster</div>';
            }
        }
    },

    isPlayerActive(playerId) {
        const stats = this.playerStats.get(playerId);
        if (!stats) return false;
        return Date.now() - stats.lastSeen < 10000; // Active within 10 seconds
    },

    getPlayerLastSeen(playerId) {
        const stats = this.playerStats.get(playerId);
        if (!stats) return 'Not tracked';
        const timeDiff = Date.now() - stats.lastSeen;
        if (timeDiff < 3000) return 'Active now';
        if (timeDiff < 60000) return `${Math.floor(timeDiff/1000)}s ago`;
        if (timeDiff < 3600000) return `${Math.floor(timeDiff/60000)}m ago`;
        return `${Math.floor(timeDiff/3600000)}h ago`;
    },

    async renderLeaderboard() {
        const list = document.getElementById('admin-lb-list');
        if (!list) return;
        const players = (await Storage.getPlayers()).sort((a, b) => b.score - a.score);
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
    const roomInfo = document.getElementById('room-info');

    // Ensure participants see the active section code (admin controls this)
    if (roomInfo) {
        roomInfo.classList.remove('hidden');
        const roomName = document.getElementById('room-name');
        const roomParticipants = document.getElementById('room-participants');
        if (roomName) roomName.textContent = `SECTION ID: ${Storage.getSessionId()}`;
        if (roomParticipants) roomParticipants.textContent = `--/-- participants`;
    }

    if (startBattleBtn && playerNameInput) {
        startBattleBtn.onclick = async () => {
            const name = playerNameInput.value.trim().toUpperCase();
            const roomCode = Storage.getRoomCode();

            if (!name || name.length < 2) {
                if (nameError) {
                    nameError.textContent = 'NAME MUST BE AT LEAST 2 CHARACTERS';
                    nameError.classList.remove('hidden');
                }
                return;
            }

            try {
                // Ensure session is set for the active room
                Storage.setRoomCode(roomCode);

                // Check if name already exists in this room
                const players = await Storage.getPlayers();
                const existingPlayer = players.find(p => p.name.toUpperCase() === name);

                if (existingPlayer) {
                    // Returning player — restore their session instead of blocking
                    localStorage.setItem('currentPlayer', JSON.stringify(existingPlayer));

                    if (nameError) nameError.classList.add('hidden');

                    Toast.show(`Welcome back, ${existingPlayer.name}!`, 'success');
                    showScreen('lobby-screen');
                    ParticipantLobby.init();
                    return;
                }

                // Hide errors
                if (nameError) nameError.classList.add('hidden');

                // Add player to the room
                const newPlayer = {
                    id: 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                    name: name,
                    score: 0,
                    joinedAt: Date.now(),
                    isActive: true,
                    roomCode: roomCode
                };
                players.push(newPlayer);
                await Storage.savePlayers(players);

                // Store current player info
                localStorage.setItem('currentPlayer', JSON.stringify(newPlayer));

                // Show lobby
                showScreen('lobby-screen');
                ParticipantLobby.init();

                Toast.show(`Welcome to ${roomCode}, ${name}!`, 'success');
            } catch (error) {
                if (nameError) {
                    nameError.textContent = `DATABASE ERROR: ${error.message}`;
                    nameError.classList.remove('hidden');
                }
                Toast.show(`Failed to join: ${error.message}`, 'error');
            }
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
    hasStopped: false,
    warnedMissingLevel: false,
    lastGamePhase: null,
    lastGameLevel: null,

    init() {
        this.hasStopped = false;
        this.warnedMissingLevel = false;
        this.lastGamePhase = null;
        this.lastGameLevel = null;
        this.currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        this.renderRoomInfo();
        this.renderPlayerList();
        this.startPolling();
        this.checkGameState();
    },

    async renderRoomInfo() {
        const sessionId = Storage.getSessionId();
        const roomHeader = document.getElementById('lobby-room-info');
        
        if (roomHeader && sessionId) {
            try {
                // If game_rooms exists, show additional info when possible
                if (SchemaInspector.has('game_rooms')) {
                    const roomCode = Storage.getRoomCode();
                    const { data: room } = await supabaseClient
                        .from('game_rooms')
                        .select('room_name, current_participants, max_participants')
                        .eq('room_code', roomCode)
                        .single();

                    if (room) {
                        roomHeader.innerHTML = `
                            <div class="room-info-display">
                                <div class="room-title">${room.room_name}</div>
                                <div class="room-code">SECTION: ${roomCode}</div>
                                <div class="room-capacity">${room.current_participants || 0}/${room.max_participants} PARTICIPANTS</div>
                            </div>
                        `;
                        return;
                    }
                }

                // Default: show the current session ID as the section identifier
                roomHeader.innerHTML = `<div class="room-code">SECTION ID: ${sessionId}</div>`;
            } catch (error) {
                roomHeader.innerHTML = `<div class="room-code">SECTION ID: ${sessionId}</div>`;
            }
        }
    },

    async startPolling() {
        // Clear existing interval
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        // Poll every 5 seconds for updates (reduced frequency)
        this.pollingInterval = setInterval(async () => {
            await this.renderRoomInfo();
            await this.renderPlayerList();
            // Only check game state if we're not currently in a level
            if (!this.isInActiveLevel()) {
                await this.checkGameState();
            }
        }, 5000);
    },

    isInActiveLevel() {
        // Check if we're currently in an active level screen
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) return false;
        
        const screenId = activeScreen.id;
        return screenId && (
            screenId.includes('level-one') ||
            screenId.includes('level-two') ||
            screenId.includes('level-three') ||
            screenId.includes('level-four') ||
            screenId.includes('level-five')
        );
    },

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    async renderPlayerList() {
        const players = await Storage.getPlayers();
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

    async checkGameState() {
        try {
            const state = await Storage.getGameState();

            const phaseChanged = state.phase !== this.lastGamePhase;
            const levelChanged = state.currentLevel !== this.lastGameLevel;

            // Only react to actual state changes, not default states
            if (state.phase === 'lobby' && phaseChanged && this.lastGamePhase !== null) {
                if (!this.hasStopped) {
                    this.stopPolling();
                    stopAllLevels();
                    showScreen('lobby-screen');
                    Toast.show('Level stopped by admin.', 'warning');
                    this.hasStopped = true;
                }

                this.lastGamePhase = state.phase;
                this.lastGameLevel = state.currentLevel;
                return;
            }

            // If this is the initial load and state is lobby, just update tracking without stopping
            if (state.phase === 'lobby' && this.lastGamePhase === null) {
                this.lastGamePhase = state.phase;
                this.lastGameLevel = state.currentLevel;
                return;
            }

            // Reset flags only when phase/level changes
            if (phaseChanged || levelChanged) {
                this.hasStopped = false;
                this.warnedMissingLevel = false;
            }

            // Switch to appropriate level when admin starts playing
            if (state.phase === 'playing') {
                this.stopPolling();

                // Route to correct level based on currentLevel
                switch (state.currentLevel) {
                    case 1:
                        showScreen('screen-level-one');
                        Level1.startLevel();
                        break;
                    case 2:
                        showScreen('screen-level-two');
                        Level2.startLevel();
                        break;
                    case 3:
                        if (!this.warnedMissingLevel) {
                            this.warnedMissingLevel = true;
                        }
                        showScreen('screen-level-three');
                        Level3.startLevel();
                        break;
                    case 4:
                        showScreen('screen-level-four');
                        Level4.startLevel();
                        break;
                    case 5:
                        if (!this.warnedMissingLevel) {
                            this.warnedMissingLevel = true;
                        }
                        showScreen('screen-level-five');
                        Level5.startLevel();
                        break;
                    default:
                        if (!this.warnedMissingLevel) {
                            console.warn('Unknown level:', state.currentLevel);
                            Toast.show(`Unknown level: ${state.currentLevel}`, 'error');
                            this.warnedMissingLevel = true;
                        }
                        // Only stop levels for truly unknown levels
                        stopAllLevels();
                        showScreen('lobby-screen');
                }

                this.lastGamePhase = state.phase;
                this.lastGameLevel = state.currentLevel;
            } else if (state.phase === 'results') {
                // Show results screen
                this.stopPolling();
                stopAllLevels();
                showScreen('results-screen');

                this.lastGamePhase = state.phase;
                this.lastGameLevel = state.currentLevel;
            } else if (state.phase === 'finished') {
                // Show final leaderboard
                this.stopPolling();
                stopAllLevels();
                if (typeof FinalLeaderboard !== 'undefined') FinalLeaderboard.init();

                this.lastGamePhase = state.phase;
                this.lastGameLevel = state.currentLevel;
            }
        } catch (error) {
            console.error('Error checking game state:', error.message);
        }
    }
};

// Global expose - Make immediately available
window.AdminController = AdminController;
window.showScreen = showScreen;
window.ParticipantLobby = ParticipantLobby;

document.addEventListener('DOMContentLoaded', () => {
    AdminController.init();
    initNavigation();

    setTimeout(async () => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.style.display = 'none';

        const app = document.getElementById('app');
        if (app) app.style.display = 'flex';

        // Auto-restore session if player already joined (page refresh)
        const cachedPlayer = localStorage.getItem('currentPlayer');
        if (cachedPlayer) {
            try {
                const player = JSON.parse(cachedPlayer);
                // Verify the player still exists in the DB
                const players = await Storage.getPlayers();
                const stillExists = players.some(p => p.id === player.id);
                if (stillExists) {
                    Toast.show(`Welcome back, ${player.name}!`, 'info');
                    showScreen('lobby-screen');
                    ParticipantLobby.init();
                    return;
                } else {
                    // Player was removed (kicked), clear cache
                    localStorage.removeItem('currentPlayer');
                }
            } catch (e) {
                // DB not ready or parse error — fall through to home screen
            }
        }

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
        this.startAdminPolling();
    },

    // Start polling for admin commands
    startAdminPolling() {
        if (this.adminPollingInterval) clearInterval(this.adminPollingInterval);

        this.adminPollingInterval = setInterval(async () => {
            try {
                const state = await Storage.getGameState();

                // Check if admin stopped the level
                if (state.phase === 'lobby') {
                    this.handleAdminStop();
                    return;
                }

                // Check if admin wants to show answer
                if (state.phase === 'show_answer' && !this.answerShown) {
                    this.showCorrectAnswer();
                    this.answerShown = true;
                }

                // Reset answer shown flag when back to playing
                if (state.phase === 'playing') {
                    this.answerShown = false;
                }

            } catch (error) {
                console.error('Error polling admin commands:', error.message);
            }
        }, 1000);
    },

    stopLevel() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.adminPollingInterval) {
            clearInterval(this.adminPollingInterval);
            this.adminPollingInterval = null;
        }
        this.isCompleted = true;
        showScreen('lobby-screen');
        ParticipantLobby.init();
    },

    handleAdminStop() {
        this.stopLevel();
        Toast.show('Level stopped by admin', 'warning');
    },
    
    showCorrectAnswer() {
        // Clear all solution slots
        const slots = document.querySelectorAll('.solution-slot');
        slots.forEach(slot => {
            slot.innerHTML = `<span class="slot-num">${slot.dataset.slot}</span>`;
            slot.classList.remove('filled');
        });
        
        // Show correct solution
        this.correctOrder.forEach((pieceId, index) => {
            const piece = this.pieces.find(p => p.id === pieceId);
            if (piece) {
                const slot = document.querySelector(`[data-slot="${index + 1}"]`);
                if (slot) {
                    slot.innerHTML = `
                        <div class="code-piece correct-answer" data-piece-id="${piece.id}">
                            <span class="line-num">${index + 1}</span>
                            <span class="code-text" style="padding-left: ${piece.indent * 20}px">${piece.code}</span>
                        </div>
                    `;
                    slot.classList.add('filled');
                }
            }
        });
        
        Toast.show('Correct answer revealed by admin', 'info');
    },
    
    resetState() {
        this.elapsedSeconds = 0;
        this.attempts = 0;
        this.solutionOrder = [null, null, null, null, null, null, null, null, null];
        this.isCompleted = false;
        this.answerShown = false;
        
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
    
    async loadPlayerInfo() {
        // Get player info from localStorage or Supabase
        const players = await Storage.getPlayers();
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
        
        // Do not deduct points for wrong answers (keep score unchanged)
        // Score is only awarded for correct completion.
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
        // No penalty for retries; wrong attempts should not reduce available points.
        let penalty = 0;
        
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
    
    async saveProgress() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        if (!currentPlayer) return;
        
        // Update player in storage
        const players = await Storage.getPlayers();
        const playerIndex = players.findIndex(p => p.id === currentPlayer.id);
        if (playerIndex >= 0) {
            players[playerIndex].score = this.playerScore;
            players[playerIndex].level1Completed = this.isCompleted;
            await Storage.savePlayers(players);
        }
        
        // Save detailed score to Supabase
        if (this.isCompleted) {
            await Storage.savePlayerScore(
                currentPlayer.id,
                currentPlayer.name,
                1, // Level 1
                this.playerScore,
                this.elapsedSeconds,
                {
                    timeWindow: this.getCurrentWindow(),
                    completedAt: Date.now(),
                    attempts: 1,
                    success: this.playerScore > 0
                }
            );
        }
    },
    
    // Called by admin to start level for all players
    startLevel() {
        this.init();
        showScreen('screen-level-one');
    }
};

// Admin function to start Level 1
async function adminStartLevel() {
    const state = await Storage.getGameState();
    state.phase = 'level1';
    state.currentLevel = 1;
    await Storage.saveGameState(state);
    
    // For local testing, start the level
    Level1.startLevel();
    
    Toast.show('Level 1 Started!', 'success');
}

// Expose Level1 globally
window.Level1 = Level1;
window.adminStartLevel = adminStartLevel;

// ============ LEVEL 2 LOGIC - BONUS ROUND ============

const Level2 = {
    totalTime: 480, // 8 minutes
    remainingSeconds: 480,
    timerInterval: null,
    adminPollingInterval: null,
    
    // Question pool for Level 2
   questions: [
    { q: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Power Unit", "Central Program Uploader", "Core Processing Utility"], correct: 0 },
    { q: "What do you use to browse the internet?", options: ["Compiler", "Web Browser", "Terminal", "Notepad"], correct: 1 },
    { q: "Which company made the iPhone?", options: ["Samsung", "Google", "Apple", "Microsoft"], correct: 2 },
    { q: "What does RAM stand for?", options: ["Read All Memory", "Run Any Module", "Random Allocated Machine", "Random Access Memory"], correct: 3 },
    { q: "Which of these is a programming language?", options: ["Python", "Windows", "HTML", "Google"], correct: 0 },
    { q: "What is Wi-Fi used for?", options: ["Charging phones", "Wireless internet connection", "Cooling computers", "Printing documents"], correct: 1 },
    { q: "Which company makes Windows?", options: ["Apple", "Google", "Microsoft", "Samsung"], correct: 2 },
    { q: "What is a mouse used for?", options: ["Typing text", "Storing files", "Connecting to internet", "Controlling the cursor on screen"], correct: 3 },
    { q: "What does USB stand for?", options: ["Universal Serial Bus", "United System Bridge", "Universal Storage Block", "Unified Serial Board"], correct: 0 },
    { q: "Which of these is a search engine?", options: ["Python", "Google", "Excel", "Bluetooth"], correct: 1 },
    { q: "What does a keyboard do?", options: ["Displays images", "Connects to Wi-Fi", "Inputs text and commands", "Stores data"], correct: 2 },
    { q: "What is the brain of a computer called?", options: ["RAM", "GPU", "SSD", "CPU"], correct: 3 },
    { q: "Which of these is a social media platform?", options: ["Instagram", "Linux", "Python", "Java"], correct: 0 },
    { q: "What does an SSD store?", options: ["Power", "Data and files", "Internet connection", "Sound"], correct: 1 },
    { q: "What does PDF stand for?", options: ["Printed Data File", "Program Data Form", "Portable Document Format", "Personal Doc Folder"], correct: 2 },
    { q: "Which device is used for printing?", options: ["Monitor", "Mouse", "Keyboard", "Printer"], correct: 3 },
    { q: "What do you call unwanted emails?", options: ["Spam", "Archives", "Sent items", "Drafts"], correct: 0 },
    { q: "Which symbol is used in email addresses?", options: ["#", "@", "&", "%"], correct: 1 },
    { q: "What type of software is Microsoft Word?", options: ["Game", "Web browser", "Word processor", "Spreadsheet"], correct: 2 },
    { q: "What does a webcam do?", options: ["Prints documents", "Stores files", "Connects to Wi-Fi", "Captures video"], correct: 3 },
    { q: "What does GPS stand for?", options: ["Global Positioning System", "General Power Supply", "Global Program Software", "Graphical Position Setup"], correct: 0 },
    { q: "Which of these stores data permanently?", options: ["RAM", "Hard Drive", "CPU", "Monitor"], correct: 1 },
    { q: "What does HTML stand for?", options: ["Home Tool Markup Language", "Hyperlinks Text Mark Language", "Hyper Text Markup Language", "High Tech Modern Language"], correct: 2 },
    { q: "What is the main function of an operating system?", options: ["Play games", "Browse internet", "Send emails", "Manage computer hardware and software"], correct: 3 },
    { q: "Which of these is a mobile operating system?", options: ["Android", "Windows XP", "Linux Ubuntu", "macOS"], correct: 0 },
    { q: "What does Bluetooth do?", options: ["Provides internet", "Short range wireless data transfer", "Charges devices", "Cools computers"], correct: 1 },
    { q: "Which of these is a cloud storage service?", options: ["Notepad", "Photoshop", "Google Drive", "Calculator"], correct: 2 },
    { q: "What is the function of a monitor?", options: ["Process data", "Store files", "Input commands", "Display visual output"], correct: 3 },
    { q: "Which key is used to delete text to the left?", options: ["Backspace", "Delete", "Enter", "Tab"], correct: 0 },
    { q: "What does a router do?", options: ["Prints documents", "Connects devices to the internet", "Stores data", "Displays images"], correct: 1 },
    { q: "What does www stand for?", options: ["Wide World Web", "Web World Wide", "World Wide Web", "World Web Wide"], correct: 2 },
    { q: "Which of these is an antivirus software?", options: ["Chrome", "Excel", "Zoom", "Norton"], correct: 3 },
    { q: "What is a screenshot?", options: ["An image of your screen", "A printed image", "A type of camera", "A video file"], correct: 0 },
    { q: "What does ctrl+C do?", options: ["Paste", "Copy", "Close", "Cut"], correct: 1 },
    { q: "What does ctrl+V do?", options: ["Cut", "Copy", "Paste", "Close"], correct: 2 },
    { q: "Which company created Facebook?", options: ["Google", "Microsoft", "Apple", "Meta"], correct: 3 },
    { q: "What is a gigabyte?", options: ["A unit of data storage", "A type of virus", "A programming language", "An internet speed"], correct: 0 },
    { q: "What does a power supply unit do?", options: ["Displays images", "Supplies power to the computer", "Stores data", "Connects to internet"], correct: 1 },
    { q: "Which of these is a video conferencing app?", options: ["Word", "Excel", "Zoom", "Paint"], correct: 2 },
    { q: "What is a tablet?", options: ["A type of medicine", "A keyboard", "A printer", "A portable touchscreen computer"], correct: 3 },
    { q: "What does HDMI stand for?", options: ["High Definition Multimedia Interface", "Heavy Duty Media Input", "High Data Memory Interface", "Hard Drive Media Installation"], correct: 0 },
    { q: "Which of these is a file extension for images?", options: [".mp3", ".jpg", ".txt", ".exe"], correct: 1 },
    { q: "What is a browser extension?", options: ["A cable", "A type of virus", "An add-on that enhances browser functionality", "A programming language"], correct: 2 },
    { q: "What does a refresh button do?", options: ["Turns off computer", "Opens a new tab", "Closes the window", "Reloads the current page"], correct: 3 },
    { q: "Which of these is a valid file name?", options: ["myfile.txt", "my file?.txt", "my:file.txt", "my/file.txt"], correct: 0 },
    { q: "What is the home button on a browser for?", options: ["Closes browser", "Goes to homepage", "Opens settings", "Refreshes page"], correct: 1 },
    { q: "Which company makes the PlayStation?", options: ["Microsoft", "Nintendo", "Sony", "Sega"], correct: 2 },
    { q: "What does double-clicking usually do?", options: ["Selects item", "Copies item", "Deletes item", "Opens item"], correct: 3 }
],
    shuffledQuestions: [],
    currentIndex: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    pointsThisRound: 0,
    playerScore: 0,
    playerName: 'AGENT',
    playerId: '',
    isCompleted: false,
    
    // Seeded random shuffle
    seededShuffle(array, seed) {
        const shuffled = [...array];
        let m = shuffled.length, t, i;
        
        // Simple seeded random function
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        
        while (m) {
            i = Math.floor(random() * m--);
            t = shuffled[m];
            shuffled[m] = shuffled[i];
            shuffled[i] = t;
        }
        return shuffled;
    },
    
    init() {
        this.resetState();
        this.loadPlayerInfo();
        this.shuffleQuestions();
        this.updateStats(); // Initialize stats display
        this.showUnlockBanner();
        this.startTimer();
        this.startAdminPolling();
    },
    
    resetState() {
        this.remainingSeconds = 480;
        this.currentIndex = 0;
        this.questionsAnswered = 0;
        this.correctAnswers = 0;
        this.pointsThisRound = 0;
        this.isCompleted = false;
        this.answerShown = false;
        
        // Hide overlays
        document.getElementById('l2-unlock-banner').style.display = 'flex';
        document.getElementById('l2-complete-overlay').style.display = 'none';
        
        // Reset stats display
        document.getElementById('l2-answered').textContent = '0';
        document.getElementById('l2-correct').textContent = '0';
        document.getElementById('l2-round-pts').textContent = '0';
    },
    
    loadPlayerInfo() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        if (currentPlayer) {
            this.playerName = currentPlayer.name || 'AGENT';
            this.playerId = currentPlayer.id || 'player-' + Date.now();
            this.playerScore = currentPlayer.score || 0;
        }
        
        document.getElementById('l2-codename').textContent = this.playerName;
        document.getElementById('l2-score').textContent = `${this.playerScore} PTS`;
    },
    
    shuffleQuestions() {
        // Use player ID as seed for unique order per player
        const seed = this.playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        this.shuffledQuestions = this.seededShuffle(this.questions, seed);
    },
    
    showUnlockBanner() {
        const banner = document.getElementById('l2-unlock-banner');
        banner.style.display = 'flex';
        
        setTimeout(() => {
            banner.style.display = 'none';
            this.startTimer();
            this.loadQuestion();
        }, 2000);
    },
    
    startTimer() {
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            if (this.isCompleted) {
                clearInterval(this.timerInterval);
                return;
            }
            
            this.remainingSeconds--;
            this.updateTimerDisplay();
            
            if (this.remainingSeconds <= 0) {
                clearInterval(this.timerInterval);
                this.endLevel();
            }
        }, 1000);
    },
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.remainingSeconds / 60);
        const seconds = this.remainingSeconds % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('l2-timer').textContent = display;
    },
    
    loadQuestion() {
        if (this.isCompleted) return;
        
        // Loop questions if exhausted
        if (this.currentIndex >= this.shuffledQuestions.length) {
            this.currentIndex = 0;
            // Reshuffle for variety
            const seed = Date.now();
            this.shuffledQuestions = this.seededShuffle(this.questions, seed);
        }
        
        const q = this.shuffledQuestions[this.currentIndex];
        
        document.getElementById('l2-q-num').textContent = `QUESTION ${this.questionsAnswered + 1}`;
        document.getElementById('l2-q-text').textContent = q.q;
        
        const answersContainer = document.getElementById('l2-answers');
        const letters = ['A', 'B', 'C', 'D'];
        
        answersContainer.innerHTML = q.options.map((opt, idx) => `
            <button class="bonus-answer-btn" data-index="${idx}">
                <span class="option-letter">${letters[idx]}</span>
                <span class="option-text">${opt}</span>
            </button>
        `).join('');
        
        // Bind click events
        answersContainer.querySelectorAll('.bonus-answer-btn').forEach(btn => {
            btn.onclick = () => this.handleAnswer(parseInt(btn.dataset.index));
        });
    },
    
    handleAnswer(selectedIndex) {
        if (this.isCompleted) return;
        
        const q = this.shuffledQuestions[this.currentIndex];
        const buttons = document.querySelectorAll('#l2-answers .bonus-answer-btn');
        const selectedBtn = buttons[selectedIndex];
        
        // Disable all buttons
        buttons.forEach(btn => btn.style.pointerEvents = 'none');
        
        this.questionsAnswered++;
        
        if (selectedIndex === q.correct) {
            // Correct answer
            this.correctAnswers++;
            this.pointsThisRound += 10;
            this.playerScore += 10;
            
            selectedBtn.classList.add('correct');
            this.showPointsPopup();
            this.updateStats();
            this.saveScore();
        } else {
            // Wrong answer - no penalty, just dim
            selectedBtn.classList.add('wrong');
        }
        
        // Move to next question after delay
        setTimeout(() => {
            this.currentIndex++;
            this.loadQuestion();
        }, 800);
    },
    
    showPointsPopup() {
        const popup = document.getElementById('l2-points-popup');
        popup.style.display = 'block';
        
        setTimeout(() => {
            popup.style.display = 'none';
        }, 800);
    },
    
    updateStats() {
        document.getElementById('l2-answered').textContent = this.questionsAnswered;
        document.getElementById('l2-correct').textContent = this.correctAnswers;
        document.getElementById('l2-round-pts').textContent = this.pointsThisRound;
        document.getElementById('l2-score').textContent = `${this.playerScore} PTS`;
    },
    
    async saveScore() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || '{}');
        
        // Update in localStorage
        currentPlayer.score = this.playerScore;
        localStorage.setItem('currentPlayer', JSON.stringify(currentPlayer));
        
        // Update players list
        const players = await Storage.getPlayers();
        const idx = players.findIndex(p => p.id === this.playerId);
        if (idx !== -1) {
            players[idx].score = this.playerScore;
            await Storage.savePlayers(players);
        }
        
        // Save detailed score to Supabase
        if (currentPlayer.id) {
            await Storage.savePlayerScore(
                currentPlayer.id,
                currentPlayer.name || 'Unknown Player',
                2, // Level 2
                this.pointsThisRound,
                480 - this.remainingSeconds, // Time spent
                {
                    questionsAnswered: this.questionsAnswered,
                    correctAnswers: this.correctAnswers,
                    accuracy: this.questionsAnswered > 0 ? (this.correctAnswers / this.questionsAnswered * 100).toFixed(1) : 0,
                    completedAt: Date.now(),
                    levelType: 'bonus_round'
                }
            );
        }
    },
    
    async endLevel() {
        this.isCompleted = true;
        clearInterval(this.timerInterval);
        
        // Update game state
        const state = await Storage.getGameState();
        state.phase = 'lobby';
        await Storage.saveGameState(state);
        
        // Show complete overlay
        document.getElementById('l2-final-answered').textContent = this.questionsAnswered;
        document.getElementById('l2-final-correct').textContent = this.correctAnswers;
        document.getElementById('l2-final-pts').textContent = this.pointsThisRound;
        document.getElementById('l2-total-score').textContent = this.playerScore;
        document.getElementById('l2-complete-overlay').style.display = 'flex';
    },
    
    startLevel() {
        this.init();
        showScreen('screen-level-two');
    },

    // Start polling for admin commands
    startAdminPolling() {
        if (this.adminPollingInterval) clearInterval(this.adminPollingInterval);

        this.adminPollingInterval = setInterval(async () => {
            try {
                const state = await Storage.getGameState();

                // Check if admin stopped the level
                if (state.phase === 'lobby') {
                    this.handleAdminStop();
                    return;
                }

            } catch (error) {
                console.error('Error polling admin commands:', error.message);
            }
        }, 1000);
    },

    stopLevel() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.adminPollingInterval) {
            clearInterval(this.adminPollingInterval);
            this.adminPollingInterval = null;
        }
        this.isCompleted = true;
        showScreen('lobby-screen');
        ParticipantLobby.init();
    },

    handleAdminStop() {
        this.stopLevel();
        Toast.show('Level stopped by admin', 'warning');
    }
};

// Admin function to start Level 2
async function adminStartLevel2() {
    const state = await Storage.getGameState();
    state.phase = 'level2';
    state.currentLevel = 2;
    await Storage.saveGameState(state);
    
    Level2.startLevel();
    Toast.show('Level 2 (Bonus Round) Started!', 'success');
}

window.Level2 = Level2;
window.adminStartLevel2 = adminStartLevel2;

// ============ LEVEL 3 - HEAP BUILDER ============
const Level3 = {
    totalTime: 480, // 8 minutes total
    remainingSeconds: 480,
    timerInterval: null,
    adminPollingInterval: null,
    
    // Game state
    currentRound: 1,
    maxRounds: 4,
    roundsCompleted: 0,
    playerScore: 0,
    playerName: 'AGENT',
    playerId: '',
    totalPoints: 0,
    penalty: 0,
    isCompleted: false,
    
    // Heap data for each round
    rounds: [
        { numbers: [85, 73, 42, 56, 28, 19, 35], maxSize: 7 }, // Round 1
        { numbers: [92, 74, 68, 51, 43, 37, 26, 15], maxSize: 8 }, // Round 2  
        { numbers: [88, 76, 65, 54, 49, 39, 32, 28, 21, 18], maxSize: 10 }, // Round 3
        { numbers: [95, 83, 77, 69, 58, 47, 41, 36, 29, 24, 18, 12, 8], maxSize: 13 } // Round 4
    ],
    
    currentNumbers: [],
    heapTree: [], // Array representing heap positions
    
    init() {
        this.resetState();
        this.loadPlayerInfo();
        this.setupRound();
        this.setupDragAndDrop();
        this.bindEvents();
        this.updateDisplay();
        this.startTimer();
        this.startAdminPolling();
        this.showInstructions();
    },
    
    resetState() {
        this.currentRound = 1;
        this.roundsCompleted = 0;
        this.totalPoints = 0;
        this.penalty = 0;
        this.isCompleted = false;
        this.remainingSeconds = 480;
        this.heapTree = [];
        
        // Hide overlays
        document.getElementById('heap-instruction-overlay').style.display = 'none';
        document.getElementById('heap-success-popup').style.display = 'none';
        document.getElementById('heap-error-popup').style.display = 'none';
        document.getElementById('heap-level-complete-overlay').style.display = 'none';
    },
    
    loadPlayerInfo() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        if (currentPlayer) {
            this.playerName = currentPlayer.name || 'AGENT';
            this.playerId = currentPlayer.id || '';
            this.playerScore = currentPlayer.score || 0;
        }
    },
    
    showInstructions() {
        document.getElementById('heap-instruction-overlay').style.display = 'flex';
        
        document.getElementById('heap-instruction-go').onclick = () => {
            document.getElementById('heap-instruction-overlay').style.display = 'none';
        };
    },
    
    setupRound() {
        console.log('Setting up round:', this.currentRound); // Debug log
        
        // Set current round numbers
        this.currentNumbers = [...this.rounds[this.currentRound - 1].numbers];
        const maxSize = this.rounds[this.currentRound - 1].maxSize;
        
        console.log('Round numbers:', this.currentNumbers); // Debug log
        console.log('Max heap size:', maxSize); // Debug log
        
        // Initialize empty heap positions  
        this.heapTree = new Array(maxSize).fill(null);
        
        this.renderNumberBank();
        this.renderHeapTree();
        this.updateRoundProgress();
    },
    
    renderNumberBank() {
        const bank = document.getElementById('heap-bank');
        bank.innerHTML = '';
        
        // Shuffle numbers for visual variety
        const shuffled = [...this.currentNumbers].sort(() => Math.random() - 0.5);
        
        shuffled.forEach(num => {
            if (num !== null) {
                const el = document.createElement('div');
                el.className = 'heap-number';
                el.textContent = num;
                el.draggable = true;
                el.dataset.value = num;
                bank.appendChild(el);
            }
        });
    },
    
    renderHeapTree() {
        const tree = document.getElementById('heap-tree');
        const svg = document.getElementById('heap-tree-lines');
        tree.innerHTML = '';
        svg.innerHTML = '';

        const maxSize = this.rounds[this.currentRound - 1].maxSize;
        const maxLevel = Math.floor(Math.log2(maxSize)); // 0-indexed max level

        // --- Coordinate system ---
        // We use a fixed 1000-unit wide x-axis and pixel y-axis.
        // SVG viewBox matches: "0 0 1000 [containerH]"
        const containerH = 420;
        const levelGap = Math.floor((containerH - 60) / (maxLevel + 1)); // spacing between levels
        const nodesAtBottom = Math.pow(2, maxLevel);

        // Node visual size shrinks for deeper trees so nodes don't overlap
        const nodeSize = Math.max(44, Math.min(64, Math.floor(1000 / (nodesAtBottom * 1.6))));

        svg.setAttribute('viewBox', `0 0 1000 ${containerH}`);

        // Pre-compute all node positions (cx in 0..1000, cy in pixels)
        const positions = [];
        for (let i = 0; i < maxSize; i++) {
            const level  = Math.floor(Math.log2(i + 1));
            const posInLevel = i - (Math.pow(2, level) - 1);
            const nodesInLevel = Math.pow(2, level);
            const cx = ((posInLevel + 0.5) / nodesInLevel) * 1000; // 0..1000
            const cy = level * levelGap + 60;                       // pixels from top
            positions.push({ cx, cy });
        }

        // Draw SVG connecting lines first (so they appear behind nodes)
        for (let i = 1; i < maxSize; i++) {
            const parentIdx = Math.floor((i - 1) / 2);
            const p = positions[parentIdx];
            const c = positions[i];
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', p.cx);
            line.setAttribute('y1', p.cy);
            line.setAttribute('x2', c.cx);
            line.setAttribute('y2', c.cy);
            line.setAttribute('stroke', '#4a9eff');
            line.setAttribute('stroke-width', '2.5');
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('opacity', '0.75');
            svg.appendChild(line);
        }

        // Draw heap slot nodes
        for (let i = 0; i < maxSize; i++) {
            const { cx, cy } = positions[i];
            const slot = document.createElement('div');
            slot.className = 'heap-slot';
            slot.dataset.index = i;
            // Convert cx (0..1000) to CSS percentage
            slot.style.left  = (cx / 10) + '%';   // cx/1000 * 100
            slot.style.top   = cy + 'px';
            slot.style.width  = nodeSize + 'px';
            slot.style.height = nodeSize + 'px';
            slot.style.fontSize = Math.max(0.75, nodeSize / 58) + 'rem';

            if (this.heapTree[i] !== null && this.heapTree[i] !== undefined) {
                slot.textContent = this.heapTree[i];
                slot.classList.add('filled');
            }
            tree.appendChild(slot);
        }
    },
    
    setupDragAndDrop() {
        document.addEventListener('dragstart', (e) => this.handleDragStart(e));
        document.addEventListener('dragend', (e) => this.handleDragEnd(e));
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    },
    
    handleDragStart(e) {
        if (e.target.classList.contains('heap-number') || e.target.classList.contains('heap-slot')) {
            e.dataTransfer.setData('text/plain', '');
            e.target.classList.add('dragging');
        }
    },
    
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        document.querySelectorAll('.drop-hover').forEach(el => el.classList.remove('drop-hover'));
    },
    
    handleDragOver(e) {
        e.preventDefault();
        if (e.target.classList.contains('heap-slot') || e.target.id === 'heap-bank') {
            e.target.classList.add('drop-hover');
        }
    },
    
    handleDragLeave(e) {
        e.target.classList.remove('drop-hover');
    },
    
    handleDrop(e) {
        e.preventDefault();
        e.target.classList.remove('drop-hover');
        
        const dragged = document.querySelector('.dragging');
        if (!dragged) return;
        
        if (e.target.classList.contains('heap-slot')) {
            // Dropping into heap position
            const index = parseInt(e.target.dataset.index);
            
            if (dragged.classList.contains('heap-number')) {
                // From bank to heap
                const value = parseInt(dragged.dataset.value);
                
                // If slot is filled, move existing number back to bank
                if (this.heapTree[index] !== null) {
                    const existingValue = this.heapTree[index];
                    const bank = document.getElementById('heap-bank');
                    const existingNum = document.createElement('div');
                    existingNum.className = 'heap-number';
                    existingNum.textContent = existingValue;
                    existingNum.draggable = true;
                    existingNum.dataset.value = existingValue;
                    bank.appendChild(existingNum);
                }
                
                this.heapTree[index] = value;
                dragged.remove();
            } else if (dragged.classList.contains('heap-slot')) {
                // From heap to heap (swap)
                const fromIndex = parseInt(dragged.dataset.index);
                const temp = this.heapTree[index];
                this.heapTree[index] = this.heapTree[fromIndex];
                this.heapTree[fromIndex] = temp;
            }
            
        } else if (e.target.id === 'heap-bank' || e.target.parentElement?.id === 'heap-bank') {
            // Dropping back to bank
            const targetBank = e.target.id === 'heap-bank' ? e.target : e.target.parentElement;
            
            if (dragged.classList.contains('heap-slot')) {
                const index = parseInt(dragged.dataset.index);
                const value = this.heapTree[index];
                if (value !== null) {
                    this.heapTree[index] = null;
                    // Add back to bank
                    const num = document.createElement('div');
                    num.className = 'heap-number';
                    num.textContent = value;
                    num.draggable = true;
                    num.dataset.value = value;
                    targetBank.appendChild(num);
                }
            }
        }
        
        this.renderHeapTree();
    },
    
    bindEvents() {
        document.getElementById('heap-validate').onclick = () => this.validateHeap();
        document.getElementById('heap-reset').onclick = () => this.resetRound();
    },
    
    validateHeap() {
        if (!this.isHeapComplete()) {
            this.showError('Please place all numbers in the heap before validating.');
            return;
        }
        
        if (this.isValidMaxHeap()) {
            this.handleSuccess();
        } else {
            this.handleViolation();
        }
    },
    
    isHeapComplete() {
        return this.heapTree.every(pos => pos !== null);
    },
    
    isValidMaxHeap() {
        for (let i = 0; i < this.heapTree.length; i++) {
            const leftChild = 2 * i + 1;
            const rightChild = 2 * i + 2;
            
            if (leftChild < this.heapTree.length && this.heapTree[i] < this.heapTree[leftChild]) {
                return false;
            }
            if (rightChild < this.heapTree.length && this.heapTree[i] < this.heapTree[rightChild]) {
                return false;
            }
        }
        return true;
    },
    
    handleSuccess() {
        const timeWindow = this.getTimeWindow();
        const basePoints = 100;
        const timeBonus = timeWindow === 'EARLY' ? 50 : timeWindow === 'MID' ? 25 : 0;
        const roundTotal = basePoints + timeBonus - this.penalty;
        
        this.totalPoints += roundTotal;
        this.roundsCompleted++;
        
        // Update popup
        document.getElementById('heap-popup-round').textContent = `ROUND ${this.currentRound} OF ${this.maxRounds} COMPLETE`;
        document.getElementById('heap-popup-window').textContent = timeWindow;
        document.getElementById('heap-popup-window').className = 'window-result ' + timeWindow.toLowerCase();
        document.getElementById('heap-pts-base').textContent = basePoints;
        document.getElementById('heap-pts-bonus').textContent = timeBonus;
        document.getElementById('heap-pts-penalty').textContent = -this.penalty;
        document.getElementById('heap-pts-total').textContent = roundTotal;
        
        document.getElementById('heap-success-popup').style.display = 'flex';
        
        setTimeout(() => {
            document.getElementById('heap-success-popup').style.display = 'none';
            this.nextRound();
        }, 3000);
    },
    
    handleViolation() {
        this.penalty += 15;
        document.getElementById('heap-penalty-info').textContent = `-${this.penalty} points total`;
        document.getElementById('heap-error-popup').style.display = 'flex';
        
        setTimeout(() => {
            document.getElementById('heap-error-popup').style.display = 'none';
        }, 2000);
    },
    
    showError(message) {
        document.getElementById('heap-error-message').textContent = message;
        document.getElementById('heap-error-popup').style.display = 'flex';
        
        setTimeout(() => {
            document.getElementById('heap-error-popup').style.display = 'none';
        }, 2000);
    },
    
    nextRound() {
        if (this.currentRound >= this.maxRounds) {
            this.completeLevel();
        } else {
            this.currentRound++;
            this.penalty = 0; // Reset penalty for new round
            this.setupRound();
            this.updateDisplay();
        }
    },
    
    resetRound() {
        this.penalty = 0;
        this.heapTree = new Array(this.rounds[this.currentRound - 1].maxSize).fill(null);
        this.setupRound();
    },
    
    completeLevel() {
        this.isCompleted = true;
        
        // Update completion overlay
        document.getElementById('heap-complete-rounds').textContent = this.roundsCompleted;
        document.getElementById('heap-complete-points').textContent = this.totalPoints;
        document.getElementById('heap-complete-cumulative').textContent = this.playerScore + this.totalPoints;
        document.getElementById('heap-complete-time').textContent = this.formatTime(this.remainingSeconds);
        
        // Save final score
        this.savePlayerProgress();
        
        document.getElementById('heap-level-complete-overlay').style.display = 'flex';
        
        setTimeout(() => {
            this.stopLevel();
        }, 5000);
    },
    
    async savePlayerProgress() {
        try {
            const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
            if (currentPlayer) {
                currentPlayer.score = (currentPlayer.score || 0) + this.totalPoints;
                localStorage.setItem('currentPlayer', JSON.stringify(currentPlayer));
                await Storage.savePlayers([currentPlayer]);
            }
        } catch (error) {
            console.error('Error saving player progress:', error);
        }
    },
    
    getTimeWindow() {
        const elapsed = 480 - this.remainingSeconds;
        if (elapsed < 160) return 'EARLY';
        if (elapsed < 320) return 'MID'; 
        return 'LATE';
    },
    
    updateDisplay() {
        // Update header info
        document.getElementById('heap-round-num').textContent = this.currentRound;
        document.getElementById('heap-codename').textContent = this.playerName;
        document.getElementById('heap-score').textContent = `${this.playerScore + this.totalPoints} PTS`;
        
        // Update timer
        document.getElementById('heap-timer').textContent = this.formatTime(this.remainingSeconds);
        
        // Update time window
        const window = this.getTimeWindow();
        const label = document.getElementById('heap-window-label');
        label.textContent = window;
        label.className = 'heap-window-label ' + window.toLowerCase();
        
        this.updateRoundProgress();
        this.updateTimeProgress();
    },
    
    updateRoundProgress() {
        document.querySelectorAll('.heap-round-dot').forEach((dot, index) => {
            if (index + 1 === this.currentRound) {
                dot.classList.add('active');
            } else if (index + 1 < this.currentRound) {
                dot.classList.add('completed');
                dot.classList.remove('active');
            } else {
                dot.classList.remove('active', 'completed');
            }
        });
    },
    
    updateTimeProgress() {
        const elapsed = 480 - this.remainingSeconds;
        const earlyEnd = 160;
        const midEnd = 320;
        
        const early = document.getElementById('heap-seg-early');
        const mid = document.getElementById('heap-seg-mid');
        const late = document.getElementById('heap-seg-late');
        
        // Update progress bars
        if (elapsed <= earlyEnd) {
            early.querySelector('.seg-fill').style.width = `${(elapsed / earlyEnd) * 100}%`;
        } else {
            early.querySelector('.seg-fill').style.width = '100%';
            if (elapsed <= midEnd) {
                mid.querySelector('.seg-fill').style.width = `${((elapsed - earlyEnd) / (midEnd - earlyEnd)) * 100}%`;
            } else {
                mid.querySelector('.seg-fill').style.width = '100%';
                late.querySelector('.seg-fill').style.width = `${((elapsed - midEnd) / (480 - midEnd)) * 100}%`;
            }
        }
    },
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },
    
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            this.remainingSeconds--;
            this.updateDisplay();
            
            if (this.remainingSeconds <= 0) {
                this.completeLevel();
            }
        }, 1000);
    },
    
    startAdminPolling() {
        if (this.adminPollingInterval) clearInterval(this.adminPollingInterval);

        this.adminPollingInterval = setInterval(async () => {
            try {
                const state = await Storage.getGameState();

                // Check if admin stopped the level
                if (state.phase === 'lobby') {
                    this.handleAdminStop();
                    return;
                }

            } catch (error) {
                console.error('Error polling admin commands:', error.message);
            }
        }, 1000);
    },

    stopLevel() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.adminPollingInterval) {
            clearInterval(this.adminPollingInterval);
            this.adminPollingInterval = null;
        }
        this.isCompleted = true;
        showScreen('lobby-screen');
        ParticipantLobby.init();
    },

    handleAdminStop() {
        this.stopLevel();
        Toast.show('Level stopped by admin', 'warning');
    },
    
    startLevel() {
        this.init();
        showScreen('screen-level-three');
    }
};

// Admin function to start Level 3
async function adminStartLevel3() {
    const state = await Storage.getGameState();
    state.phase = 'level3';
    state.currentLevel = 3;
    await Storage.saveGameState(state);
    
    Level3.startLevel();
    Toast.show('Level 3 (Heap Builder) Started!', 'success');
}

window.Level3 = Level3;
window.adminStartLevel3 = adminStartLevel3;

// ============ LEVEL 4 LOGIC - BONUS ROUND 2 ============

const Level4 = {
    totalTime: 480, // 8 minutes
    remainingSeconds: 480,
    timerInterval: null,
    adminPollingInterval: null,
    
    // Question pool for Level 4 (more technical)
  questions: [
    { q: "What does AI stand for?", options: ["Automated Input", "Artificial Intelligence", "Advanced Interface", "Automatic Integration"], correct: 0 },
    { q: "What is a programming loop used for?", options: ["Storing data", "Repeating a block of code", "Connecting to internet", "Displaying images"], correct: 1 },
    { q: "Which of these is a version control tool?", options: ["Figma", "Slack", "Git", "Zoom"], correct: 2 },
    { q: "What does an algorithm do?", options: ["Stores files", "Connects devices", "Displays graphics", "Solves a problem step by step"], correct: 3 },
    { q: "What is a variable in coding?", options: ["A named storage for data", "A type of loop", "A network cable", "A screen component"], correct: 0 },
    { q: "Which language is used for web styling?", options: ["Python", "CSS", "Java", "SQL"], correct: 1 },
    { q: "What does an API do?", options: ["Stores passwords", "Displays videos", "Allows apps to communicate", "Charges devices"], correct: 2 },
    { q: "What is open source software?", options: ["Expensive software", "Software for businesses only", "Software with no updates", "Software with publicly available code"], correct: 3 },
    { q: "What does a compiler do?", options: ["Translates code into machine language", "Stores files permanently", "Connects to Wi-Fi", "Displays output on screen"], correct: 0 },
    { q: "Which of these is a database language?", options: ["HTML", "SQL", "CSS", "Swift"], correct: 1 },
    { q: "What is a boolean value?", options: ["A large number", "A string of text", "True or false", "A decimal number"], correct: 2 },
    { q: "What does debugging mean?", options: ["Writing new features", "Compiling code", "Deploying software", "Finding and fixing errors in code"], correct: 3 },
    { q: "What is the function of RAM?", options: ["Temporarily stores data for active processes", "Saves files permanently", "Displays images", "Connects to internet"], correct: 0 },
    { q: "Which of these is a front end framework?", options: ["Django", "React", "Laravel", "Flask"], correct: 1 },
    { q: "What does HTTP stand for?", options: ["High Transfer Text Protocol", "Home Tool Text Program", "HyperText Transfer Protocol", "Hyper Tool Transfer Page"], correct: 2 },
    { q: "What is a function in programming?", options: ["A type of error", "A storage device", "A screen component", "A reusable block of code"], correct: 3 },
    { q: "What does OOP stand for?", options: ["Object Oriented Programming", "Open Online Platform", "Operational Output Processing", "Optional Output Parameter"], correct: 0 },
    { q: "Which of these is a NoSQL database?", options: ["MySQL", "MongoDB", "PostgreSQL", "SQLite"], correct: 1 },
    { q: "What is a firewall used for?", options: ["Speeding up internet", "Storing backups", "Monitoring and filtering network traffic", "Charging devices"], correct: 2 },
    { q: "What does VPN stand for?", options: ["Very Private Node", "Virtual Public Net", "Verified Private Network", "Virtual Private Network"], correct: 3 },
    { q: "What is machine learning?", options: ["Training computers to learn from data", "Teaching machines to move physically", "Repairing hardware automatically", "Programming using binary only"], correct: 0 },
    { q: "What does the term syntax mean in coding?", options: ["Speed of the code", "Rules for writing valid code", "Memory used by program", "Output of a program"], correct: 1 },
    { q: "What is a server?", options: ["A type of keyboard", "A display screen", "A computer that provides data to others", "A person who serves coffee"], correct: 2 },
    { q: "What does encryption do?", options: ["Speeds up data transfer", "Compresses large files", "Deletes data permanently", "Converts data into a coded format"], correct: 3 },
    { q: "What is an IDE?", options: ["Integrated Development Environment", "Internal Data Engine", "Internet Download Extension", "Integrated Design Editor"], correct: 0 },
    { q: "Which of these is a Python web framework?", options: ["React", "Django", "Angular", "Vue"], correct: 1 },
    { q: "What does bandwidth mean?", options: ["Physical size of a cable", "Number of devices connected", "Maximum data transfer rate of a network", "Screen resolution"], correct: 2 },
    { q: "What is a cookie in web browsing?", options: ["A type of malware", "A download file", "A type of password", "A small file stored by websites on your browser"], correct: 3 },
    { q: "What does the term runtime mean?", options: ["The period when a program is executing", "Time to write code", "Time to compile code", "Startup time of a computer"], correct: 0 },
    { q: "What is responsive web design?", options: ["A fast loading website", "A website that adapts to different screen sizes", "A colourful website", "A website with animations"], correct: 1 },
    { q: "What is a hash in computing?", options: ["A type of password", "A network address", "A fixed size output from data using an algorithm", "A storage format"], correct: 2 },
    { q: "What does the term cache mean?", options: ["Digital money", "A type of network", "A deleted file", "Temporary storage for fast data access"], correct: 3 },
    { q: "What is two factor authentication?", options: ["A security process requiring two forms of verification", "Using two passwords", "Logging in twice", "A type of encryption"], correct: 0 },
    { q: "What does the cloud mean in technology?", options: ["Weather forecasting software", "Storing and accessing data over the internet", "A type of RAM", "A cooling system"], correct: 1 },
    { q: "What is a data breach?", options: ["A software update", "A backup process", "Unauthorised access to confidential data", "A type of firewall"], correct: 2 },
    { q: "What does IP address stand for?", options: ["Internet Provider Address", "Internal Protocol Access", "Integrated Program Address", "Internet Protocol Address"], correct: 3 },
    { q: "What is the purpose of a motherboard?", options: ["Connects all computer components together", "Displays visuals", "Stores files", "Cools the processor"], correct: 0 },
    { q: "Which of these is a Linux command to list files?", options: ["show", "ls", "list", "dir"], correct: 1 },
    { q: "What does HTTPS mean compared to HTTP?", options: ["It is faster", "It downloads files", "It uses a secure encrypted connection", "It blocks ads"], correct: 2 },
    { q: "What is latency in networking?", options: ["Speed of processor", "Size of a file", "Screen refresh rate", "Delay before data transfer begins"], correct: 3 },
    { q: "What does the term compile mean?", options: ["Translating source code into machine code", "Writing new code", "Running a program", "Deleting old files"], correct: 0 },
    { q: "What is a binary number system?", options: ["A system using digits 0 to 9", "A system using only 0 and 1", "A system using hexadecimal", "A system using letters only"], correct: 1 },
    { q: "What does the term bug mean in programming?", options: ["A virus", "A feature request", "An error or flaw in the code", "A comment in code"], correct: 2 },
    { q: "What is the purpose of comments in code?", options: ["To slow down the program", "To create variables", "To run functions", "To explain and document what the code does"], correct: 3 },
    { q: "What is an array in programming?", options: ["A collection of elements stored in order", "A type of loop", "A network connection", "A drawing tool"], correct: 0 },
    { q: "What does DOM stand for in web development?", options: ["Data Object Management", "Document Object Model", "Display Output Mode", "Dynamic Object Method"], correct: 1 },
    { q: "What is a pull request in Git?", options: ["Downloading a repository", "Deleting a branch", "A request to merge code changes into a branch", "Pushing code to server"], correct: 2 },
    { q: "What does the term deploy mean in software?", options: ["Writing new features", "Testing the code", "Fixing a bug", "Making the application live and accessible to users"], correct: 3 }
],
    shuffledQuestions: [],
    currentIndex: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    pointsThisRound: 0,
    playerScore: 0,
    playerName: 'AGENT',
    playerId: '',
    isCompleted: false,
    
    // Seeded random shuffle
    seededShuffle(array, seed) {
        const shuffled = [...array];
        let m = shuffled.length, t, i;
        
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        
        while (m) {
            i = Math.floor(random() * m--);
            t = shuffled[m];
            shuffled[m] = shuffled[i];
            shuffled[i] = t;
        }
        return shuffled;
    },
    
    init() {
        this.resetState();
        this.loadPlayerInfo();
        this.shuffleQuestions();
        this.updateStats(); // Initialize stats display
        this.showUnlockBanner();
        this.startAdminPolling();
    },

    startAdminPolling() {
        if (this.adminPollingInterval) clearInterval(this.adminPollingInterval);

        this.adminPollingInterval = setInterval(async () => {
            try {
                const state = await Storage.getGameState();

                // Check if admin stopped the level
                if (state.phase === 'lobby') {
                    this.handleAdminStop();
                }
            } catch (error) {
                console.error('Error polling admin commands (L4):', error.message);
            }
        }, 1000);
    },

    handleAdminStop() {
        this.stopLevel();
        Toast.show('Level stopped by admin', 'warning');
    },
    
    resetState() {
        this.remainingSeconds = 480;
        this.currentIndex = 0;
        this.questionsAnswered = 0;
        this.correctAnswers = 0;
        this.pointsThisRound = 0;
        this.isCompleted = false;
        this.answerShown = false;
        
        document.getElementById('l4-unlock-banner').style.display = 'flex';
        document.getElementById('l4-complete-overlay').style.display = 'none';
        
        // Reset stats display
        document.getElementById('l4-answered').textContent = '0';
        document.getElementById('l4-correct').textContent = '0';
        document.getElementById('l4-round-pts').textContent = '0';
    },
    
    loadPlayerInfo() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        if (currentPlayer) {
            this.playerName = currentPlayer.name || 'AGENT';
            this.playerId = currentPlayer.id || 'player-' + Date.now();
            this.playerScore = currentPlayer.score || 0;
        }
        
        document.getElementById('l4-codename').textContent = this.playerName;
        document.getElementById('l4-score').textContent = `${this.playerScore} PTS`;
    },
    
    shuffleQuestions() {
        // Use player ID as seed for unique order per player
        const seed = this.playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + 1000;
        this.shuffledQuestions = this.seededShuffle(this.questions, seed);
    },
    
    showUnlockBanner() {
        const banner = document.getElementById('l4-unlock-banner');
        banner.style.display = 'flex';
        
        setTimeout(() => {
            banner.style.display = 'none';
            this.startTimer();
            this.loadQuestion();
        }, 2000);
    },
    
    startTimer() {
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            if (this.isCompleted) {
                clearInterval(this.timerInterval);
                return;
            }
            
            this.remainingSeconds--;
            this.updateTimerDisplay();
            
            if (this.remainingSeconds <= 0) {
                clearInterval(this.timerInterval);
                this.endLevel();
            }
        }, 1000);
    },
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.remainingSeconds / 60);
        const seconds = this.remainingSeconds % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('l4-timer').textContent = display;
    },
    
    loadQuestion() {
        if (this.isCompleted) return;
        
        // Loop questions if exhausted
        if (this.currentIndex >= this.shuffledQuestions.length) {
            this.currentIndex = 0;
            const seed = Date.now();
            this.shuffledQuestions = this.seededShuffle(this.questions, seed);
        }
        
        const q = this.shuffledQuestions[this.currentIndex];
        
        document.getElementById('l4-q-num').textContent = `QUESTION ${this.questionsAnswered + 1}`;
        document.getElementById('l4-q-text').textContent = q.q;
        
        const answersContainer = document.getElementById('l4-answers');
        const letters = ['A', 'B', 'C', 'D'];
        
        answersContainer.innerHTML = q.options.map((opt, idx) => `
            <button class="bonus-answer-btn" data-index="${idx}">
                <span class="option-letter">${letters[idx]}</span>
                <span class="option-text">${opt}</span>
            </button>
        `).join('');
        
        answersContainer.querySelectorAll('.bonus-answer-btn').forEach(btn => {
            btn.onclick = () => this.handleAnswer(parseInt(btn.dataset.index));
        });
    },
    
    handleAnswer(selectedIndex) {
        if (this.isCompleted) return;
        
        const q = this.shuffledQuestions[this.currentIndex];
        const buttons = document.querySelectorAll('#l4-answers .bonus-answer-btn');
        const selectedBtn = buttons[selectedIndex];
        
        buttons.forEach(btn => btn.style.pointerEvents = 'none');
        
        this.questionsAnswered++;
        
        if (selectedIndex === q.correct) {
            this.correctAnswers++;
            this.pointsThisRound += 10;
            this.playerScore += 10;
            
            selectedBtn.classList.add('correct');
            this.showPointsPopup();
            this.updateStats();
            this.saveScore();
        } else {
            selectedBtn.classList.add('wrong');
        }
        
        setTimeout(() => {
            this.currentIndex++;
            this.loadQuestion();
        }, 800);
    },
    
    showPointsPopup() {
        const popup = document.getElementById('l4-points-popup');
        popup.style.display = 'block';
        
        setTimeout(() => {
            popup.style.display = 'none';
        }, 800);
    },
    
    updateStats() {
        document.getElementById('l4-answered').textContent = this.questionsAnswered;
        document.getElementById('l4-correct').textContent = this.correctAnswers;
        document.getElementById('l4-round-pts').textContent = this.pointsThisRound;
        document.getElementById('l4-score').textContent = `${this.playerScore} PTS`;
    },
    
    async saveScore() {
        const currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || '{}');
        
        // Update in localStorage
        currentPlayer.score = this.playerScore;
        localStorage.setItem('currentPlayer', JSON.stringify(currentPlayer));
        
        // Update players list
        const players = await Storage.getPlayers();
        const idx = players.findIndex(p => p.id === this.playerId);
        if (idx !== -1) {
            players[idx].score = this.playerScore;
            await Storage.savePlayers(players);
        }
        
        // Save detailed score to Supabase
        if (currentPlayer.id) {
            await Storage.savePlayerScore(
                currentPlayer.id,
                currentPlayer.name || 'Unknown Player',
                4, // Level 4
                this.pointsThisRound,
                480 - this.remainingSeconds, // Time spent
                {
                    questionsAnswered: this.questionsAnswered,
                    correctAnswers: this.correctAnswers,
                    accuracy: this.questionsAnswered > 0 ? (this.correctAnswers / this.questionsAnswered * 100).toFixed(1) : 0,
                    completedAt: Date.now(),
                    levelType: 'bonus_round_2'
                }
            );
        }
    },

    stopLevel() {
        // Stop the timer and clean up
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.adminPollingInterval) {
            clearInterval(this.adminPollingInterval);
            this.adminPollingInterval = null;
        }
        this.isCompleted = true;
        showScreen('lobby-screen');
        // Properly reinitialize participant lobby
        if (typeof ParticipantLobby !== 'undefined') {
            ParticipantLobby.init();
        }
    },

    async endLevel() {
        this.isCompleted = true;
        clearInterval(this.timerInterval);
        if (this.adminPollingInterval) {
            clearInterval(this.adminPollingInterval);
            this.adminPollingInterval = null;
        }
        
        const state = await Storage.getGameState();
        state.phase = 'lobby';
        await Storage.saveGameState(state);
        
        document.getElementById('l4-final-answered').textContent = this.questionsAnswered;
        document.getElementById('l4-final-correct').textContent = this.correctAnswers;
        document.getElementById('l4-final-pts').textContent = this.pointsThisRound;
        document.getElementById('l4-total-score').textContent = this.playerScore;
        document.getElementById('l4-complete-overlay').style.display = 'flex';
    },
    
    startLevel() {
        this.init();
        showScreen('screen-level-four');
    }
};

// Admin function to start Level 4
async function adminStartLevel4() {
    const state = await Storage.getGameState();
    state.phase = 'level4';
    state.currentLevel = 4;
    await Storage.saveGameState(state);
    
    Level4.startLevel();
    Toast.show('Level 4 (Bonus Round 2) Started!', 'success');
}

window.Level4 = Level4;
window.adminStartLevel4 = adminStartLevel4;

// ============ LEVEL 5 — TECH ESCAPE ROOM ============
const Level5 = {
    totalTime: 480,
    remainingSeconds: 480,
    timerInterval: null,
    adminPollingInterval: null,
    isCompleted: false,
    hasEscaped: false,
    playerName: 'AGENT',
    playerId: '',
    playerScore: 0,

    // Lock points
    lock1Points: 0,
    lock2Points: 0,
    lock3Points: 0,
    raceBonus: 0,
    levelPoints: 0,

    // Attempt tracking per question inside each lock
    lock1Attempts: [0, 0, 0],
    lock2Attempts: [0, 0, 0],
    lock3Attempts: [0, 0, 0, 0, 0],

    // Current state
    currentLock: 1,
    currentQIndex: 0,
    currentAttempts: 0,
    lastKnownEscapeOrder: [],

   locks: [
    {
        id: 1,
        header: '🔒 LOCK 1 — CODE BREAKER',
        sub: 'IDENTIFY THE LINE THAT CAUSES THE ERROR',
        qLabel: 'QUESTION',
        totalQ: 3,
        pointsPerAttempt: [50, 30, 15],
        questions: [
            {
                text: 'Which line contains the error?',
                code: 'names = ["Alice", "Bob", "Charlie"]\nnames.sort()\nfor name in names\n    print(name)',
                options: [
                    'Line 1 — names = ["Alice", "Bob", "Charlie"]',
                    'Line 2 — names.sort()',
                    'Line 3 — for name in names',
                    'Line 4 — print(name)'
                ],
                correct: 2
            },
            {
                text: 'Which line contains the error?',
                code: 'numbers = [72, 45, 88, 60, 95]\ntotal = 0\nfor num in numbers:\n    total == total + num\nprint(total)',
                options: [
                    'Line 4 — total == total + num',
                    'Line 1 — numbers = [72, 45, 88, 60, 95]',
                    'Line 2 — total = 0',
                    'Line 5 — print(total)'
                ],
                correct: 0
            },
            {
                text: 'Which line contains the error?',
                code: 'scores = [33, 67, 45, 89, 12]\nscores.sort(reverse=True)\nhighest = scores[1]\nprint(highest)',
                options: [
                    'Line 1 — scores = [33, 67, 45, 89, 12]',
                    'Line 2 — scores.sort(reverse=True)',
                    'Line 4 — print(highest)',
                    'Line 3 — highest = scores[1]'
                ],
                correct: 3
            }
        ]
    },
    {
        id: 2,
        header: '🔒 LOCK 2 — TERMINAL TYPO',
        sub: 'PREDICT THE OUTPUT — WHAT DOES THE TERMINAL PRINT?',
        qLabel: 'QUESTION',
        totalQ: 3,
        pointsPerAttempt: [60, 35, 15],
        questions: [
            {
                text: 'What does this code print?',
                code: 'x = "hello"\nprint(x[1])',
                options: ['"e"', '"h"', '"l"', '"o"'],
                correct: 0
            },
            {
                text: 'What does this code print?',
                code: 'nums = [3, 1, 4, 1, 5]\nnums.sort()\nprint(nums[0])',
                options: ['3', '1', '5', '4'],
                correct: 1
            },
            {
                text: 'What does this code print?',
                code: 'a = 7\nb = 2\nprint(a // b)',
                options: ['3.5', '4', '2', '3'],
                correct: 3
            }
        ]
    },
    {
        id: 3,
        header: '🔒 LOCK 3 — FINAL CIPHER',
        sub: 'SOLVE THE RIDDLES — 5 CLUES STAND BETWEEN YOU AND FREEDOM',
        qLabel: 'RIDDLE',
        totalQ: 5,
        pointsPerAttempt: [70, 40, 20],
        questions: [
            {
                text: 'I store your data but vanish the moment power is off. Fast as lightning but forget everything. What am I?',
                code: null,
                options: ['SSD', 'Hard Drive', 'RAM', 'ROM'],
                correct: 2
            },
            {
                text: 'I am the boss of the computer. Every instruction passes through me. Nothing runs without me. What am I?',
                code: null,
                options: ['RAM', 'GPU', 'Motherboard', 'CPU'],
                correct: 3
            },
            {
                text: 'I am a set of rules two computers follow when they want to talk to each other. What am I?',
                code: null,
                options: ['Algorithm', 'Protocol', 'Compiler', 'Variable'],
                correct: 1
            },
            {
                text: 'I am the process of finding and fixing mistakes in your code. Developers spend most of their time doing me. What am I?',
                code: null,
                options: ['Compiling', 'Deploying', 'Debugging', 'Rendering'],
                correct: 2
            },
            {
                text: 'I am a step by step set of instructions written to solve a specific problem. Recipes and directions are real world versions of me. What am I?',
                code: null,
                options: ['Function', 'Loop', 'Variable', 'Algorithm'],
                correct: 3
            }
            ]
        }
    ],

    init() {
        this.resetState();
        this.loadPlayerInfo();
    },

    resetState() {
        this.remainingSeconds = 480;
        this.isCompleted = false;
        this.hasEscaped = false;
        this.currentLock = 1;
        this.currentQIndex = 0;
        this.currentAttempts = 0;
        this.lock1Points = 0;
        this.lock2Points = 0;
        this.lock3Points = 0;
        this.raceBonus = 0;
        this.levelPoints = 0;
        this.lock1Attempts = [0, 0, 0];
        this.lock2Attempts = [0, 0, 0];
        this.lock3Attempts = [0, 0, 0, 0, 0];
        this.lastKnownEscapeOrder = [];

        // Reset lock icons
        [1, 2, 3].forEach(i => {
            const icon = document.getElementById(`l5-lock-${i}-icon`);
            if (icon) { icon.textContent = '🔒'; icon.classList.remove('unlocked'); }
        });

        // Reset progress bar
        [1, 2, 3].forEach(i => {
            const seg = document.getElementById(`l5-seg-${i}`);
            const fill = document.getElementById(`l5-fill-${i}`);
            if (seg) seg.className = 'l5-progress-seg dim';
            if (fill) fill.style.width = '0%';
        });

        // Hide all overlays except intro
        ['l5-complete-overlay', 'l5-escaped-overlay', 'l5-escape-announcement', 'l5-lock-cracked'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.getElementById('l5-pts-feedback').style.display = 'none';
        document.getElementById('l5-intro-overlay').style.display = 'flex';

        const timer = document.getElementById('l5-timer');
        if (timer) { timer.textContent = '08:00'; timer.className = 'l5-timer'; }
    },

    loadPlayerInfo() {
        const cp = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
        if (cp) {
            this.playerName = cp.name || 'AGENT';
            this.playerId = cp.id || '';
            this.playerScore = cp.score || 0;
        }
        const cdn = document.getElementById('l5-codename');
        const sc = document.getElementById('l5-score');
        if (cdn) cdn.textContent = this.playerName;
        if (sc) sc.textContent = `${this.playerScore} PTS`;
    },

    showIntro() {
        return new Promise(resolve => {
            const overlay = document.getElementById('l5-intro-overlay');
            const els = {
                boss:  document.getElementById('l5-intro-boss'),
                title: document.getElementById('l5-intro-title'),
                sub1:  document.getElementById('l5-intro-sub1'),
                sub2:  document.getElementById('l5-intro-sub2'),
                count: document.getElementById('l5-intro-count')
            };
            overlay.style.display = 'flex';
            Object.values(els).forEach(e => { if (e) { e.style.opacity = '0'; e.style.display = ''; } });
            if (els.count) els.count.style.display = 'none';

            const show = (el, delay) => setTimeout(() => { if (el) el.style.opacity = '1'; }, delay);
            show(els.boss, 100);
            show(els.title, 650);
            show(els.sub1, 1150);
            show(els.sub2, 1350);

            const counts = ['3', '2', '1', 'GO!'];
            const countDelays = [1700, 2300, 2900, 3450];
            counts.forEach((c, i) => {
                setTimeout(() => {
                    if (!els.count) return;
                    els.count.style.display = 'block';
                    els.count.style.opacity = '1';
                    els.count.textContent = c;
                    els.count.className = 'l5-intro-count' + (c === 'GO!' ? ' go' : '');
                }, countDelays[i]);
            });

            setTimeout(() => {
                overlay.style.display = 'none';
                resolve();
            }, 4000);
        });
    },

    startTimer() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            if (this.isCompleted) { clearInterval(this.timerInterval); return; }
            this.remainingSeconds--;
            this.updateTimerDisplay();
            if (this.remainingSeconds <= 0) {
                clearInterval(this.timerInterval);
                this.endLevel(false);
            }
        }, 1000);
    },

    updateTimerDisplay() {
        const m = Math.floor(this.remainingSeconds / 60);
        const s = this.remainingSeconds % 60;
        const el = document.getElementById('l5-timer');
        if (!el) return;
        el.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        el.className = 'l5-timer';
        if (this.remainingSeconds <= 60)  el.className = 'l5-timer red pulse';
        else if (this.remainingSeconds <= 180) el.className = 'l5-timer amber';
    },

    loadCurrentQuestion() {
        const lock = this.locks[this.currentLock - 1];
        const q = lock.questions[this.currentQIndex];

        document.getElementById('l5-lock-header').textContent = lock.header;
        document.getElementById('l5-lock-sub').textContent = lock.sub;
        document.getElementById('l5-q-num').textContent = `${lock.qLabel} ${this.currentQIndex + 1} OF ${lock.totalQ}`;
        document.getElementById('l5-question-text').textContent = q.text;

        const codeBlock = document.getElementById('l5-code-block');
        if (q.code) {
            codeBlock.style.display = 'block';
            codeBlock.textContent = q.code;
        } else {
            codeBlock.style.display = 'none';
        }

        this.currentAttempts = 0;
        this.updateAttemptDots();

        const letters = ['A', 'B', 'C', 'D'];
        const answers = document.getElementById('l5-answers');
        answers.innerHTML = q.options.map((opt, idx) => `
            <button class="l5-answer-btn" data-index="${idx}">
                <span class="l5-opt-letter">${letters[idx]}</span>
                <span class="l5-opt-text">${opt}</span>
            </button>
        `).join('');
        answers.querySelectorAll('.l5-answer-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleAnswer(parseInt(btn.dataset.index)));
        });

        document.getElementById('l5-pts-feedback').style.display = 'none';
        this.updateProgressBar();
    },

    updateAttemptDots() {
        for (let i = 0; i < 3; i++) {
            const dot = document.getElementById('l5-dot-' + i);
            if (!dot) continue;
            if (i < (3 - this.currentAttempts)) {
                dot.textContent = '⬤'; dot.className = 'l5-dot filled';
            } else {
                dot.textContent = '○'; dot.className = 'l5-dot empty';
            }
        }
    },

    updateProgressBar() {
        [1, 2, 3].forEach(i => {
            const seg = document.getElementById(`l5-seg-${i}`);
            const fill = document.getElementById(`l5-fill-${i}`);
            if (!seg || !fill) return;
            if (i < this.currentLock) {
                seg.className = 'l5-progress-seg completed';
                fill.style.width = '100%';
            } else if (i === this.currentLock && !this.isCompleted) {
                seg.className = 'l5-progress-seg active';
                const lock = this.locks[this.currentLock - 1];
                fill.style.width = (this.currentQIndex / lock.totalQ * 100) + '%';
            } else {
                seg.className = 'l5-progress-seg dim';
                fill.style.width = '0%';
            }
        });
    },

    async handleAnswer(selectedIndex) {
        if (this.isCompleted) return;
        const lock = this.locks[this.currentLock - 1];
        const q = lock.questions[this.currentQIndex];
        const buttons = document.querySelectorAll('#l5-answers .l5-answer-btn');
        buttons.forEach(btn => btn.style.pointerEvents = 'none');
        this.currentAttempts++;

        const attemptsArr = this.currentLock === 1 ? this.lock1Attempts :
                            this.currentLock === 2 ? this.lock2Attempts : this.lock3Attempts;
        attemptsArr[this.currentQIndex] = this.currentAttempts;

        if (selectedIndex === q.correct) {
            const pts = lock.pointsPerAttempt[this.currentAttempts - 1] || 0;
            if (this.currentLock === 1) this.lock1Points += pts;
            else if (this.currentLock === 2) this.lock2Points += pts;
            else this.lock3Points += pts;
            this.levelPoints += pts;
            this.playerScore += pts;

            buttons[selectedIndex].classList.add('l5-correct');
            this.showPtsFeedback(`+${pts} PTS`, true);
            this.updateScoreDisplay();
            await this.saveScoreIncrement(pts);
            setTimeout(() => this.nextQuestion(), 1500);
        } else {
            buttons[selectedIndex].classList.add('l5-wrong');
            if (buttons[q.correct]) buttons[q.correct].classList.add('l5-correct');
            this.showPtsFeedback('0 PTS', false);
            setTimeout(() => this.nextQuestion(), 1500);
        }
    },

    showPtsFeedback(msg, positive) {
        const el = document.getElementById('l5-pts-feedback');
        el.textContent = msg;
        el.className = 'l5-pts-feedback ' + (positive ? 'positive' : 'negative');
        el.style.display = 'block';
    },

    async nextQuestion() {
        this.currentQIndex++;
        if (this.currentQIndex >= this.locks[this.currentLock - 1].totalQ) {
            await this.completeLock();
        } else {
            this.loadCurrentQuestion();
        }
    },

    async completeLock() {
        const lockId = this.currentLock;
        const lockPts = lockId === 1 ? this.lock1Points : lockId === 2 ? this.lock2Points : this.lock3Points;
        const unlocked = lockPts > 0;

        if (unlocked) {
            const icon = document.getElementById(`l5-lock-${lockId}-icon`);
            if (icon) { icon.textContent = '🔓'; icon.classList.add('unlocked'); }

            const seg = document.getElementById(`l5-seg-${lockId}`);
            const fill = document.getElementById(`l5-fill-${lockId}`);
            if (seg) seg.className = 'l5-progress-seg completed';
            if (fill) fill.style.width = '100%';

            const cracked = document.getElementById('l5-lock-cracked');
            const crackedText = document.getElementById('l5-lock-cracked-text');
            if (cracked && crackedText) {
                crackedText.textContent = `🔓 LOCK ${lockId} CRACKED`;
                cracked.style.display = 'flex';
            }
            await new Promise(r => setTimeout(r, 1500));
            if (cracked) cracked.style.display = 'none';
        }

        if (lockId < 3) {
            this.currentLock++;
            this.currentQIndex = 0;
            this.currentAttempts = 0;
            this.loadCurrentQuestion();
        } else {
            if (this.levelPoints > 0) {
                await this.playerEscaped();
            } else {
                await this.endLevel(false);
            }
        }
    },

    async playerEscaped() {
        this.isCompleted = true;
        this.hasEscaped = true;
        clearInterval(this.timerInterval);
        clearInterval(this.adminPollingInterval);
        this.timerInterval = null;
        this.adminPollingInterval = null;

        let escapePosition = null;
        try {
            const state = await Storage.getGameState();
            const escapeOrder = Array.isArray(state.escape_order) ? state.escape_order : [];
            escapePosition = escapeOrder.length + 1;
            const raceMap = { 1: 200, 2: 100, 3: 50 };
            this.raceBonus = raceMap[escapePosition] || 0;
            this.levelPoints += this.raceBonus;
            this.playerScore += this.raceBonus;
            escapeOrder.push(this.playerId);
            state.escape_order = escapeOrder;
            await Storage.saveGameState(state);
        } catch (e) {
            console.error('Error updating escape_order:', e.message);
        }

        if (this.raceBonus > 0) await this.saveScoreIncrement(this.raceBonus);
        await this.saveLevel5Data(true, escapePosition);

        document.getElementById('l5-escaped-codename').textContent = this.playerName;
        document.getElementById('l5-escaped-pts').textContent = this.levelPoints;
        document.getElementById('l5-escaped-total').textContent = this.playerScore;
        if (this.raceBonus > 0) {
            document.getElementById('l5-race-bonus-display').style.display = 'block';
            document.getElementById('l5-race-bonus-pts').textContent = `+${this.raceBonus}`;
        }
        document.getElementById('l5-escaped-overlay').style.display = 'flex';
        this.updateScoreDisplay();
    },

    updateScoreDisplay() {
        const el = document.getElementById('l5-score');
        if (el) el.textContent = `${this.playerScore} PTS`;
        const cp = JSON.parse(localStorage.getItem('currentPlayer') || '{}');
        cp.score = this.playerScore;
        localStorage.setItem('currentPlayer', JSON.stringify(cp));
    },

    async saveScoreIncrement(pts) {
        try {
            const players = await Storage.getPlayers();
            const idx = players.findIndex(p => p.id === this.playerId);
            if (idx !== -1) {
                players[idx].score = (players[idx].score || 0) + pts;
                await Storage.savePlayers(players);
            }
        } catch (e) {
            console.error('L5 score increment error:', e.message);
        }
    },

    async saveLevel5Data(escaped, escapePosition) {
        try {
            await Storage.savePlayerScore(
                this.playerId, this.playerName, 5, this.levelPoints,
                480 - this.remainingSeconds,
                {
                    escaped,
                    escapePosition: escapePosition || null,
                    timeRemaining: this.remainingSeconds,
                    raceBonus: this.raceBonus,
                    lock1Points: this.lock1Points,
                    lock2Points: this.lock2Points,
                    lock3Points: this.lock3Points,
                    totalPoints: this.levelPoints,
                    lock1Attempts: this.lock1Attempts,
                    lock2Attempts: this.lock2Attempts,
                    lock3Attempts: this.lock3Attempts
                }
            );
        } catch (e) {
            console.error('L5 save error:', e.message);
        }
    },

    startAdminPolling() {
        if (this.adminPollingInterval) clearInterval(this.adminPollingInterval);
        this.adminPollingInterval = setInterval(async () => {
            try {
                const state = await Storage.getGameState();
                if (state.phase === 'finished') {
                    this.handleAdminFinish();
                    return;
                }
                if (!this.isCompleted && state.phase === 'lobby') {
                    this.handleAdminStop();
                    return;
                }
                if (!this.hasEscaped) {
                    this.checkEscapeAnnouncements(state);
                }
            } catch (e) {
                console.error('L5 admin poll error:', e.message);
            }
        }, 2000);
    },

    checkEscapeAnnouncements(state) {
        const order = Array.isArray(state.escape_order) ? state.escape_order : [];
        if (order.length > this.lastKnownEscapeOrder.length) {
            const newId = order[order.length - 1];
            if (newId !== this.playerId) {
                this.showEscapeAnnouncement(newId);
            }
        }
        this.lastKnownEscapeOrder = [...order];
    },

    async showEscapeAnnouncement(escapeeId) {
        try {
            const players = await Storage.getPlayers();
            const p = players.find(pl => pl.id === escapeeId);
            const name = p ? p.name : 'A PLAYER';
            const nameEl = document.getElementById('l5-escaped-player-name');
            if (nameEl) nameEl.textContent = name;
            const ann = document.getElementById('l5-escape-announcement');
            if (ann) {
                ann.style.display = 'flex';
                setTimeout(() => { ann.style.display = 'none'; }, 3000);
            }
        } catch (e) {}
    },

    handleAdminStop() {
        this.stopLevel();
        Toast.show('Level stopped by admin', 'warning');
    },

    handleAdminFinish() {
        clearInterval(this.timerInterval);
        clearInterval(this.adminPollingInterval);
        this.timerInterval = null;
        this.adminPollingInterval = null;
        this.isCompleted = true;
        showScreen('screen-final-leaderboard');
        FinalLeaderboard.init();
    },

    stopLevel() {
        clearInterval(this.timerInterval);
        clearInterval(this.adminPollingInterval);
        this.timerInterval = null;
        this.adminPollingInterval = null;
        this.isCompleted = true;
        showScreen('lobby-screen');
        if (typeof ParticipantLobby !== 'undefined') ParticipantLobby.init();
    },

    async endLevel(escaped) {
        this.isCompleted = true;
        clearInterval(this.timerInterval);
        clearInterval(this.adminPollingInterval);
        this.timerInterval = null;
        this.adminPollingInterval = null;
        if (!escaped) await this.saveLevel5Data(false, null);

        document.getElementById('l5-fin-lock1').textContent = this.lock1Points;
        document.getElementById('l5-fin-lock2').textContent = this.lock2Points;
        document.getElementById('l5-fin-lock3').textContent = this.lock3Points;
        document.getElementById('l5-fin-race').textContent = this.raceBonus;
        document.getElementById('l5-fin-total').textContent = this.levelPoints;
        document.getElementById('l5-fin-cumulative').textContent = this.playerScore;
        const status = document.getElementById('l5-complete-status');
        status.textContent = escaped ? 'ESCAPED ✓' : 'TIME OUT ✗';
        status.className = 'l5-complete-status ' + (escaped ? 'escaped' : 'timeout');
        document.getElementById('l5-complete-overlay').style.display = 'flex';
    },

    async startLevel() {
        this.init();
        showScreen('screen-level-five');
        await this.showIntro();
        this.startAdminPolling();
        this.startTimer();
        this.loadCurrentQuestion();
    }
};

// ============ FINAL LEADERBOARD ============
const FinalLeaderboard = {
    async init() {
        showScreen('screen-final-leaderboard');
        await this.render();
    },

    async render() {
        try {
            const players = await Storage.getPlayers();
            players.sort((a, b) => (b.score || 0) - (a.score || 0));
            const podium = document.getElementById('l5-lb-podium');
            const rest = document.getElementById('l5-lb-rest');
            if (!podium || !rest) return;

            const medals = ['🏆', '🥈', '🥉'];
            const top3 = players.slice(0, 3);
            const others = players.slice(3);

            podium.innerHTML = top3.map((p, i) => `
                <div class="l5-lb-podium-entry rank-${i + 1}">
                    <div class="l5-lb-medal">${medals[i] || ''}</div>
                    <div class="l5-lb-name">${p.name}</div>
                    <div class="l5-lb-score">${p.score || 0} PTS</div>
                </div>
            `).join('');

            rest.innerHTML = others.map((p, i) => `
                <div class="l5-lb-row">
                    <span class="l5-lb-rank">#${i + 4}</span>
                    <span class="l5-lb-row-name">${p.name}</span>
                    <span class="l5-lb-row-score">${p.score || 0} PTS</span>
                </div>
            `).join('');

            this.startParticles();
        } catch (e) {
            console.error('Leaderboard render error:', e.message);
        }
    },

    startParticles() {
        const container = document.getElementById('l5-lb-particles');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'l5-particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 5 + 's';
            p.style.animationDuration = (3 + Math.random() * 4) + 's';
            container.appendChild(p);
        }
    }
};

// Global expose all levels
window.Level3 = Level3;
window.Level5 = Level5;
window.FinalLeaderboard = FinalLeaderboard;