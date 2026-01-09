document.addEventListener('DOMContentLoaded', () => {
    // --- CẤU HÌNH ---
    const LEVELS = {
        easy: { width: 9, height: 9, bombs: 10 },
        medium: { width: 16, height: 16, bombs: 40 },
        hard: { width: 30, height: 16, bombs: 99 }
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

    // --- LOGIC GAME QUAN TRỌNG: Rải bom tránh vùng click ---
    function placeBombs(firstClickIndex) {
        // 1. Xác định "Vùng an toàn" (Safe Zone)
        const neighbors = getNeighbors(firstClickIndex);
        const safeZone = [firstClickIndex, ...neighbors];

        // 2. Tìm tất cả các vị trí còn lại trong bảng có thể đặt bom
        let validLocations = [];
        for (let i = 0; i < width * height; i++) {
            if (!safeZone.includes(i)) {
                validLocations.push(i);
            }
        }

        // 3. Xáo trộn danh sách vị trí hợp lệ
        validLocations.sort(() => Math.random() - 0.5);

        // 4. Lấy n vị trí đầu tiên để đặt bom
        let actualBombsCount = Math.min(bombCount, validLocations.length);
        const bombIndices = validLocations.slice(0, actualBombsCount);

        // 5. Cập nhật dữ liệu cho các ô trên bàn cờ
        squares.forEach((sq, index) => {
            sq.classList.remove('bomb', 'valid'); 
            
            if (bombIndices.includes(index)) {
                sq.classList.add('bomb');
                sq.setAttribute('data', 'bomb');
            } else {
                sq.classList.add('valid');
                sq.setAttribute('data', 'valid');
            }
        });
        
        // 6. Tính toán số bom xung quanh (data-total) cho TOÀN BỘ bảng
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

    // Xử lý Click trái (ĐÃ SỬA LOGIC CHORDING)
    function click(square) {
        let currentId = parseInt(square.id);

        // 1. Chỉ chặn nếu game over hoặc ô đó đang có cờ
        // (Bỏ chặn 'checked' ở đây để cho phép xử lý Chording)
        if (isGameOver || square.classList.contains('flag')) return;

        // --- MỚI: LOGIC CHORDING (Click vào ô số đã mở) ---
        if (square.classList.contains('checked')) {
            let total = parseInt(square.getAttribute('data-total'));
            let neighbors = getNeighbors(currentId);
            let flagCount = 0;

            // Đếm số lượng cờ xung quanh
            neighbors.forEach(nId => {
                if (squares[nId].classList.contains('flag')) flagCount++;
            });

            // Nếu số cờ bằng con số của ô -> Mở tất cả hàng xóm chưa mở
            if (total === flagCount) {
                neighbors.forEach(nId => {
                    // Chỉ click những ô chưa mở và chưa cắm cờ
                    if (!squares[nId].classList.contains('checked') && !squares[nId].classList.contains('flag')) {
                        click(squares[nId]); // Đệ quy gọi click cho ô hàng xóm
                    }
                });
            }
            return; // Xử lý xong Chording thì thoát, không chạy logic mở ô bên dưới
        }

        // --- XỬ LÝ CLICK ĐẦU TIÊN ---
        if (isFirstClick) {
            placeBombs(currentId); 
            isFirstClick = false;
            startTimer();
            checkSquare(currentId);
            checkForWin();
            return; 
        }

        // --- CÁC CLICK TIẾP THEO ---
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