/* global LEVELS, MATERIALS, THEMES, AntEngine */
(function () {
  'use strict';

  const SIZE = AntEngine.SIZE;
  const STORE_KEY = 'ant-painter-progress-v1';
  const REACH_KEY = 'ant-painter-reached-v1';
  const TIP_KEY = 'ant-painter-tips-v1';
  const SEED_KEY = 'ant-painter-last-seed-v1';
  const MAX_IN_FLIGHT = 8;
  const VISIBLE_ROWS = 3;
  const LONG_PRESS_MS = 420;
  const SLOT_CAPACITY_RESERVED = 6; // 仅预留：默认仍为 5 格；第 6 格由第 3 关道具临时启用。
  const MANUAL_SPEEDS = [1, 2, 4, 8];
  const ANT_W = 18;
  const ANT_H = 14;
  const PEEK_MS = 8000;
  const RUSH_MS = 8000;
  const RUSH_FACTOR = 2;
  const PREVIEW_NOTE_DEFAULT = '原图预览 · 长按令牌亮同色 · 再点还原';

  // 每次正常进入关卡都换一个新 seed；只有显式传入 {seed} 或 ?seed= 时才复现。
  // 生成器本身只依赖 (关卡, seed)，所以同 seed 必定得到同一队列。
  let seedSerial = 0;
  function nextQueueSeed(baseNo) {
    seedSerial++;
    let s = 0;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        s = a[0] >>> 0;
      }
    } catch (err) { /* file:// 或旧浏览器没有 crypto，用时间兜底 */ }
    if (!s) {
      const now = Date.now();
      const fine = (typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now() * 1000) : 0;
      s = ((now & 0xffffffff) ^ (fine & 0xffffffff) ^ Math.imul(seedSerial, 0x9E3779B9)) >>> 0;
    }
    s = (s ^ Math.imul((Number(baseNo) || 1) >>> 0, 0x85EBCA6B) ^ Math.imul(seedSerial, 0xC2B2AE35)) >>> 0;
    if (!s) s = 1;
    if (state.queueSeed && s === state.queueSeed) s = ((s + 0x9E3779B9) >>> 0) || 1;
    return s >>> 0;
  }

  // 四个本地免费道具：只在本关内生效，次数每关重置；
  // 解锁按「到达对应关」——进入该关即算到达，之后重玩前面关卡仍保持解锁。
  const PROPS = [
    { key: 'slot', name: '备用巢格', unlock: 3, uses: 1, short: '本关多开 1 个待令位（第 6 格）' },
    { key: 'peek', name: '预窥令', unlock: 4, uses: 2, short: '8 秒内看清每列隐藏的下一枚令牌' },
    { key: 'recall', name: '召回令', unlock: 8, uses: 1, short: '把一枚还没出巢的待令令牌退回原列队首' },
    { key: 'rush', name: '疾行令', unlock: 10, uses: 1, short: '8 秒内小画师移动与出巢加速 2 倍' }
  ];
  // 纯像素图标：12×12 网格，每格 1 个 viewBox 单位；渲染时只画实心矩形。
  const PROP_ICONS = {
    slot: [
      '............', '..########..', '..#......#..', '..#..##..#..', '..#..##..#..',
      '..#......#..', '..#......#..', '..#......#..', '..########..', '............', '............', '............'
    ],
    peek: [
      '............', '....####....', '..##....##..', '.#..####..#.', '#..#....#..#',
      '#..#.##.#..#', '.#..####..#.', '..##....##..', '....####....', '............', '............', '............'
    ],
    recall: [
      '............', '......#.....', '.....##.....', '....###.....', '...####.....',
      '..##########', '...####.....', '....###.....', '.....##.....', '......#.....', '............', '............'
    ],
    rush: [
      '.....###....', '....##......', '...##.......', '..######....', '.....##.....',
      '....##......', '...######...', '......##....', '.....##.....', '....##......', '...##.......', '............'
    ]
  };

  const COLORS = {
    C: { hex: '#c25f45', hi: '#eb956e', dark: '#7c352a', ink: '#24110c' },
    W: { hex: '#a97840', hi: '#d8ac6c', dark: '#674628', ink: '#241708' },
    M: { hex: '#6c9659', hi: '#a2c77f', dark: '#3b5c36', ink: '#12220f' },
    H: { hex: '#ddb052', hi: '#ffe29b', dark: '#8d6927', ink: '#2b1f08' },
    B: { hex: '#6f91a2', hi: '#b8d4df', dark: '#3b5b6b', ink: '#0d2028' },
    P: { hex: '#e18fa6', hi: '#ffc2d3', dark: '#8c455e', ink: '#35101b' },
    S: { hex: '#9ca79a', hi: '#cdd6c8', dark: '#58645b', ink: '#18201a' },
    N: { hex: '#4e6f7a', hi: '#89a9b2', dark: '#2e464f', ink: '#081418' },
    D: { hex: '#3d5a49', hi: '#6f9079', dark: '#22372a', ink: '#08130d' },
    L: { hex: '#a9c47f', hi: '#d6e9ad', dark: '#718c4d', ink: '#1b260d' },
    V: { hex: '#8a7ba7', hi: '#bcafd0', dark: '#5b4f73', ink: '#160f22' }
  };

  const $ = function (id) { return document.getElementById(id); };
  const app = $('app');
  const boardCanvas = $('boardCanvas');
  const boardFrame = $('boardFrame');
  const nestCanvas = $('nestCanvas');
  const slotsEl = $('slots');
  const matGrid = $('matGrid');
  const antsLayer = $('antsLayer');
  const previewCanvas = $('previewCanvas');
  const previewCard = $('previewCard');
  const previewNote = $('previewNote');
  const toastEl = $('toast');
  const overlayEl = $('overlay');
  const modalEl = $('modal');
  const tipBubble = $('tipBubble');
  const tipText = $('tipText');
  const hintChip = $('hintChip');

  const params = new URLSearchParams(location.search);
  const bootLevel = Math.max(0, Math.min(LEVELS.length - 1, parseInt(params.get('level') || '1', 10) - 1 || 0));
  const bootFromLevelParam = params.has('level');
  const bootSeed = parseInt(params.get('seed') || '0', 10) || 0;
  const THEME_LIST = (typeof THEMES !== 'undefined' && Array.isArray(THEMES)) ? THEMES : [];

  const state = {
    levelIndex: bootLevel,
    homeOpen: false,
    homeTheme: 0,
    queueSeed: 0,
    queueTokenCount: 0,
    game: null,
    analysis: null,
    phase: 'playing',
    multiplier: 1,
    manualMultiplier: 1,
    autoMultiplier: 1,
    motionScale: 1,
    runToken: 0,
    coordinator: null,
    tickTimer: 0,
    tickRunning: false,
    animating: new Set(),
    antViews: new Map(),
    spawnCursor: 0,
    modalOpen: false,
    popSlot: -1,
    incomingSlots: new Set(),
    pickLocks: new Set(),
    pickAnimating: false,
    slotSig: '',
    toastTimer: 0,
    hintColor: null,
    hintPhase: 0,
    hintTimer: 0,
    press: null,
    suppressClickUntil: 0,
    tipTimer: 0,
    tipKey: '',
    tipUntil: 0,
    tipQueue: [],
    tipSuspended: null,
    lastDead: null,
    previewOpen: false,
    departureLog: [],
    lastRouteStart: null,
    reachedMax: loadReached(),
    propUses: { slot: 0, peek: 0, recall: 0, rush: 0 },
    extraSlot: false,
    peekUntil: 0,
    rushUntil: 0,
    recallMode: false,
    propTimer: 0,
    propSig: '',
    tips: loadTips(),
    finished: loadProgress()
  };

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { done: [] };
      const p = JSON.parse(raw);
      if (!p || !Array.isArray(p.done)) return { done: [] };
      return { done: p.done.filter(function (n) { return Number.isInteger(n); }) };
    } catch (err) {
      return { done: [] };
    }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.finished)); } catch (err) { /* file:// 可能拒绝，玩法不受影响 */ }
  }
  function loadReached() {
    try {
      const n = parseInt(localStorage.getItem(REACH_KEY) || '0', 10);
      return Number.isInteger(n) && n > 0 ? n : 0;
    } catch (err) {
      return 0;
    }
  }
  function noteReached(no) {
    const n = Math.max(1, Number(no) || 1);
    if (n > state.reachedMax) {
      state.reachedMax = n;
      try { localStorage.setItem(REACH_KEY, String(n)); } catch (err) { /* 忽略 */ }
    }
  }
  function hasDone(no) { return state.finished.done.indexOf(no) !== -1; }
  function markDone(no) {
    if (!hasDone(no)) {
      state.finished.done.push(no);
      state.finished.done.sort(function (a, b) { return a - b; });
      saveProgress();
    }
  }
  function doneCount() {
    let n = 0;
    for (let i = 0; i < LEVELS.length; i++) if (hasDone(LEVELS[i].no)) n++;
    return n;
  }
  function isUnlocked(no) {
    if (no <= 1) return true;
    return hasDone(no - 1);
  }
  function firstUnfinishedUnlocked() {
    for (let i = 0; i < LEVELS.length; i++) {
      const no = LEVELS[i].no;
      if (!hasDone(no) && isUnlocked(no)) return i;
    }
    return LEVELS.length - 1;
  }

  function loadTips() {
    try {
      const raw = localStorage.getItem(TIP_KEY);
      if (!raw) return Object.create(null);
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : Object.create(null);
    } catch (err) {
      return Object.create(null);
    }
  }
  function saveTips() {
    try { localStorage.setItem(TIP_KEY, JSON.stringify(state.tips)); } catch (err) { /* 忽略 */ }
  }

  function color(k) { return COLORS[k] || COLORS.C; }

  function tokenTotal() {
    if (!state.game) return 0;
    return state.game.total;
  }

  function unpickedBlocks() {
    const game = state.game;
    let n = 0;
    for (let c = 0; c < 4; c++) {
      for (let k = game.colPos[c]; k < game.columns[c].length; k++) n += game.columns[c][k].n;
    }
    return n;
  }

  function slotBlocks() {
    return state.game.slots.reduce(function (sum, slot) { return sum + (slot ? slot.remaining : 0); }, 0);
  }

  function inFlightCount() {
    return state.coordinator ? state.coordinator.stats().inFlight : 0;
  }

  function conservation() {
    // 已放 + 未取 + 待令区未出发 + 在途 = 总数
    const inFlight = inFlightCount();
    return {
      placed: state.game.filledCount,
      unpicked: unpickedBlocks(),
      inArea: slotBlocks(),
      inFlight: inFlight,
      total: state.game.total,
      sum: state.game.filledCount + unpickedBlocks() + slotBlocks() + inFlight
    };
  }

  /* ============================================================
     盘面 / 缩略图 / 巢穴绘制
     ============================================================ */
  // 画布按「CSS 尺寸 × 设备像素比」分配后备像素，并按整数物理像素切格。
  // 375 / 430 档不再是 300 后备像素硬缩放到 254 / 320 CSS，网格线和格子边缘不会半像素发虚。
  function setupCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = boardCanvas.getBoundingClientRect().width || 300;
    const target = Math.max(SIZE, Math.round(cssW * dpr));
    if (boardCanvas.width !== target || boardCanvas.height !== target) {
      boardCanvas.width = target;
      boardCanvas.height = target;
    }
    if (previewCanvas.width !== SIZE) {
      previewCanvas.width = SIZE;
      previewCanvas.height = SIZE;
    }
  }

  function drawBoard() {
    setupCanvas();
    const W = boardCanvas.width;
    const S = W / SIZE;
    const U = Math.max(1, Math.round(window.devicePixelRatio || 1)); // 1 CSS 像素对应的后备像素
    const ctx = boardCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const game = state.game;
    if (!game) return;
    const edge = function (n) { return Math.round(n * S); };
    function px(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    }

    // 原图预览：只换绘制内容，不改 game.filled / slots / reservations / phase。
    if (state.previewOpen) {
      const level = LEVELS[state.levelIndex];
      for (let y = 0; y < SIZE; y++) {
        const Y = edge(y), CH = edge(y + 1) - Y;
        for (let x = 0; x < SIZE; x++) {
          const X = edge(x), CW = edge(x + 1) - X;
          const ch = level.map[y][x];
          const c = COLORS[ch] || COLORS.N;
          px(X, Y, CW, CH, c.hex);
          px(X, Y, CW, U, c.hi);
          px(X, Y, U, CH, c.hi);
          px(X + CW - U, Y + U, U, CH - U, c.dark);
          px(X + U, Y + CH - U, CW - U, U, c.dark);
        }
      }
      ctx.fillStyle = 'rgba(8,18,15,.22)';
      for (let i = 0; i <= SIZE; i++) {
        const p = Math.min(W - U, edge(i));
        ctx.fillRect(p, 0, U, W);
        ctx.fillRect(0, p, W, U);
      }
      // 预览态长按：原图铺满时也在对应剩余同色格上叠像素高亮；
      // 只改绘制层，不退出预览，不改 filled / slots / reservations / phase。
      if (state.hintColor) {
        const gold = state.hintPhase ? '#fff3bd' : '#f0c262';
        // 先压暗整张预览，再把目标格按原色重新点亮，保证在全彩原图上仍然一眼能认出。
        ctx.fillStyle = 'rgba(4,10,8,.58)';
        ctx.fillRect(0, 0, W, W);
        for (let i = 0; i < SIZE * SIZE; i++) {
          if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
          if (game.color[i] !== state.hintColor) continue;
          const p = AntEngine.xyOf(i);
          const X = edge(p.x), Y = edge(p.y);
          const CW = edge(p.x + 1) - X, CH = edge(p.y + 1) - Y;
          const c = color(game.color[i]);
          px(X, Y, CW, CH, c.hex);
          px(X + 2 * U, Y + 2 * U, Math.max(U, CW - 4 * U), 2 * U, c.hi);
          px(X + 2 * U, Y + 2 * U, 2 * U, Math.max(U, CH - 4 * U), c.hi);
          px(X, Y, CW, 2 * U, gold);
          px(X, Y + CH - 2 * U, CW, 2 * U, gold);
          px(X, Y, 2 * U, CH, gold);
          px(X + CW - 2 * U, Y, 2 * U, CH, gold);
        }
      }
      px(0, 0, W, 3 * U, '#f8dc98');
      px(0, W - 3 * U, W, 3 * U, '#f8dc98');
      px(0, 0, 3 * U, W, '#f8dc98');
      px(W - 3 * U, 0, 3 * U, W, '#f8dc98');
      return;
    }

    ctx.fillStyle = '#d8c69a';
    ctx.fillRect(0, 0, W, W);

    for (let y = 0; y < SIZE; y++) {
      const Y = edge(y), CH = edge(y + 1) - Y;
      for (let x = 0; x < SIZE; x++) {
        const X = edge(x), CW = edge(x + 1) - X;
        const i = AntEngine.idxOf(x, y);
        const terrain = game.terrain[i];
        if (terrain === AntEngine.HOLE) {
          px(X + U, Y + U, CW - 2 * U, CH - 2 * U, '#1a3030');
          px(X + 2 * U, Y + 2 * U, CW - 4 * U, CH - 4 * U, '#0b1b1b');
          continue;
        }
        if (terrain !== AntEngine.OBJECT) {
          px(X, Y, CW, CH, '#e5d5ad');
          continue;
        }
        if (game.filled[i]) {
          const c = color(game.color[i]);
          px(X, Y, CW, CH, c.hex);
          px(X, Y, CW, U, c.hi);
          px(X, Y, U, CH, c.hi);
          px(X + CW - U, Y + U, U, CH - U, c.dark);
          px(X + U, Y + CH - U, CW - U, U, c.dark);
        } else {
          // 未施工：中性色块 + 中心点，不提前泄露任何原图颜色。
          px(X, Y, CW, CH, '#d9c9a3');
          px(X + U, Y + U, CW - 2 * U, CH - 2 * U, '#ddcda8');
          px(X + U, Y + U, CW - 2 * U, U, '#e7d8b5');
          px(X + Math.floor(CW / 2) - U, Y + Math.floor(CH / 2) - U, 2 * U, 2 * U, '#c0ad83');
          px(X + 2 * U, Y + CH - 2 * U, Math.max(U, CW - 4 * U), U, '#cbb88f');
        }
      }
    }

    // 在途预约：只在目标格左上角画一个很小的颜色角标。
    // 预约不等于已填色，格子本体仍保持未施工现场；小角标让玩家看见“这只已经派到哪”。
    if (state.coordinator) {
      const stats = state.coordinator.stats();
      stats.reservations.forEach(function (r) {
        const p = AntEngine.xyOf(r.idx);
        const c = color(r.color);
        const X = edge(p.x), Y = edge(p.y);
        px(X + U, Y + U, 3 * U, 3 * U, c.ink);
        px(X + 2 * U, Y + 2 * U, 2 * U, 2 * U, c.hi);
      });
    }

    // 长按同色提示
    if (state.hintColor) {
      const border = state.hintPhase ? '#fff3bd' : '#e6b45b';
      const wash = state.hintPhase ? 'rgba(248,220,152,.52)' : 'rgba(230,180,91,.38)';
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
        if (game.color[i] !== state.hintColor) continue;
        const p = AntEngine.xyOf(i);
        const X = edge(p.x), Y = edge(p.y);
        const CW = edge(p.x + 1) - X, CH = edge(p.y + 1) - Y;
        px(X + U, Y + U, CW - 2 * U, CH - 2 * U, wash);
        px(X, Y, CW, U, border);
        px(X, Y + CH - U, CW, U, border);
        px(X, Y, U, CH, border);
        px(X + CW - U, Y, U, CH, border);
      }
    }

    // 细网格；30×30 仍能数格。
    ctx.fillStyle = 'rgba(83,62,34,.34)';
    for (let i = 0; i <= SIZE; i++) {
      const p = Math.min(W - U, edge(i));
      ctx.fillRect(p, 0, U, W);
      ctx.fillRect(0, p, W, U);
    }
    px(0, 0, W, 2 * U, 'rgba(61,43,23,.9)');
    px(0, W - 2 * U, W, 2 * U, 'rgba(61,43,23,.9)');
    px(0, 0, 2 * U, W, 'rgba(61,43,23,.9)');
    px(W - 2 * U, 0, 2 * U, W, 'rgba(61,43,23,.9)');
  }

  function drawNest() {
    // 像素巢穴按 CSS 尺寸 × DPR 重新分配后备像素，再用整数设备像素落每一块，
    // 避免 42×31 的固定后备画布被浏览器放大后出现半像素 / 模糊边。
    const nr = nestCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = nr.width || 48;
    const cssH = nr.height || 36;
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (nestCanvas.width !== targetW || nestCanvas.height !== targetH) {
      nestCanvas.width = targetW;
      nestCanvas.height = targetH;
    }
    const nc = nestCanvas.getContext('2d');
    const nw = nestCanvas.width, nh = nestCanvas.height;
    nc.imageSmoothingEnabled = false;
    nc.clearRect(0, 0, nw, nh);
    const S = Math.min(nw / 42, nh / 31);
    const ox = (nw - 42 * S) / 2;
    const oy = (nh - 31 * S) / 2;
    function npx(x, y, w, h, c) {
      nc.fillStyle = c;
      nc.fillRect(
        Math.round(ox + x * S),
        Math.round(oy + y * S),
        Math.max(1, Math.round(w * S)),
        Math.max(1, Math.round(h * S))
      );
    }
    // 土丘：外深、内浅，底部压一层暗边，像素块仍保持硬边。
    npx(7, 6, 28, 20, '#3a2b1b');
    npx(4, 10, 34, 15, '#4b3722');
    npx(2, 15, 38, 12, '#5f4a2f');
    npx(6, 8, 30, 5, '#6b5233');
    npx(12, 4, 18, 4, '#5a442a');
    npx(3, 26, 36, 2, '#2b2014');
    // 洞口：外圈略宽，内圈近黑，口沿有 1 格高光。
    npx(14, 12, 14, 15, '#120d09');
    npx(12, 16, 18, 11, '#120d09');
    npx(16, 10, 10, 5, '#0a0705');
    npx(16, 19, 10, 8, '#080605');
    npx(14, 13, 2, 12, '#241a10');
    npx(26, 13, 2, 12, '#050302');
    // 苔与草。
    npx(3, 13, 3, 2, '#6c9659');
    npx(36, 18, 3, 2, '#6c9659');
    npx(8, 24, 2, 3, '#a9c47f');
    npx(31, 25, 2, 2, '#a9c47f');
    npx(20, 3, 2, 2, '#a9c47f');
    npx(4, 25, 2, 2, '#7e9b5f');
    npx(35, 24, 2, 2, '#7e9b5f');
    // 洞口的颜料点：小画师的颜色。
    npx(11, 24, 2, 2, '#ddb052');
    npx(29, 24, 2, 2, '#e18fa6');
    npx(10, 26, 1, 1, '#f8dc98');
    npx(30, 26, 1, 1, '#ffc2d3');
  }
  function drawThumb(canvas, level) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = level.map[y][x];
        ctx.fillStyle = COLORS[ch] ? COLORS[ch].hex : '#101e18';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // 点击缩略图：原图铺满盘面作预览；再点缩略图（或盘面）还原。
  // 只切换绘制层，不修改 filled / slots / reservations / phase / 进度。
  function setPreviewOpen(open, quiet) {
    const next = !!open;
    state.previewOpen = next;
    boardFrame.classList.toggle('preview-on', next);
    if (previewCard) {
      previewCard.classList.toggle('open', next);
      previewCard.setAttribute('aria-pressed', next ? 'true' : 'false');
      previewCard.setAttribute('aria-label', next ? '完整原图预览中，点击还原游戏盘面' : '放大缩略图，点击将完整原图铺满盘面');
    }
    if (previewNote) {
      previewNote.hidden = !next;
      previewNote.textContent = PREVIEW_NOTE_DEFAULT;
    }
    if (hintChip) hintChip.hidden = true;
    if (next) {
      if (state.press) endPress(null, true);
      clearHint();
      suspendTipsForPreview();
    } else {
      resumeTipsFromPreview();
    }
    if (!quiet && state.game) drawBoard();
  }

  function togglePreview() {
    if (!state.game || state.modalOpen) return false;
    setPreviewOpen(!state.previewOpen);
    announce(state.previewOpen
      ? '完整原图预览：再点缩略图还原。填色进度没有改变。'
      : '已还原游戏盘面，填色进度没有改变。');
    return state.previewOpen;
  }

  /* ============================================================
     DOM / 状态渲染
     ============================================================ */
  function remainingTokens() {
    let n = 0;
    for (let c = 0; c < 4; c++) n += state.game.columns[c].length - state.game.colPos[c];
    return n;
  }

  function hiddenCount(c) {
    const left = state.game.columns[c].length - state.game.colPos[c];
    return Math.max(0, left - VISIBLE_ROWS);
  }

  function updateHeader() {
    const level = state.level || LEVELS[state.levelIndex];
    $('levelKicker').textContent = '第 ' + level.no + ' 关 / ' + LEVELS.length + (level.themeName ? ' · ' + level.themeName : '');
    $('levelTitle').textContent = level.name;
    const progressLabel = $('progressLabel');
    if (progressLabel) {
      const mech = String(level.mechanic || '像素填色').split(' · ').filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · ');
      progressLabel.textContent = '填色进度 · 30×30 · ' + mech;
    }
    const minSteps = Number(level.minimumSteps || (state.game && state.game.level && state.game.level.minimumSteps) || 0);
    const stepBadge = $('minStepBadge');
    if (stepBadge) {
      stepBadge.textContent = minSteps ? '最少 ' + minSteps + ' 步' : '步数待配置';
      stepBadge.title = minSteps
        ? '本关最少 ' + minSteps + ' 次取令；一步 = 点一次队首令牌'
        : '本关最少步数尚未配置';
      stepBadge.setAttribute('aria-label', stepBadge.title);
    }
    const done = state.game.filledCount;
    $('progressText').textContent = done + ' / ' + state.game.total;
    const pct = state.game.total ? Math.max(0, Math.min(100, done / state.game.total * 100)) : 0;
    const bar = $('progressBar');
    bar.style.width = pct.toFixed(2) + '%';
    bar.classList.toggle('on', done > 0);

    const badge = $('speedBadge');
    const auto = state.autoMultiplier >= AntEngine.ENDGAME_MULTIPLIER;
    const rush = rushActive() ? RUSH_FACTOR : 1;
    badge.textContent = (state.multiplier * rush) + '×';
    badge.classList.toggle('fast', state.multiplier > 1 || rush > 1);
    badge.classList.toggle('auto', auto);
    badge.classList.toggle('rush', rush > 1);
    badge.setAttribute('aria-label', rush > 1
      ? '疾行令生效：移动与出巢在 ' + state.multiplier + ' 倍基础上再乘 2'
      : (auto
        ? '当前速度：令牌取完后自动 8 倍；手动倍速不会覆盖它'
        : '当前速度：手动 ' + state.manualMultiplier + ' 倍'));
    app.setAttribute('data-speed', String(state.multiplier));
    app.setAttribute('data-speed-source', rush > 1 ? 'rush' : (auto ? 'auto' : 'manual'));
  }

  function updateSpeedControls() {
    const auto = state.autoMultiplier >= AntEngine.ENDGAME_MULTIPLIER;
    document.querySelectorAll('.speed-btn').forEach(function (btn) {
      const n = parseInt(btn.getAttribute('data-speed'), 10);
      const on = n === state.manualMultiplier;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = auto && n < 8 ? '自动 8× 已生效；手动 ' + n + '× 不会覆盖它' : '手动 ' + n + '×';
    });
    const note = $('speedAuto');
    if (note) {
      note.textContent = auto ? '自动 8× 生效 · 手动不会覆盖' : '取完令牌自动 8×';
      note.classList.toggle('on', auto);
    }
    const badge = $('speedBadge');
    if (badge) badge.title = auto ? '自动 8×（令牌已取完）' : '手动 ' + state.manualMultiplier + '×';
  }

  function setManualSpeed(n) {
    const speed = Number(n);
    if (MANUAL_SPEEDS.indexOf(speed) === -1) return false;
    state.manualMultiplier = speed;
    // 自动 8× 是下限，不会被手动 1/2/4× 悄悄覆盖；界面同步说明。
    updateSpeed(true);
    announce('手动倍速 ' + speed + '×' + (state.autoMultiplier >= 8 ? '；自动 8× 仍然生效' : ''));
    return true;
  }

  function slotCanLaunch(index) {
    if (!state.game || !state.coordinator) return false;
    if (state.phase !== 'playing' || state.modalOpen) return false;
    // 入区动画只锁“正在飞入的那个槽”；其他已到达槽位的令牌仍可派工。
    if (state.incomingSlots.has(index)) return false;
    return state.coordinator.canDispatch(index);
  }

  function slotSig() {
    return state.game.slots.map(function (s) { return s ? String(s.uid) : 'x'; }).join(',') +
      '|' + Array.from(state.incomingSlots).sort().join('.');
  }

  function buildSlotEl(i) {
    const slot = state.game.slots[i];
    if (!slot) {
      return '<div class="slot empty" data-slot="' + i + '" data-uid="" aria-label="待令格 ' + (i + 1) + '，空"></div>';
    }
    const c = color(slot.color);
    const incoming = state.incomingSlots.has(i);
    const canLaunch = slotCanLaunch(i);
    const cls = ['slot', 'filled'];
    if (incoming) cls.push('incoming');
    if (state.pickAnimating) cls.push('pick-locked');
    if (canLaunch) cls.push('can-launch');
    if (isRecallable(i)) cls.push('recall-target');
    if (state.popSlot === i) cls.push('pop');
    const aria = incoming
      ? '待令格 ' + (i + 1) + '，令牌正在移入'
      : '待令格 ' + (i + 1) + '，' + c.hex + ' 色令牌，未出发 ' + slot.remaining + (state.recallMode && isRecallable(i) ? '，可召回' : (canLaunch ? '，可出发' : '，暂不可出发，休眠中'));
    return '<div class="' + cls.join(' ') + '" data-slot="' + i + '" data-uid="' + slot.uid + '" data-color="' + slot.color + '" style="--slot-color:' + c.hex + ';--slot-ink:' + c.ink + ';--slot-edge:' + c.hi + ';--slot-dark:' + c.dark + '" aria-label="' + aria + '">' +
      '<span class="slot-flag" aria-hidden="true"></span>' +
      '<span class="slot-zz" aria-hidden="true">Zz</span>' +
      '<span class="slot-inner"><span class="slot-count">' + slot.remaining + '</span></span>' +
    '</div>';
  }

  function updateSlotDom() {
    const children = slotsEl.children;
    for (let i = 0; i < state.game.slots.length; i++) {
      const slot = state.game.slots[i];
      const el = children[i];
      if (!el) return false;
      if (!slot) {
        if (!el.classList.contains('empty')) return false;
        continue;
      }
      if (el.classList.contains('empty')) return false;
      const incoming = state.incomingSlots.has(i);
      const canLaunch = slotCanLaunch(i);
      el.classList.toggle('incoming', incoming);
      el.classList.toggle('pick-locked', !!state.pickAnimating);
      el.classList.toggle('can-launch', canLaunch);
      el.classList.toggle('recall-target', isRecallable(i));
      const count = el.querySelector('.slot-count');
      if (count && count.textContent !== String(slot.remaining)) count.textContent = String(slot.remaining);
      el.setAttribute('aria-label', incoming
        ? '待令格 ' + (i + 1) + '，令牌正在移入'
        : '待令格 ' + (i + 1) + '，未出发 ' + slot.remaining + (state.recallMode && isRecallable(i) ? '，可召回' : (canLaunch ? '，可出发' : '，暂不可出发，休眠中')));
    }
    return true;
  }

  function renderSlots(force) {
    if (!state.game) return;
    const sig = slotSig();
    if (force || sig !== state.slotSig || slotsEl.children.length !== state.game.slots.length) {
      const html = [];
      for (let i = 0; i < state.game.slots.length; i++) html.push(buildSlotEl(i));
      slotsEl.innerHTML = html.join('');
      state.slotSig = sig;
      state.popSlot = -1;
      slotsEl.classList.toggle('recall-mode', state.recallMode);
      slotsEl.style.setProperty('--slot-count', String(state.game.slots.length));
      slotsEl.setAttribute('aria-label', state.game.slots.length + ' 个待令格');
      app.setAttribute('data-slot-count', String(state.game.slots.length));
      // 第 6 格只收紧间距，不缩小任何槽 / 令牌，避免 6 格溢出。
      app.setAttribute('data-slot-mode', state.game.slots.length >= 6 ? 'six' : 'five');
    } else {
      updateSlotDom();
    }
  }

  function tokenStyle(k) {
    const c = color(k);
    return 'background:' + c.hex + ';color:' + c.ink + ';border-color:' + c.dark;
  }

  function renderMaterials() {
    const game = state.game;
    matGrid.classList.toggle('recall-lock', !!state.recallMode);
    matGrid.setAttribute('aria-disabled', state.recallMode ? 'true' : 'false');
    // 队首可点 ≠ 当前能派工。
    // 只要还在游玩、没有弹层、没有正在入区的令牌，队首就应该可点：
    // 待令区满了，点击时再给「已满」反馈；没有同色目标，令牌也可以先入区等待。
    // 不再用「待令区是否已满」或「有没有合法目标」把队首永久置灰。
    const baseCanPick = state.phase === 'playing' && !state.modalOpen;
    const full = !game.slots.some(function (s) { return !s; });
    const html = [];
    for (let c = 0; c < 4; c++) {
      const queue = game.columns[c];
      const pos = game.colPos[c];
      const left = queue.length - pos;
      const visible = [];
      for (let r = 0; r < VISIBLE_ROWS; r++) visible.push(left > r ? queue[pos + r] : null);
      html.push('<div class="mat-col' + (left ? '' : ' dim') + (full ? ' slots-full' : '') + '" data-col="' + c + '">');
      for (let r = 0; r < VISIBLE_ROWS; r++) {
        const g = visible[r];
        // 预选区耗尽 / 该行没有令牌：不渲染空占位，也不把“暂不可选”误当成耗尽。
        if (!g) continue;
        if (r === 0) {
          // 每列独立锁：正在飞入的那一列短暂置灰，其他列仍可立即取令。
          const off = !baseCanPick || state.pickLocks.has(c);
          html.push(
            '<button type="button" class="token front' + (off ? ' off' : '') + '"' +
              ' data-col="' + c + '" data-row="0" data-id="' + g.id + '" data-color="' + g.color + '"' +
              ' style="' + tokenStyle(g.color) + '"' +
              (off ? ' aria-disabled="true"' : '') +
              ' aria-label="第 ' + (c + 1) + ' 列队首令牌，数量 ' + g.n + '。点按移入待令区，长按看同色位置">' +
              '<svg class="front-tri" width="9" height="6" viewBox="0 0 9 6" aria-hidden="true" shape-rendering="crispEdges">' +
                '<path d="M4 0h1v1h1v1h1v1h1v1H0V4h1V3h1V2h1V1h1z" fill="#21150d"/>' +
                '<path d="M4 1h1v1h1v1H2V3h1V2h1z" fill="#f8dc98"/>' +
              '</svg>' +
              '<span class="token-count">' + g.n + '</span>' +
            '</button>'
          );
        } else {
          html.push(
            '<div class="token queued" data-col="' + c + '" data-row="' + r + '" data-id="' + g.id + '" data-color="' + g.color + '"' +
              ' style="' + tokenStyle(g.color) + '" role="img" aria-disabled="true"' +
              ' aria-label="第 ' + (c + 1) + ' 列第 ' + (r + 1) + ' 排令牌，数量 ' + g.n + '。暂不可选，长按看同色位置">' +
              '<span class="token-count">' + g.n + '</span>' +
            '</div>'
          );
        }
      }
      const hidden = Math.max(0, left - VISIBLE_ROWS);
      const peekOn = state.peekUntil > performance.now();
      const nextHidden = queue[pos + VISIBLE_ROWS];
      if (peekOn && nextHidden) {
        const nc = color(nextHidden.color);
        html.push('<div class="queue-hidden peek" data-hidden="' + hidden + '"' +
          ' aria-label="预窥：这一列隐藏的下一枚令牌是 ' + nextHidden.n + ' 格 ' + nc.hex + ' 色">' +
          '<i style="background:' + nc.hex + ';border-color:' + nc.dark + '"></i>' +
          '<span>下枚 ' + nextHidden.n + '</span></div>');
      } else if (left === 0) {
        html.push('<div class="queue-hidden dim" data-hidden="0">取完</div>');
      } else if (hidden > 0) {
        html.push('<div class="queue-hidden" data-hidden="' + hidden + '">+' + hidden + '令</div>');
      } else {
        html.push('<div class="queue-hidden dim" data-hidden="0" aria-hidden="true"> </div>');
      }
      html.push('</div>');
    }
    matGrid.innerHTML = html.join('');
  }

  function renderAll() {
    if (!state.game) return;
    state.analysis = AntEngine.analyze(state.game);
    updateHeader();
    drawBoard();
    renderSlots(false);
    if (!state.pickAnimating) renderMaterials();
  }

  // 落块热路径：只重画盘面、数字和进度，不重算整盘 analyze，也不重建预选区。
  function renderAfterCommit() {
    state.analysis = null;
    updateHeader();
    drawBoard();
    renderSlots(false);
  }

  /* ============================================================
     四个本地道具：解锁 / 次数 / 状态 / 效果
     ============================================================ */
  function reachedStage() {
    let maxDone = 0;
    state.finished.done.forEach(function (n) { if (n > maxDone) maxDone = n; });
    // 「到达对应关」才算解锁：完成第 N 关只代表到达过第 N 关，不能提前把第 N+1 关的道具
    // 放进第 N 关。旧存档没有 reached 键时，用已画成的最大关号作为到达下界迁移。
    return Math.max(1, state.level ? state.level.no : 1, state.reachedMax, maxDone);
  }
  function propUnlocked(p) { return reachedStage() >= p.unlock; }
  function propRemaining(p) { return Math.max(0, p.uses - (state.propUses[p.key] || 0)); }
  function rushActive() { return state.rushUntil > performance.now(); }
  function peekActive() { return state.peekUntil > performance.now(); }

  function propIconSVG(key) {
    const rows = PROP_ICONS[key] || [];
    let rects = '';
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === '#') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    return '<svg class="prop-icon" viewBox="0 0 12 12" width="24" height="24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + rects + '</svg>';
  }

  function isRecallable(i) {
    if (!state.recallMode || !state.game || !state.coordinator) return false;
    const slot = state.game.slots[i];
    if (!slot || slot.remaining <= 0) return false;
    if (state.incomingSlots.has(i)) return false;
    const byToken = state.coordinator.stats().byToken || {};
    return !byToken[slot.uid];
  }

  function renderProps() {
    const grid = $('propsGrid');
    if (!grid || !state.game) return;
    const now = performance.now();
    const html = PROPS.map(function (p) {
      const unlocked = propUnlocked(p);
      const left = propRemaining(p);
      const peeking = p.key === 'peek' && state.peekUntil > now;
      const rushing = p.key === 'rush' && state.rushUntil > now;
      const slotOpen = p.key === 'slot' && state.extraSlot;
      const selecting = p.key === 'recall' && state.recallMode;
      // 召回选格时只保留召回令可点（用于取消）；其他道具暂不响应，避免切换输入模式。
      const recallLock = state.recallMode && p.key !== 'recall';
      let cls = 'prop-btn';
      if (!unlocked) cls += ' locked';
      else if (peeking || rushing || slotOpen || selecting) cls += ' active';
      else if (left <= 0) cls += ' used';
      if (recallLock) cls += ' recall-off';
      let meta = '';
      if (!unlocked) meta = '第 ' + p.unlock + ' 关';
      else if (peeking) meta = '剩余 ' + Math.max(1, Math.ceil((state.peekUntil - now) / 1000)) + 's';
      else if (rushing) meta = '剩余 ' + Math.max(1, Math.ceil((state.rushUntil - now) / 1000)) + 's';
      else if (slotOpen) meta = '已开6格';
      else if (selecting) meta = '选格中';
      else if (left <= 0) meta = '本关用完';
      else meta = '可用 ×' + left;
      const disabled = !unlocked || left <= 0 || peeking || rushing || slotOpen || recallLock || (state.phase !== 'playing') || state.modalOpen;
      const label = !unlocked
        ? p.name + '：第 ' + p.unlock + ' 关到达后解锁。' + p.short
        : p.name + '：' + p.short + '；本关剩余 ' + left + ' 次。';
      return '<button type="button" class="' + cls + '" data-prop="' + p.key + '"' +
        ' aria-label="' + label + '"' + (disabled ? ' aria-disabled="true" disabled' : '') + '>' +
        '<span class="prop-ico-wrap">' + propIconSVG(p.key) + '</span>' +
        '<span class="prop-text"><span class="prop-name">' + p.name + '</span>' +
        '<span class="prop-meta">' + meta + '</span></span>' +
        '<span class="prop-lock" aria-hidden="true"></span>' +
      '</button>';
    }).join('');
    if (html !== state.propSig) {
      grid.innerHTML = html;
      state.propSig = html;
    }
  }

  function armPropExpiry(kind) {
    const token = state.runToken;
    const wait = kind === 'peek' ? Math.max(0, state.peekUntil - performance.now()) : Math.max(0, state.rushUntil - performance.now());
    setTimeout(function () {
      if (token !== state.runToken) return;
      if (kind === 'peek' && !peekActive()) {
        if (!state.pickAnimating) renderMaterials();
        renderProps();
        if (state.phase === 'playing') announce('预窥结束，隐藏队列恢复为 +N令');
      }
      if (kind === 'rush' && !rushActive()) {
        updateSpeed(true);
        updateHeader();
        renderProps();
        if (state.phase === 'playing') announce('疾行结束，速度回到当前倍速');
      }
    }, wait + 40);
    if (!state.propTimer) {
      state.propTimer = setInterval(function () {
        if (state.phase !== 'playing' || (!peekActive() && !rushActive())) {
          clearInterval(state.propTimer);
          state.propTimer = 0;
          return;
        }
        renderProps();
      }, 500);
    }
  }

  function firstUseTip(key, text) {
    // 走首次提示队列：如果「新道具 / 本关机制 / 欢迎」正在显示，先把首次使用说明排在后面，
    // 不抢掉正在读的气泡；仍然只出现一次、不常驻。
    return queueIntroTip({
      key: 'prop-use-' + key,
      text: text,
      anchor: 'board',
      ms: 5000
    });
  }

  function useProp(key) {
    if (!state.game || state.phase !== 'playing' || state.modalOpen) return false;
    const p = PROPS.filter(function (x) { return x.key === key; })[0];
    if (!p) return false;
    if (!propUnlocked(p)) {
      toast('到达第 ' + p.unlock + ' 关后解锁「' + p.name + '」', 1600);
      return false;
    }
    if (key === 'recall') return toggleRecallMode();
    if (propRemaining(p) <= 0) {
      toast('「' + p.name + '」本关次数已用完；重来或换关会重置', 1700);
      return false;
    }
    if (key === 'slot') {
      if (state.extraSlot || state.game.slots.length >= SLOT_CAPACITY_RESERVED) return false;
      if (!AntEngine.addSlot(state.game, SLOT_CAPACITY_RESERVED)) return false;
      state.extraSlot = true;
      state.propUses.slot++;
      state.slotSig = '';
      renderAll();
      renderProps();
      if (!firstUseTip('slot', '备用巢格：本关多 1 个待令位；重来或换关回到 5 格。')) {
        toast('备用巢格已打开：本关临时多 1 个待令位', 1800);
      }
      announce('备用巢格已打开，待令区现在有 6 格');
      kick();
      return true;
    }
    if (key === 'peek') {
      if (peekActive()) return false;
      state.propUses.peek++;
      state.peekUntil = performance.now() + PEEK_MS;
      if (!state.pickAnimating) renderMaterials();
      renderProps();
      armPropExpiry('peek');
      if (!firstUseTip('peek', '预窥 8 秒：只看每列隐藏的下一枚，不取令、不改队列。')) {
        toast('预窥 8 秒：看每列隐藏的下一枚令牌', 1600);
      }
      announce('预窥已开启，隐藏队列的下一枚令牌会显示 8 秒');
      return true;
    }
    if (key === 'rush') {
      if (rushActive()) return false;
      state.propUses.rush++;
      state.rushUntil = performance.now() + RUSH_MS;
      renderProps();
      armPropExpiry('rush');
      updateSpeed(true);
      updateHeader();
      if (!firstUseTip('rush', '疾行 8 秒：移动和出巢 ×2；不改令牌、预约、封口和默认速度。')) {
        toast('疾行 8 秒：移动和出巢节奏 2 倍', 1500);
      }
      announce('疾行令生效 8 秒');
      kick();
      return true;
    }
    return false;
  }

  function recallableSlots() {
    const out = [];
    if (!state.game) return out;
    const stats = state.coordinator ? state.coordinator.stats() : { byToken: {} };
    for (let i = 0; i < state.game.slots.length; i++) {
      const slot = state.game.slots[i];
      if (!slot || slot.remaining <= 0) continue;
      if (state.incomingSlots.has(i)) continue;
      if (stats.byToken && stats.byToken[slot.uid]) continue;
      out.push(i);
    }
    return out;
  }

  function toggleRecallMode() {
    if (state.recallMode) {
      state.recallMode = false;
      renderSlots(true);
      renderMaterials();
      renderProps();
      announce('已取消召回，恢复派工');
      kick();
      return false;
    }
    const p = PROPS.filter(function (x) { return x.key === 'recall'; })[0];
    if (propRemaining(p) <= 0) {
      toast('「召回令」本关次数已用完；重来或换关会重置', 1700);
      return false;
    }
    if (state.pickAnimating) {
      toast('有一枚令牌正在飞入待令区，稍后再召回', 1500);
      return false;
    }
    // 先进入选格模式暂停新派工，再统计可召回格；避免统计完到点击之间又被派走。
    state.recallMode = true;
    state.press = null;
    const list = recallableSlots();
    if (!list.length) {
      state.recallMode = false;
      toast('没有可召回的令牌：有蚂蚁在途的令牌要等它落完才能退回', 2000);
      return false;
    }
    renderSlots(true);
    renderMaterials();
    renderProps();
    firstUseTip('recall', '点高亮待令格，把没有在途蚂蚁的令牌退回原列队首；有在途的先等它落完。');
    announce('召回模式已暂停新派工：点高亮的待令格退回令牌；再点召回令取消');
    return true;
  }

  function recallSlot(i) {
    if (!state.recallMode || !state.game) return false;
    if (!state.game.slots[i]) {
      toast('这个待令格是空的；点有令牌的高亮格', 1400);
      return false;
    }
    if (!isRecallable(i)) {
      toast('这枚令牌还有蚂蚁在途，稍后再召回', 1500);
      return false;
    }
    const res = AntEngine.recall(state.game, i, true);
    if (!res) return false;
    state.propUses.recall++;
    state.recallMode = false;
    state.slotSig = '';
    renderAll();
    renderProps();
    toast('令牌已退回第 ' + (res.column + 1) + ' 列队首，待令位已空出', 1900);
    announce('召回完成：第 ' + (res.column + 1) + ' 列队首恢复这枚令牌，待令格 ' + (i + 1) + ' 已空');
    kick();
    return true;
  }

  /* ============================================================
     提示与速度
     ============================================================ */
  function toast(message, ms) {
    clearTimeout(state.toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    state.toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 2100);
  }

  function announce(message) { $('live').textContent = message; }

  function hideTip() {
    clearTimeout(state.tipTimer);
    state.tipTimer = 0;
    state.tipKey = '';
    state.tipUntil = 0;
    state.tipQueue.length = 0;
    state.tipSuspended = null;
    tipBubble.hidden = true;
  }

  // 打开原图预览时把新手 / 机制气泡暂存：预览期间不遮挡原图，退出后按剩余时长继续。
  // 这样「看原图」这个正常动作不会把还没看的机制提示永久吞掉。
  function suspendTipsForPreview() {
    if (!tipIsActive() && !state.tipQueue.length) return;
    const anchorMatch = /(?:^|\s)at-([a-z-]+)/.exec(tipBubble.className);
    state.tipSuspended = {
      current: tipIsActive() ? {
        key: state.tipKey,
        text: tipText.textContent,
        anchor: anchorMatch ? anchorMatch[1] : 'board',
        left: Math.max(1200, state.tipUntil - performance.now())
      } : null,
      queue: state.tipQueue.slice()
    };
    clearTimeout(state.tipTimer);
    state.tipTimer = 0;
    state.tipKey = '';
    state.tipUntil = 0;
    state.tipQueue.length = 0;
    tipBubble.hidden = true;
  }

  function resumeTipsFromPreview() {
    const held = state.tipSuspended;
    if (!held) return;
    state.tipSuspended = null;
    if (held.queue.length) state.tipQueue = held.queue;
    if (held.current) {
      showTip(held.current.key, held.current.text, held.current.anchor, held.current.left, true);
    } else {
      pumpTipQueue();
    }
  }

  // 只收起当前气泡并继续排队；hideTip 用于换关 / 弹层 / 测试，会清空队列。
  function expireTip(key) {
    if (state.tipKey !== key) return;
    clearTimeout(state.tipTimer);
    state.tipTimer = 0;
    state.tipKey = '';
    state.tipUntil = 0;
    tipBubble.hidden = true;
    pumpTipQueue();
  }

  function tipIsActive() {
    return !tipBubble.hidden && !!state.tipKey;
  }

  function introTipBusy() {
    if (state.tipSuspended || state.tipQueue.length) return true;
    if (!tipIsActive()) return false;
    return state.tipKey === 'welcome' || state.tipKey.indexOf('level-') === 0 || state.tipKey.indexOf('prop-get-') === 0;
  }

  function pumpTipQueue() {
    if (!state.tipQueue.length) return;
    if (state.modalOpen || state.phase !== 'playing') { state.tipQueue.length = 0; return; }
    if (tipIsActive()) return;
    const item = state.tipQueue.shift();
    if (!item || state.tips[item.key]) { pumpTipQueue(); return; }
    showTip(item.key, item.text, item.anchor, item.ms, true, item.alsoMark);
  }

  // 新手 / 新机制提示排队：一次只显示一枚，前一枚自然结束后再出下一枚。
  // 旧提示被临时反馈替换时，队列仍保留，等临时反馈结束后继续。
  function queueIntroTip(item) {
    if (!item || !item.key || state.tips[item.key]) return false;
    // 预览期间到点的首次提示先挂起，退出预览后再显示，不覆盖原图。
    if (state.previewOpen) {
      if (!state.tipSuspended) state.tipSuspended = { current: null, queue: [] };
      if (!state.tipSuspended.queue.some(function (q) { return q.key === item.key; })) {
        state.tipSuspended.queue.push(item);
      }
      return true;
    }
    if (tipIsActive()) {
      if (state.tipQueue.some(function (q) { return q.key === item.key; })) return false;
      state.tipQueue.push(item);
      return true;
    }
    return showTip(item.key, item.text, item.anchor, item.ms, true, item.alsoMark);
  }

  function showTip(key, text, anchor, ms, force, alsoMark) {
    if (!force && state.tips[key]) return false;
    if (state.modalOpen) return false;
    // 预览期间任何气泡都不盖到原图上；先挂起，退出预览后按队列继续。
    if (state.previewOpen) {
      if (!state.tipSuspended) state.tipSuspended = { current: null, queue: [] };
      if (!state.tipSuspended.queue.some(function (q) { return q.key === key; })) {
        state.tipSuspended.queue.push({ key: key, text: text, anchor: anchor, ms: ms || 5200, alsoMark: alsoMark });
      }
      return true;
    }
    state.tips[key] = true;
    if (alsoMark && alsoMark.length) {
      alsoMark.forEach(function (k) { state.tips[k] = true; });
    }
    saveTips();
    state.tipKey = key;
    tipText.textContent = text;
    tipBubble.className = 'tip-bubble at-' + (anchor || 'mats');
    tipBubble.style.removeProperty('--tip-y');
    if ((anchor || 'mats') === 'props') {
      const pr = $('props') ? $('props').getBoundingClientRect() : null;
      const ar = app.getBoundingClientRect();
      if (pr) tipBubble.style.setProperty('--tip-y', Math.round(pr.top - ar.top - 10) + 'px');
    }
    tipBubble.hidden = false;
    const dur = ms || 5200;
    state.tipUntil = performance.now() + dur;
    clearTimeout(state.tipTimer);
    state.tipTimer = setTimeout(function () { expireTip(key); }, dur);
    return true;
  }

  function updateSpeed(force) {
    if (!state.game) return;
    const auto = AntEngine.speedMultiplier(state.game);
    const next = AntEngine.effectiveMultiplier(state.game, state.manualMultiplier);
    const autoBefore = state.autoMultiplier;
    state.autoMultiplier = auto;
    if (next !== state.multiplier || force) {
      const before = state.multiplier;
      state.multiplier = next;
      if (auto >= 8 && autoBefore < 8) {
        announce('令牌已全部取完，进入自动全局 8 倍速');
        showTip('speed', '令牌取完了，小画师进入自动 8× 全速收尾；手动倍速不会覆盖它。', 'speed', 4200);
        clearTimeout(state.tickTimer);
        state.tickTimer = 0;
        scheduleTick(0);
      } else if (next > before && auto < 8) {
        announce('手动倍速 ' + state.manualMultiplier + '×');
      }
    }
    updateHeader();
    updateSpeedControls();
  }

  /* ============================================================
     长按同色位置提示
     ============================================================ */
  function hintCells(k) {
    const game = state.game;
    const out = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (game.terrain[i] !== AntEngine.OBJECT || game.filled[i]) continue;
      if (game.color[i] === k) out.push(i);
    }
    return out;
  }

  function startHintPulse() {
    if (state.hintTimer) return;
    state.hintPhase = 0;
    state.hintTimer = setInterval(function () {
      state.hintPhase = state.hintPhase ? 0 : 1;
      if (state.hintColor) drawBoard();
    }, 150);
  }
  function stopHintPulse() {
    if (state.hintTimer) clearInterval(state.hintTimer);
    state.hintTimer = 0;
    state.hintPhase = 0;
  }
  function clearHint() {
    state.hintColor = null;
    stopHintPulse();
    document.querySelectorAll('.hinting').forEach(function (el) { el.classList.remove('hinting'); });
    if (hintChip) hintChip.hidden = true;
    // 预览态长按只收高亮，原图预览与提示条都要恢复；不退出预览。
    if (previewNote && state.previewOpen) previewNote.textContent = PREVIEW_NOTE_DEFAULT;
    if (state.game) drawBoard();
  }

  function removeHoldVisual(press) {
    if (!press || !press.el || !press.el.isConnected) return;
    press.el.classList.remove('holding');
    const meter = press.el.querySelector('.hold-meter');
    if (meter) meter.remove();
  }

  function addHoldVisual(press) {
    if (!press.el || !press.el.isConnected) return;
    // 长按进度用 4 格像素条表示：松手 / 取消 / 高亮激活时立即移除。
    const meter = document.createElement('span');
    meter.className = 'hold-meter';
    meter.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) {
      const block = document.createElement('i');
      block.style.animationDelay = (i * 105) + 'ms';
      meter.appendChild(block);
    }
    press.el.classList.add('holding');
    press.el.appendChild(meter);
  }

  function activateHint(press) {
    if (!state.game || state.press !== press) return;
    const cells = hintCells(press.color);
    press.active = true;
    state.suppressClickUntil = performance.now() + 900;
    removeHoldVisual(press);
    if (!cells.length) {
      // 这个颜色已经全部填完：长按仍然算一次长按，松开后不能误触取令。
      press.noTarget = true;
      toast('这个颜色已经填完了', 1200);
      announce('这个颜色已经填完了，长按不会取令');
      return;
    }
    state.hintColor = press.color;
    if (press.el && press.el.isConnected) press.el.classList.add('hinting');
    if (hintChip) {
      hintChip.textContent = '同色 ' + cells.length + ' 格';
      hintChip.hidden = state.previewOpen;
    }
    if (previewNote && state.previewOpen) {
      previewNote.textContent = '原图预览 · 同色 ' + cells.length + ' 格 · 松开恢复';
    }
    startHintPulse();
    drawBoard();
    announce((state.previewOpen ? '原图预览中的同色位置提示：' : '同色位置提示：') + '盘面上有 ' + cells.length + ' 格，松开收起');
  }

  function beginPress(ev, el) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (state.phase !== 'playing' || state.modalOpen || !state.game || state.pickAnimating) return;
    if (state.recallMode) return;
    if (state.press) return;
    const k = el.getAttribute('data-color');
    if (!k) return;
    const press = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, color: k, el: el, timer: 0, active: false, noTarget: false, captured: false };
    // 触摸长按期间把指针捕获到这个令牌：手指轻微抖动或 DOM 补位时，
    // 仍能在 window 的 pointerup / pointercancel 上可靠收高亮，不误触取令。
    try {
      if (el.setPointerCapture) { el.setPointerCapture(ev.pointerId); press.captured = true; }
    } catch (err) { /* 某些浏览器不支持 / 指针已失效，window 监听仍然兜底 */ }
    addHoldVisual(press);
    press.timer = setTimeout(function () { activateHint(press); }, LONG_PRESS_MS);
    state.press = press;
  }

  function endPress(ev, cancelled) {
    const press = state.press;
    if (!press) return;
    if (ev && ev.pointerId !== undefined && ev.pointerId !== press.pointerId) return;
    clearTimeout(press.timer);
    const wasActive = press.active;
    const noTarget = press.noTarget;
    if (press.captured && press.el && press.el.isConnected && press.el.releasePointerCapture) {
      try { press.el.releasePointerCapture(press.pointerId); } catch (err) { /* 忽略已释放的指针 */ }
    }
    removeHoldVisual(press);
    state.press = null;
    if (wasActive) {
      // 即使这个颜色已填完，也不能把长按松手当成一次取令点击。
      state.suppressClickUntil = performance.now() + 700;
      clearHint();
      if (!cancelled && !noTarget) announce('同色提示已收起');
    }
  }
  function cancelPressForMove(ev) {
    const press = state.press;
    if (!press) return;
    if (Math.abs(ev.clientX - press.x) <= 16 && Math.abs(ev.clientY - press.y) <= 16) return;
    endPress(ev, true);
  }

  /* ============================================================
     关卡装载
     ============================================================ */
  function clearAnts() {
    antsLayer.innerHTML = '';
    state.animating.clear();
    state.antViews.clear();
  }

  function scheduleLevelIntro() {
    const level = state.level || LEVELS[state.levelIndex];
    const token = state.runToken;
    setTimeout(function () {
      if (token !== state.runToken || state.phase !== 'playing' || state.modalOpen) return;
      // 不再因为玩家先点了一枚令牌就放弃首次提示；气泡不挡点击，可以边玩边看。
      const items = [];
      const fresh = PROPS.filter(function (p) {
        return propUnlocked(p) && !state.tips['prop-get-' + p.unlock];
      });
      if (fresh.length) {
        const top = fresh[fresh.length - 1];
        const others = fresh.slice(0, -1).map(function (p) { return p.name; });
        let text = '新道具 · ' + top.name + '（第 ' + top.unlock + ' 关解锁）：' + top.short + '。点底部道具按钮使用，本关次数有限。';
        if (others.length) text += ' 同时解锁：' + others.join(' / ') + '。';
        items.push({
          key: 'prop-get-' + top.unlock,
          text: text,
          anchor: 'board',
          ms: 5600,
          alsoMark: fresh.map(function (p) { return 'prop-get-' + p.unlock; })
        });
      }
      if (level.no === 1) {
        if (!state.tips.welcome) {
          items.push({
            key: 'welcome',
            text: '点第一排令牌，小画师会从巢穴出发填同色格。长按令牌看同色位置；点右侧小图看原图，预览中长按也会亮起同色格。',
            anchor: 'board',
            ms: 6200
          });
        }
      } else {
        const key = 'level-' + level.no;
        if (!state.tips[key]) {
          // 机制文字先去重（第 10 关数据里有「多色并行 · 多色并行」），再和新道具提示排队。
          const mech = String(level.mechanic || '').split(' · ').filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · ');
          const hint = level.hint || level.teaches || '';
          items.push({
            key: key,
            text: (mech ? '本关机制 · ' + mech + '：' : '本关机制：') + hint,
            anchor: 'board',
            ms: 6000
          });
        }
      }
      // 先道具、后机制；两枚气泡不重叠、不堆叠。第一枚立即显示，其余排队。
      // 全部走 queueIntroTip，预览期间才会一起进入挂起队列而不是漏掉第二枚。
      items.forEach(function (item) { queueIntroTip(item); });
    }, 720);
  }

  function loadLevel(index, opts) {
    const options = opts || {};
    state.runToken++;
    clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    state.tickRunning = false;
    state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    const base = LEVELS[state.levelIndex];
    // 08:01：每次正常进入 / 重试 / 换关 / 通关后再进，都用新 seed 重新计算令牌
    // 拆分与四列队列；只有开发显式传 {seed} 或 ?seed= 时才用同一 seed 复现。
    const explicitSeed = Number(options.seed);
    const seed = (Number.isFinite(explicitSeed) && explicitSeed > 0)
      ? (explicitSeed >>> 0)
      : nextQueueSeed(base.no);
    try { localStorage.setItem(SEED_KEY, JSON.stringify({ no: base.no, seed: seed, at: Date.now() })); } catch (err) { /* file:// 可能拒绝 */ }
    let runtime;
    try {
      runtime = AntEngine.prepareLevel(base, seed);
    } catch (err) {
      console.error('本关令牌生成失败，退回保守队列', err);
      runtime = AntEngine.prepareLevel(base, seed, { fallback: true });
    }
    state.level = runtime;
    state.queueSeed = runtime.queueSeed;
    state.queueTokenCount = runtime.queueTokenCount;
    noteReached(runtime.no);
    state.game = AntEngine.createState(runtime);
    state.coordinator = AntEngine.createCoordinator(state.game, {
      maxInFlight: MAX_IN_FLIGHT,
      routePlanner: function (targetIdx, reserved) {
        // 起点就是巢穴出口：把屏幕巢穴位置换成盘外最下一行的同一列节点。
        return AntEngine.routeFromNest(state.game, targetIdx, reserved, nestExitNode());
      }
    });
    state.analysis = AntEngine.analyze(state.game);
    state.phase = 'playing';
    state.homeOpen = false;
    state.multiplier = 1;
    state.manualMultiplier = 1;
    state.autoMultiplier = 1;
    state.lastDead = null;
    state.motionScale = 1;
    state.popSlot = -1;
    state.modalOpen = false;
    state.spawnCursor = 0;
    state.incomingSlots = new Set();
    state.pickLocks = new Set();
    state.pickAnimating = false;
    state.slotSig = '';
    state.press = null;
    state.suppressClickUntil = 0;
    state.hintColor = null;
    if (hintChip) hintChip.hidden = true;
    document.querySelectorAll('.hinting').forEach(function (el) { el.classList.remove('hinting'); });
    stopHintPulse();
    state.departureLog = [];
    state.lastRouteStart = null;
    state.propUses = { slot: 0, peek: 0, recall: 0, rush: 0 };
    state.extraSlot = false;
    state.peekUntil = 0;
    state.rushUntil = 0;
    state.recallMode = false;
    state.propSig = '';
    if (state.propTimer) { clearInterval(state.propTimer); state.propTimer = 0; }
    hideTip();
    clearTimeout(state.toastTimer);
    clearAnts();
    boardFrame.style.boxShadow = '';
    boardFrame.classList.remove('preview-on');
    setPreviewOpen(false, true);
    toastEl.hidden = true;
    overlayEl.hidden = true;
    modalEl.innerHTML = '';
    $('home').hidden = true;
    document.body.classList.remove('home-open');
    drawNest();
    drawThumb(previewCanvas, runtime);
    renderAll();
    app.setAttribute('data-slot-count', String(state.game.slots.length));
    renderProps();
    updateSpeedControls();
    scheduleTick(0);
    announce('第 ' + runtime.no + ' 关，' + runtime.name + '，开始');
    scheduleLevelIntro();
  }

  /* ============================================================
     坐标 / 蚂蚁
     ============================================================ */
  function relRect(el) {
    const r = el.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    return { left: r.left - ar.left, top: r.top - ar.top, width: r.width, height: r.height };
  }

  function boardCellSize() {
    return boardCanvas.getBoundingClientRect().width / SIZE;
  }

  function boardCellCenter(i) {
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = cr.width / SIZE;
    const p = AntEngine.xyOf(i);
    return { x: cr.left - ar.left + (p.x + 0.5) * cell, y: cr.top - ar.top + (p.y + 0.5) * cell };
  }

  function boardCellRect(i) {
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = cr.width / SIZE;
    const p = AntEngine.xyOf(i);
    return { left: cr.left - ar.left + p.x * cell, top: cr.top - ar.top + p.y * cell, width: cell, height: cell };
  }

  function nestPoint() {
    const nr = $('nest').getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    return { x: nr.left - ar.left + nr.width / 2, y: nr.top - ar.top + nr.height - 7 };
  }

  // 巢穴出口 -> 盘外虚拟行 y = SIZE + 1 的同一列节点。
  // 这个节点在屏幕上就是巢穴出口，寻路从它开始，不再先跑到盘面底边中点。
  function nestExitNode() {
    const np = nestPoint();
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = cr.width / SIZE;
    if (!cell) return { x: Math.floor(SIZE / 2), y: SIZE + 1 };
    let gx = Math.round((np.x - (cr.left - ar.left)) / cell - 0.5);
    gx = Math.max(-1, Math.min(SIZE, gx));
    return { x: gx, y: SIZE + 1 };
  }

  function isBoardNode(node) {
    return node.x >= 0 && node.x < SIZE && node.y >= 0 && node.y < SIZE;
  }

  function pathNodePoint(node) {
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = cr.width / SIZE;
    if (isBoardNode(node)) return boardCellCenter(node.y * SIZE + node.x);
    // 巢穴出口那一行由屏幕上的真实巢穴位置表示，不按网格中心画，避免视觉瞬移。
    if (node.y === SIZE + 1) return nestPoint();
    return {
      x: cr.left - ar.left + (node.x + 0.5) * cell,
      y: cr.top - ar.top + (node.y + 0.5) * cell
    };
  }

  function positionAnt(el, point) {
    el.style.transform = 'translate(' + Math.round(point.x - ANT_W / 2) + 'px,' + Math.round(point.y - ANT_H / 2) + 'px)';
  }

  function setAntFacing(el, dx, dy) {
    if (dx > 0.01) el._facing = 'right';
    else if (dx < -0.01) el._facing = 'left';
    else if (Math.abs(dy) <= 0.01) return;
    el.classList.toggle('facing-right', el._facing !== 'left');
    el.classList.toggle('facing-left', el._facing === 'left');
  }

  function outSpeed() {
    const rush = rushActive() ? RUSH_FACTOR : 1;
    return AntEngine.NORMAL_PX_PER_MS * state.multiplier * state.motionScale * rush;
  }

  function animatePixelSegment(el, from, to, token) {
    return new Promise(function (resolve) {
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) { positionAnt(el, to); resolve(token === state.runToken); return; }
      let done = 0;
      let last = performance.now();
      function frame(now) {
        if (token !== state.runToken) { resolve(false); return; }
        const dt = Math.min(100, Math.max(0, now - last));
        last = now;
        done = Math.min(dist, done + dt * Math.max(0.001, outSpeed()));
        const t = done / dist;
        positionAnt(el, { x: from.x + dx * t, y: from.y + dy * t });
        if (t >= 1) { resolve(true); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function waitMs(ms, token) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(token === state.runToken); }, ms);
    });
  }

  function pathBlockedForTask(task) {
    const blocked = new Set();
    for (let i = 0; i < SIZE * SIZE; i++) if (state.game.filled[i]) blocked.add(i);
    const stats = state.coordinator ? state.coordinator.stats() : { reservations: [] };
    stats.reservations.forEach(function (r) {
      if (r.id !== task.id) blocked.add(r.idx);
    });
    return blocked;
  }

  function replanFrom(task, current) {
    return AntEngine.planVirtualRoute(state.game, current, task.idx, pathBlockedForTask(task));
  }

  function makeAnt(task) {
    const el = document.createElement('div');
    el.className = 'ant facing-right step';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-task-id', String(task.id));
    el._facing = 'right';
    el.style.setProperty('--paint', color(task.color).hex);
    const body = document.createElement('span');
    body.className = 'ant-body';
    const sprite = document.createElement('span');
    sprite.className = 'ant-sprite';
    body.appendChild(sprite);
    const bucket = document.createElement('span');
    bucket.className = 'ant-bucket';
    el.appendChild(body);
    el.appendChild(bucket);
    positionAnt(el, nestPoint());
    antsLayer.appendChild(el);
    state.antViews.set(task.id, {
      id: task.id,
      slotIndex: task.slotIndex,
      tokenUid: task.tokenUid,
      color: task.color,
      status: 'out',
      idx: null,
      route: task.route
    });
    return el;
  }

  async function moveAntToTarget(task, el, token) {
    const view = state.antViews.get(task.id);
    let point = nestPoint();
    let route = task.route && task.route.length ? task.route.slice() : [];
    if (!route.length) return false;
    let current = route[0];
    // 新路径的第 0 个节点就是巢穴出口（y = SIZE + 1）；旧调用若从盘边起步，才走这一小段。
    if (current.y !== SIZE + 1) {
      if (!await animatePixelSegment(el, point, pathNodePoint(current), token)) return false;
    }
    route = route.slice(1);
    point = pathNodePoint(current);
    view.status = 'walking';
    view.route = route.slice();
    el.classList.add('step');
    let guard = 900;
    while (guard-- > 0) {
      if (token !== state.runToken) return false;
      if (isBoardNode(current) && current.x + current.y * SIZE === task.idx) break;
      if (!route.length) {
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
      }
      const next = route[0];
      const ni = isBoardNode(next) ? next.y * SIZE + next.x : -1;
      // 下一格已被别的蚂蚁填上：原地立刻重规划，不站着干等。
      if (ni >= 0 && state.game.filled[ni]) {
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
        continue;
      }
      const nextPoint = pathNodePoint(next);
      setAntFacing(el, nextPoint.x - point.x, nextPoint.y - point.y);
      if (!await animatePixelSegment(el, point, nextPoint, token)) return false;
      current = next;
      point = nextPoint;
      route.shift();
      view.route = route.slice();
      view.idx = isBoardNode(current) ? current.x + current.y * SIZE : null;
      view.status = 'walking';
    }
    if (token !== state.runToken) return false;
    view.idx = task.idx;
    view.status = 'arrived';
    el.classList.remove('step');
    return true;
  }

  function paintFill(idx, hex, token) {
    return new Promise(function (resolve) {
      const r = boardCellRect(idx);
      const el = document.createElement('span');
      el.className = 'paint-fill';
      el.style.setProperty('--paint', hex);
      el.style.left = Math.round(r.left + r.width * 0.35) + 'px';
      el.style.top = Math.round(r.top + r.height * 0.35) + 'px';
      el.style.width = Math.max(2, Math.round(r.width * 0.3)) + 'px';
      el.style.height = Math.max(2, Math.round(r.height * 0.3)) + 'px';
      antsLayer.appendChild(el);
      const dur = Math.max(50, 170 / Math.max(0.25, state.motionScale));
      const t0 = performance.now();
      function frame(now) {
        if (token !== state.runToken) { el.remove(); resolve(false); return; }
        const t = Math.min(1, (now - t0) / dur);
        const w = r.width * (0.3 + 0.7 * t);
        const h = r.height * (0.3 + 0.7 * t);
        el.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';
        el.style.top = Math.round(r.top + (r.height - h) / 2) + 'px';
        el.style.width = Math.round(w) + 'px';
        el.style.height = Math.round(h) + 'px';
        if (t < 1) { requestAnimationFrame(frame); return; }
        el.remove();
        resolve(true);
      }
      requestAnimationFrame(frame);
    });
  }

  function fadeAnt(el, token) {
    return new Promise(function (resolve) {
      const ms = Math.max(80, Math.round(420 / Math.max(0.25, state.motionScale)));
      el.style.transitionDuration = ms + 'ms';
      el.classList.remove('step');
      void el.offsetWidth;
      el.classList.add('landing');
      setTimeout(function () { resolve(token === state.runToken); }, ms + 20);
    });
  }

  function cleanupAnt(task, el, token) {
    // 换关 / 重来后旧任务的 id 可能与新任务相同，不能误删新任务的视图。
    if (token !== state.runToken) {
      if (el && el.parentNode) el.remove();
      return;
    }
    state.antViews.delete(task.id);
    if (el && el.parentNode) el.remove();
  }

  async function runAnt(task, token) {
    const el = makeAnt(task);
    try {
      const ok = await moveAntToTarget(task, el, token);
      if (!ok || token !== state.runToken) {
        if (token === state.runToken && state.coordinator) {
          state.coordinator.abort(task);
          renderAll();
        }
        return false;
      }
      // 到格后先提桶倾倒，再把整格填满。
      el.classList.add('pouring');
      await waitMs(Math.max(40, 130 / Math.max(0.25, state.motionScale)), token);
      if (token !== state.runToken) return false;
      if (!state.coordinator.canCommit(task)) {
        state.coordinator.abort(task);
        renderAll();
        announce('这枚令牌暂时不落，留在待令区');
        await fadeAnt(el, token);
        return false;
      }
      await paintFill(task.idx, color(task.color).hex, token);
      if (token !== state.runToken) return false;
      if (!state.coordinator.canCommit(task)) {
        state.coordinator.abort(task);
        renderAll();
        announce('这枚令牌暂时不落，留在待令区');
        await fadeAnt(el, token);
        return false;
      }
      const placed = state.coordinator.commit(task);
      el.classList.remove('pouring');
      el.classList.add('placed');
      state.popSlot = task.slotIndex;
      updateSpeed();
      renderAfterCommit();
      announce('填上一格，' + state.game.filledCount + ' / ' + state.game.total);
      // 原地像素渐隐；不回巢。
      await fadeAnt(el, token);
      return placed.done;
    } catch (err) {
      if (token === state.runToken && state.coordinator) state.coordinator.abort(task);
      if (err && err.code !== 'UNSAFE_COMMIT') console.error(err);
      return false;
    } finally {
      cleanupAnt(task, el, token);
    }
  }

  /* ============================================================
     令牌移入待令区 / 预选向上补位：真实连续位移
     ============================================================ */
  function captureColumn(c) {
    const colEl = matGrid.querySelector('.mat-col[data-col="' + c + '"]');
    const out = { tokens: [], hidden: null };
    if (!colEl) return out;
    colEl.querySelectorAll('.token[data-id]').forEach(function (el) {
      out.tokens.push({
        row: parseInt(el.getAttribute('data-row'), 10),
        color: el.getAttribute('data-color'),
        n: (el.querySelector('.token-count') || el).textContent.trim(),
        rect: relRect(el)
      });
    });
    out.tokens.sort(function (a, b) { return a.row - b.row; });
    const hiddenEl = colEl.querySelector('.queue-hidden');
    if (hiddenEl) out.hidden = relRect(hiddenEl);
    return out;
  }

  function makeGhost(rect, colorKey, n) {
    const c = color(colorKey);
    const el = document.createElement('div');
    el.className = 'token token-ghost';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    el.style.background = c.hex;
    el.style.color = c.ink;
    el.style.borderColor = c.dark;
    el.textContent = n;
    el.style.transform = 'translate(' + Math.round(rect.left) + 'px,' + Math.round(rect.top) + 'px)';
    antsLayer.appendChild(el);
    return el;
  }

  function animateGhost(el, fromX, fromY, toX, toY, duration, token) {
    return new Promise(function (resolve) {
      const t0 = performance.now();
      function frame(now) {
        if (token !== state.runToken) { el.remove(); resolve(false); return; }
        const t = Math.min(1, (now - t0) / Math.max(1, duration));
        const x = Math.round(fromX + (toX - fromX) * t);
        const y = Math.round(fromY + (toY - fromY) * t);
        el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        if (t < 1) { requestAnimationFrame(frame); return; }
        resolve(true);
      }
      requestAnimationFrame(frame);
    });
  }

  async function animatePick(c, old, picked) {
    const game = state.game;
    const token = state.runToken;
    const colEl = matGrid.querySelector('.mat-col[data-col="' + c + '"]');
    if (!colEl) return;
    colEl.classList.add('animating');
    const frontBtn = colEl.querySelector('.token.front');
    if (frontBtn) frontBtn.classList.add('off');
    const slotEl = slotsEl.querySelector('[data-slot="' + picked.slotIndex + '"]');
    if (!slotEl) {
      state.incomingSlots.delete(picked.slotIndex);
      state.pickLocks.delete(c);
      state.pickAnimating = state.pickLocks.size > 0;
      if (state.pickAnimating) {
        renderSlots(false);
        drawBoard();
        updateHeader();
      } else {
        renderAll();
      }
      kick();
      return;
    }
    const slotRect = relRect(slotEl);
    const flightDur = Math.max(60, 330 / Math.max(0.25, state.motionScale));
    const shiftDur = Math.max(40, 240 / Math.max(0.25, state.motionScale));
    const jobs = [];
    const ghostEls = [];

    // 队首令牌：完整颜色 + 数量一起飞向目标待令格。
    if (old.tokens[0]) {
      const from = old.tokens[0].rect;
      const g = makeGhost(from, old.tokens[0].color, old.tokens[0].n);
      ghostEls.push(g);
      const tx = slotRect.left + (slotRect.width - from.width) / 2;
      const ty = slotRect.top + (slotRect.height - from.height) / 2;
      jobs.push(animateGhost(g, from.left, from.top, tx, ty, flightDur, token));
    }
    // 第二、三排真实向上补位；目标位置在到达前不出现下一令。
    if (old.tokens[1] && old.tokens[0]) {
      const from = old.tokens[1].rect, to = old.tokens[0].rect;
      const g = makeGhost(from, old.tokens[1].color, old.tokens[1].n);
      ghostEls.push(g);
      jobs.push(animateGhost(g, from.left, from.top, to.left, to.top, shiftDur, token));
    }
    if (old.tokens[2] && old.tokens[1]) {
      const from = old.tokens[2].rect, to = old.tokens[1].rect;
      const g = makeGhost(from, old.tokens[2].color, old.tokens[2].n);
      ghostEls.push(g);
      jobs.push(animateGhost(g, from.left, from.top, to.left, to.top, shiftDur, token));
    }
    // 隐藏行补进第三排：从「+N令」的位置向上滑入，不提前显示终态。
    const newPos = game.colPos[c];
    const incomingGroup = game.columns[c][newPos + 2];
    if (incomingGroup && old.tokens[2]) {
      const to = old.tokens[2].rect;
      const from = old.hidden || { left: to.left, top: to.top + to.height + 6, width: to.width, height: to.height };
      const g = makeGhost({ left: from.left, top: from.top, width: to.width, height: to.height }, incomingGroup.color, incomingGroup.n);
      ghostEls.push(g);
      jobs.push(animateGhost(g, from.left, from.top, to.left, to.top, shiftDur, token));
    }

    await Promise.all(jobs);
    ghostEls.forEach(function (g) { if (g.parentNode) g.remove(); });
    if (token !== state.runToken) return;
    if (!state.pickAnimating) colEl.classList.remove('animating');
    state.incomingSlots.delete(picked.slotIndex);
    state.pickLocks.delete(c);
    state.pickAnimating = state.pickLocks.size > 0;
    state.slotSig = '';
    if (state.pickAnimating) {
      // 其他列还在飞入：只刷新槽位 / 盘面，不重建预选区，避免把别人的动画源换掉。
      renderSlots(false);
      drawBoard();
      updateHeader();
    } else {
      renderAll();
    }
    if (!state.tips['first-slot']) {
      // 欢迎 / 新机制气泡正在显示时也不丢掉这条一次性说明，排在它后面再出现。
      queueIntroTip({
        key: 'first-slot',
        text: '数字是这枚令牌还没出发的蚂蚁数；能出发时，右上角会出现小红旗。',
        anchor: 'board',
        ms: 4400
      });
    }
    kick();
  }

  function showFullFeedback() {
    // 只在用户再点队首、企图取令时调用；不在蚂蚁搬运途中自动弹。
    const n = state.game ? state.game.slots.length : 5;
    showTip('full', '待令区 ' + n + ' 格都满了：先等一枚令牌腾位，或用道具 / 点「重来」免费重开。', 'slots', 4200, true);
    toast('待令区已满：等一枚令牌腾位，或重来', 2000);
    announce('待令区已满，当前不能取新令牌；已有蚂蚁仍在正常搬运。');
  }

  async function pickColumn(c, opts) {
    const userInitiated = !opts || opts.user !== false;
    if (state.phase !== 'playing' || state.modalOpen || !state.game) return false;
    // 召回选格模式暂停新派工：鼠标 / 触摸 / 键盘都不能再往待令区塞新令牌。
    if (state.recallMode) {
      if (userInitiated) toast('召回选格中：先点高亮待令格，或再点召回令取消', 1600);
      return false;
    }
    // 每列独立锁：同一列在飞入动画期间防重复扣数；其他列仍可立即取令。
    if (state.pickLocks.has(c)) return false;
    const game = state.game;
    if (AntEngine.isQueueExhausted(game)) return false;
    if (!game.slots.some(function (s) { return !s; })) {
      if (userInitiated) showFullFeedback();
      return false;
    }
    const group = game.columns[c][game.colPos[c]];
    if (!group) return false;
    // 新手 / 新机制气泡不再因为第一次取令而立刻消失；它们会按自身时长收起。
    const old = captureColumn(c);
    const picked = AntEngine.pick(game, c);
    if (!picked) return false;
    state.pickLocks.add(c);
    state.pickAnimating = true;
    state.incomingSlots.add(picked.slotIndex);
    state.slotSig = '';
    updateHeader();
    renderSlots(true);
    announce('第 ' + (c + 1) + ' 列一枚令牌进入待令格 ' + (picked.slotIndex + 1));
    try {
      await animatePick(c, old, picked);
    } finally {
      // 动画异常也不能把队首永久锁死；只清这一列的锁。
      if (state.pickLocks.has(c)) {
        state.pickLocks.delete(c);
        state.pickAnimating = state.pickLocks.size > 0;
        state.incomingSlots.delete(picked.slotIndex);
        state.slotSig = '';
        if (state.pickAnimating) {
          renderSlots(false);
          drawBoard();
          updateHeader();
        } else {
          renderAll();
        }
        kick();
      }
    }
    return true;
  }

  /* ============================================================
     并行派工 / 胜负
     ============================================================ */
  function scheduleTick(ms) {
    if (state.tickTimer) return;
    const token = state.runToken;
    state.tickTimer = setTimeout(function () {
      state.tickTimer = 0;
      if (token !== state.runToken) return;
      tick();
    }, Math.max(0, ms));
  }

  function spawnInterval() {
    const speed = state.multiplier * Math.max(0.25, state.motionScale) * (rushActive() ? RUSH_FACTOR : 1);
    // 稳定、连续的单只派遣节奏；不按“整批完成”再发，也不固定小批量。
    return Math.max(30, 340 / speed);
  }

  function dispatchNext() {
    if (state.phase !== 'playing' || state.modalOpen || !state.coordinator) return 0;
    // 召回选格模式：暂停「新派工」，让可召回令牌的在途状态稳定下来；
    // 已在途的蚂蚁继续正常落色，不冻结动画、不改规则。
    if (state.recallMode) return 0;
    if (state.game.filledCount >= state.game.total) return 0;
    if (state.coordinator.activeCount() >= MAX_IN_FLIGHT) return 0;
    const slotCount = state.game.slots.length;
    for (let k = 0; k < slotCount; k++) {
      const s = (state.spawnCursor + k) % slotCount;
      // 正在飞入的槽位先不派工；其他已到达的槽位可以继续派。
      if (state.incomingSlots.has(s)) continue;
      const task = state.coordinator.dispatch(s);
      if (!task) continue;
      state.spawnCursor = (s + 1) % slotCount;
      const token = state.runToken;
      const p = runAnt(task, token).finally(function () {
        state.animating.delete(p);
        if (state.phase === 'playing') scheduleTick(0);
      });
      state.animating.add(p);
      state.slotSig = '';
      state.departureLog.push({
        at: Math.round(performance.now()),
        slotIndex: s,
        idx: task.idx,
        color: task.color,
        routeStart: task.route && task.route[0] ? { x: task.route[0].x, y: task.route[0].y } : null,
        inFlight: state.coordinator.activeCount()
      });
      state.lastRouteStart = task.route && task.route[0] ? { x: task.route[0].x, y: task.route[0].y } : null;
      if (state.departureLog.length > 240) state.departureLog.shift();
      renderSlots(false);
      // 某一令牌最后一只出巢后槽位会空出来；同步刷新队首可用状态和「满格」标记，
      // 不再让旧 DOM 的 .off 把队首永久置灰。
      if (!state.game.slots[s] && !state.press && state.pickLocks.size === 0) renderMaterials();
      updateHeader();
      drawBoard();
      if (!state.tips['first-parallel'] && !introTipBusy()) {
        const colors = new Set(state.coordinator.stats().reservations.map(function (r) { return r.color; }));
        if (colors.size >= 2) {
          showTip('first-parallel', '不同颜色的令牌可以同时在途；四列队首轮流点，盘面会连续填色。', 'board', 5200);
        }
      }
      return 1;
    }
    return 0;
  }

  function tick() {
    if (state.tickRunning) return;
    state.tickRunning = true;
    const token = state.runToken;
    try {
      if (token !== state.runToken || state.phase !== 'playing') return;
      if (state.modalOpen) { scheduleTick(140); return; }
      updateSpeed();
      const started = dispatchNext();
      if (started > 0) { scheduleTick(spawnInterval()); return; }
      if (state.coordinator.activeCount() > 0 || state.animating.size > 0 || state.incomingSlots.size > 0) { scheduleTick(70); return; }
      if (state.recallMode) {
        if (AntEngine.isWin(state.game)) { finishWin(); return; }
        scheduleTick(120);
        return;
      }
      afterSettle();
    } finally {
      state.tickRunning = false;
    }
  }

  function kick() {
    if (state.phase !== 'playing') return;
    scheduleTick(0);
  }

  function afterSettle() {
    if (state.phase !== 'playing') return;
    state.analysis = AntEngine.analyze(state.game);
    renderAll();
    if (AntEngine.isWin(state.game)) { finishWin(); return; }
    const dead = AntEngine.deadlock(state.game);
    if (dead) { finishLoss(dead); return; }
    const waiting = state.analysis.slots.filter(function (s) { return !s.empty && s.waiting; });
    if (waiting.length) {
      showTip('seal', '内部余白还没填满，最后一格会先在待令区等；填完后会自动继续，不会封口。', 'slots', 4600);
    }
  }

  function finishWin() {
    if (state.phase === 'won') return;
    state.phase = 'won';
    clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    markDone((state.level || LEVELS[state.levelIndex]).no);
    renderAll();
    renderProps();
    boardFrame.style.boxShadow = 'inset 0 0 0 2px #f5d389, inset 0 0 0 5px #b1833e, 0 0 0 2px #f5d389, 6px 6px 0 #050c09';
    announce('画作完成：' + (state.level || LEVELS[state.levelIndex]).name);
    setTimeout(function () {
      if (state.phase !== 'won') return;
      openWinModal();
    }, 320);
  }

  function finishLoss(dead) {
    if (state.phase === 'lost') return;
    state.phase = 'lost';
    state.lastDead = dead || null;
    clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    renderAll();
    renderProps();
    openLossModal(dead);
  }

  /* ============================================================
     弹层
     ============================================================ */
  function setModalOpen(open) {
    state.modalOpen = open;
    overlayEl.hidden = !open;
    if (!open) {
      modalEl.innerHTML = '';
      kick();
    }
  }
  function openOverlay(html) {
    state.modalOpen = true;
    if (state.previewOpen) setPreviewOpen(false, true);
    if (state.press) endPress(null, true);
    hideTip();
    overlayEl.hidden = false;
    modalEl.innerHTML = html;
    const focusable = modalEl.querySelector('button');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 0);
  }
  function closeOverlay() {
    if (state.phase === 'won') { openWinModal(); return; }
    if (state.phase === 'lost') { openLossModal(state.lastDead); return; }
    setModalOpen(false);
    renderAll();
  }

  function helpHTML() {
    const level = state.level || LEVELS[state.levelIndex];
    const minSteps = Number(level.minimumSteps || 0);
    const mech = String(level.mechanic || '').split(' · ').filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · ');
    return [
      '<div class="modal-kicker">提示 · 当前规则与本关机制</div>',
      '<h2>怎么玩</h2>',
      '<p>首页按主题选关，一关一解锁。点四列第一排的纯色令牌，送进待令区；小画师会从巢穴出口直接出发，提同色颜料桶，把盘面上同色的空格逐格填满。</p>',
      '<div class="rule"><b>本关 · 第 ' + level.no + ' 关「' + level.name + '」</b><br>难度 ' + level.difficulty + ' / 10 · 像素 ' + level.pixelUnit + '× · 机制：' + (mech || '像素填色') + '。' +
        (minSteps ? '本关最少 <b>' + minSteps + ' 步</b>（一步 = 点一次队首令牌）。' : '本关最少步数待配置。') +
        '这里只说明规则和机制，不显示整关答案，也不会自动取令。</div>',
      '<div class="rule"><span class="num">1</span><b>只点第一排</b><br>每列只显示三行令牌。第四枚及以后不画出来，只显示「+N令」；N 是隐藏的令牌枚数。只要还有空待令位，队首就能先入区等待，即使暂时没有可派的目标。</div>',
      '<div class="rule"><span class="num">2</span><b>长按看同色</b><br>长按任意可见令牌，或待令区里的令牌，按住时会走一条 4 格像素进度条；激活后盘面亮起同色位置，右下角显示同色格数。松手就收起，不取令、不占格。原图铺满预览时长按同样有效，松开只收起高亮，不退出预览。</div>',
      '<div class="rule"><span class="num">3</span><b>数字、休眠 Zz 和小旗</b><br>待令格默认 5 位（第 3 关道具可临时开第 6 位）。数字是这枚令牌还没出发的蚂蚁数；能出发时右上出现小红旗，暂时不能派工时显示像素风 Zz 休眠标记；空槽不显示 Zz。五格满了以后，只有你再点队首才会提示「已满」，蚂蚁搬运途中不会自动弹。</div>',
      '<div class="rule"><span class="num">4</span><b>从巢穴出口直接出发、不踩已铺格</b><br>路径从屏幕巢穴出口开始，经盘外环路绕到目标，不先跑到盘面中间，也不直线穿过已铺格。每只蚂蚁在即将出巢时才确认并预约自己的目标；预约会在目标格左上角显示一个小角标，预约不等于已经填色。</div>',
      '<div class="rule"><span class="num">5</span><b>内部未满不封口</b><br>最后一枚同色令牌会留在待令区等；内部填完后自动继续。四列令牌取完会自动 8×；手动倍速可随时选 1/2/4/8×，自动 8× 是下限，不会被手动悄悄覆盖。</div>' +
      '<div class="rule"><b>道具（本地免费，每关重置次数）</b><br>到达对应关即解锁：第 3 关「备用巢格」本关多开 1 个待令位（默认仍是 5 格）；第 4 关「预窥令」8 秒看清每列隐藏的下一枚；第 8 关「召回令」把一枚还没出巢的待令令牌退回原列队首（选格期间暂停新派工，再点一次召回令可取消）；第 10 关「疾行令」8 秒内移动与出巢节奏 ×2。道具不绕过封口，不加付费 / 广告 / 联网。</div>' +
      '<div class="rule"><b>原图预览</b><br>点洞穴右侧的完整原图缩略图，会把原图铺满盘面；再点缩略图（或盘面）还原。预览只换画面，不改填色进度。</div>' +
      '<div class="rule"><b>推荐节奏</b><br>一列一列点：等这一列的小画师基本填完或开始等待，再点下一列，更容易通关；任意顺序失败都可免费重来。</div>',
      '<div class="legend">' +
        '<span><i style="background:#d9c9a3;border-color:#8d7a56"></i>未施工</span>' +
        '<span><i style="background:#6c9659"></i>已填色</span>' +
        '<span><i style="background:#26352c;border-color:#695a42"></i>待令格</span>' +
        '<span><i style="background:#8f231d"></i>可出发小旗</span>' +
      '</div>',
      '<div class="seed-note">本局 seed <b>' + (state.queueSeed >>> 0) + '</b> · 正常换关 / 重试会换新 seed；开发复现可加 <b>?seed=' + (state.queueSeed >>> 0) + '</b></div>',
      '<div class="modal-actions"><button type="button" class="btn primary" data-action="close-help">知道了</button></div>'
    ].join('');
  }
  function openHelp() { openOverlay(helpHTML()); }

  function themeForIndex(i) {
    if (!THEME_LIST.length) return { name: '全部关卡', blurb: '', start: 1, count: LEVELS.length };
    return THEME_LIST[Math.max(0, Math.min(THEME_LIST.length - 1, i))];
  }

  function drawHomeThumbs() {
    document.querySelectorAll('#levelGrid canvas[data-thumb]').forEach(function (cv) {
      const i = parseInt(cv.getAttribute('data-thumb'), 10);
      if (LEVELS[i]) drawThumb(cv, LEVELS[i]);
    });
  }

  function renderHome() {
    const total = LEVELS.length;
    const done = doneCount();
    $('homeDone').textContent = String(done);
    $('homeTotal').textContent = String(total);
    $('homeProgressBar').style.width = (done / Math.max(1, total) * 100).toFixed(2) + '%';

    // 主题标签
    const tabs = [];
    THEME_LIST.forEach(function (t, i) {
      let td = 0;
      for (let k = t.start - 1; k < Math.min(LEVELS.length, t.start - 1 + t.count); k++) if (hasDone(LEVELS[k].no)) td++;
      tabs.push('<button type="button" class="theme-tab' + (i === state.homeTheme ? ' on' : '') + '" data-theme="' + i + '" role="tab" aria-selected="' + (i === state.homeTheme ? 'true' : 'false') + '">' +
        '<span class="theme-tab-name">' + t.name + '</span>' +
        '<span class="theme-tab-count">' + td + '/' + t.count + '</span>' +
      '</button>');
    });
    $('themeTabs').innerHTML = tabs.join('');

    const theme = themeForIndex(state.homeTheme);
    $('themeKicker').textContent = '主题 ' + (state.homeTheme + 1) + ' / ' + Math.max(1, THEME_LIST.length);
    $('themeTitle').textContent = theme.name;
    const mechs = [];
    for (let k = theme.start - 1; k < Math.min(LEVELS.length, theme.start - 1 + theme.count); k++) {
      const tag = String(LEVELS[k].mechanic || '').split(' · ')[0];
      if (tag && mechs.indexOf(tag) === -1) mechs.push(tag);
      if (mechs.length >= 2) break;
    }
    $('themeBlurb').textContent = (theme.blurb || '') + (mechs.length ? ' · 机制：' + mechs.join(' / ') : '');

    // 关卡网格
    const cards = [];
    for (let k = theme.start - 1; k < Math.min(LEVELS.length, theme.start - 1 + theme.count); k++) {
      const lv = LEVELS[k];
      const unlocked = isUnlocked(lv.no) || hasDone(lv.no);
      const doneLv = hasDone(lv.no);
      const cls = ['level-card'];
      if (doneLv) cls.push('done');
      if (!unlocked) cls.push('locked');
      const pips = [];
      for (let p = 0; p < 5; p++) pips.push('<i class="' + (p < Math.ceil(lv.difficulty / 2) ? 'on' : '') + '"></i>');
      cards.push('<button type="button" class="' + cls.join(' ') + '" data-level="' + k + '"' + (unlocked ? '' : ' disabled aria-disabled="true"') + '>' +
        '<span class="lvl-art">' +
          (unlocked ? '<canvas width="30" height="30" data-thumb="' + k + '" aria-hidden="true"></canvas>' : '<span class="lvl-lock" aria-hidden="true"></span>') +
          '<span class="lvl-no">' + lv.no + '</span>' +
          (doneLv ? '<span class="lvl-done" aria-hidden="true">✓</span>' : '') +
        '</span>' +
        '<span class="lvl-name">' + lv.name + '</span>' +
        '<span class="lvl-meta"><span class="lvl-diff" aria-label="难度 ' + lv.difficulty + '">' + pips.join('') + '</span><span class="lvl-unit">像素 ' + lv.pixelUnit + '×</span></span>' +
      '</button>');
    }
    $('levelGrid').innerHTML = cards.join('');

    const next = firstUnfinishedUnlocked();
    const nextLevel = LEVELS[next];
    const allDone = done >= total;
    $('homeNext').textContent = allDone ? '200 关全部画成' : '继续第 ' + nextLevel.no + ' 关';
    $('homeNext').disabled = allDone;
    $('homeNext').setAttribute('data-level', String(next));
    drawHomeThumbs();
  }

  function openHome(opts) {
    const options = opts || {};
    state.homeOpen = true;
    state.phase = 'home';
    state.runToken++;
    clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    state.tickRunning = false;
    state.pickLocks = new Set();
    state.pickAnimating = false;
    state.incomingSlots = new Set();
    state.press = null;
    state.hintColor = null;
    stopHintPulse();
    if (hintChip) hintChip.hidden = true;
    document.querySelectorAll('.hinting').forEach(function (el) { el.classList.remove('hinting'); });
    state.recallMode = false;
    state.peekUntil = 0;
    state.rushUntil = 0;
    if (state.propTimer) { clearInterval(state.propTimer); state.propTimer = 0; }
    state.animating.clear();
    clearAnts();
    hideTip();
    clearTimeout(state.toastTimer);
    toastEl.hidden = true;
    overlayEl.hidden = true;
    modalEl.innerHTML = '';
    state.modalOpen = false;
    if (typeof options.theme === 'number') state.homeTheme = options.theme;
    else if (state.level) state.homeTheme = state.level.themeIndex || 0;
    $('home').hidden = false;
    document.body.classList.add('home-open');
    renderHome();
    announce('选关首页：已画成 ' + doneCount() + ' / ' + LEVELS.length + '；点亮的关卡才能进入');
  }

  // 兼容旧调用：返回 / 选关现在都进入首页。
  function openLevels() {
    openHome();
  }

  function openWinModal() {
    const level = state.level || LEVELS[state.levelIndex];
    const last = state.levelIndex >= LEVELS.length - 1;
    const allDone = LEVELS.every(function (l) { return hasDone(l.no); });
    const remain = LEVELS.filter(function (l) { return !hasDone(l.no); }).length;
    const tail = allDone ? '200 关全部画完。' : (remain === 1 ? '还有 1 关在首页等你。' : '还有 ' + remain + ' 关在首页等你。');
    const html = [
      '<div class="modal-kicker">' + (allDone ? '全部画作完成' : '第 ' + level.no + ' 关 · 完成') + '</div>',
      '<h2>画作完成</h2>',
      '<div class="big-done">' + level.name + ' 画好了。</div>',
      '<div class="done-object"><span class="dot"></span><span class="txt"><b>' + state.game.total + ' 格</b>全部填上，原图应绘制的位置都有实际颜色。<br>' + tail + '</span></div>',
      '<div class="modal-actions">' +
        (last ? '' : '<button type="button" class="btn primary" data-action="next-level">下一关</button>') +
        '<button type="button" class="btn" data-action="retry">再画一次</button>' +
        '<button type="button" class="btn" data-action="levels">选关</button>' +
      '</div>'
    ].join('');
    openOverlay(html);
  }

  function openLossModal(dead) {
    const chips = [];
    state.game.slots.forEach(function (slot) {
      if (!slot) return;
      chips.push('<span class="stuck-chip"><i style="background:' + color(slot.color).hex + '"></i>剩 ' + slot.remaining + '</span>');
    });
    const full = dead && dead.reason === 'full';
    const html = [
      '<div class="modal-kicker">待令区堵死 · 免费重来</div>',
      '<h2>' + (full ? state.game.slots.length + ' 个待令格都满了' : '没有可落块的目标了') + '</h2>',
      '<p>' + (full
        ? '这些令牌都在等内部余白被别的颜色填掉。待令区没有空位，第一排也拿不上来了。'
        : '待令区和四列队首都没有能落块的目标了；令牌还在等内部余白，但已经没有新的颜色进来。') + '</p>',
      '<div class="stuck-list">' + chips.join('') + '</div>',
      '<div class="rule"><b>为什么输</b><br>多枚不同的令牌同时等待内部。先填里面，或少拿一枚需要等待的令牌；也可以直接免费重来。</div>',
      '<div class="modal-actions"><button type="button" class="btn primary" data-action="retry">免费重来</button><button type="button" class="btn" data-action="levels">选关</button></div>'
    ].join('');
    openOverlay(html);
  }

  /* ============================================================
     输入
     ============================================================ */
  matGrid.addEventListener('click', function (ev) {
    if (performance.now() < state.suppressClickUntil) return;
    const btn = ev.target.closest('.token.front[data-col]');
    if (!btn || btn.classList.contains('off')) return;
    pickColumn(parseInt(btn.getAttribute('data-col'), 10), { user: true });
  });

  matGrid.addEventListener('pointerdown', function (ev) {
    const el = ev.target.closest('.token[data-color]');
    if (!el) return;
    beginPress(ev, el);
  });

  slotsEl.addEventListener('pointerdown', function (ev) {
    if (state.recallMode) return;
    const el = ev.target.closest('.slot.filled[data-color]');
    if (!el) return;
    beginPress(ev, el);
  });

  slotsEl.addEventListener('click', function (ev) {
    if (!state.recallMode) return;
    const el = ev.target.closest('.slot[data-slot]');
    if (!el) return;
    recallSlot(parseInt(el.getAttribute('data-slot'), 10));
  });

  $('propsGrid').addEventListener('click', function (ev) {
    const btn = ev.target.closest('.prop-btn[data-prop]');
    if (!btn || btn.disabled) return;
    useProp(btn.getAttribute('data-prop'));
  });

  window.addEventListener('pointermove', cancelPressForMove, true);
  window.addEventListener('pointerup', function (ev) { endPress(ev, false); }, true);
  window.addEventListener('pointercancel', function (ev) { endPress(ev, true); }, true);
  window.addEventListener('blur', function () { endPress(null, true); });
  window.addEventListener('pagehide', function () { endPress(null, true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) endPress(null, true);
  });
  matGrid.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  slotsEl.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  tipBubble.addEventListener('click', hideTip);

  previewCard.addEventListener('click', function (ev) {
    ev.preventDefault();
    togglePreview();
  });
  boardCanvas.addEventListener('click', function () {
    if (performance.now() < state.suppressClickUntil) return;
    if (state.previewOpen) togglePreview();
  });
  document.querySelectorAll('.speed-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setManualSpeed(parseInt(btn.getAttribute('data-speed'), 10));
    });
  });

  $('themeTabs').addEventListener('click', function (ev) {
    const btn = ev.target.closest('.theme-tab[data-theme]');
    if (!btn) return;
    state.homeTheme = parseInt(btn.getAttribute('data-theme'), 10) || 0;
    renderHome();
  });

  $('levelGrid').addEventListener('click', function (ev) {
    const btn = ev.target.closest('.level-card[data-level]');
    if (!btn || btn.disabled) return;
    const i = parseInt(btn.getAttribute('data-level'), 10);
    if (!Number.isInteger(i)) return;
    if (!(isUnlocked(LEVELS[i].no) || hasDone(LEVELS[i].no))) {
      toast('这一关还没解锁：先画成上一关', 1600);
      return;
    }
    loadLevel(i);
  });

  $('homeNext').addEventListener('click', function () {
    const i = parseInt($('homeNext').getAttribute('data-level'), 10);
    if (!Number.isInteger(i) || $('homeNext').disabled) return;
    loadLevel(i);
  });

  $('backBtn').addEventListener('click', function () {
    if (state.modalOpen) return;
    openLevels();
  });
  $('restartBtn').addEventListener('click', function () {
    loadLevel(state.levelIndex);
    toast('本关已重置 · 免费', 1400);
  });
  $('helpBtn').addEventListener('click', function () {
    if (state.phase === 'won' || state.phase === 'lost') return;
    openHelp();
  });

  overlayEl.addEventListener('click', function (ev) {
    if (ev.target === overlayEl) {
      if (state.phase === 'playing') closeOverlay();
      return;
    }
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'close-help' || action === 'close-levels') {
      closeOverlay();
    } else if (action === 'pick-level') {
      const i = parseInt(btn.getAttribute('data-level'), 10);
      setModalOpen(false);
      loadLevel(i);
    } else if (action === 'next-level') {
      setModalOpen(false);
      loadLevel(state.levelIndex + 1);
    } else if (action === 'retry') {
      setModalOpen(false);
      loadLevel(state.levelIndex);
    } else if (action === 'levels') {
      setModalOpen(false);
      openLevels();
    }
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (state.previewOpen) { togglePreview(); return; }
      if (state.modalOpen && state.phase === 'playing') closeOverlay();
    }
    if (state.modalOpen || state.phase !== 'playing') return;
    if (ev.key >= '1' && ev.key <= '4') pickColumn(parseInt(ev.key, 10) - 1, { user: true });
  });

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state.game) {
        drawBoard();
        drawNest();
        renderSlots(true);
      }
    }, 120);
  });

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    setupCanvas();
    drawNest();
    loadLevel(bootLevel, bootSeed ? { seed: bootSeed } : undefined);
    if (!bootFromLevelParam) {
      setTimeout(function () {
        if (!state.homeOpen) openHome({ theme: 0 });
      }, 0);
    }
  }

  // 供本地开发自测 / 截图脚本使用，不进入玩法。
  window.AntGame = {
    loadLevel: loadLevel,
    pickColumn: pickColumn,
    openLevels: openLevels,
    openHome: openHome,
    isUnlocked: isUnlocked,
    levelThemes: THEME_LIST,
    showTip: showTip,
    hideTip: hideTip,
    resetTips: function () { state.tips = Object.create(null); saveTips(); hideTip(); },
    getState: function () {
      const stats = state.coordinator ? state.coordinator.stats() : { inFlight: 0, reservations: [], byToken: {} };
      let waiting = [];
      if (state.analysis) {
        waiting = state.analysis.slots
          .filter(function (s) { return !s.empty && s.waiting; })
          .map(function (s) { return { index: s.index, color: s.color, remaining: s.remaining }; });
      } else {
        state.game.slots.forEach(function (slot, i) {
          if (!slot) return;
          if (AntEngine.legalTargets(state.game, slot.color, null, slot.cells).length === 0) {
            waiting.push({ index: i, color: slot.color, remaining: slot.remaining });
          }
        });
      }
      const hiddenCounts = [];
      for (let c = 0; c < 4; c++) hiddenCounts.push(hiddenCount(c));
      const cons = state.game ? conservation() : { placed: 0, unpicked: 0, inArea: 0, inFlight: 0, total: 0, sum: 0 };
      const byToken = stats.byToken || {};
      const candidateCounts = [];
      const legalCounts = [];
      if (state.coordinator) {
        for (let i = 0; i < state.game.slots.length; i++) {
          candidateCounts.push(state.coordinator.candidateCount(i));
          legalCounts.push(state.coordinator.legalCount(i));
        }
      }
      const currentLevel = state.level || LEVELS[state.levelIndex];
      return {
        levelIndex: state.levelIndex,
        levelNo: currentLevel.no,
        levelName: currentLevel.name,
        levelTheme: currentLevel.themeName,
        themeIndex: currentLevel.themeIndex,
        difficulty: currentLevel.difficulty,
        pixelUnit: currentLevel.pixelUnit,
        levelCount: LEVELS.length,
        queueSeed: state.queueSeed,
        queueTokenCount: state.queueTokenCount,
        minimumSteps: Number(currentLevel.minimumSteps || 0),
        queueTarget: Number(currentLevel.queueTarget || 0),
        queueMode: currentLevel.queueMode || '',
        queueGeneration: currentLevel.queueGeneration || null,
        queueFallback: !!(currentLevel.queueGeneration && currentLevel.queueGeneration.fallback),
        queueTokens: (currentLevel.groups || []).map(function (g) { return { color: g.color, n: g.n }; }),
        queueColumns: (currentLevel.columns || []).map(function (col) {
          return col.map(function (id) {
            const g = (currentLevel.groups || []).find(function (x) { return x.id === id; });
            return g ? { color: g.color, n: g.n } : null;
          });
        }),
        stepDefinition: currentLevel.stepDefinition || '',
        queueVerified: !!(state.game && state.game.level && state.game.level.queueVerified),
        homeOpen: state.homeOpen,
        unlocked: (function () { const out = []; for (let i = 0; i < LEVELS.length; i++) out.push(isUnlocked(LEVELS[i].no) || hasDone(LEVELS[i].no)); return out; })(),
        doneCount: doneCount(),
        phase: state.phase,
        multiplier: state.multiplier,
        displayMultiplier: state.multiplier * (rushActive() ? RUSH_FACTOR : 1),
        manualMultiplier: state.manualMultiplier,
        autoMultiplier: state.autoMultiplier,
        normalMultiplier: 1,
        maxInFlight: MAX_IN_FLIGHT,
        reachedMax: reachedStage(),
        propUses: Object.assign({}, state.propUses),
        props: PROPS.map(function (p) {
          return {
            key: p.key,
            name: p.name,
            unlock: p.unlock,
            uses: p.uses,
            left: propRemaining(p),
            unlocked: propUnlocked(p),
            active: (p.key === 'slot' && state.extraSlot) || (p.key === 'peek' && peekActive()) ||
              (p.key === 'rush' && rushActive()) || (p.key === 'recall' && state.recallMode)
          };
        }),
        extraSlot: state.extraSlot,
        slotCount: state.game.slots.length,
        peekActive: peekActive(),
        peekUntil: state.peekUntil,
        peekNext: (function () {
          const out = [];
          for (let c = 0; c < 4; c++) {
            const q = state.game.columns[c];
            const pos = state.game.colPos[c];
            const g = q[pos + VISIBLE_ROWS];
            out.push(g ? { color: g.color, n: g.n } : null);
          }
          return out;
        })(),
        rushActive: rushActive(),
        rushUntil: state.rushUntil,
        recallMode: state.recallMode,
        recallable: recallableSlots(),
        queuesExhausted: state.game ? AntEngine.isQueueExhausted(state.game) : false,
        speedBadge: $('speedBadge').textContent,
        speedNote: $('speedAuto') ? $('speedAuto').textContent : '',
        filled: state.game.filledCount,
        total: state.game.total,
        slots: state.game.slots.map(function (s, i) {
          if (!s) return null;
          const inFlight = byToken[s.uid] || 0;
          return {
            uid: s.uid,
            id: s.id,
            color: s.color,
            n: s.n,
            remaining: s.remaining,
            inFlight: inFlight,
            undeparted: s.remaining,
            canLaunch: slotCanLaunch(i)
          };
        }),
        colPos: state.game.colPos.slice(),
        columnLengths: state.game.columns.map(function (c) { return c.length; }),
        columnLeft: state.game.columns.map(function (c, i) { return c.length - state.game.colPos[i]; }),
        remainingTokens: remainingTokens(),
        hiddenCounts: hiddenCounts,
        deadlock: AntEngine.deadlock(state.game),
        waiting: waiting,
        inFlight: stats.inFlight,
        reservations: stats.reservations,
        candidateCounts: candidateCounts,
        legalCounts: legalCounts,
        departures: state.departureLog.slice(-60),
        lastRouteStart: state.lastRouteStart,
        nestExit: state.game ? nestExitNode() : null,
        nestPoint: state.game ? nestPoint() : null,
        activeAnts: state.animating.size,
        ants: Array.from(state.antViews.values()).map(function (v) {
          const el = antsLayer.querySelector('[data-task-id="' + v.id + '"]');
          if (!el) return { id: v.id, status: v.status, idx: v.idx, gone: true };
          const ar = app.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const br = el.querySelector('.ant-bucket').getBoundingClientRect();
          return {
            id: v.id,
            status: v.status,
            idx: v.idx,
            color: v.color,
            facing: el._facing,
            x: r.left - ar.left,
            y: r.top - ar.top,
            opacity: parseFloat(getComputedStyle(el).opacity),
            bucketW: br.width,
            bucketH: br.height,
            cell: boardCellSize(),
            landing: el.classList.contains('landing'),
            route: v.route ? v.route.slice(0, 6) : []
          };
        }),
        routeCells: state.coordinator ? Array.from(state.coordinator.routeCellSet()) : [],
        filledMask: Array.from(state.game.filled),
        boardCell: boardCellSize(),
        boardLeft: (function () { const cr = boardCanvas.getBoundingClientRect(); const ar = app.getBoundingClientRect(); return cr.left - ar.left; })(),
        boardTop: (function () { const cr = boardCanvas.getBoundingClientRect(); const ar = app.getBoundingClientRect(); return cr.top - ar.top; })(),
        busy: state.animating.size > 0 || stats.inFlight > 0 || state.incomingSlots.size > 0 || state.pickAnimating,
        incoming: Array.from(state.incomingSlots),
        pickAnimating: state.pickAnimating,
        frontOff: document.querySelectorAll('.token.front.off').length,
        frontCount: document.querySelectorAll('.token.front').length,
        queuedCount: document.querySelectorAll('.token.queued').length,
        zzCount: document.querySelectorAll('.slot-zz').length,
        zzVisible: Array.from(document.querySelectorAll('.slot-zz')).filter(function (el) { return getComputedStyle(el).display !== 'none'; }).length,
        hintColor: state.hintColor,
        hintActive: !!state.press && state.press.active,
        conservation: cons,
        modalOpen: state.modalOpen,
        previewOpen: state.previewOpen,
        previewNote: previewNote ? !previewNote.hidden : false,
        tipVisible: !tipBubble.hidden,
        tipKey: tipBubble.hidden ? '' : state.tipKey,
        tipText: tipBubble.hidden ? '' : tipText.textContent,
        tipQueue: state.tipQueue.length,
        tipQueueKeys: state.tipQueue.map(function (q) { return q.key; }),
        tipSuspended: !!state.tipSuspended,
        toastVisible: !toastEl.hidden,
        toastText: toastEl.hidden ? '' : toastEl.textContent,
        matHead: null,
        previewText: previewCard ? previewCard.textContent.trim() : '',
        title: document.title,
        brand: document.querySelector('.desk-mark__cn') ? document.querySelector('.desk-mark__cn').textContent : '',
        appName: app.getAttribute('aria-label')
      };
    },
    setManualSpeed: setManualSpeed,
    togglePreview: togglePreview,
    setPreviewOpen: setPreviewOpen,
    useProp: useProp,
    recallSlot: recallSlot,
    toggleRecallMode: toggleRecallMode,
    setMotionScale: function (n) {
      state.motionScale = Math.max(0.25, Math.min(30, Number(n) || 1));
      return state.motionScale;
    },
    reservedSlotCapacity: SLOT_CAPACITY_RESERVED
  };

  boot();
})();
