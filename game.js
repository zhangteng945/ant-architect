/* global LEVELS, MATERIALS, AntEngine */
(function () {
  'use strict';

  const SIZE = AntEngine.SIZE;
  const STORE_KEY = 'ant-painter-progress-v1';
  const TIP_KEY = 'ant-painter-tips-v1';
  const MAX_IN_FLIGHT = 8;
  const VISIBLE_ROWS = 3;
  const LONG_PRESS_MS = 420;
  const SLOT_CAPACITY_RESERVED = 6; // 仅预留：本轮默认仍为 5 格，不做第 6 格玩法 / 道具。
  const MANUAL_SPEEDS = [1, 2, 4, 8];
  const ANT_W = 18;
  const ANT_H = 14;

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

  const params = new URLSearchParams(location.search);
  const bootLevel = Math.max(0, Math.min(LEVELS.length - 1, parseInt(params.get('level') || '1', 10) - 1 || 0));

  const state = {
    levelIndex: bootLevel,
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
    lastDead: null,
    previewOpen: false,
    departureLog: [],
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
  function hasDone(no) { return state.finished.done.indexOf(no) !== -1; }
  function markDone(no) {
    if (!hasDone(no)) {
      state.finished.done.push(no);
      state.finished.done.sort(function (a, b) { return a - b; });
      saveProgress();
    }
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
  function setupCanvas() {
    if (boardCanvas.width !== SIZE * 10) {
      boardCanvas.width = SIZE * 10;
      boardCanvas.height = SIZE * 10;
    }
    if (previewCanvas.width !== SIZE) {
      previewCanvas.width = SIZE;
      previewCanvas.height = SIZE;
    }
  }

  function drawBoard() {
    setupCanvas();
    const S = boardCanvas.width / SIZE;
    const ctx = boardCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = SIZE * S;
    const game = state.game;
    if (!game) return;

    // 原图预览：只换绘制内容，不改 game.filled / slots / reservations / phase。
    if (state.previewOpen) {
      const level = LEVELS[state.levelIndex];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const ch = level.map[y][x];
          const c = COLORS[ch] || COLORS.N;
          const X = x * S, Y = y * S;
          px(X, Y, S, S, c.hex);
          px(X, Y, S, 1, c.hi);
          px(X, Y, 1, S, c.hi);
          px(X + S - 1, Y + 1, 1, S - 1, c.dark);
          px(X + 1, Y + S - 1, S - 1, 1, c.dark);
        }
      }
      ctx.fillStyle = 'rgba(8,18,15,.22)';
      for (let i = 0; i <= SIZE; i++) {
        ctx.fillRect(i * S, 0, 1, W);
        ctx.fillRect(0, i * S, W, 1);
      }
      ctx.strokeStyle = '#f8dc98';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, W - 2, W - 2);
      return;
    }

    ctx.fillStyle = '#d8c69a';
    ctx.fillRect(0, 0, W, W);

    function px(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    }

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = AntEngine.idxOf(x, y);
        const X = x * S, Y = y * S;
        const terrain = game.terrain[i];
        if (terrain === AntEngine.HOLE) {
          px(X + 1, Y + 1, S - 2, S - 2, '#1a3030');
          px(X + 2, Y + 2, S - 4, S - 4, '#0b1b1b');
          continue;
        }
        if (terrain !== AntEngine.OBJECT) {
          px(X, Y, S, S, '#e5d5ad');
          continue;
        }
        if (game.filled[i]) {
          const c = color(game.color[i]);
          px(X, Y, S, S, c.hex);
          px(X, Y, S, 1, c.hi);
          px(X, Y, 1, S, c.hi);
          px(X + S - 1, Y + 1, 1, S - 1, c.dark);
          px(X + 1, Y + S - 1, S - 1, 1, c.dark);
        } else {
          // 未施工：中性色块 + 中心点，不提前泄露任何原图颜色。
          px(X, Y, S, S, '#d9c9a3');
          px(X + 1, Y + 1, S - 2, S - 2, '#ddcda8');
          px(X + 1, Y + 1, S - 2, 1, '#e7d8b5');
          px(X + Math.floor(S / 2) - 1, Y + Math.floor(S / 2) - 1, 2, 2, '#c0ad83');
          px(X + 2, Y + S - 2, S - 4, 1, '#cbb88f');
        }
      }
    }

    // 长按同色提示
    if (state.hintColor) {
      const edge = state.hintPhase ? '#fff3bd' : '#e6b45b';
      const wash = state.hintPhase ? 'rgba(248,220,152,.52)' : 'rgba(230,180,91,.38)';
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
        if (game.color[i] !== state.hintColor) continue;
        const p = AntEngine.xyOf(i);
        const X = p.x * S, Y = p.y * S;
        px(X + 1, Y + 1, S - 2, S - 2, wash);
        px(X, Y, S, 1, edge);
        px(X, Y + S - 1, S, 1, edge);
        px(X, Y, 1, S, edge);
        px(X + S - 1, Y, 1, S, edge);
      }
    }

    // 细网格；30×30 仍能数格。
    ctx.fillStyle = 'rgba(83,62,34,.34)';
    for (let i = 0; i <= SIZE; i++) {
      ctx.fillRect(i * S, 0, 1, W);
      ctx.fillRect(0, i * S, W, 1);
    }
    ctx.strokeStyle = 'rgba(61,43,23,.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, W - 2);
  }

  function drawNest() {
    const nc = nestCanvas.getContext('2d');
    const nw = nestCanvas.width, nh = nestCanvas.height;
    nc.imageSmoothingEnabled = false;
    nc.clearRect(0, 0, nw, nh);
    function npx(x, y, w, h, c) { nc.fillStyle = c; nc.fillRect(x, y, w, h); }
    // 土丘
    npx(7, 6, 28, 20, '#3a2b1b');
    npx(4, 10, 34, 15, '#4b3722');
    npx(2, 15, 38, 12, '#5f4a2f');
    npx(6, 8, 30, 5, '#6b5233');
    npx(12, 4, 18, 4, '#5a442a');
    // 洞口
    npx(14, 12, 14, 15, '#120d09');
    npx(12, 16, 18, 11, '#120d09');
    npx(16, 10, 10, 5, '#0a0705');
    npx(16, 19, 10, 8, '#080605');
    // 苔与草
    npx(3, 13, 3, 2, '#6c9659');
    npx(36, 18, 3, 2, '#6c9659');
    npx(8, 24, 2, 3, '#a9c47f');
    npx(31, 25, 2, 2, '#a9c47f');
    npx(20, 3, 2, 2, '#a9c47f');
    // 洞口的颜料点：小画师的颜色
    npx(11, 24, 2, 2, '#ddb052');
    npx(29, 24, 2, 2, '#e18fa6');
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
    if (previewNote) previewNote.hidden = !next;
    if (next) {
      if (state.press) endPress(null, true);
      clearHint();
      hideTip();
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
    const level = LEVELS[state.levelIndex];
    $('levelKicker').textContent = '蚂蚁小画师 · 第 ' + level.no + ' 关 / ' + LEVELS.length + ' · ' + level.tag;
    $('levelTitle').textContent = level.name;
    const progressLabel = $('progressLabel');
    if (progressLabel) progressLabel.textContent = '填色进度 · 30×30 · ' + (level.mechanic || '像素填色');
    const done = state.game.filledCount;
    $('progressText').textContent = done + ' / ' + state.game.total;
    const pct = state.game.total ? Math.max(0, Math.min(100, done / state.game.total * 100)) : 0;
    const bar = $('progressBar');
    bar.style.width = pct.toFixed(2) + '%';
    bar.classList.toggle('on', done > 0);

    const badge = $('speedBadge');
    const auto = state.autoMultiplier >= AntEngine.ENDGAME_MULTIPLIER;
    badge.textContent = state.multiplier + '×';
    badge.classList.toggle('fast', state.multiplier > 1);
    badge.classList.toggle('auto', auto);
    badge.setAttribute('aria-label', auto
      ? '当前速度：令牌取完后自动 8 倍；手动倍速不会覆盖它'
      : '当前速度：手动 ' + state.manualMultiplier + ' 倍');
    app.setAttribute('data-speed', String(state.multiplier));
    app.setAttribute('data-speed-source', auto ? 'auto' : 'manual');
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
    if (state.pickAnimating) return false;
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
    if (canLaunch) cls.push('can-launch');
    if (state.popSlot === i) cls.push('pop');
    const aria = incoming
      ? '待令格 ' + (i + 1) + '，令牌正在移入'
      : '待令格 ' + (i + 1) + '，' + c.hex + ' 色令牌，未出发 ' + slot.remaining + (canLaunch ? '，可出发' : '，暂不可出发');
    return '<div class="' + cls.join(' ') + '" data-slot="' + i + '" data-uid="' + slot.uid + '" data-color="' + slot.color + '" style="--slot-color:' + c.hex + ';--slot-ink:' + c.ink + ';--slot-edge:' + c.hi + ';--slot-dark:' + c.dark + '" aria-label="' + aria + '">' +
      '<span class="slot-flag" aria-hidden="true"></span>' +
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
      el.classList.toggle('can-launch', canLaunch);
      const count = el.querySelector('.slot-count');
      if (count && count.textContent !== String(slot.remaining)) count.textContent = String(slot.remaining);
      el.setAttribute('aria-label', incoming
        ? '待令格 ' + (i + 1) + '，令牌正在移入'
        : '待令格 ' + (i + 1) + '，未出发 ' + slot.remaining + (canLaunch ? '，可出发' : '，暂不可出发'));
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
      slotsEl.style.setProperty('--slot-count', String(state.game.slots.length));
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
    // 队首可点 ≠ 当前能派工。
    // 只要还在游玩、没有弹层、没有正在入区的令牌，队首就应该可点：
    // 待令区满了，点击时再给「已满」反馈；没有同色目标，令牌也可以先入区等待。
    // 不再用「待令区是否已满」或「有没有合法目标」把队首永久置灰。
    const canPick = state.phase === 'playing' && !state.modalOpen && !state.pickAnimating;
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
        if (!g) {
          html.push('<div class="token empty" aria-hidden="true"></div>');
          continue;
        }
        if (r === 0) {
          const off = !canPick;
          html.push(
            '<button type="button" class="token front' + (off ? ' off' : '') + '"' +
              ' data-col="' + c + '" data-row="0" data-id="' + g.id + '" data-color="' + g.color + '"' +
              ' style="' + tokenStyle(g.color) + '"' +
              (off ? ' aria-disabled="true"' : '') +
              ' aria-label="第 ' + (c + 1) + ' 列队首令牌，数量 ' + g.n + '。点按移入待令区，长按看同色位置">' +
              '<span class="token-count">' + g.n + '</span>' +
            '</button>'
          );
        } else {
          html.push(
            '<div class="token" data-col="' + c + '" data-row="' + r + '" data-id="' + g.id + '" data-color="' + g.color + '"' +
              ' style="' + tokenStyle(g.color) + '" role="img"' +
              ' aria-label="第 ' + (c + 1) + ' 列第 ' + (r + 1) + ' 排令牌，数量 ' + g.n + '。长按看同色位置">' +
              '<span class="token-count">' + g.n + '</span>' +
            '</div>'
          );
        }
      }
      const hidden = Math.max(0, left - VISIBLE_ROWS);
      if (left === 0) {
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
    tipBubble.hidden = true;
  }

  function showTip(key, text, anchor, ms, force) {
    if (!force && state.tips[key]) return false;
    if (state.modalOpen) return false;
    state.tips[key] = true;
    saveTips();
    state.tipKey = key;
    tipText.textContent = text;
    tipBubble.className = 'tip-bubble at-' + (anchor || 'mats');
    tipBubble.hidden = false;
    clearTimeout(state.tipTimer);
    state.tipTimer = setTimeout(function () {
      if (state.tipKey === key) hideTip();
    }, ms || 5200);
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
    if (state.game) drawBoard();
  }
  function activateHint(press) {
    if (!state.game || state.press !== press) return;
    const cells = hintCells(press.color);
    press.active = true;
    state.suppressClickUntil = performance.now() + 900;
    if (!cells.length) { toast('这个颜色已经填完了', 1200); return; }
    state.hintColor = press.color;
    if (press.el && press.el.isConnected) press.el.classList.add('hinting');
    startHintPulse();
    drawBoard();
    announce('同色位置提示：盘面上有 ' + cells.length + ' 格，松开收起');
  }
  function beginPress(ev, el) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (state.phase !== 'playing' || state.modalOpen || state.previewOpen || !state.game || state.pickAnimating) return;
    if (state.press) return;
    const k = el.getAttribute('data-color');
    if (!k) return;
    const press = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, color: k, el: el, timer: 0, active: false };
    press.timer = setTimeout(function () { activateHint(press); }, LONG_PRESS_MS);
    state.press = press;
  }
  function endPress(ev, cancelled) {
    const press = state.press;
    if (!press) return;
    if (ev && ev.pointerId !== undefined && ev.pointerId !== press.pointerId) return;
    clearTimeout(press.timer);
    const wasActive = press.active;
    state.press = null;
    if (wasActive) {
      state.suppressClickUntil = performance.now() + 700;
      clearHint();
      if (!cancelled) announce('同色提示已收起');
    }
  }
  function cancelPressForMove(ev) {
    const press = state.press;
    if (!press) return;
    if (Math.abs(ev.clientX - press.x) <= 12 && Math.abs(ev.clientY - press.y) <= 12) return;
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
    const level = LEVELS[state.levelIndex];
    const token = state.runToken;
    setTimeout(function () {
      if (token !== state.runToken || state.phase !== 'playing' || state.modalOpen) return;
      if (state.game.filledCount > 0 || state.pickAnimating) return;
      const key = 'level-' + level.no;
      if (state.tips[key]) return;
      if (level.no === 1 && !state.tips.welcome) return; // 第 1 关由欢迎气泡承担
      const mech = level.mechanic ? '本关机制 · ' + level.mechanic + '：' : '';
      showTip(key, mech + (level.hint || level.teaches), 'board', 6500);
    }, 720);
  }

  function loadLevel(index) {
    state.runToken++;
    clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    state.tickRunning = false;
    state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    state.game = AntEngine.createState(LEVELS[state.levelIndex]);
    state.coordinator = AntEngine.createCoordinator(state.game, {
      maxInFlight: MAX_IN_FLIGHT,
      routePlanner: function (targetIdx, reserved) {
        return AntEngine.planVirtualRoute(state.game, { x: Math.floor(SIZE / 2), y: SIZE }, targetIdx, reserved);
      }
    });
    state.analysis = AntEngine.analyze(state.game);
    state.phase = 'playing';
    state.multiplier = 1;
    state.manualMultiplier = 1;
    state.autoMultiplier = 1;
    state.lastDead = null;
    state.motionScale = 1;
    state.popSlot = -1;
    state.modalOpen = false;
    state.spawnCursor = 0;
    state.incomingSlots = new Set();
    state.pickAnimating = false;
    state.slotSig = '';
    state.press = null;
    state.suppressClickUntil = 0;
    state.hintColor = null;
    state.departureLog = [];
    stopHintPulse();
    hideTip();
    clearTimeout(state.toastTimer);
    clearAnts();
    boardFrame.style.boxShadow = '';
    boardFrame.classList.remove('preview-on');
    setPreviewOpen(false, true);
    toastEl.hidden = true;
    overlayEl.hidden = true;
    modalEl.innerHTML = '';
    drawNest();
    drawThumb(previewCanvas, LEVELS[state.levelIndex]);
    renderAll();
    updateSpeedControls();
    scheduleTick(0);
    announce('第 ' + LEVELS[state.levelIndex].no + ' 关，' + LEVELS[state.levelIndex].name + '，开始');
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

  function isBoardNode(node) {
    return node.x >= 0 && node.x < SIZE && node.y >= 0 && node.y < SIZE;
  }

  function pathNodePoint(node) {
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = cr.width / SIZE;
    if (isBoardNode(node)) return boardCellCenter(node.y * SIZE + node.x);
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
    return AntEngine.NORMAL_PX_PER_MS * state.multiplier * state.motionScale;
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
    let current = { x: Math.floor(SIZE / 2), y: SIZE };
    let route = task.route && task.route.length ? task.route.slice() : replanFrom(task, current);
    if (!route.length) return false;
    // 从巢穴走到盘外环路的起点
    if (!await animatePixelSegment(el, point, pathNodePoint(route[0]), token)) return false;
    current = route[0];
    route = route.slice(1);
    point = pathNodePoint(current);
    view.status = 'walking';
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
    const slotEl = slotsEl.querySelector('[data-slot="' + picked.slotIndex + '"]');
    if (!slotEl) {
      colEl.classList.remove('animating');
      state.incomingSlots.delete(picked.slotIndex);
      state.pickAnimating = false;
      renderAll();
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
    colEl.classList.remove('animating');
    state.incomingSlots.delete(picked.slotIndex);
    state.pickAnimating = false;
    state.slotSig = '';
    renderAll();
    if (!state.tips['first-slot']) {
      showTip('first-slot', '数字是这枚令牌还没出发的蚂蚁数；能出发时，右上角会出现小红旗。', 'board', 5200);
    }
    kick();
  }

  function showFullFeedback() {
    // 只在用户再点队首、企图取令时调用；不在蚂蚁搬运途中自动弹。
    showTip('full', '待令区 5 格都满了：先等一枚令牌腾位，或点「重来」免费重开。', 'slots', 4200, true);
    toast('待令区已满：等一枚令牌腾位，或重来', 2000);
    announce('待令区已满，当前不能取新令牌；已有蚂蚁仍在正常搬运。');
  }

  async function pickColumn(c, opts) {
    const userInitiated = !opts || opts.user !== false;
    if (state.phase !== 'playing' || state.modalOpen || !state.game) return false;
    // 入区动画期间的短暂防重复点击：这是唯一会暂时置灰队首的情况。
    if (state.pickAnimating) return false;
    const game = state.game;
    if (AntEngine.isQueueExhausted(game)) return false;
    if (!game.slots.some(function (s) { return !s; })) {
      if (userInitiated) showFullFeedback();
      return false;
    }
    const group = game.columns[c][game.colPos[c]];
    if (!group) return false;
    hideTip();
    const old = captureColumn(c);
    const picked = AntEngine.pick(game, c);
    if (!picked) return false;
    state.pickAnimating = true;
    state.incomingSlots.add(picked.slotIndex);
    state.slotSig = '';
    updateHeader();
    renderSlots(true);
    announce('第 ' + (c + 1) + ' 列一枚令牌进入待令格 ' + (picked.slotIndex + 1));
    try {
      await animatePick(c, old, picked);
    } finally {
      // 动画异常也不能把队首永久锁死。
      if (state.incomingSlots.has(picked.slotIndex)) {
        state.incomingSlots.delete(picked.slotIndex);
        state.slotSig = '';
        state.pickAnimating = false;
        renderAll();
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
    const speed = state.multiplier * Math.max(0.25, state.motionScale);
    // 稳定、连续的单只派遣节奏；不按“整批完成”再发，也不固定小批量。
    return Math.max(30, 340 / speed);
  }

  function dispatchNext() {
    if (state.phase !== 'playing' || state.modalOpen || !state.coordinator) return 0;
    if (state.pickAnimating) return 0;
    if (state.game.filledCount >= state.game.total) return 0;
    if (state.coordinator.activeCount() >= MAX_IN_FLIGHT) return 0;
    for (let k = 0; k < AntEngine.SLOTS; k++) {
      const s = (state.spawnCursor + k) % AntEngine.SLOTS;
      const task = state.coordinator.dispatch(s);
      if (!task) continue;
      state.spawnCursor = (s + 1) % AntEngine.SLOTS;
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
        inFlight: state.coordinator.activeCount()
      });
      if (state.departureLog.length > 240) state.departureLog.shift();
      renderSlots(false);
      // 某一令牌最后一只出巢后槽位会空出来；同步刷新队首可用状态和「满格」标记，
      // 不再让旧 DOM 的 .off 把队首永久置灰。
      if (!state.game.slots[s] && !state.press) renderMaterials();
      updateHeader();
      if (!state.tips['first-parallel']) {
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
      if (state.pickAnimating) { scheduleTick(70); return; }
      updateSpeed();
      const started = dispatchNext();
      if (started > 0) { scheduleTick(spawnInterval()); return; }
      if (state.coordinator.activeCount() > 0 || state.animating.size > 0) { scheduleTick(70); return; }
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
    markDone(LEVELS[state.levelIndex].no);
    renderAll();
    boardFrame.style.boxShadow = 'inset 0 0 0 2px #f5d389, inset 0 0 0 5px #b1833e, 0 0 0 2px #f5d389, 6px 6px 0 #050c09';
    announce('画作完成：' + LEVELS[state.levelIndex].name);
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
    return [
      '<div class="modal-kicker">玩法说明 · 30×30 像素填色</div>',
      '<h2>怎么玩</h2>',
      '<p>点四列第一排的纯色令牌，送进待令区。小画师会提同色颜料桶，把盘面上同色的空格逐格填满。</p>',
      '<div class="rule"><span class="num">1</span><b>只点第一排</b><br>每列只显示三行令牌。第四枚及以后不画出来，只显示「+N令」；N 是隐藏的令牌枚数。只要还有空待令位，队首就能先入区等待，即使暂时没有可派的目标。</div>',
      '<div class="rule"><span class="num">2</span><b>长按看同色</b><br>长按任意可见令牌，或待令区里的令牌，盘面只临时亮起同色位置；松手就收起，不取令、不占格。</div>',
      '<div class="rule"><span class="num">3</span><b>只显示数字和小旗</b><br>待令格默认 5 位。数字是这枚令牌还没出发的蚂蚁数；能出发时右上出现小红旗，不能出发时不显示。五格满了以后，只有你再点队首才会提示「已满」，蚂蚁搬运途中不会自动弹。</div>',
      '<div class="rule"><span class="num">4</span><b>盘外绕行、不踩已铺格</b><br>30×30 盘面外有一圈环路。小画师会从盘外绕到边缘格，再进去填色；每只蚂蚁在即将出巢时才确认并预约自己的目标，不会提前把整组目标锁死。</div>',
      '<div class="rule"><span class="num">5</span><b>内部未满不封口</b><br>最后一枚同色令牌会留在待令区等；内部填完后自动继续。四列令牌取完会自动 8×；手动倍速可随时选 1/2/4/8×，自动 8× 是下限，不会被手动悄悄覆盖。</div>' +
      '<div class="rule"><b>原图预览</b><br>点洞穴右侧的完整原图缩略图，会把原图铺满盘面；再点缩略图（或盘面）还原。预览只换画面，不改填色进度。</div>' +
      '<div class="rule"><b>推荐节奏</b><br>一列一列点：等这一列的小画师基本填完或开始等待，再点下一列，更容易通关；任意顺序失败都可免费重来。</div>',
      '<div class="legend">' +
        '<span><i style="background:#d9c9a3;border-color:#8d7a56"></i>未施工</span>' +
        '<span><i style="background:#6c9659"></i>已填色</span>' +
        '<span><i style="background:#26352c;border-color:#695a42"></i>待令格</span>' +
        '<span><i style="background:#8f231d"></i>可出发小旗</span>' +
      '</div>',
      '<div class="modal-actions"><button type="button" class="btn primary" data-action="close-help">知道了</button></div>'
    ].join('');
  }
  function openHelp() { openOverlay(helpHTML()); }

  function levelCardsHTML() {
    const html = [];
    html.push('<div class="modal-kicker">5 张原创 30×30 像素画 · 进度存在本机</div>');
    html.push('<h2>选关</h2>');
    html.push('<div class="level-list">');
    LEVELS.forEach(function (level, i) {
      const done = hasDone(level.no);
      const current = i === state.levelIndex;
      html.push(
        '<button type="button" class="level-card' + (current ? ' current' : '') + '" data-action="pick-level" data-level="' + i + '">' +
          '<canvas class="level-thumb" width="30" height="30" data-thumb="' + i + '" aria-hidden="true"></canvas>' +
          '<span class="lvl-text">' +
            '<span class="lvl-line1"><span>第 ' + level.no + ' 关</span><b>' + level.name + '</b></span>' +
            '<span class="lvl-line2">' + level.tag + ' · ' + (level.mechanic ? '本关机制：' + level.mechanic + ' · ' : '') + level.teaches + '</span>' +
          '</span>' +
          '<span class="lvl-state ' + (done ? 'done' : '') + '">' + (done ? '已画成' : '未完成') + '</span>' +
        '</button>'
      );
    });
    html.push('</div>');
    html.push('<div class="modal-actions"><button type="button" class="btn" data-action="close-levels">返回游戏</button></div>');
    return html.join('');
  }
  function openLevels() {
    openOverlay(levelCardsHTML());
    modalEl.querySelectorAll('canvas[data-thumb]').forEach(function (cv) {
      const i = parseInt(cv.getAttribute('data-thumb'), 10);
      drawThumb(cv, LEVELS[i]);
    });
  }

  function openWinModal() {
    const level = LEVELS[state.levelIndex];
    const last = state.levelIndex >= LEVELS.length - 1;
    const allDone = LEVELS.every(function (l) { return hasDone(l.no); });
    const remain = LEVELS.filter(function (l) { return !hasDone(l.no); }).length;
    const tail = allDone ? '五张像素画已经全部画完。' : (remain === 1 ? '还有 1 张空画布在选关里。' : '还有 ' + remain + ' 张空画布在选关里。');
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
      '<h2>' + (full ? '五个待令格都满了' : '没有可落块的目标了') + '</h2>',
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
    const el = ev.target.closest('.slot.filled[data-color]');
    if (!el) return;
    beginPress(ev, el);
  });

  window.addEventListener('pointermove', cancelPressForMove, true);
  window.addEventListener('pointerup', function (ev) { endPress(ev, false); }, true);
  window.addEventListener('pointercancel', function (ev) { endPress(ev, true); }, true);
  window.addEventListener('blur', function () { endPress(null, true); });
  matGrid.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  slotsEl.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  tipBubble.addEventListener('click', hideTip);

  previewCard.addEventListener('click', function (ev) {
    ev.preventDefault();
    togglePreview();
  });
  boardCanvas.addEventListener('click', function () {
    if (state.previewOpen) togglePreview();
  });
  document.querySelectorAll('.speed-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setManualSpeed(parseInt(btn.getAttribute('data-speed'), 10));
    });
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
    drawThumb(previewCanvas, LEVELS[bootLevel]);
    loadLevel(bootLevel);
    setTimeout(function () {
      const busy = state.pickAnimating || (state.coordinator && state.coordinator.activeCount() > 0);
      if (state.game && state.phase === 'playing' && !busy && state.game.filledCount === 0 && !state.press) {
        showTip('welcome', '点每列第一排的令牌，小画师会提颜料桶去填同色格。长按任一枚令牌，可临时看同色位置。', 'board', 6200);
      }
    }, 650);
  }

  // 供本地开发自测 / 截图脚本使用，不进入玩法。
  window.AntGame = {
    loadLevel: loadLevel,
    pickColumn: pickColumn,
    openLevels: openLevels,
    showTip: showTip,
    hideTip: hideTip,
    resetTips: function () { state.tips = Object.create(null); saveTips(); },
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
          if (AntEngine.legalTargets(state.game, slot.color).length === 0) {
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
      return {
        levelIndex: state.levelIndex,
        levelNo: LEVELS[state.levelIndex].no,
        levelName: LEVELS[state.levelIndex].name,
        phase: state.phase,
        multiplier: state.multiplier,
        manualMultiplier: state.manualMultiplier,
        autoMultiplier: state.autoMultiplier,
        normalMultiplier: 1,
        maxInFlight: MAX_IN_FLIGHT,
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
        remainingTokens: remainingTokens(),
        hiddenCounts: hiddenCounts,
        deadlock: AntEngine.deadlock(state.game),
        waiting: waiting,
        inFlight: stats.inFlight,
        reservations: stats.reservations,
        candidateCounts: candidateCounts,
        legalCounts: legalCounts,
        departures: state.departureLog.slice(-60),
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
        busy: state.animating.size > 0 || stats.inFlight > 0 || state.incomingSlots.size > 0 || state.pickAnimating,
        incoming: Array.from(state.incomingSlots),
        pickAnimating: state.pickAnimating,
        frontOff: document.querySelectorAll('.token.front.off').length,
        frontCount: document.querySelectorAll('.token.front').length,
        hintColor: state.hintColor,
        hintActive: !!state.press && state.press.active,
        conservation: cons,
        modalOpen: state.modalOpen,
        previewOpen: state.previewOpen,
        previewNote: previewNote ? !previewNote.hidden : false,
        tipVisible: !tipBubble.hidden,
        tipKey: tipBubble.hidden ? '' : state.tipKey,
        tipText: tipBubble.hidden ? '' : tipText.textContent,
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
    setMotionScale: function (n) {
      state.motionScale = Math.max(0.25, Math.min(30, Number(n) || 1));
      return state.motionScale;
    },
    reservedSlotCapacity: SLOT_CAPACITY_RESERVED
  };

  boot();
})();
