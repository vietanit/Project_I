document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- CẤU HÌNH ---
    const LEVELS = {
        easy: { width: 9, height: 9, bombs: 10 },
        medium: { width: 16, height: 16, bombs: 40 },
        hard: { width: 30, height: 16, bombs: 99 }
    };
    
    // --- STATE VARIABLES ---
    let width = 16;
    let height = 16;
    let bombCount = 40;
    let flags = 0;
    let squares = [];
    let isGameOver = false;
    let isWin = false;
    let timerId;
    let timeElapsed = 0;
    let isFirstClick = true;
    let isGameActive = false; 
    let currentLevelMode = 'medium'; 

    // Online State
    let isOnline = false;
    let currentRoomId = null;
    let isHost = false;
    let onlineConfig = {};

    // --- DOM ELEMENTS ---
    const grid = document.getElementById('grid');
    const bombCountDisplay = document.getElementById('bomb-count');
    const timerDisplay = document.getElementById('timer');
    const smiley = document.getElementById('smiley');
    const resultDisplay = document.getElementById('result');
    const levelBtns = document.querySelectorAll('.levels button[data-level]');
    
    const mainMenu = document.getElementById('main-menu');
    const createOptions = document.getElementById('create-options');
    const onlineWaiting = document.getElementById('online-waiting');
    
    const onlineStatusBar = document.getElementById('online-status-bar');
    const myProgress = document.getElementById('my-progress');
    const opProgress = document.getElementById('opponent-progress');

    // --- THEME HANDLERS ---
    const themeMenu = document.getElementById('theme-menu');
    document.getElementById('btn-open-theme').addEventListener('click', () => themeMenu.classList.remove('hidden'));
    document.getElementById('btn-close-theme').addEventListener('click', () => themeMenu.classList.add('hidden'));

    // --- CUSTOM POPUP HANDLERS (ĐÃ SỬA LỖI LOGIC) ---
    const customMenu = document.getElementById('custom-menu');
    
    document.getElementById('close-custom').addEventListener('click', () => {
        customMenu.classList.add('hidden');
        updateActiveBtn(currentLevelMode);
    });

    document.getElementById('apply-custom').addEventListener('click', () => {
        let w = parseInt(document.getElementById('custom-width').value);
        let h = parseInt(document.getElementById('custom-height').value);
        let b = parseInt(document.getElementById('custom-bombs').value);
        
        // Validation giới hạn
        w = Math.min(50, Math.max(5, w));
        h = Math.min(50, Math.max(5, h));
        // Đảm bảo số bom không vượt quá số ô (chừa ít nhất 1 ô trống)
        if(b >= w*h) b = Math.floor(w*h*0.5);
        if(b < 1) b = 1;

        // Cập nhật thông số toàn cục
        width = w; height = h; bombCount = b;
        
        // QUAN TRỌNG: Gọi initGame('custom') để reset sạch bàn cờ cũ trước khi tạo mới
        // (Trước đây gọi thẳng startBoard() nên bị lỗi chồng data)
        initGame('custom'); 
        
        customMenu.classList.add('hidden');
        isGameActive = true;
    });

    function updateActiveBtn(level) {
        levelBtns.forEach(b => b.classList.remove('active'));
        const target = document.querySelector(`.levels button[data-level="${level}"]`);
        if(target) target.classList.add('active');
    }

    // --- 1. XỬ LÝ MENU & TẠO PHÒNG ---
    
    document.getElementById('btn-open-create-options').addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        createOptions.classList.remove('hidden');
    });

    document.getElementById('btn-back-menu').addEventListener('click', () => {
        createOptions.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    });

    let selectedOnlineLevel = 'easy';
    document.querySelectorAll('.level-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.level-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedOnlineLevel = btn.getAttribute('data-lvl');
            
            if(selectedOnlineLevel === 'custom') {
                document.getElementById('online-custom-inputs').classList.remove('hidden');
            } else {
                document.getElementById('online-custom-inputs').classList.add('hidden');
            }
        });
    });

    document.getElementById('btn-confirm-create').addEventListener('click', () => {
        let config = {};
        if (selectedOnlineLevel === 'custom') {
            config.width = Math.min(50, Math.max(5, parseInt(document.getElementById('onl-w').value)));
            config.height = Math.min(50, Math.max(5, parseInt(document.getElementById('onl-h').value)));
            config.bombs = parseInt(document.getElementById('onl-b').value);
            if (config.bombs >= config.width * config.height) config.bombs = Math.floor(config.width * config.height * 0.5);
            if (config.bombs < 1) config.bombs = 1;
        } else {
            config = LEVELS[selectedOnlineLevel];
        }
        socket.emit('create_room', config);
    });

    // --- 2. SOCKET EVENTS ---

    socket.on('room_created', (roomId) => {
        isOnline = true; isHost = true; currentRoomId = roomId;
        createOptions.classList.add('hidden');
        onlineWaiting.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = roomId;
        document.getElementById('waiting-title').innerText = "Đang chờ đối thủ...";
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
        const code = document.getElementById('room-code-input').value.toUpperCase().trim();
        if(code) socket.emit('join_room', code);
    });

    socket.on('error_join', (msg) => {
        document.getElementById('menu-status').innerText = msg;
    });

    socket.on('player_joined', (config) => {
        isOnline = true;
        onlineConfig = config;
        mainMenu.classList.add('hidden');
        createOptions.classList.add('hidden');
        onlineWaiting.classList.remove('hidden');
        if(!isHost) {
            currentRoomId = document.getElementById('room-code-input').value.toUpperCase();
            document.getElementById('display-room-code').innerText = currentRoomId;
        }
        document.getElementById('waiting-title').innerText = "ĐỐI THỦ ĐÃ VÀO!";
    });

    socket.on('countdown', (count) => {
        document.getElementById('countdown-display').innerText = `Vào trận: ${count}s`;
    });

    socket.on('request_map_generation', () => {
        width = onlineConfig.width;
        height = onlineConfig.height;
        bombCount = onlineConfig.bombs;
        placeBombs(0, true); 
    });

    socket.on('sync_map', (data) => {
        onlineWaiting.classList.add('hidden');
        document.getElementById('online-indicator').classList.remove('hidden');
        document.querySelector('.levels').style.display = 'none';
        onlineStatusBar.classList.remove('hidden');
        if (!isHost) {
            width = onlineConfig.width;
            height = onlineConfig.height;
            bombCount = onlineConfig.bombs;
        }
        initGame('online');
        finalizeBoard(data.bombIndices);
        isFirstClick = false; 
        isGameActive = true; 
        startTimer();
    });

    socket.on('opponent_progress', (percent) => {
        opProgress.style.width = `${percent}%`;
    });

    socket.on('opponent_won', () => {
        if(!isGameOver) {
            isGameOver = true;
            isGameActive = false;
            resultDisplay.innerText = 'BẠN THUA!';
            resultDisplay.style.color = 'red';
            smiley.innerText = '😵';
            clearInterval(timerId);
            squares.forEach(sq => {
                if (sq.classList.contains('bomb')) {
                    sq.innerHTML = '💣';
                    sq.classList.add('checked');
                }
            });
        }
    });

    socket.on('opponent_left', () => {
        alert("Đối thủ đã thoát!");
        location.reload();
    });

    // --- 3. GAME LOGIC ---

    document.getElementById('btn-offline').addEventListener('click', () => {
        isOnline = false;
        mainMenu.classList.add('hidden');
        initGame('medium');
        isGameActive = true;
    });

    document.getElementById('btn-cancel-wait').addEventListener('click', () => location.reload());

    function initGame(level) {
        // RESET SẠCH DỮ LIỆU CŨ
        isGameOver = false; isWin = false; flags = 0; squares = []; 
        timeElapsed = 0; clearInterval(timerId); isGameActive = false;
        
        myProgress.style.width = '0%';
        opProgress.style.width = '0%';
        
        timerDisplay.innerText = '000';
        resultDisplay.innerText = '';
        smiley.innerText = '🙂';
        grid.innerHTML = ''; // XÓA HTML BÀN CỜ CŨ
        
        if (level !== 'online' && level !== 'custom') {
            width = LEVELS[level].width;
            height = LEVELS[level].height;
            bombCount = LEVELS[level].bombs;
            currentLevelMode = level;
            isFirstClick = true;
            document.querySelector('.levels').style.display = 'flex';
            updateActiveBtn(level);
        } else if (level === 'custom') {
            currentLevelMode = 'custom';
            isFirstClick = true;
            updateActiveBtn('custom');
            // width/height đã được set ở sự kiện click
        } else if (level === 'online') {
            isFirstClick = false;
        }
        
        startBoard();
    }

    function startBoard() {
        bombCountDisplay.innerText = bombCount.toString().padStart(3, '0');
        grid.style.gridTemplateColumns = `repeat(${width}, 30px)`;
        grid.style.width = 'fit-content';
        
        for (let i = 0; i < width * height; i++) {
            const square = document.createElement('div');
            square.id = i;
            square.classList.add('square');
            square.addEventListener('click', () => click(square));
            square.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                addFlag(square);
            });
            grid.appendChild(square);
            squares.push(square);
        }
    }

    // --- SOLVER & MAP GENERATION ---
    function resetBoardDataForRetry() {
        squares.forEach(sq => {
            sq.classList.remove('bomb', 'valid');
            sq.removeAttribute('data-total');
        });
    }

    function placeBombs(firstClickIndex, isGenerationOnly = false) {
        let attempts = 0; let isSolvable = false; let finalBombIndices = [];
        const maxAttempts = 50; 

        do {
            attempts++;
            if (!isGenerationOnly) resetBoardDataForRetry();
            const neighbors = getNeighbors(firstClickIndex);
            const safeZone = [firstClickIndex, ...neighbors];
            let validLocations = [];
            for(let i=0; i<width*height; i++) {
                if(!safeZone.includes(i)) validLocations.push(i);
            }
            validLocations.sort(() => Math.random() - 0.5);
            let actualBombs = Math.min(bombCount, validLocations.length);
            finalBombIndices = validLocations.slice(0, actualBombs);

            if (width * height > 1000 || attempts >= maxAttempts) {
                isSolvable = true; 
            } else {
                isSolvable = runSolverSimulation(finalBombIndices, safeZone);
            }

        } while (!isSolvable);

        if (isGenerationOnly && isOnline) {
            socket.emit('send_map_data', { roomId: currentRoomId, bombIndices: finalBombIndices });
        } else {
            finalizeBoard(finalBombIndices);
        }
    }

    function finalizeBoard(bombIndices) {
        squares.forEach((sq, index) => {
            if (bombIndices.includes(index)) sq.classList.add('bomb');
        });
        for (let i = 0; i < squares.length; i++) {
            if (squares[i].classList.contains('bomb')) continue;
            let total = 0;
            getNeighbors(i).forEach(nId => {
                if (squares[nId].classList.contains('bomb')) total++;
            });
            squares[i].setAttribute('data-total', total);
        }
    }

    function runSolverSimulation(currentBombIndices, initialSafeZone) {
        let totalCells = width * height;
        let simRevealed = new Set([...initialSafeZone]);
        let simFlags = new Set();
        let simHidden = new Set();
        for(let i=0; i<totalCells; i++) if(!simRevealed.has(i)) simHidden.add(i);

        let progress = true;
        while (progress) {
            progress = false;
            let toReveal = new Set();
            let toFlag = new Set();

            simRevealed.forEach(idx => {
                let neighborIds = getNeighbors(idx);
                let actualBombs = 0;
                neighborIds.forEach(nid => { if(currentBombIndices.includes(nid)) actualBombs++; });
                if (actualBombs === 0) return;
                let hidden = [], flagged = 0;
                neighborIds.forEach(nid => {
                    if (simHidden.has(nid)) hidden.push(nid);
                    if (simFlags.has(nid)) flagged++;
                });
                if (hidden.length > 0 && hidden.length === (actualBombs - flagged)) hidden.forEach(h => toFlag.add(h));
                if (hidden.length > 0 && flagged === actualBombs) hidden.forEach(h => toReveal.add(h));
            });

            toFlag.forEach(id => { if(!simFlags.has(id)) { simFlags.add(id); simHidden.delete(id); progress = true; } });
            let checkQueue = Array.from(toReveal);
            toReveal.forEach(id => {
                if(!simRevealed.has(id) && !simFlags.has(id)) {
                    simRevealed.add(id); simHidden.delete(id); progress = true;
                }
            });
            while(checkQueue.length > 0) {
                let curr = checkQueue.pop();
                let isZero = true;
                getNeighbors(curr).forEach(nid => { if(currentBombIndices.includes(nid)) isZero = false; });
                if(isZero) {
                    getNeighbors(curr).forEach(nid => {
                        if(simHidden.has(nid) && !simFlags.has(nid)) {
                            simRevealed.add(nid); simHidden.delete(nid); checkQueue.push(nid);
                        }
                    });
                }
            }
        }
        return (simRevealed.size + currentBombIndices.length) === totalCells;
    }

    // --- 4. CLICK HANDLERS ---
    
    function sendProgressUpdate() {
        if (!isOnline) return;
        const totalSafeCells = width * height - bombCount;
        let checkedCount = 0;
        for (let i = 0; i < squares.length; i++) {
            if (squares[i].classList.contains('checked')) checkedCount++;
        }
        const percent = Math.floor((checkedCount / totalSafeCells) * 100);
        myProgress.style.width = `${percent}%`;
        socket.emit('update_progress', { roomId: currentRoomId, percent });
    }

    function click(square) {
        if (!isGameActive && !isFirstClick) return; 
        if (isGameOver || square.classList.contains('flag')) return;

        let currentId = parseInt(square.id);

        if (square.classList.contains('checked')) {
            let total = parseInt(square.getAttribute('data-total'));
            let flagCount = 0;
            let neighbors = getNeighbors(currentId);
            neighbors.forEach(nid => { if (squares[nid].classList.contains('flag')) flagCount++; });
            if (total === flagCount) {
                neighbors.forEach(nid => {
                    if (!squares[nid].classList.contains('checked') && !squares[nid].classList.contains('flag')) click(squares[nid]);
                });
            }
            return;
        }

        if (isFirstClick) {
            if (!isOnline) {
                placeBombs(currentId);
                finalizeBoard(document.querySelectorAll('.bomb').length ? [] : []);
                let total = 0;
                getNeighbors(currentId).forEach(nId => { if(squares[nId].classList.contains('bomb')) total++; });
                square.setAttribute('data-total', total);
            }
            isFirstClick = false;
            startTimer();
        }

        if (square.classList.contains('bomb')) {
            gameOver(square);
        } else {
            let total = parseInt(square.getAttribute('data-total'));
            if (isNaN(total)) total = 0; 
            
            if (total !== 0) {
                square.classList.add('checked');
                square.innerText = total;
                square.setAttribute('data-val', total);
                sendProgressUpdate(); 
            } else {
                checkSquare(currentId); 
            }
            checkForWin();
        }
    }

    function checkSquare(startId) {
        let stack = [startId];
        while (stack.length > 0) {
            let currentId = stack.pop();
            const sq = squares[currentId];
            if (sq.classList.contains('checked') || sq.classList.contains('flag')) continue;

            sq.classList.add('checked');
            let total = parseInt(sq.getAttribute('data-total'));
            if (isNaN(total)) total = 0;

            if (total !== 0) {
                sq.innerText = total;
                sq.setAttribute('data-val', total);
            } else {
                const neighbors = getNeighbors(currentId);
                neighbors.forEach(nId => {
                    if (!squares[nId].classList.contains('checked') && !squares[nId].classList.contains('flag')) {
                        stack.push(nId);
                    }
                });
            }
        }
        sendProgressUpdate();
    }

    function getNeighbors(id) {
        const neighbors = [];
        const isLeft = (id % width === 0);
        const isRight = (id % width === width - 1);
        if (id >= width) { neighbors.push(id - width); if (!isLeft) neighbors.push(id - 1 - width); if (!isRight) neighbors.push(id + 1 - width); }
        if (id < width * (height - 1)) { neighbors.push(id + width); if (!isLeft) neighbors.push(id - 1 + width); if (!isRight) neighbors.push(id + 1 + width); }
        if (!isLeft) neighbors.push(id - 1); if (!isRight) neighbors.push(id + 1);
        return neighbors;
    }

    function addFlag(square) {
        if (isGameOver || (!isGameActive && !isFirstClick)) return;
        if (!square.classList.contains('checked')) {
            if (!square.classList.contains('flag')) {
                if (flags < bombCount) {
                    square.classList.add('flag'); square.innerHTML = '🚩'; flags++;
                    bombCountDisplay.innerText = (bombCount - flags).toString().padStart(3, '0');
                }
            } else {
                square.classList.remove('flag'); square.innerHTML = ''; flags--;
                bombCountDisplay.innerText = (bombCount - flags).toString().padStart(3, '0');
            }
            checkForWin();
        }
    }

    function checkForWin() {
        let checkedCount = 0;
        for (let i = 0; i < squares.length; i++) {
            if (squares[i].classList.contains('checked')) checkedCount++;
        }
        if (checkedCount === (width * height - bombCount)) {
            isWin = true;
            isGameOver = true;
            isGameActive = false; // KHÓA BÀN CỜ
            
            resultDisplay.innerText = 'BẠN THẮNG!';
            resultDisplay.style.color = '#4CAF50';
            smiley.innerText = '😎';
            
            clearInterval(timerId);
            if(window.confetti) confetti();
            
            if(isOnline) {
                socket.emit('i_won', currentRoomId);
            }
        }
    }

    function gameOver(square) {
        isGameOver = true;
        isGameActive = false; // KHÓA BÀN CỜ
        resultDisplay.innerText = 'GAME OVER!';
        resultDisplay.style.color = 'red';
        smiley.innerText = '😵';
        clearInterval(timerId);
        
        squares.forEach(sq => {
            if (sq.classList.contains('bomb')) {
                sq.innerHTML = '💣';
                sq.classList.add('checked');
                if (square && sq === square) sq.style.backgroundColor = 'red';
            }
        });
    }

    function startTimer() {
        clearInterval(timerId);
        timerId = setInterval(() => {
            timeElapsed++;
            timerDisplay.innerText = timeElapsed.toString().padStart(3, '0');
        }, 1000);
    }
    
    // UI Handlers
    levelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if(isOnline) return;
            const level = btn.getAttribute('data-level');
            if (level === 'custom') {
                customMenu.classList.remove('hidden');
            } else {
                levelBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                initGame(level);
                isGameActive = true;
            }
        });
    });

    smiley.addEventListener('click', () => {
        if(isOnline) return; 
        initGame(currentLevelMode); 
        isGameActive = true;
    });
});