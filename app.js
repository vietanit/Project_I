document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid');
  const bombCountEl = document.getElementById('bomb-count');
  const timerEl = document.getElementById('timer');
  const smiley = document.getElementById('smiley');
  const result = document.getElementById('result');
  const bestTimeEl = document.getElementById('best-time');
  const themeToggle = document.getElementById('theme-toggle');
  const customSettings = document.getElementById('custom-settings');
  const customBtn = document.getElementById('custom-btn');
  const applyCustom = document.getElementById('apply-custom');
  const errorMessage = document.getElementById('error-message');

  let width, height, bombAmount, totalCells;
  let squares = [];
  let flags = 0;
  let revealedCount = 0;
  let isGameOver = false;
  let timerInterval;
  let seconds = 0;
  let firstClick = true;
  let currentLevel = 'medium';

  const levels = {
    easy:   { w: 9,  h: 9,  bombs: 10 },
    medium: { w: 16, h: 16, bombs: 40 },
    hard:   { w: 30, h: 16, bombs: 99 }
  };

  // --- Các Event Listener giữ nguyên như cũ ---
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
  });

  customBtn.addEventListener('click', () => customSettings.classList.toggle('show'));

  applyCustom.addEventListener('click', () => {
    const w = parseInt(document.getElementById('custom-width').value);
    const h = parseInt(document.getElementById('custom-height').value);
    const b = parseInt(document.getElementById('custom-bombs').value);

    if (isNaN(w) || isNaN(h) || isNaN(b)) return;

    const maxBombs = Math.floor(w * h * 0.8);
    if (b < 1 || b > maxBombs) {
      errorMessage.textContent = `Số bom phải từ 1 đến ${maxBombs} (80% số ô)`;
      errorMessage.classList.add('show');
      return;
    }

    errorMessage.classList.remove('show');
    levels.custom = { w, h, bombs: b };
    currentLevel = 'custom';
    customSettings.classList.remove('show');
    document.querySelectorAll('.levels button').forEach(btn => btn.classList.remove('active'));
    customBtn.classList.add('active');
    initGame('custom');
  });

  document.querySelectorAll('.levels button:not(#custom-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.levels button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customSettings.classList.remove('show');
      initGame(btn.dataset.level);
    });
  });

  smiley.addEventListener('click', () => initGame(currentLevel));


  // --- INIT GAME ---
  function initGame(level = 'medium') {
    clearInterval(timerInterval);
    seconds = 0;
    timerEl.textContent = '000';
    firstClick = true;
    isGameOver = false;
    flags = 0;
    revealedCount = 0;
    result.textContent = '';
    smiley.textContent = '🙂';
    
    if (level === 'custom' && !levels.custom) level = 'medium';
    currentLevel = level;

    const config = levels[level];
    width = config.w;
    height = config.h;
    bombAmount = config.bombs;
    totalCells = width * height;

    grid.style.width = `${Math.min(width * 32, window.innerWidth - 20)}px`;
    grid.innerHTML = '';
    squares = [];

    bombCountEl.textContent = bombAmount.toString().padStart(3, '0');
    loadBestTime(level);

    for (let i = 0; i < totalCells; i++) {
      const square = document.createElement('div');
      square.classList.add('square');
      square.dataset.id = i;
      square.addEventListener('click', () => leftClick(square));
      square.addEventListener('contextmenu', e => {
        e.preventDefault();
        rightClick(square);
      });
      grid.appendChild(square);
      squares.push(square);
    }
  }

  // ============ LOGIC ĐÃ ĐƯỢC SỬA VÀ TỐI ƯU ============

  function resetBoardState() {
    squares.forEach(sq => {
      sq.className = 'square'; // Reset class nhanh hơn
      sq.textContent = '';
      sq.removeAttribute('data-number');
    });
  }

  // Thuật toán xáo trộn Fisher-Yates (Tạo ngẫu nhiên chuẩn xác nhất)
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function generateNoGuessingBombs(startId) {
    // Ở mức khó, giới hạn số lần thử để tránh treo máy.
    // Nếu quá khó tạo bảng No Guessing (do mật độ bom cao), sẽ dùng bảng ngẫu nhiên.
    const maxAttempts = 50; 
    let attempts = 0;
    
    const forbiddenZone = new Set([startId, ...getNeighbors(startId)]);

    while (attempts < maxAttempts) {
      attempts++;
      resetBoardState();

      // 1. Tạo danh sách tất cả các ô có thể đặt bom
      const candidates = [];
      for (let i = 0; i < totalCells; i++) {
        if (!forbiddenZone.has(i)) candidates.push(i);
      }

      // 2. Xáo trộn và lấy N ô đầu tiên (Cách tối ưu nhất để rải bom)
      shuffleArray(candidates);
      const bombIndices = candidates.slice(0, bombAmount);
      
      // 3. Đặt bom
      bombIndices.forEach(idx => squares[idx].classList.add('bomb'));

      // 4. Tính số
      calculateNumbers();

      // 5. Kiểm tra tính giải được
      if (isSolvableNoGuessing(startId)) {
        console.log(`Tạo thành công sau ${attempts} lần thử.`);
        return;
      }
    }

    // Nếu thất bại, dùng fallback (Random thuần túy)
    console.log('Chuyển sang chế độ Random (Fallback)');
    resetBoardState();
    generateFallbackBombs(startId);
    calculateNumbers();
  }

  // Hàm tạo bom dự phòng (Sử dụng Fisher-Yates để đảm bảo không bị dồn cục)
  function generateFallbackBombs(startId) {
    const forbiddenZone = new Set([startId, ...getNeighbors(startId)]);
    const candidates = [];
    for (let i = 0; i < totalCells; i++) {
      if (!forbiddenZone.has(i)) candidates.push(i);
    }
    shuffleArray(candidates);
    const bombIndices = candidates.slice(0, bombAmount);
    bombIndices.forEach(idx => squares[idx].classList.add('bomb'));
  }

  // Logic giải đố mô phỏng (Đã tối ưu hóa tốc độ)
  function isSolvableNoGuessing(startId) {
    const simRevealed = new Set();
    const simBombs = new Set();
    const toRevealQueue = [startId]; // Dùng hàng đợi thay vì đệ quy
    
    // Hàm phụ: mở an toàn một ô trong mô phỏng
    const safeReveal = (id) => {
        if (simRevealed.has(id) || simBombs.has(id)) return;
        simRevealed.add(id);
        
        const numStr = squares[id].getAttribute('data-number');
        const num = numStr ? parseInt(numStr) : 0;
        
        // Nếu là ô 0, thêm tất cả hàng xóm vào hàng đợi để mở tiếp
        if (num === 0) {
            getNeighbors(id).forEach(n => {
                if (!simRevealed.has(n)) toRevealQueue.push(n);
            });
        }
    };

    // Bước 1: Mở vùng khởi đầu
    while(toRevealQueue.length > 0) {
        const id = toRevealQueue.shift();
        safeReveal(id);
    }

    // Bước 2: Vòng lặp logic
    let changed = true;
    while (changed) {
      changed = false;
      
      // Chỉ duyệt qua các ô "biên" (đã mở nhưng chưa xử lý hết hàng xóm)
      // Để tối ưu, ta có thể duy trì danh sách biên, nhưng duyệt toàn bộ simRevealed cũng ổn
      for (const i of simRevealed) {
        const numStr = squares[i].getAttribute('data-number');
        const num = numStr ? parseInt(numStr) : 0;
        if (num === 0) continue; // Ô 0 đã được xử lý tự động ở trên

        const neighbors = getNeighbors(i);
        const unknownNeighbors = [];
        let foundBombsCount = 0;

        // Phân loại hàng xóm
        for (const n of neighbors) {
            if (simBombs.has(n)) {
                foundBombsCount++;
            } else if (!simRevealed.has(n)) {
                unknownNeighbors.push(n);
            }
        }

        if (unknownNeighbors.length === 0) continue;

        // Logic A: Nếu số bom đã tìm thấy == số trên ô -> MỞ các ô còn lại
        if (foundBombsCount === num) {
          unknownNeighbors.forEach(n => {
             // Thêm vào hàng đợi để xử lý lan truyền ngay lập tức nếu nó là 0
             if (!simRevealed.has(n)) {
                 toRevealQueue.push(n);
                 changed = true;
             }
          });
        }
        
        // Logic B: Nếu số ô chưa biết + số bom đã tìm == số trên ô -> ĐÁNH CỜ các ô còn lại
        else if (foundBombsCount + unknownNeighbors.length === num) {
          unknownNeighbors.forEach(n => {
             if (!simBombs.has(n)) {
                 simBombs.add(n);
                 changed = true;
             }
          });
        }
      }

      // Xử lý hàng đợi mở rộng (Flood fill) ngay trong vòng lặp logic
      while(toRevealQueue.length > 0) {
          const id = toRevealQueue.shift();
          safeReveal(id);
          // Việc mở thêm ô mới có thể tạo ra dữ kiện mới, nên cần lặp lại logic
          changed = true; 
      }
    }

    // Nếu tổng số ô đã xác định (Mở + Bom) == Tổng số ô -> Giải thành công
    return (simRevealed.size + simBombs.size) === totalCells;
  }

  function calculateNumbers() {
    for (let i = 0; i < totalCells; i++) {
      if (squares[i].classList.contains('bomb')) continue;
      let count = 0;
      getNeighbors(i).forEach(n => {
        if (squares[n].classList.contains('bomb')) count++;
      });
      if (count > 0) squares[i].setAttribute('data-number', count);
    }
  }

  function getNeighbors(id) {
    const x = id % width;
    const y = Math.floor(id / width);
    const neighbors = [];
    // Sử dụng mảng cố định để loop nhanh hơn
    const offsets = [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]];
    
    for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            neighbors.push(ny * width + nx);
        }
    }
    return neighbors;
  }

  // --- GAMEPLAY FUNCTIONS (Giữ nguyên logic hiển thị) ---

  function reveal(square) {
    if (square.classList.contains('revealed') || square.classList.contains('flag')) return;
    
    square.classList.add('revealed');
    revealedCount++;

    const number = square.getAttribute('data-number');
    if (number) {
      square.textContent = number;
      square.classList.add(`num${number}`);
      return;
    }

    const id = parseInt(square.dataset.id);
    getNeighbors(id).forEach(nid => {
        const neighbor = squares[nid];
        if (!neighbor.classList.contains('revealed') && !neighbor.classList.contains('flag')) {
            reveal(neighbor);
        }
    });
  }

  function leftClick(square) {
    if (isGameOver || square.classList.contains('flag')) return;

    if (square.classList.contains('revealed') && square.getAttribute('data-number')) {
      chordClick(square);
      return;
    }
    if (square.classList.contains('revealed')) return;

    if (firstClick) {
      firstClick = false;
      generateNoGuessingBombs(parseInt(square.dataset.id));
      startTimer();
    }

    if (square.classList.contains('bomb')) {
      gameOver(false);
      return;
    }

    reveal(square);
    checkWin();
  }

  function chordClick(square) {
    const id = parseInt(square.dataset.id);
    const number = parseInt(square.getAttribute('data-number'));
    const neighbors = getNeighbors(id);
    let flagCount = 0;
    
    neighbors.forEach(nid => {
      if (squares[nid].classList.contains('flag')) flagCount++;
    });

    if (flagCount === number) {
      neighbors.forEach(nid => {
        const neighbor = squares[nid];
        if (!neighbor.classList.contains('revealed') && !neighbor.classList.contains('flag')) {
          if (neighbor.classList.contains('bomb')) {
            gameOver(false);
            return; 
          }
          reveal(neighbor);
        }
      });
      checkWin();
    }
  }

  function rightClick(square) {
    if (isGameOver || square.classList.contains('revealed')) return;
    square.classList.toggle('flag');
    if (square.classList.contains('flag')) {
      flags++;
      square.textContent = '🚩';
    } else {
      flags--;
      square.textContent = '';
    }
    bombCountEl.textContent = (bombAmount - flags).toString().padStart(3, '0');
  }

  function gameOver(won) {
    isGameOver = true;
    clearInterval(timerInterval);
    smiley.textContent = won ? '😎' : '💀';

    squares.forEach(sq => {
      if (sq.classList.contains('bomb')) {
        sq.innerHTML = '💣';
        sq.classList.add('revealed', 'bomb-revealed');
      }
    });

    result.textContent = won ? '🎉 BẠN ĐÃ THẮNG! 🎉' : '💥 BÙM! Thử lại nhé...';
    result.style.color = won ? 'green' : 'red';

    if (won) {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
      }
      saveBestTime();
    }
  }

  function checkWin() {
    if (revealedCount + bombAmount === totalCells) {
      gameOver(true);
    }
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = seconds.toString().padStart(3, '0');
    }, 1000);
  }

  function saveBestTime() {
    const key = `minesweeper_best_${width}x${height}_${bombAmount}`;
    const currentBest = localStorage.getItem(key);
    if (!currentBest || seconds < parseInt(currentBest)) {
      localStorage.setItem(key, seconds);
      bestTimeEl.textContent = seconds;
    }
  }

  function loadBestTime(level) {
    let config;
    if (level === 'custom') {
        config = levels.custom || { w: width, h: height, bombs: bombAmount };
        if (!config || !config.w) return;
    } else {
        config = levels[level];
    }
    const key = `minesweeper_best_${config.w}x${config.h}_${config.bombs}`;
    const best = localStorage.getItem(key);
    bestTimeEl.textContent = best ? best : '---';
  }

  // Khởi chạy
  initGame('medium');
});