document.addEventListener('DOMContentLoaded', () => {
    // --- CẤU HÌNH ---
    const LEVELS = {
        easy: { width: 9, height: 9, bombs: 10 },
        medium: { width: 16, height: 16, bombs: 40 },
        hard: { width: 30, height: 16, bombs: 99 } // No Guessing trên Hard có thể mất 1-2 giây để tạo map
    };
    
    // --- BIẾN TRẠNG THÁI ---
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

    // --- DOM ELEMENTS ---
    const grid = document.getElementById('grid');
    const bombCountDisplay = document.getElementById('bomb-count');
    const timerDisplay = document.getElementById('timer');
    const smiley = document.getElementById('smiley');
    const resultDisplay = document.getElementById('result');
    const levelBtns = document.querySelectorAll('.levels button[data-level]');
    const customSettings = document.getElementById('custom-settings');
    const applyCustomBtn = document.getElementById('apply-custom');
    const themeToggle = document.getElementById('theme-toggle');
    const bestTimeDisplay = document.getElementById('best-time');

    // --- KHỞI TẠO GAME ---
    function initGame(level = 'medium') {
        isGameOver = false;
        isWin = false;
        isFirstClick = true;
        flags = 0;
        squares = [];
        timeElapsed = 0;
        clearInterval(timerId);
        timerDisplay.innerText = '000';
        resultDisplay.innerText = '';
        smiley.innerText = '🙂';
        grid.innerHTML = '';
        
        if (level !== 'custom') {
            width = LEVELS[level].width;
            height = LEVELS[level].height;
            bombCount = LEVELS[level].bombs;
            customSettings.classList.remove('show');
        } else {
            customSettings.classList.add('show');
            return; 
        }

        startBoard();
    }

    function startBoard() {
        bombCountDisplay.innerText = bombCount.toString().padStart(3, '0');
        grid.style.gridTemplateColumns = `repeat(${width}, 30px)`;
        grid.style.width = 'fit-content';
        
        for (let i = 0; i < width * height; i++) {
            const square = document.createElement('div');
            square.setAttribute('id', i);
            square.classList.add('square');
            
            square.addEventListener('click', () => click(square));
            square.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                addFlag(square);
            });
            square.addEventListener('mousedown', () => { if(!isGameOver) smiley.innerText = '😮'; });
            square.addEventListener('mouseup', () => { if(!isGameOver) smiley.innerText = '🙂'; });

            grid.appendChild(square);
            squares.push(square);
        }
    }

    // --- HELPER CHO NO GUESSING ---
    // Dọn dẹp dữ liệu bàn cờ để thử tạo lại
    function resetBoardDataForRetry() {
        squares.forEach(sq => {
            sq.classList.remove('bomb', 'valid');
            sq.removeAttribute('data');
            sq.removeAttribute('data-total');
        });
    }

    // --- LOGIC TẠO MAP NO GUESSING ---
    function placeBombs(firstClickIndex) {
        letAttempts = 0;
        const maxAttempts = 500; // Giới hạn số lần thử để tránh treo trình duyệt
        let isSolvable = false;
        let finalBombIndices = [];

        // Vòng lặp Tạo và Kiểm tra
        do {
            letAttempts++;
            resetBoardDataForRetry();

            // 1. Xác định vùng an toàn cho click đầu
            const neighbors = getNeighbors(firstClickIndex);
            const safeZone = [firstClickIndex, ...neighbors];

            // 2. Tìm vị trí hợp lệ
            let validLocations = [];
            for (let i = 0; i < width * height; i++) {
                if (!safeZone.includes(i)) {
                    validLocations.push(i);
                }
            }

            // 3. Rải bom ngẫu nhiên
            validLocations.sort(() => Math.random() - 0.5);
            let actualBombsCount = Math.min(bombCount, validLocations.length);
            finalBombIndices = validLocations.slice(0, actualBombsCount);

            // 4. CHẠY MÔ PHỎNG GIẢI ĐỐ (Solver Simulation)
            // Nếu đây là lần thử cuối cùng, chấp nhận luôn map đó dù có phải đoán hay không
            if (letAttempts >= maxAttempts) {
                console.log("Max attempts reached. Using best effort map.");
                isSolvable = true; 
            } else {
                 // Kiểm tra xem map vừa tạo có giải được bằng logic không
                isSolvable = runSolverSimulation(finalBombIndices, safeZone);
            }

        } while (!isSolvable);

        console.log(`Map generated in ${letAttempts} attempts.`);

        // 5. Áp dụng vị trí bom đã chọn vào bàn cờ thật
        finalizeBoard(finalBombIndices);
    }

    // Áp dụng bom và tính số sau khi đã chốt map
    function finalizeBoard(bombIndices) {
        squares.forEach((sq, index) => {
            if (bombIndices.includes(index)) {
                sq.classList.add('bomb');
                sq.setAttribute('data', 'bomb');
            } else {
                sq.classList.add('valid');
                sq.setAttribute('data', 'valid');
            }
        });
        
        for (let i = 0; i < squares.length; i++) {
            if (squares[i].classList.contains('bomb')) continue;
            let total = 0;
            const n = getNeighbors(i);
            n.forEach(neighborId => {
                if (squares[neighborId].classList.contains('bomb')) total++;
            });
            squares[i].setAttribute('data-total', total);
        }
    }


    // --- THUẬT TOÁN MÔ PHỎNG NGƯỜI CHƠI (SOLVER) ---
    function runSolverSimulation(currentBombIndices, initialSafeZone) {
        let totalCells = width * height;
        let simRevealed = new Set([...initialSafeZone]); // Những ô AI đã mở
        let simFlags = new Set(); // Những ô AI đã cắm cờ
        let simHidden = new Set(); // Những ô còn ẩn

        // Khởi tạo danh sách ô ẩn
        for(let i=0; i<totalCells; i++) {
            if(!simRevealed.has(i)) simHidden.add(i);
        }

        let progressMade = true;

        // Vòng lặp chính: Chạy liên tục miễn là còn suy luận được bước mới
        while (progressMade) {
            progressMade = false;
            let cellsToReveal = new Set();
            let cellsToFlag = new Set();

            // Duyệt qua tất cả các ô đã mở có số > 0 (biên giới của vùng đã mở)
            simRevealed.forEach(index => {
                 // Tính toán số bom thực tế xung quanh ô này (AI biết số này khi ô đã mở)
                let actualNumber = 0;
                let myNeighbors = getNeighbors(index);
                myNeighbors.forEach(nId => {
                    if(currentBombIndices.includes(nId)) actualNumber++;
                });

                if (actualNumber === 0) return; // Ô số 0 không cung cấp thông tin

                let hiddenNeighbors = [];
                let flaggedNeighbors = 0;

                myNeighbors.forEach(nId => {
                    if (simHidden.has(nId)) hiddenNeighbors.push(nId);
                    if (simFlags.has(nId)) flaggedNeighbors++;
                });

                // RULE 1: Basic Flagging logic
                // Nếu số ô ẩn bằng chính con số của ô đó -> Tất cả ô ẩn là bom
                // Ví dụ: Số 2, có 2 ô ẩn xung quanh và 0 cờ -> Cả 2 ô ẩn phải là bom
                if (hiddenNeighbors.length > 0 && hiddenNeighbors.length === (actualNumber - flaggedNeighbors)) {
                    hiddenNeighbors.forEach(hiddenId => cellsToFlag.add(hiddenId));
                }

                // RULE 2: Basic Clearing logic (Chording simulation)
                // Nếu số cờ xung quanh đã bằng con số của ô đó -> Tất cả ô ẩn còn lại là an toàn
                // Ví dụ: Số 2, đã có 2 cờ xung quanh -> Mở các ô ẩn còn lại
                if (hiddenNeighbors.length > 0 && flaggedNeighbors === actualNumber) {
                    hiddenNeighbors.forEach(hiddenId => cellsToReveal.add(hiddenId));
                }
            });

            // Áp dụng các suy luận mới
            cellsToFlag.forEach(id => {
                if (!simFlags.has(id)) {
                    simFlags.add(id);
                    simHidden.delete(id);
                    progressMade = true; // Đã có tiến triển
                }
            });

            cellsToReveal.forEach(id => {
                if (!simRevealed.has(id) && !simFlags.has(id)) {
                    simRevealed.add(id);
                    simHidden.delete(id);
                    progressMade = true; // Đã có tiến triển
                }
            });

            // Mở lan (Flood fill) cho các ô số 0 mới được mở trong mô phỏng
            let newlyRevealedArr = Array.from(cellsToReveal);
            while(newlyRevealedArr.length > 0) {
                 let currentId = newlyRevealedArr.pop();
                 // Kiểm tra xem ô này có phải số 0 không
                 let isZero = true;
                 getNeighbors(currentId).forEach(nId => {
                     if(currentBombIndices.includes(nId)) isZero = false;
                 });
                 
                 if(isZero) {
                    getNeighbors(currentId).forEach(nId => {
                        if(simHidden.has(nId) && !simFlags.has(nId)) {
                            simRevealed.add(nId);
                            simHidden.delete(nId);
                            newlyRevealedArr.push(nId); // Thêm vào hàng đợi để tiếp tục kiểm tra loang
                        }
                    });
                 }
            }
        }

        // Kết thúc mô phỏng: Kiểm tra xem số ô đã mở + số bom có bằng tổng số ô không
        // Nếu bằng, nghĩa là AI đã giải quyết được toàn bộ bàn cờ mà không cần đoán.
        return (simRevealed.size + currentBombIndices.length) === totalCells;
    }


    // --- CÁC HÀM XỬ LÝ GAMEPLAY CHÍNH (GIỮ NGUYÊN TỪ CODE CŨ) ---
    // Xử lý Click trái
    function click(square) {
        let currentId = parseInt(square.id);

        if (isGameOver || square.classList.contains('flag')) return;

        // Logic Chording
        if (square.classList.contains('checked')) {
            let total = parseInt(square.getAttribute('data-total'));
            let neighbors = getNeighbors(currentId);
            let flagCount = 0;

            neighbors.forEach(nId => {
                if (squares[nId].classList.contains('flag')) flagCount++;
            });

            if (total === flagCount) {
                neighbors.forEach(nId => {
                    if (!squares[nId].classList.contains('checked') && !squares[nId].classList.contains('flag')) {
                        click(squares[nId]);
                    }
                });
            }
            return;
        }

        // XỬ LÝ CLICK ĐẦU TIÊN
        if (isFirstClick) {
            // Gọi hàm placeBombs mới (có tích hợp No Guessing)
            placeBombs(currentId); 
            isFirstClick = false;
            startTimer();
            checkSquare(currentId);
            checkForWin();
            return; 
        }

        // CÁC CLICK TIẾP THEO
        if (square.classList.contains('bomb')) {
            gameOver(square);
        } else {
            let total = parseInt(square.getAttribute('data-total'));
            if (total !== 0) {
                square.classList.add('checked');
                square.innerText = total;
                square.setAttribute('data-val', total);
                checkForWin();
            } else {
                checkSquare(currentId);
                checkForWin();
            }
        }
    }

    // Đệ quy mở ô trống (Flood Fill)
    function checkSquare(currentId) {
        const isLeftEdge = (currentId % width === 0);
        const isRightEdge = (currentId % width === width - 1);

        setTimeout(() => {
            if (squares[currentId].classList.contains('checked') || squares[currentId].classList.contains('flag')) return;
            
            squares[currentId].classList.add('checked');
            
            let total = parseInt(squares[currentId].getAttribute('data-total'));
            
            if (total !== 0) {
                squares[currentId].innerText = total;
                squares[currentId].setAttribute('data-val', total);
                return;
            }

            const neighbors = getNeighbors(currentId);
            neighbors.forEach(nId => checkSquare(nId));
        }, 10);
    }

    // Lấy danh sách ID hàng xóm
    function getNeighbors(id) {
        const neighbors = [];
        const isLeftEdge = (id % width === 0);
        const isRightEdge = (id % width === width - 1);

        if (id >= width) {
            neighbors.push(id - width);
            if (!isLeftEdge) neighbors.push(id - 1 - width);
            if (!isRightEdge) neighbors.push(id + 1 - width);
        }
        if (id < width * (height - 1)) {
            neighbors.push(id + width);
            if (!isLeftEdge) neighbors.push(id - 1 + width);
            if (!isRightEdge) neighbors.push(id + 1 + width);
        }
        if (!isLeftEdge) neighbors.push(id - 1);
        if (!isRightEdge) neighbors.push(id + 1);

        return neighbors;
    }

    // Xử lý cắm cờ
    function addFlag(square) {
        if (isGameOver) return;
        if (!square.classList.contains('checked')) {
            if (!square.classList.contains('flag')) {
                if (flags < bombCount) {
                    square.classList.add('flag');
                    square.innerHTML = '🚩';
                    flags++;
                    bombCountDisplay.innerText = (bombCount - flags).toString().padStart(3, '0');
                    checkForWin();
                }
            } else {
                square.classList.remove('flag');
                square.innerHTML = '';
                flags--;
                bombCountDisplay.innerText = (bombCount - flags).toString().padStart(3, '0');
            }
        }
    }

    function checkForWin() {
        let matches = 0;
        let checkedCount = 0; 
        
        for (let i = 0; i < squares.length; i++) {
            if (squares[i].classList.contains('checked')) {
                checkedCount++;
            }
        }

        if (checkedCount === (width * height - bombCount)) {
            isWin = true;
            isGameOver = true;
            resultDisplay.innerText = 'YOU WIN!';
            smiley.innerText = '😎';
            clearInterval(timerId);
            
            squares.forEach(sq => {
                if (sq.classList.contains('bomb') && !sq.classList.contains('flag')) {
                    sq.classList.add('flag');
                    sq.innerHTML = '🚩';
                }
            });

            const currentBest = parseFloat(localStorage.getItem('minesweeper-best')) || 9999;
            if (timeElapsed < currentBest) {
                localStorage.setItem('minesweeper-best', timeElapsed);
                bestTimeDisplay.innerText = timeElapsed;
            }

            if (window.confetti) {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        }
    }

    function gameOver(square) {
        isGameOver = true;
        resultDisplay.innerText = 'GAME OVER!';
        smiley.innerText = '😵';
        clearInterval(timerId);

        squares.forEach(sq => {
            if (sq.classList.contains('bomb')) {
                sq.innerHTML = '💣';
                sq.classList.add('checked');
                if (sq === square) sq.style.backgroundColor = 'red'; 
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

    // Handle Custom Settings
    applyCustomBtn.addEventListener('click', () => {
        const w = parseInt(document.getElementById('custom-width').value);
        const h = parseInt(document.getElementById('custom-height').value);
        const b = parseInt(document.getElementById('custom-bombs').value);
        const errorMsg = document.getElementById('error-message');

        if (b >= (w * h - 9)) {
            errorMsg.innerText = "Quá nhiều bom! Phải chừa khoảng trống.";
            errorMsg.style.display = 'block';
            return;
        }
        errorMsg.style.display = 'none';
        
        width = w;
        height = h;
        bombCount = b;
        startBoard();
        customSettings.classList.remove('show');
    });

    levelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            levelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const level = btn.getAttribute('data-level');
            initGame(level);
        });
    });

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        themeToggle.innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    });

    smiley.addEventListener('click', () => {
        const activeBtn = document.querySelector('.levels button.active');
        const level = activeBtn ? activeBtn.getAttribute('data-level') : 'medium';
        if (level === 'custom') {
            grid.innerHTML = '';
            squares = [];
            isGameOver = false;
            isFirstClick = true;
            flags = 0;
            timeElapsed = 0;
            bombCountDisplay.innerText = bombCount;
            timerDisplay.innerText = '000';
            smiley.innerText = '🙂';
            resultDisplay.innerText = '';
            startBoard();
        } else {
            initGame(level);
        }
    });

    bestTimeDisplay.innerText = localStorage.getItem('minesweeper-best') || '--';
    initGame('medium');
});