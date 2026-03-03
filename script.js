const state = {
    playerName: '',
    currentScreen: 'loading-screen',
    score: 0,
    currentQuestionIndex: 0,
    timer: 15,
    timerInterval: null,
    players: [
        { name: 'X-Phantom', status: 'online' },
        { name: 'CyberWitch', status: 'online' },
        { name: 'NeonSamurai', status: 'online' }
    ]
};

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

// DOM Elements
const screens = document.querySelectorAll('.screen');
const playerNameInput = document.getElementById('player-name');
const startBtn = document.getElementById('start-battle');
const launchBtn = document.getElementById('launch-game');
const playerList = document.getElementById('player-list');
const timerBar = document.getElementById('timer-bar');
const questionText = document.getElementById('question-text');
const answerGrid = document.getElementById('answer-grid');
const scoreDisplay = document.getElementById('current-score');
const leaderboard = document.getElementById('leaderboard');
const playAgainBtn = document.getElementById('play-again');

// Navigation
function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    state.currentScreen = screenId;
}

// Particle Background Simulation
function initParticles() {
    const container = document.getElementById('particles-container');
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 5 + 's';
        // Add particle styles dynamically
        Object.assign(p.style, {
            position: 'absolute',
            width: '3px',
            height: '3px',
            background: 'var(--neon-blue)',
            borderRadius: '50%',
            opacity: Math.random() * 0.5,
            pointerEvents: 'none',
            boxShadow: '0 0 5px var(--neon-blue)',
            animation: `float ${5 + Math.random() * 5}s infinite linear`
        });
        container.appendChild(p);
    }
}

// Add Float Animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes float {
    0% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-100px) scale(1.2); }
    100% { transform: translateY(0) scale(1); }
}`;
document.head.appendChild(styleSheet);

// Lobby Logic
function updateLobby() {
    playerList.innerHTML = '';
    const allPlayers = [{ name: state.playerName, status: 'online' }, ...state.players];
    allPlayers.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.style.animationDelay = `${idx * 0.1}s`;
        card.innerHTML = `
            <div class="status-dot"></div>
            <span class="player-name">${p.name}</span>
        `;
        playerList.appendChild(card);
    });
}

// Quiz Logic
function startQuiz() {
    state.currentQuestionIndex = 0;
    state.score = 0;
    scoreDisplay.innerText = '0';
    showQuestion();
}

function showQuestion() {
    if (state.currentQuestionIndex >= questions.length) {
        showResults();
        return;
    }

    const q = questions[state.currentQuestionIndex];
    questionText.innerText = q.q;
    answerGrid.innerHTML = '';

    q.a.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = ans;
        btn.onclick = () => handleAnswer(idx);
        answerGrid.appendChild(btn);
    });

    startTimer();
}

function startTimer() {
    clearInterval(state.timerInterval);
    state.timer = 15;
    timerBar.style.width = '100%';

    state.timerInterval = setInterval(() => {
        state.timer -= 0.1;
        timerBar.style.width = (state.timer / 15) * 100 + '%';

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            handleAnswer(-1); // Timeout
        }
    }, 100);
}

function handleAnswer(idx) {
    clearInterval(state.timerInterval);
    const buttons = answerGrid.querySelectorAll('.answer-btn');
    const correctIdx = questions[state.currentQuestionIndex].correct;

    if (idx === correctIdx) {
        buttons[idx].classList.add('correct');
        state.score += Math.ceil(state.timer * 10);
    } else {
        if (idx !== -1) buttons[idx].classList.add('wrong');
        buttons[correctIdx].classList.add('correct');
    }

    scoreDisplay.innerText = state.score;

    setTimeout(() => {
        state.currentQuestionIndex++;
        showQuestion();
    }, 1500);
}

// Results Logic
function showResults() {
    showScreen('result-screen');
    renderLeaderboard();
}

function renderLeaderboard() {
    leaderboard.innerHTML = '';
    const gameResults = [
        { name: state.playerName, score: state.score },
        { name: 'X-Phantom', score: 850 },
        { name: 'CyberWitch', score: 620 },
        { name: 'NeonSamurai', score: 440 }
    ].sort((a, b) => b.score - a.score);

    gameResults.forEach((res, idx) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item ${idx === 0 ? 'top' : ''}`;
        item.innerHTML = `
            <span>#${idx + 1} ${res.name}</span>
            <span>${res.score}</span>
        `;
        leaderboard.appendChild(item);
    });
}

// Event Listeners
startBtn.onclick = () => {
    state.playerName = playerNameInput.value.trim() || 'CODER-X';
    showScreen('lobby-screen');
    updateLobby();
};

launchBtn.onclick = () => {
    showScreen('quiz-screen');
    startQuiz();
};

playAgainBtn.onclick = () => {
    showScreen('home-screen');
};

// Initial loading sequence
function initLoading() {
    initParticles();

    // Create and play sound
    const audio = new Audio('https://www.soundjay.com/mechanical/sounds/power-up-1.mp3');
    audio.volume = 0.5;

    // Background audio playback often requires a user gesture
    // We'll attempt to play it, but handle failure gracefully
    const playAttempt = setInterval(() => {
        audio.play().then(() => {
            clearInterval(playAttempt);
        }).catch(() => {
            // Still waiting for user interaction or blocked
        });
    }, 500);

    // Simulate loading time (Increased to 4s)
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('fade-out');

        setTimeout(() => {
            showScreen('home-screen');
            clearInterval(playAttempt);
        }, 1000);
    }, 4000);
}

// Start initialization
initLoading();
