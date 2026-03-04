// --- BELMONTS: TECH ARENA - Core Logic ---

// 1. Diagnostics & Logging
const ArenaLog = {
    info: (msg) => console.log(`%c[ARENA INFO]%c ${msg}`, "color: #00f2ff; font-weight: bold", "color: #fff"),
    warn: (msg) => console.warn(`[ARENA WARN] ${msg}`),
    err: (msg) => console.error(`[ARENA ERROR] ${msg}`)
};

ArenaLog.info("SYSTEM SECURE: INITIALIZING KERNEL V2.1.1...");

// 2. Supabase - Defensive Initialization
let supabase = null;
const SUPABASE_URL = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBrp-zgLSnJAQb8_XAyECQ_Vj8zF5kN';

function initSupabase() {
    if (supabase) return supabase;
    try {
        if (window.supabase && window.supabase.createClient) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            ArenaLog.info("SUPABASE: INSTANCE ACQUIRED");
        } else {
            ArenaLog.warn("SUPABASE: Library not loaded, running in offline mode");
        }
    } catch (e) {
        ArenaLog.err("SUPABASE: INITIALIZATION ERROR - " + e.message);
    }
    return supabase;
}

// Try to init immediately (may succeed if loaded with defer)
initSupabase();

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
        { q: "What is the time complexity of a Binary Search algorithm?", a: ["O(n)", "O(n^2)", "O(log n)", "O(1)"], correct: 2 },
        { q: "Which keyword is used to create a constant variable in ES6?", a: ["var", "let", "const", "static"], correct: 2 },
        { q: "What is the result of typeof null in JavaScript?", a: ["'null'", "'undefined'", "'object'", "'number'"], correct: 2 }
    ]
};

const getEl = (id) => document.getElementById(id);

// 4. UI Engine
function showScreen(screenId) {
    ArenaLog.info("Switching to screen -> " + screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
        s.style.opacity = '';
    });
    const target = getEl(screenId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
        target.style.opacity = '1';
        state.currentScreen = screenId;
        updateUI();
        ArenaLog.info("Screen switched to -> " + screenId);
    } else {
        ArenaLog.err("Screen element not found -> " + screenId);
    }
}

function updateUI() {
    try {
        // Removed admin panel logic
        if (state.userRole === 'PARTICIPANT' || state.playerId) syncParticipantScreen();
    } catch (e) {
        ArenaLog.err("UI UPDATE FAIL: " + e.message);
    }
}

// Sync Manager
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

// Removed renderAdminData and related admin panel logic

function syncParticipantScreen() {
    const g = state.global;
    if (g.phase === 'lobby' && (state.currentScreen !== 'lobby-screen' && state.currentScreen !== 'home-screen')) showScreen('lobby-screen');
    else if (g.phase === 'playing' && state.currentScreen !== 'quiz-screen') showScreen('quiz-screen');
}

// 5. Force Reveal Arena - For manual override
function forceRevealArena() {
    ArenaLog.info("Force reveal triggered");
    const loader = getEl('loading-screen');
    const app = getEl('app');
    
    if (loader) {
        loader.classList.remove('active');
        loader.style.display = 'none';
    }
    if (app) {
        app.style.display = 'flex';
    }
    showScreen('home-screen');
}

// 6. Global Click Delegator
function initNavigation() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[id], .sidebar-btn, .tab-btn, .level-card');
        if (!target) return;
        const id = target.id;
        ArenaLog.info("CLICK DETECTED ON: " + (id || target.className || target.tagName));

        // Removed admin role selection logic
        if (id === 'role-participant' || target.closest('#role-participant')) {
            ArenaLog.info("PARTICIPANT ROLE SELECTED");
            var roleSelection = getEl('role-selection');
            var playerInput = getEl('player-input-group');
            if (roleSelection) roleSelection.classList.add('hidden');
            if (playerInput) playerInput.classList.remove('hidden');
        }
        if (id === 'back-to-roles') {
            var playerInput2 = getEl('player-input-group');
            var roleSelection2 = getEl('role-selection');
            if (playerInput2) playerInput2.classList.add('hidden');
            if (roleSelection2) roleSelection2.classList.remove('hidden');
        }
        // Removed admin login logic
        if (id === 'start-battle') {
            const nameInput = getEl('player-name');
            const n = nameInput ? nameInput.value.trim() : '';
            if (n.length >= 2) {
                state.playerName = n; 
                state.playerId = 'P-' + Date.now(); 
                state.userRole = 'PARTICIPANT';
                SyncManager.joinPlayer({ id: state.playerId, name: n, score: 0, joinTime: Date.now(), status: 'active' });
                showScreen('lobby-screen');
            }
        }
        // Force button
        if (id === 'force-enter-btn') {
            forceRevealArena();
        }
        // Removed admin panel tab, level, and command logic
        if (id === 'play-again') showScreen('home-screen');
    });
}

// 7. Initialization Sequence
function initArena() {
    if (window.ARENA_INITIALIZED) return;
    window.ARENA_INITIALIZED = true;
    ArenaLog.info("BOOT SEQUENCE INITIATED");

    // Initialize click handlers
    initNavigation();
    
    // Hide loading screen and show app after short delay (MUST be before subscribe)
    setTimeout(function() {
        ArenaLog.info("FINISHING STARTUP...");
        const loader = getEl('loading-screen');
        const app = getEl('app');
        
        if (app) app.style.display = 'flex';
        
        if (loader) {
            loader.classList.remove('active');
            loader.style.display = 'none';
        }
        
        showScreen('home-screen');
        ArenaLog.info("ARENA READY");
    }, 4000);

    // Try Supabase init again (in case CDN loaded after initial attempt)
    initSupabase();

    // Subscribe to Supabase if available (after setTimeout is registered)
    try {
        if (supabase) SyncManager.subscribe();
    } catch (e) {
        ArenaLog.err("Supabase subscribe failed: " + e.message);
    }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    ArenaLog.info("DOM Content Loaded");
    initArena();
});

// Fallback: If DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ArenaLog.info("Document already ready, initializing...");
    setTimeout(initArena, 100);
}

// Safety net: Force show after 6 seconds no matter what
setTimeout(function() {
    const loader = getEl('loading-screen');
    if (loader && (loader.style.display !== 'none')) {
        ArenaLog.warn("SAFETY NET TRIGGERED - Forcing app display");
        forceRevealArena();
    }
}, 6000);

// Expose globals for debugging and HTML onclick handlers
window.SyncManager = SyncManager;
window.state = state;
window.showScreen = showScreen;
window.forceRevealArena = forceRevealArena;

ArenaLog.info("Script loaded successfully");
