/* global LEVELS, MATERIALS, THEMES, AntEngine */
(function () {
  'use strict';

  const SIZE = AntEngine.SIZE;
  // 2026-11-19 t227u：前 5 关本地样板走独立入口 ?sample=first5，读
  // levels-sample-first5.js 的 window.SAMPLE_LEVELS；正常入口仍读旧 200 关。
  // 两套进度 / 存档 key 分开，样板试玩不覆盖、不重置旧关存档。
  const SAMPLE_MODE = (function () {
    try {
      return new URLSearchParams(location.search).get('sample') === 'first5' &&
        Array.isArray(window.SAMPLE_LEVELS) && window.SAMPLE_LEVELS.length === 5;
    } catch (err) { return false; }
  })();
  const LEVELS = SAMPLE_MODE ? window.SAMPLE_LEVELS : (window.LEVELS || []);
  const THEME_SRC = SAMPLE_MODE ? (window.SAMPLE_THEMES || []) : (window.THEMES || []);
  const KEY_PREFIX = SAMPLE_MODE ? 'ant-painter-sample-' : 'ant-painter-';
  const STORE_KEY = KEY_PREFIX + 'progress-v1';
  const STAR_MAX = 3; // 通关评星 1–3 星；只按计次道具次数，与难度分档独立。
  const REACH_KEY = KEY_PREFIX + 'reached-v1';
  const TIP_KEY = KEY_PREFIX + 'tips-v1';
  const SEED_KEY = KEY_PREFIX + 'last-seed-v1';
  // 2026-11-19 20:32 / 20:37 t206u + t207u：运行时取消「共享在途 / 同时锁定格数」硬上限。
  // 每条待令位队列仍按自己的约 300ms 逐只出发；到点、有合法可达目标就派一只，
  // 不再等前一批落色腾出容量。每令牌总蚁数、目标预约防重与路径安全检查仍生效。
  const IN_FLIGHT_CAP = null;
  const VISIBLE_ROWS = 3;
  const LONG_PRESS_MS = 420;
  const SLOT_CAPACITY_RESERVED = 6; // 仅预留：默认仍为 5 格；第 6 格由第 3 关道具临时启用。
  const MANUAL_SPEEDS = [1, 2, 4, 8];
  const ANT_W = 18;
  const ANT_H = 14;
  const PEEK_MS = 8000;
  const LAMP_MS = 8000;
  const GIFT_KEY = KEY_PREFIX + 'prop-gifts-v1';
  const GIFT_SCHEMA = 2; // v2：更新后首次真正解锁才赠；旧存档已到达的解锁关不补领。
  const HOME_GUIDE_KEY = KEY_PREFIX + 'home-guide-v1';
  const CHECKIN_KEY = KEY_PREFIX + 'checkin-v1';
  const PREVIEW_NOTE_DEFAULT = '原图预览 · 长按令牌亮同色 · 再点还原';

  // 2026-11-19 10:38：签到奖励表是纯数据。默认按 备用巢格 → 预窥令 → 召回令 →
  // 照色灯 循环；0840 已把第 4 个道具从加速改为「照色灯」，这里绝不重新加回加速。
  // 只发已经存在的免费本地道具，发的是「赠次」，与首次解锁赠次共用 GIFT_KEY。
  const CHECKIN_REWARD_CYCLE = ['slot', 'peek', 'recall', 'lamp'];
  const CHECKIN_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  // 一轮固定 7 天；某天要换奖励时改这张表即可，不写死在渲染里。
  const CHECKIN_REWARDS = [0, 1, 2, 3, 0, 1, 2].map(function (n) {
    return CHECKIN_REWARD_CYCLE[n % CHECKIN_REWARD_CYCLE.length];
  });
  const CHECKIN_PROP_CAP = 99;
  const DAY_MS = 86400000;
  const BEIJING_OFFSET_MS = 8 * 3600000;
  const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DOW_NUM = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // 画框是同一套 30×30 格、3 格边框的原创像素图；中心透明，只包住原画。
  // 运行时只读 assets/frames/frames.js 的元数据，不做运行时生成 / AI 绘图。
  const FRAME_SET = (typeof window !== 'undefined' && Array.isArray(window.ANT_FRAME_SET))
    ? window.ANT_FRAME_SET.filter(function (f) {
      return f && typeof f.id === 'string' && typeof f.src === 'string';
    })
    : [];
  const FRAME_BY_ID = FRAME_SET.reduce(function (map, f) { map[f.id] = f; return map; }, Object.create(null));

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

  // 四个本地免费道具：每关基础次数重置；每种首次解锁另赠 1 次跨关库存。
  // 解锁按「到达对应关」——进入该关即算到达，之后重玩前面关卡仍保持解锁。
  // 第 4 个道具不再是加速：加速统一放到顶部⏩，这里改为纯规划辅助的「照色灯」。
  const PROPS = [
    { key: 'slot', name: '备用巢格', unlock: 3, uses: 1, short: '本关多开 1 个待令位（第 6 格）' },
    { key: 'peek', name: '预窥令', unlock: 4, uses: 2, short: '8 秒内看清每列隐藏的下一枚令牌' },
    { key: 'recall', name: '召回令', unlock: 8, uses: 1, short: '把一枚还没出巢的待令令牌退回原列队首' },
    { key: 'lamp', name: '照色灯', unlock: 10, uses: 1, short: '8 秒内点亮待令令牌同色的未填格' }
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
    lamp: [
      '............', '.....##.....', '....####....', '...######...', '..##.##.##..',
      '.#...##...#.', '......##....', '......##....', '.##########.', '.....##.....', '....####....', '............'
    ]
  };

  // 原创 9×9 像素星标：不用 Unicode ★、不搬其他游戏的星形素材。
  // 实心 / 空心共用同一套格，只换颜色；首页入口 9px（1×），完成弹层 27px（3×）。
  const STAR_PIXEL_ROWS = [
    '....#....',
    '...###...',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '..##.##..',
    '.##...##.',
    '.#.....#.'
  ];
  function starSVG() {
    let rects = '';
    for (let y = 0; y < STAR_PIXEL_ROWS.length; y++) {
      for (let x = 0; x < STAR_PIXEL_ROWS[y].length; x++) {
        if (STAR_PIXEL_ROWS[y][x] === '#') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    return '<svg viewBox="0 0 9 9" width="9" height="9" fill="currentColor" shape-rendering="crispEdges" focusable="false" aria-hidden="true">' + rects + '</svg>';
  }
  const STAR_SVG = starSVG();
  function starsHTML(n, cls, label) {
    const count = Math.max(0, Math.min(STAR_MAX, Math.floor(Number(n) || 0)));
    if (count <= 0) return '';
    let stars = '';
    for (let i = 0; i < STAR_MAX; i++) {
      stars += '<span class="pixel-star' + (i < count ? ' on' : '') + '" aria-hidden="true">' + STAR_SVG + '</span>';
    }
    const text = label || ('通关 ' + count + ' 星，满分 ' + STAR_MAX + ' 星');
    return '<span class="' + (cls || 'stars') + '" role="img" aria-label="' + text + '">' + stars + '</span>';
  }

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
  const THEME_LIST = Array.isArray(THEME_SRC) ? THEME_SRC : [];

  const state = {
    levelIndex: bootLevel,
    homeOpen: false,
    checkinOpen: false,
    checkinNow: (function () {
      const raw = params.get('now');
      if (!raw) return 0;
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : 0;
    })(),
    checkin: loadCheckin(),
    checkinToastTimer: 0,
    homeScroll: 0,
    homeTheme: 0,
    queueSeed: 0,
    queueTokenCount: 0,
    queueFixed: false,
    presetQueueSource: '',
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
    // 每个「可出动令牌」一路独立出巢队列：slotIndex -> { uid, nextAt }。
    // 同色多令牌各占一路，不共用全局限速；每条 lane 自己记 nextAt，
    // 到点就派，同一 tick 可以多路同时出发。没有全局 nextDispatchAt /
    // spawnCursor，也没有「所有路汇总成一个总队列轮流放行」。
    launchLanes: new Map(),
    modalOpen: false,
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
    propUses: { slot: 0, peek: 0, recall: 0, lamp: 0 },
    // 本轮评星只按「本关计次道具使用次数」，与步数、关卡难度分档无关。
    // 倍速不经过 consumePropUse，所以永远不会写进这个计数。
    starPropUses: 0,
    lastStarResult: null,
    propGifts: loadGiftState(),
    extraSlot: false,
    peekUntil: 0,
    lampUntil: 0,
    homeGuideSeen: loadHomeGuideSeen(),
    recallMode: false,
    propTimer: 0,
    propSig: '',
    tips: loadTips(),
    finished: loadProgress()
  };

  // 必须在 state.finished / state.reachedMax 都读完之后、第一次 grantUnlockGifts 之前执行。
  const giftBackfillSkipped = migrateGiftBackfill();

  function loadProgress() {
    const fresh = { done: [], stars: Object.create(null) };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return fresh;
      const p = JSON.parse(raw);
      if (!p || !Array.isArray(p.done)) return fresh;
      fresh.done = p.done.filter(function (n) { return Number.isInteger(n); });
      // 星级与通关进度共用同一份本机存档；旧存档没有 stars 时按未评星迁移，
      // 不把旧「已画成」伪造为 3 星，也不丢旧通关记录。
      if (p.stars && typeof p.stars === 'object') {
        Object.keys(p.stars).forEach(function (key) {
          const no = parseInt(key, 10);
          const n = parseInt(p.stars[key], 10);
          if (Number.isInteger(no) && no >= 1 && no <= LEVELS.length && Number.isInteger(n) && n >= 1 && n <= STAR_MAX) {
            fresh.stars[String(no)] = n;
          }
        });
      }
      return fresh;
    } catch (err) {
      return fresh;
    }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.finished)); } catch (err) { /* file:// 可能拒绝，玩法不受影响 */ }
  }
  // 首次解锁赠次：与「每关基础次数」分开记账，赠次用掉才扣，未用则跨关保留。
  // 存档只有一份本机 localStorage，不联网、不付费。
  function loadGiftState() {
    const fresh = { schema: 0, counts: { slot: 0, peek: 0, recall: 0, lamp: 0 }, claimed: {} };
    try {
      const raw = localStorage.getItem(GIFT_KEY);
      if (!raw) return fresh;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return fresh;
      fresh.schema = Number(p.schema) || 0;
      PROPS.forEach(function (prop) {
        const n = parseInt(p.counts && p.counts[prop.key], 10);
        if (Number.isInteger(n) && n > 0) fresh.counts[prop.key] = Math.min(99, n);
        if (p.claimed && p.claimed[prop.key]) fresh.claimed[prop.key] = true;
      });
    } catch (err) { /* 忽略损坏存档 */ }
    return fresh;
  }
  function saveGiftState() {
    try { localStorage.setItem(GIFT_KEY, JSON.stringify(state.propGifts)); } catch (err) { /* file:// 可能拒绝 */ }
  }

  // 2026-11-19 17:23：取消 0840 对旧存档的补领。
  // 第一次载入 v2 存档时，如果玩家在更新前已经到达过某个解锁关，就只把该道具
  // 标成 claimed（不再赠次）；已经写下的 claimed / 已经领到的赠次都不收回。
  // 更新前没到过的关保持未领取，等玩家更新后第一次真正到达时再赠 1 次。
  function migrateGiftBackfill() {
    const gifts = state.propGifts;
    if (gifts.schema === GIFT_SCHEMA) return [];
    let maxDone = 0;
    state.finished.done.forEach(function (n) { if (n > maxDone) maxDone = n; });
    const reachedBeforeUpdate = Math.max(1, Number(state.reachedMax) || 0, maxDone);
    const hadOldProgress = state.finished.done.length > 0 || (Number(state.reachedMax) || 0) > 0;
    const skipped = [];
    if (hadOldProgress) {
      PROPS.forEach(function (prop) {
        if (reachedBeforeUpdate >= prop.unlock && !gifts.claimed[prop.key]) {
          gifts.claimed[prop.key] = true;
          skipped.push(prop.key);
        }
      });
    }
    gifts.schema = GIFT_SCHEMA;
    saveGiftState();
    return skipped;
  }
  function loadHomeGuideSeen() {
    try { return localStorage.getItem(HOME_GUIDE_KEY) === '1'; } catch (err) { return false; }
  }
  function saveHomeGuideSeen() {
    try { localStorage.setItem(HOME_GUIDE_KEY, '1'); } catch (err) { /* 忽略 */ }
  }

  /* ============================================================
     2026-11-19 10:38 · 北京时间自然周签到 / 签到道具 / 画框
     ============================================================ */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function utcDateKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function shortDate(y, m, d) { return (m) + '/' + d; }

  // 只按 Asia/Shanghai 的日历年月日取「今天」，不读设备本地时区，也不用 UTC 日期。
  // Intl 不可用时退回 UTC+8（中国自 1991 年起没有夏令时），两者都不会串天。
  // 缓存 formatter：getState / 自测会高频取周信息，避免每次 new Intl.DateTimeFormat。
  let BEIJING_FORMATTER = null;
  let BEIJING_FORMATTER_FAILED = false;
  function beijingFormatter() {
    if (BEIJING_FORMATTER || BEIJING_FORMATTER_FAILED) return BEIJING_FORMATTER;
    try {
      BEIJING_FORMATTER = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
      });
    } catch (err) {
      BEIJING_FORMATTER_FAILED = true;
    }
    return BEIJING_FORMATTER;
  }

  function beijingParts(ms) {
    const t = new Date(Number(ms) || Date.now());
    let y, m, d, dow;
    try {
      const fmt = beijingFormatter();
      if (!fmt) throw new Error('no Intl');
      const parts = fmt.formatToParts(t);
      parts.forEach(function (p) {
        if (p.type === 'year') y = parseInt(p.value, 10);
        else if (p.type === 'month') m = parseInt(p.value, 10);
        else if (p.type === 'day') d = parseInt(p.value, 10);
        else if (p.type === 'weekday') dow = DOW_NUM[p.value] || 0;
      });
    } catch (err) { /* 旧环境走 UTC+8 */ }
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
      const bj = new Date(t.getTime() + BEIJING_OFFSET_MS);
      y = bj.getUTCFullYear(); m = bj.getUTCMonth() + 1; d = bj.getUTCDate();
    }
    if (!dow) {
      dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 1;
    }
    return { y: y, m: m, d: d, dow: dow };
  }

  // 自然周：周一 00:00 到周日 24:00（北京时间）。用 UTC 日历做纯日期加减，
  // 避免设备时区把周一零点推前一天；日期本身仍来自上面的北京时间年月日。
  function beijingWeek(ms) {
    const p = beijingParts(ms);
    const offset = p.dow - 1;
    const monday = Date.UTC(p.y, p.m - 1, p.d) - offset * DAY_MS;
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday + i * DAY_MS);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      dates.push({ y: y, m: m, d: d, key: utcDateKey(y, m, d), label: CHECKIN_WEEKDAYS[i], short: shortDate(y, m, d) });
    }
    return {
      y: p.y, m: p.m, d: p.d, dow: p.dow,
      index: p.dow - 1,
      key: dates[0].key,
      todayKey: utcDateKey(p.y, p.m, p.d),
      dates: dates,
      label: dates[0].short + ' – ' + dates[6].short,
      fullLabel: dates[0].y + ' 年 ' + dates[0].short + ' – ' + dates[6].short
    };
  }

  function freshCheckinState() {
    return {
      v: 1,
      weeks: Object.create(null),
      frames: [],
      frameMode: 'all',
      frameAll: null,
      frameByLevel: Object.create(null)
    };
  }

  function sanitizeCheckinState(raw) {
    const out = freshCheckinState();
    if (!raw || typeof raw !== 'object') return out;
    const known = Object.create(null);
    FRAME_SET.forEach(function (f) { known[f.id] = true; });
    if (Array.isArray(raw.frames)) {
      raw.frames.forEach(function (id) {
        if (typeof id === 'string' && known[id] && out.frames.indexOf(id) === -1) out.frames.push(id);
      });
    }
    if (raw.weeks && typeof raw.weeks === 'object') {
      const keys = Object.keys(raw.weeks).filter(function (k) { return WEEK_KEY_RE.test(k); }).sort().slice(-26);
      keys.forEach(function (k) {
        const w = raw.weeks[k];
        if (!w || typeof w !== 'object') return;
        const days = [];
        for (let i = 0; i < 7; i++) days.push(!!(w.days && w.days[i]));
        out.weeks[k] = {
          days: days,
          frameAwarded: (typeof w.frameAwarded === 'string' && (w.frameAwarded === 'none' || known[w.frameAwarded])) ? w.frameAwarded : null,
          lastSignedAt: typeof w.lastSignedAt === 'string' ? w.lastSignedAt : ''
        };
      });
    }
    // 2026-11-19 17:23：画框改为选择后全局应用，不再按关卡分别设置。
    // 旧存档若只有「按关卡个别」，迁移成用得最多的一枚作为全局画框；
    // 次数相同取关号最小的，保证确定性；迁移后丢弃逐关设置。
    out.frameMode = 'all';
    if (typeof raw.frameAll === 'string' && known[raw.frameAll] && out.frames.indexOf(raw.frameAll) !== -1) {
      out.frameAll = raw.frameAll;
    } else if (raw.frameByLevel && typeof raw.frameByLevel === 'object') {
      const used = Object.create(null);
      const firstNo = Object.create(null);
      Object.keys(raw.frameByLevel).forEach(function (k) {
        const no = parseInt(k, 10);
        const id = raw.frameByLevel[k];
        if (!Number.isInteger(no) || no < 1) return;
        if (typeof id !== 'string' || !known[id] || out.frames.indexOf(id) === -1) return;
        used[id] = (used[id] || 0) + 1;
        if (!firstNo[id] || no < firstNo[id]) firstNo[id] = no;
      });
      const ids = Object.keys(used);
      ids.sort(function (a, b) { return used[b] - used[a] || firstNo[a] - firstNo[b]; });
      if (ids.length) out.frameAll = ids[0];
    }
    out.frameByLevel = Object.create(null);
    return out;
  }

  function loadCheckin() {
    try {
      const raw = localStorage.getItem(CHECKIN_KEY);
      if (!raw) return freshCheckinState();
      return sanitizeCheckinState(JSON.parse(raw));
    } catch (err) {
      return freshCheckinState();
    }
  }
  function saveCheckin() {
    try { localStorage.setItem(CHECKIN_KEY, JSON.stringify(state.checkin)); } catch (err) { /* file:// 可能拒绝 */ }
  }

  function checkinNow() { return Number(state.checkinNow) || Date.now(); }
  function checkinWeekInfo() { return beijingWeek(checkinNow()); }
  function checkinRecord(info, create) {
    const key = info.key;
    if (!state.checkin.weeks[key] && create) {
      state.checkin.weeks[key] = { days: [false, false, false, false, false, false, false], frameAwarded: null, lastSignedAt: '' };
    }
    return state.checkin.weeks[key] || { days: [false, false, false, false, false, false, false], frameAwarded: null, lastSignedAt: '' };
  }
  function checkinRewardFor(index) {
    const key = CHECKIN_REWARDS[index] || CHECKIN_REWARDS[0];
    return PROPS.filter(function (p) { return p.key === key; })[0] || PROPS[0];
  }
  function checkinSnapshot() {
    const info = checkinWeekInfo();
    const rec = checkinRecord(info, false);
    const days = rec.days.slice(0, 7);
    let count = 0;
    days.forEach(function (v) { if (v) count++; });
    return {
      info: info,
      record: rec,
      days: days,
      count: count,
      todaySigned: !!days[info.index],
      full: count === 7,
      reward: checkinRewardFor(info.index),
      frameAwarded: rec.frameAwarded || null
    };
  }

  function isFrameOwned(id) {
    return !!id && state.checkin.frames.indexOf(id) !== -1 && !!FRAME_BY_ID[id];
  }
  function frameName(id) { return FRAME_BY_ID[id] ? FRAME_BY_ID[id].name : ''; }
  function frameSource(id) { return FRAME_BY_ID[id] ? FRAME_BY_ID[id].src : ''; }
  function frameForLevel(no) {
    if (!state.checkin) return null;
    // 画框是全局设置：关卡号只保留在调用签名里，不再影响选中的画框。
    return isFrameOwned(state.checkin.frameAll) ? state.checkin.frameAll : null;
  }
  function frameStyleValue(id) {
    return isFrameOwned(id) ? "url('" + frameSource(id) + "')" : '';
  }
  function frameStyleAttr(id) {
    // 展示用：未获得的画框也能在画框柜里看到轮廓，但只有 isFrameOwned 的才能被应用。
    const f = FRAME_BY_ID[id];
    return f ? ' style="--frame-art:url(\'' + f.src + '\')" data-frame="' + id + '"' : '';
  }
  function frameClass(id) { return isFrameOwned(id) ? ' has-frame' : ''; }
  function applyFrameTo(el, id) {
    if (!el) return;
    const ok = isFrameOwned(id);
    el.classList.toggle('has-frame', ok);
    if (ok) {
      el.style.setProperty('--frame-art', frameStyleValue(id));
      el.setAttribute('data-frame', id);
    } else {
      el.style.removeProperty('--frame-art');
      el.removeAttribute('data-frame');
    }
  }

  function grantCheckinFrame(info, rec) {
    let next = null;
    for (let i = 0; i < FRAME_SET.length; i++) {
      if (state.checkin.frames.indexOf(FRAME_SET[i].id) === -1) { next = FRAME_SET[i]; break; }
    }
    if (!next) {
      rec.frameAwarded = 'none';
      return null;
    }
    state.checkin.frames.push(next.id);
    rec.frameAwarded = next.id;
    rec.frameAwardedAt = new Date(checkinNow()).toISOString();
    // 第一次获得画框且还没有全局选择时，默认直接应用，玩家马上能在首页和关卡里看到。
    if (!state.checkin.frameAll) state.checkin.frameAll = next.id;
    return next;
  }

  function checkinSign() {
    const info = checkinWeekInfo();
    const rec = checkinRecord(info, true);
    if (rec.days[info.index]) {
      return { ok: false, reason: 'already', info: info, reward: checkinRewardFor(info.index) };
    }
    rec.days[info.index] = true;
    rec.lastSignedAt = new Date(checkinNow()).toISOString();
    const reward = checkinRewardFor(info.index);
    state.propGifts.counts[reward.key] = Math.min(CHECKIN_PROP_CAP,
      (Number(state.propGifts.counts[reward.key]) || 0) + 1);
    let frame = null;
    let allOwned = false;
    if (rec.days.every(Boolean) && !rec.frameAwarded) {
      frame = grantCheckinFrame(info, rec);
      allOwned = !frame;
    }
    saveGiftState();
    saveCheckin();
    return {
      ok: true,
      info: info,
      reward: reward,
      frame: frame,
      allFramesOwned: allOwned,
      count: rec.days.filter(Boolean).length,
      frameAwarded: rec.frameAwarded || null
    };
  }

  function showCheckinToast(message, ms) {
    const el = $('checkinToast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.checkinToastTimer);
    state.checkinToastTimer = setTimeout(function () { el.hidden = true; }, ms || 3000);
  }

  function checkinSignAndRender() {
    const res = checkinSign();
    if (!res.ok) {
      if (res.reason === 'already') showCheckinToast('今天已经签到过了；北京时间明天 0 点后再来。', 2800);
      return res;
    }
    let msg = '签到成功：' + res.reward.name + ' ×1，已计入跨关赠次。';
    if (res.frame) msg += ' 本周签满 7 天，获得画框「' + res.frame.name + '」！';
    else if (res.allFramesOwned) msg += ' 本周画框已全部集齐。';
    showCheckinToast(msg, 3600);
    renderCheckin();
    renderHomeCheckinEntry();
    announce(msg);
    return res;
  }

  function checkinSetMode(mode) {
    // 兼容旧开发接口：现在只有全局应用，不再有「按关卡个别」。
    state.checkin.frameMode = 'all';
    state.checkin.frameByLevel = Object.create(null);
    saveCheckin();
    renderCheckin();
    announce('画框已改为全部关卡统一应用');
  }

  function checkinSetFrameAll(id) {
    if (id && !isFrameOwned(id)) return false;
    state.checkin.frameAll = id || null;
    state.checkin.frameMode = 'all';
    state.checkin.frameByLevel = Object.create(null);
    saveCheckin();
    renderCheckin();
    announce(id ? '全部关卡和首页入口统一使用「' + frameName(id) + '」' : '全部关卡不使用画框');
    return true;
  }

  // 兼容旧开发接口：逐关设置已取消，传入画框即改为全局应用；传空即清除全局画框。
  function checkinSetLevelFrame(no, id) {
    return checkinSetFrameAll(id || null);
  }

  function updateFrameHint() {
    const el = $('frameHint');
    if (!el) return;
    el.textContent = state.checkin.frameAll
      ? '全局应用：全部关卡和首页入口统一使用「' + frameName(state.checkin.frameAll) + '」。再点同一枚可取消。'
      : '全局应用：当前没有选择画框。只能使用已经获得的画框。';
  }

  function renderFrameLevels() {
    // 逐关选择已取消，保留空函数给旧调用点，避免误显示旧列表。
    const el = $('frameLevels');
    if (el) { el.hidden = true; el.innerHTML = ''; }
  }

  function renderCheckin() {
    const page = $('checkin');
    if (!page) return;
    const snap = checkinSnapshot();
    const info = snap.info;
    const rec = snap.record;
    $('checkinWeekLabel').textContent = info.label + ' · 北京时间（周一至周日）';
    $('checkinCount').textContent = snap.count + ' / 7';

    const daysHtml = [];
    for (let i = 0; i < 7; i++) {
      const signed = snap.days[i];
      const isToday = i === info.index;
      const isPast = i < info.index;
      const reward = checkinRewardFor(i);
      let cls = 'checkin-day';
      if (signed) cls += ' signed';
      if (isToday) cls += ' today';
      else if (!signed && isPast) cls += ' missed';
      else if (!signed) cls += ' future';
      const mark = signed ? '✓ 已签' : (isToday ? '今天' : (isPast ? '漏签' : '待签'));
      const label = CHECKIN_WEEKDAYS[i] + ' ' + info.dates[i].short + '，' +
        (signed ? '已签到' : (isToday ? '今天可签到' : (isPast ? '已漏签' : '还没到'))) +
        '，道具 ' + reward.name;
      daysHtml.push('<div class="' + cls + '" data-day="' + i + '" aria-label="' + label + '">' +
        '<span class="cd-week">' + CHECKIN_WEEKDAYS[i] + '</span>' +
        '<span class="cd-date">' + info.dates[i].short + '</span>' +
        '<span class="cd-ico">' + propIconSVG(reward.key) + '</span>' +
        '<span class="cd-reward">' + reward.name + '</span>' +
        '<span class="cd-mark">' + mark + '</span>' +
      '</div>');
    }
    $('checkinDays').innerHTML = daysHtml.join('');

    const btn = $('checkinBtn');
    if (snap.todaySigned) {
      btn.disabled = true;
      btn.textContent = snap.full ? '本周 7 天已签满' : '今天已签到 · 明天再来';
    } else {
      btn.disabled = false;
      btn.textContent = '签到领「' + snap.reward.name + '」×1';
    }
    btn.setAttribute('data-reward', snap.reward.key);

    const award = $('checkinAward');
    const aw = rec.frameAwarded;
    if (aw && snap.full) {
      const f = FRAME_BY_ID[aw];
      if (f) {
        award.hidden = false;
        award.innerHTML = '<span class="aw-art"' + frameStyleAttr(f.id) + '><i></i></span>' +
          '<span class="aw-copy"><b>本周签满 7 天 · 获得「' + f.name + '」</b>' +
          '<small>已存进本机画框柜；可在下面选择「应用全部」或按关卡个别使用。</small></span>';
      } else {
        award.hidden = false;
        award.innerHTML = '<span class="aw-copy"><b>本周 7 天已签满</b><small>现有原创画框套装已经全部集齐；下周仍可继续签到领道具。</small></span>';
      }
    } else {
      award.hidden = true;
      award.innerHTML = '';
    }

    $('frameOwnedCount').textContent = state.checkin.frames.length + ' / ' + FRAME_SET.length;
    const list = FRAME_SET.map(function (f) {
      const owned = isFrameOwned(f.id);
      const selected = state.checkin.frameAll === f.id;
      let status = '签满 7 天解锁';
      if (owned) status = selected ? '全局使用中' : '点击全局应用';
      const cls = 'frame-card' + (selected ? ' selected' : '') + (owned ? '' : ' locked');
      return '<button type="button" class="' + cls + '" data-frame-id="' + f.id + '"' +
        (owned ? '' : ' disabled aria-disabled="true"') + ' aria-label="' + f.name + '，' + status + '">' +
        '<span class="frame-thumb"' + frameStyleAttr(f.id) + '><i></i></span>' +
        '<span class="frame-name">' + f.name + '</span>' +
        '<span class="frame-status">' + status + '</span>' +
      '</button>';
    });
    $('frameList').innerHTML = list.join('');
    if ($('frameClear')) $('frameClear').disabled = !state.checkin.frameAll;
    updateFrameHint();
  }

  function renderHomeCheckinEntry() {
    const strip = $('homeCheckinStrip');
    if (!strip) return;
    const snap = checkinSnapshot();
    $('homeCheckinText').textContent = '本周签到 ' + snap.count + ' / 7';
    $('homeCheckinSub').textContent = snap.todaySigned
      ? (snap.full ? '本周已签满 · 画框已结算' : '今天已签到 · 明天可继续')
      : ('今天可签 · 领「' + snap.reward.name + '」；签满 7 天得画框');
    $('homeCheckinGo').textContent = snap.todaySigned ? (snap.full ? '已签满' : '已签到') : '去签到';
    strip.classList.toggle('signed', snap.todaySigned);
    strip.classList.toggle('unsigned', !snap.todaySigned);
    strip.setAttribute('aria-label', '打开签到与画框页；本周已签到 ' + snap.count + ' / 7');
  }

  function openCheckin() {
    if (state.checkinOpen) return;
    const homeEl = $('home');
    state.homeScroll = homeEl ? homeEl.scrollTop : 0;
    state.checkinOpen = true;
    state.homeOpen = false;
    state.phase = 'checkin';
    state.modalOpen = false;
    state.press = null;
    hideTip();
    clearTimeout(state.toastTimer);
    toastEl.hidden = true;
    overlayEl.hidden = true;
    modalEl.innerHTML = '';
    if (homeEl) homeEl.hidden = true;
    document.body.classList.remove('home-open');
    document.body.classList.add('checkin-open');
    $('checkin').hidden = false;
    $('checkin').scrollTop = 0;
    renderCheckin();
    announce('签到与画框页：本周已签到 ' + checkinSnapshot().count + ' / 7');
  }

  function closeCheckin() {
    if (!state.checkinOpen) return;
    $('checkin').hidden = true;
    document.body.classList.remove('checkin-open');
    state.checkinOpen = false;
    state.homeOpen = true;
    state.phase = 'home';
    $('home').hidden = false;
    $('checkin').hidden = true;
    document.body.classList.remove('checkin-open');
    document.body.classList.add('home-open');
    renderHome();
    requestAnimationFrame(function () {
      if (state.homeOpen) $('home').scrollTop = state.homeScroll || 0;
    });
    announce('回到选关首页');
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
  // 1–3 星只看本关计次道具使用次数：0 次 = 3 星；1–5 次 = 2 星；6 次及以上 = 1 星。
  // 不读步数，不读关卡 difficulty / 难度分档，也不把倍速算进来。
  function starsForPropUses(n) {
    const uses = Math.max(0, Math.floor(Number(n) || 0));
    if (uses === 0) return 3;
    if (uses <= 5) return 2;
    return 1;
  }
  function bestStars(no) {
    const n = parseInt(state.finished.stars && state.finished.stars[String(no)], 10);
    return Number.isInteger(n) && n >= 1 && n <= STAR_MAX ? n : 0;
  }
  // 重玩只保留最好成绩：更高才写，更低不覆盖；首次通关同时补 done。
  function recordClear(no, uses) {
    const stars = starsForPropUses(uses);
    const key = String(no);
    const previous = bestStars(no);
    let changed = false;
    if (!hasDone(no)) {
      state.finished.done.push(no);
      state.finished.done.sort(function (a, b) { return a - b; });
      changed = true;
    }
    const best = Math.max(previous, stars);
    if (best > previous) {
      state.finished.stars[key] = best;
      changed = true;
    }
    if (changed) saveProgress();
    return { stars: stars, best: best, previous: previous, improved: best > previous };
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
    if (!game) return 0;
    let n = 0;
    for (let c = 0; c < 4; c++) {
      for (let k = game.colPos[c]; k < game.columns[c].length; k++) n += game.columns[c][k].n;
    }
    return n;
  }

  function slotBlocks() {
    if (!state.game) return 0;
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
  function levelDims(level) {
    const dim = AntEngine.dimsOf(level || { width: SIZE, height: SIZE });
    return { width: dim.width, height: dim.height };
  }

  // 画布按关卡的 width / height 分配真实后备像素，格宽 = 格高；
  // 矩形盘在方形画框里居中，不把横向或纵向拉扁。旧 30×30 仍铺满原尺寸。
  function setupCanvas() {
    const game = state.game;
    const level = state.level || LEVELS[state.levelIndex];
    const dim = levelDims(level);
    const W = dim.width, H = dim.height;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const frameRect = boardFrame.getBoundingClientRect();
    const cs = window.getComputedStyle(boardFrame);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const innerW = Math.max(1, (frameRect.width || 300) - padL - padR - 4); // 4 = 左右边框
    // 以画框可用短边为上限，格宽 = 格高；矩形盘的真实网格不被拉扁。
    const cellCss = Math.min(innerW / W, innerW / H);
    const cssW = Math.max(1, cellCss * W);
    const cssH = Math.max(1, cellCss * H);
    boardCanvas.style.width = Math.round(cssW) + 'px';
    boardCanvas.style.height = Math.round(cssH) + 'px';
    // 画框高度跟着真实盘面走，使巢穴 DOM 紧贴画布下沿，而不是停留在
    // 固定方形画框的空白边里。旧 30×30 仍是 320px，不变。
    const frameH = Math.round(cssH + padT + padB + 4);
    if (boardFrame.style.height !== frameH + 'px') boardFrame.style.height = frameH + 'px';
    const block = boardFrame.parentNode;
    if (block) {
      block.style.height = frameH + 'px';
      block.style.flexBasis = frameH + 'px';
    }
    const targetW = Math.max(W, Math.round(cssW * dpr));
    const targetH = Math.max(H, Math.round(targetW * H / W));
    if (boardCanvas.width !== targetW || boardCanvas.height !== targetH) {
      boardCanvas.width = targetW;
      boardCanvas.height = targetH;
    }
    // 缩略图保持真实网格比例，CSS 在方形预览卡里居中留边。
    if (previewCanvas.width !== W || previewCanvas.height !== H) {
      previewCanvas.width = W;
      previewCanvas.height = H;
    }
    const pr = previewCard.getBoundingClientRect();
    const pvAvail = Math.max(1, Math.min(pr.width || 58, pr.height || 58) - 4);
    const pvCell = Math.min(pvAvail / W, pvAvail / H);
    previewCanvas.style.width = Math.round(pvCell * W) + 'px';
    previewCanvas.style.height = Math.round(pvCell * H) + 'px';
    previewCanvas.style.margin = 'auto';
    boardCanvas._cellCss = cellCss;
    if (game) {
      game.width = W;
      game.height = H;
    }
  }

  function drawBoard() {
    setupCanvas();
    const game = state.game;
    if (!game) return;
    const W = game.width, H = game.height;
    const cw = boardCanvas.width, ch = boardCanvas.height;
    const S = Math.min(cw / W, ch / H);
    const U = Math.max(1, Math.round(window.devicePixelRatio || 1)); // 1 CSS 像素对应的后备像素
    const ctx = boardCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cw, ch);
    const edge = function (n) { return Math.round(n * S); };
    const Wp = Math.round(W * S), Hp = Math.round(H * S);
    function px(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    }

    // 原图预览：只换绘制内容，不改 game.filled / slots / reservations / phase。
    if (state.previewOpen) {
      const level = state.level || LEVELS[state.levelIndex];
      for (let y = 0; y < H; y++) {
        const Y = edge(y), CH = edge(y + 1) - Y;
        for (let x = 0; x < W; x++) {
          const X = edge(x), CW = edge(x + 1) - X;
          const ch2 = level.map[y][x];
          const c = ch2 === '#'
            ? { hex: '#101e18', hi: '#1a3030', dark: '#080605' }
            : (COLORS[ch2] || COLORS.N);
          px(X, Y, CW, CH, c.hex);
          px(X, Y, CW, U, c.hi);
          px(X, Y, U, CH, c.hi);
          px(X + CW - U, Y + U, U, CH - U, c.dark);
          px(X + U, Y + CH - U, CW - U, U, c.dark);
        }
      }
      ctx.fillStyle = 'rgba(8,18,15,.22)';
      for (let i = 0; i <= W; i++) {
        const p = Math.min(Wp - U, edge(i));
        ctx.fillRect(p, 0, U, Hp);
      }
      for (let j = 0; j <= H; j++) {
        const p = Math.min(Hp - U, edge(j));
        ctx.fillRect(0, p, Wp, U);
      }
      // 预览态长按：原图铺满时也在对应剩余同色格上叠像素高亮；
      // 只改绘制层，不退出预览，不改 filled / slots / reservations / phase。
      if (state.hintColor) {
        const gold = state.hintPhase ? '#fff3bd' : '#f0c262';
        // 先压暗整张预览，再把目标格按原色重新点亮，保证在全彩原图上仍然一眼能认出。
        ctx.fillStyle = 'rgba(4,10,8,.58)';
        ctx.fillRect(0, 0, Wp, Hp);
        for (let i = 0; i < W * H; i++) {
          if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
          if (game.color[i] !== state.hintColor) continue;
          const p = AntEngine.xyOf(i, W);
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
      px(0, 0, Wp, 3 * U, '#f8dc98');
      px(0, Hp - 3 * U, Wp, 3 * U, '#f8dc98');
      px(0, 0, 3 * U, Hp, '#f8dc98');
      px(Wp - 3 * U, 0, 3 * U, Hp, '#f8dc98');
      return;
    }

    ctx.fillStyle = '#d8c69a';
    ctx.fillRect(0, 0, Wp, Hp);

    for (let y = 0; y < H; y++) {
      const Y = edge(y), CH = edge(y + 1) - Y;
      for (let x = 0; x < W; x++) {
        const X = edge(x), CW = edge(x + 1) - X;
        const i = AntEngine.idxOf(x, y, W);
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
        const p = AntEngine.xyOf(r.idx, W);
        const c = color(r.color);
        const X = edge(p.x), Y = edge(p.y);
        px(X + U, Y + U, 3 * U, 3 * U, c.ink);
        px(X + 2 * U, Y + 2 * U, 2 * U, 2 * U, c.hi);
      });
    }

    // 照色灯：只点亮「当前待令令牌颜色」的未填格，做规划提示；
    // 不自动取令、不改目标 / 预约 / 填色，8 秒后由计时器恢复中性色。
    if (lampActive()) {
      const lampColors = {};
      state.game.slots.forEach(function (slot) { if (slot) lampColors[slot.color] = true; });
      const glow = state.hintPhase ? '#fff3bd' : '#f0c262';
      const wash = state.hintPhase ? 'rgba(248,220,152,.42)' : 'rgba(230,180,91,.30)';
      for (let i = 0; i < W * H; i++) {
        if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
        if (!lampColors[game.color[i]]) continue;
        const p = AntEngine.xyOf(i, W);
        const X = edge(p.x), Y = edge(p.y);
        const CW = edge(p.x + 1) - X, CH = edge(p.y + 1) - Y;
        px(X + U, Y + U, CW - 2 * U, CH - 2 * U, wash);
        px(X, Y, CW, U, glow);
        px(X, Y + CH - U, CW, U, glow);
        px(X, Y, U, CH, glow);
        px(X + CW - U, Y, U, CH, glow);
      }
    }

    // 长按同色提示
    if (state.hintColor) {
      const border = state.hintPhase ? '#fff3bd' : '#e6b45b';
      const wash = state.hintPhase ? 'rgba(248,220,152,.52)' : 'rgba(230,180,91,.38)';
      for (let i = 0; i < W * H; i++) {
        if (game.filled[i] || game.terrain[i] !== AntEngine.OBJECT) continue;
        if (game.color[i] !== state.hintColor) continue;
        const p = AntEngine.xyOf(i, W);
        const X = edge(p.x), Y = edge(p.y);
        const CW = edge(p.x + 1) - X, CH = edge(p.y + 1) - Y;
        px(X + U, Y + U, CW - 2 * U, CH - 2 * U, wash);
        px(X, Y, CW, U, border);
        px(X, Y + CH - U, CW, U, border);
        px(X, Y, U, CH, border);
        px(X + CW - U, Y, U, CH, border);
      }
    }

    // 细网格；矩形盘也按同样格宽 / 格高画，不能把圆格拉成长方格。
    ctx.fillStyle = 'rgba(83,62,34,.34)';
    for (let i = 0; i <= W; i++) {
      const p = Math.min(Wp - U, edge(i));
      ctx.fillRect(p, 0, U, Hp);
    }
    for (let j = 0; j <= H; j++) {
      const p = Math.min(Hp - U, edge(j));
      ctx.fillRect(0, p, Wp, U);
    }
    px(0, 0, Wp, 2 * U, 'rgba(61,43,23,.9)');
    px(0, Hp - 2 * U, Wp, 2 * U, 'rgba(61,43,23,.9)');
    px(0, 0, 2 * U, Hp, 'rgba(61,43,23,.9)');
    px(Wp - 2 * U, 0, 2 * U, Hp, 'rgba(61,43,23,.9)');
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
    // 2026-11-19 17:23：巢穴恢复去掉土色底之前的原本土褐色，不再跟着草地变绿。
    // 只恢复巢穴自身这一小块土丘；1410 去掉的整条 yard 土色底仍保持移除，
    // 草地继续从巢穴四周露出来，洞口和出入口仍是深色高对比。
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
    // 苔与草：只作为土丘边缘的点缀，不改变巢穴主色。
    npx(3, 13, 3, 2, '#6c9659');
    npx(36, 18, 3, 2, '#6c9659');
    npx(8, 24, 2, 3, '#a9c47f');
    npx(31, 25, 2, 2, '#a9c47f');
    npx(20, 3, 2, 2, '#a9c47f');
    npx(4, 25, 2, 2, '#7e9b5f');
    npx(35, 24, 2, 2, '#7e9b5f');
    // 洞口的颜料点：小画家的颜色。
    npx(11, 24, 2, 2, '#ddb052');
    npx(29, 24, 2, 2, '#e18fa6');
    npx(10, 26, 1, 1, '#f8dc98');
    npx(30, 26, 1, 1, '#ffc2d3');
  }
  function drawThumb(canvas, level) {
    const dim = levelDims(level);
    const W = dim.width, H = dim.height;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
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
      const frameId = state.level ? frameForLevel(state.level.no) : null;
      const frameTip = frameId ? '；当前画框 ' + frameName(frameId) : '；未使用画框';
      previewCard.classList.toggle('open', next);
      previewCard.setAttribute('aria-pressed', next ? 'true' : 'false');
      previewCard.setAttribute('aria-label', (next ? '完整原图预览中，点击还原游戏盘面' : '放大缩略图，点击将完整原图铺满盘面') + frameTip);
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
    if (!state.game) return 0;
    let n = 0;
    for (let c = 0; c < 4; c++) n += state.game.columns[c].length - state.game.colPos[c];
    return n;
  }

  function hiddenCount(c) {
    if (!state.game) return 0;
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
      const dim = state.game ? { width: state.game.width, height: state.game.height } : levelDims(level);
      progressLabel.textContent = '填色进度 · ' + dim.width + '×' + dim.height + ' · ' + mech;
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
    badge.textContent = state.multiplier + '×';
    badge.classList.toggle('fast', state.multiplier > 1);
    badge.classList.toggle('auto', auto);
    badge.setAttribute('aria-label', auto
      ? '当前速度：令牌取完后自动 8 倍；顶部倍速不会覆盖它'
      : '当前速度：手动 ' + state.manualMultiplier + ' 倍');
    app.setAttribute('data-speed', String(state.multiplier));
    app.setAttribute('data-speed-source', auto ? 'auto' : 'manual');
  }

  function updateSpeedControls() {
    const auto = state.autoMultiplier >= AntEngine.ENDGAME_MULTIPLIER;
    const top = $('speedTopBtn');
    if (top) {
      const val = $('speedTopVal');
      if (val) val.textContent = state.manualMultiplier + '×';
      top.classList.toggle('fast', state.manualMultiplier > 1);
      top.classList.toggle('auto', auto);
      top.setAttribute('aria-label', '加速⏩：当前手动 ' + state.manualMultiplier + ' 倍' +
        (auto ? '；自动 8× 已生效，手动不会覆盖它' : '；点击切到 ' + nextManualSpeed() + ' 倍'));
      top.title = (auto ? '自动 8× 已生效；' : '') + '点击切换 1× / 2× / 4× / 8×';
    }
    const note = $('speedAuto');
    if (note) {
      note.textContent = auto ? '自动 8× 生效 · 手动不会覆盖' : '顶部⏩ 1/2/4/8× · 取完自动 8×';
      note.classList.toggle('on', auto);
    }
    const badge = $('speedBadge');
    if (badge) badge.title = auto ? '自动 8×（令牌已取完）' : '手动 ' + state.manualMultiplier + '×';
  }

  function nextManualSpeed() {
    const i = MANUAL_SPEEDS.indexOf(state.manualMultiplier);
    return MANUAL_SPEEDS[(i + 1) % MANUAL_SPEEDS.length] || 1;
  }

  function setManualSpeed(n) {
    const speed = Number(n);
    if (MANUAL_SPEEDS.indexOf(speed) === -1) return false;
    state.manualMultiplier = speed;
    // 自动 8× 是下限，不会被手动 1/2/4× 悄悄覆盖；界面同步说明。
    updateSpeed(true);
    announce('顶部倍速 ' + speed + '×' + (state.autoMultiplier >= 8 ? '；自动 8× 仍然生效' : ''));
    return true;
  }

  function cycleManualSpeed() {
    const speed = nextManualSpeed();
    setManualSpeed(speed);
    return speed;
  }

  function slotCanLaunch(index) {
    if (!state.game || !state.coordinator) return false;
    if (state.phase !== 'playing' || state.modalOpen) return false;
    // 入区动画只锁“正在飞入的那个槽”；其他已到达槽位的令牌仍可派工。
    if (state.incomingSlots.has(index)) return false;
    // 只看「这枚令牌自己还有没有可出发的蚂蚁 + 合法可达目标」；
    // t206u / t207u 起运行时没有共享在途上限，不再有「等一批落色腾容量」这层闸门。
    return state.coordinator.canLaunch(index);
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
    if (state.pickLocks.has(slot.column)) cls.push('pick-locked');
    if (canLaunch) cls.push('can-launch');
    if (isRecallable(i)) cls.push('recall-target');
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
      el.classList.toggle('pick-locked', state.pickLocks.has(slot.column));
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
      const animating = state.pickLocks.has(c);
      html.push('<div class="mat-col' + (left ? '' : ' dim') + (full ? ' slots-full' : '') + (animating ? ' animating' : '') + '" data-col="' + c + '">');
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
    // t232u：某列移入动画不再冻结整张预选区。正在飞入的列用 .animating
    // 保持第一行边框并隐藏旧色面；其他列立即恢复可点 / 可补位状态。
    if (!state.press) renderMaterials();
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
  function freeRemaining(p) { return Math.max(0, p.uses - (state.propUses[p.key] || 0)); }
  function giftRemaining(p) { return Math.max(0, Number(state.propGifts.counts[p.key]) || 0); }
  function propRemaining(p) { return freeRemaining(p) + giftRemaining(p); }
  function lampActive() { return state.lampUntil > performance.now(); }
  function peekActive() { return state.peekUntil > performance.now(); }

  // 首次到达解锁关时，给这一种道具记 1 次赠次；只记一次，存在本机 localStorage。
  // 赠次与每关基础次数分开：先扣本关免费次数，赠次留到以后关卡，未用不会过期。
  function grantUnlockGifts() {
    const granted = [];
    PROPS.forEach(function (p) {
      if (propUnlocked(p) && !state.propGifts.claimed[p.key]) {
        state.propGifts.claimed[p.key] = true;
        state.propGifts.counts[p.key] = Math.min(CHECKIN_PROP_CAP, (Number(state.propGifts.counts[p.key]) || 0) + 1);
        granted.push(p);
      }
    });
    if (granted.length) saveGiftState();
    return granted;
  }

  function consumePropUse(p) {
    if (freeRemaining(p) > 0) {
      state.propUses[p.key] = (state.propUses[p.key] || 0) + 1;
      // 只统计真正消耗成功的计次道具；失败点击、取消召回、倍速都不计数。
      // 目前 PROPS 四个都是非倍速计次道具；以后新增倍速道具时在 PROPS 里标 speed 即可排除。
      if (!p.speed) state.starPropUses = (state.starPropUses || 0) + 1;
      return 'free';
    }
    if (giftRemaining(p) > 0) {
      state.propGifts.counts[p.key] = giftRemaining(p) - 1;
      saveGiftState();
      if (!p.speed) state.starPropUses = (state.starPropUses || 0) + 1;
      return 'gift';
    }
    return false;
  }

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
      const gift = giftRemaining(p);
      const peeking = p.key === 'peek' && state.peekUntil > now;
      const lamping = p.key === 'lamp' && state.lampUntil > now;
      const slotOpen = p.key === 'slot' && state.extraSlot;
      const selecting = p.key === 'recall' && state.recallMode;
      // 召回选格时只保留召回令可点（用于取消）；其他道具暂不响应，避免切换输入模式。
      const recallLock = state.recallMode && p.key !== 'recall';
      let cls = 'prop-btn';
      if (!unlocked) cls += ' locked';
      else if (peeking || lamping || slotOpen || selecting) cls += ' active';
      else if (left <= 0) cls += ' used';
      if (recallLock) cls += ' recall-off';
      let meta = '';
      if (!unlocked) meta = '第 ' + p.unlock + ' 关';
      else if (peeking) meta = '剩余 ' + Math.max(1, Math.ceil((state.peekUntil - now) / 1000)) + 's';
      else if (lamping) meta = '剩余 ' + Math.max(1, Math.ceil((state.lampUntil - now) / 1000)) + 's';
      else if (slotOpen) meta = '已开6格';
      else if (selecting) meta = '选格中';
      else if (left <= 0) meta = '本关用完';
      else meta = '可用 ×' + left;
      const disabled = !unlocked || left <= 0 || peeking || lamping || slotOpen || recallLock || (state.phase !== 'playing') || state.modalOpen;
      const label = !unlocked
        ? p.name + '：第 ' + p.unlock + ' 关到达后解锁。' + p.short
        : p.name + '：' + p.short + '；本关基础剩余 ' + freeRemaining(p) + ' 次，首次解锁赠次 ' + gift + ' 次。';
      const giftBadge = unlocked && gift > 0
        ? '<span class="prop-gift" title="首次解锁赠次，跨关保留">赠' + gift + '</span>'
        : '';
      return '<button type="button" class="' + cls + '" data-prop="' + p.key + '"' +
        ' aria-label="' + label + '"' + (disabled ? ' aria-disabled="true" disabled' : '') + '>' +
        '<span class="prop-ico-wrap">' + propIconSVG(p.key) + '</span>' +
        '<span class="prop-text"><span class="prop-name">' + p.name + '</span>' +
        '<span class="prop-meta">' + meta + '</span></span>' +
        giftBadge +
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
    const wait = kind === 'peek'
      ? Math.max(0, state.peekUntil - performance.now())
      : Math.max(0, state.lampUntil - performance.now());
    setTimeout(function () {
      if (token !== state.runToken) return;
      if (kind === 'peek' && !peekActive()) {
        if (!state.press) renderMaterials();
        renderProps();
        if (state.phase === 'playing') announce('预窥结束，隐藏队列恢复为 +N令');
      }
      if (kind === 'lamp' && !lampActive()) {
        drawBoard();
        updateHeader();
        renderProps();
        if (state.phase === 'playing') announce('照色灯结束，盘面恢复未施工中性色');
      }
    }, wait + 40);
    if (!state.propTimer) {
      state.propTimer = setInterval(function () {
        if (state.phase !== 'playing' || (!peekActive() && !lampActive())) {
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
      toast('「' + p.name + '」本关基础次数和赠次都已用完', 1700);
      return false;
    }
    if (key === 'slot') {
      if (state.extraSlot || state.game.slots.length >= SLOT_CAPACITY_RESERVED) return false;
      if (!AntEngine.addSlot(state.game, SLOT_CAPACITY_RESERVED)) return false;
      consumePropUse(p);
      state.extraSlot = true;
      state.slotSig = '';
      renderAll();
      renderProps();
      if (!firstUseTip('slot', '备用巢格：本关多 1 个待令位；重来或换关回到 5 格。首次解锁的赠次会跨关保留。')) {
        toast('备用巢格已打开：本关临时多 1 个待令位', 1800);
      }
      announce('备用巢格已打开，待令区现在有 6 格');
      kick();
      return true;
    }
    if (key === 'peek') {
      if (peekActive()) return false;
      consumePropUse(p);
      state.peekUntil = performance.now() + PEEK_MS;
      if (!state.press) renderMaterials();
      renderProps();
      armPropExpiry('peek');
      if (!firstUseTip('peek', '预窥 8 秒：只看每列隐藏的下一枚，不取令、不改队列。')) {
        toast('预窥 8 秒：看每列隐藏的下一枚令牌', 1600);
      }
      announce('预窥已开启，隐藏队列的下一枚令牌会显示 8 秒');
      return true;
    }
    if (key === 'lamp') {
      if (lampActive()) return false;
      consumePropUse(p);
      state.lampUntil = performance.now() + LAMP_MS;
      drawBoard();
      updateHeader();
      renderProps();
      armPropExpiry('lamp');
      if (!firstUseTip('lamp', '照色灯 8 秒：点亮待令令牌同色的未填格，只做规划提示，不自动取令、不改变填色。')) {
        toast('照色灯 8 秒：点亮待令令牌同色的未填格', 1600);
      }
      announce('照色灯已开启 8 秒：只高亮待令令牌同色的未填格');
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
    const recallProp = PROPS.filter(function (x) { return x.key === 'recall'; })[0];
    if (recallProp) consumePropUse(recallProp);
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
        showTip('speed', '令牌取完了，小画家进入自动 8× 全速收尾；顶部倍速不会覆盖它。', 'speed', 4200);
        clearTimeout(state.tickTimer);
        state.tickTimer = 0;
        scheduleTick(0);
      } else if (next > before && auto < 8) {
        announce('顶部倍速 ' + state.manualMultiplier + '×');
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
    const n = game.width * game.height;
    for (let i = 0; i < n; i++) {
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
    if (state.phase !== 'playing' || state.modalOpen || !state.game) return;
    if (state.recallMode) return;
    if (state.press) return;
    // 只拦「正在飞入的那一列」的长按，其他列的长按提示照常可用；
    // 取令点击由 pickColumn 的逐列锁判断，不用全局 pickAnimating 锁。
    const pressCol = parseInt(el.getAttribute('data-col'), 10);
    if (Number.isInteger(pressCol) && state.pickLocks.has(pressCol)) return;
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
        let text = '新道具 · ' + top.name + '（第 ' + top.unlock + ' 关）：' + top.short + '。首次解锁赠 1 次，跨关保留（角标「赠1」）；先用本关基础次数。';
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
            text: '首页：彩色=已画成，灰色=未画成，带锁=先画上一关。点第一排令牌出发填色，长按看同色，点右侧小图看原图。顶部⏩切 1/2/4/8×，取完自动 8×；道具首次解锁赠 1 次（跨关保留）。',
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
    // t235u：有制作期固定队列（presetQueue）的关卡，运行期只读这一份，
    // 不按入关次数 / seed / 设备重算，也不在运行时打散。旧 200 关没有该字段，
    // 仍走原来的每局生成，保留本地旧关与存档。
    const preset = AntEngine.presetQueueOf(base);
    let seed;
    if (preset) {
      seed = (Number(preset.seed) || 1) >>> 0;
    } else {
      const explicitSeed = Number(options.seed);
      seed = (Number.isFinite(explicitSeed) && explicitSeed > 0)
        ? (explicitSeed >>> 0)
        : nextQueueSeed(base.no);
    }
    try { localStorage.setItem(SEED_KEY, JSON.stringify({ no: base.no, seed: seed, fixed: !!preset, at: Date.now() })); } catch (err) { /* file:// 可能拒绝 */ }
    let runtime;
    try {
      runtime = AntEngine.prepareLevel(base, seed);
    } catch (err) {
      // 固定队列校验失败时绝不退回「另一套运行时随机队列」；这是制作期数据
      // 错误，应让构建自测直接失败，而不是在玩家侧悄悄换队列。
      if (preset) throw err;
      console.error('本关令牌生成失败，退回保守队列', err);
      runtime = AntEngine.prepareLevel(base, seed, { fallback: true });
    }
    state.level = runtime;
    state.queueSeed = runtime.queueSeed;
    state.queueTokenCount = runtime.queueTokenCount;
    state.queueFixed = !!runtime.queueFixed;
    state.presetQueueSource = runtime.presetQueueSource || '';
    noteReached(runtime.no);
    // 首次到达解锁关：把每种道具的 1 次赠次记进本机存档，并随「新道具」气泡说明。
    state.lastGrantedGifts = grantUnlockGifts().map(function (p) { return p.key; });
    state.game = AntEngine.createState(runtime);
    state.coordinator = AntEngine.createCoordinator(state.game, {
      maxInFlight: IN_FLIGHT_CAP,
      routePlanner: function (targetIdx, reserved, routeSeed) {
        // 起点就是巢穴出口：把屏幕巢穴位置换成盘外最下一行的同一列节点。
        // t213u：routeSeed 让每只蚂蚁在同长度路线里选不同侧面；仍是最短路线。
        return AntEngine.routeFromNest(state.game, targetIdx, reserved, nestExitNode(), routeSeed);
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
    state.modalOpen = false;
    state.launchLanes.clear();
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
    state.propUses = { slot: 0, peek: 0, recall: 0, lamp: 0 };
    // 每次进入 / 重来 / 换关都从 0 开始计本关的计次道具使用次数；星级按本关结算。
    state.starPropUses = 0;
    state.lastStarResult = null;
    state.extraSlot = false;
    state.peekUntil = 0;
    state.lampUntil = 0;
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
    $('checkin').hidden = true;
    state.checkinOpen = false;
    document.body.classList.remove('home-open');
    document.body.classList.remove('checkin-open');
    // 关卡内「原画展示」位：右下角完整原图缩略图。画框只在它的 padding 里，
    // 不盖住原画，也不改变外框与盘面右缘的对齐。
    applyFrameTo(previewCard, frameForLevel(runtime.no));
    drawNest();
    drawThumb(previewCanvas, runtime);
    renderAll();
    layoutNestForLevel(runtime);
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
    const game = state.game;
    const W = game ? game.width : SIZE, H = game ? game.height : SIZE;
    const cr = boardCanvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return cr.width / W || 0;
    return Math.min(cr.width / W, cr.height / H);
  }

  function boardCellCenter(i) {
    const game = state.game;
    const W = game ? game.width : SIZE;
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = boardCellSize();
    const p = AntEngine.xyOf(i, W);
    return { x: cr.left - ar.left + (p.x + 0.5) * cell, y: cr.top - ar.top + (p.y + 0.5) * cell };
  }

  function boardCellRect(i) {
    const game = state.game;
    const W = game ? game.width : SIZE;
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = boardCellSize();
    const p = AntEngine.xyOf(i, W);
    return { left: cr.left - ar.left + p.x * cell, top: cr.top - ar.top + p.y * cell, width: cell, height: cell };
  }

  function nestPoint() {
    const nr = $('nest').getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    return { x: nr.left - ar.left + nr.width / 2, y: nr.top - ar.top + nr.height / 2 };
  }

  // 把巢穴 DOM 摆到与引擎 nestCenterFor(level) 相同的「格」坐标：
  // 横向 width×0.375，纵向 height+3（旧 30×30 仍为 11.25 / 34）。这样
  // 圆心的欧氏距离、巢穴出口列和屏幕上的洞口味于同一实际比例坐标系。
  function layoutNestForLevel(level) {
    if (!level) return;
    const dim = levelDims(level);
    const W = dim.width, H = dim.height;
    const center = AntEngine.nestCenterFor(level);
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const yard = document.querySelector('.yard');
    const yr = yard.getBoundingClientRect();
    const cell = boardCellSize();
    if (!cell || !yr.height) return;
    const targetX = cr.left - ar.left + center.x * cell;
    const targetY = cr.top - ar.top + center.y * cell;
    const nb = document.querySelector('.nest-block');
    const nestEl = $('nest');
    const label = document.querySelector('.nest-label');
    if (!nb || !nestEl) return;
    nb.style.left = Math.round(targetX - (yr.left - ar.left)) + 'px';
    nb.style.top = '0px';
    nb.style.height = Math.round(yr.height) + 'px';
    const nestH = nestEl.getBoundingClientRect().height || 36;
    const nestTop = targetY - (yr.top - ar.top) - nestH / 2;
    nestEl.style.top = Math.round(nestTop) + 'px';
    if (label) label.style.top = Math.max(0, Math.round(nestTop - 13)) + 'px';
  }

  // 巢穴出口 -> 盘外虚拟行 y = H + 1 的同一列节点。
  // 这个节点在屏幕上就是巢穴出口，寻路从它开始，不再先跑到盘面底边中点。
  function nestExitNode() {
    const game = state.game;
    const W = game ? game.width : SIZE, H = game ? game.height : SIZE;
    const np = nestPoint();
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = boardCellSize();
    if (!cell) return { x: Math.floor(W / 2), y: H + 1 };
    let gx = Math.round((np.x - (cr.left - ar.left)) / cell - 0.5);
    gx = Math.max(-1, Math.min(W, gx));
    return { x: gx, y: H + 1 };
  }

  function isBoardNode(node) {
    const game = state.game;
    const W = game ? game.width : SIZE, H = game ? game.height : SIZE;
    return node.x >= 0 && node.x < W && node.y >= 0 && node.y < H;
  }

  function pathNodePoint(node) {
    const game = state.game;
    const W = game ? game.width : SIZE, H = game ? game.height : SIZE;
    const cr = boardCanvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const cell = boardCellSize();
    if (isBoardNode(node)) return boardCellCenter(node.y * W + node.x);
    // 巢穴出口那一行由屏幕上的真实巢穴位置表示，不按网格中心画，避免视觉瞬移。
    if (node.y === H + 1) return nestPoint();
    return {
      x: cr.left - ar.left + (node.x + 0.5) * cell,
      y: cr.top - ar.top + (node.y + 0.5) * cell
    };
  }

  // 蚂蚁身体缩放：格宽 0.72 倍以内，保证身体（含腿）落在足迹半径内。
  // 题图不是放大蚂蚁挡画，宁可小一点也要让整条真实轨迹不压已填格。
  function antScaleForCell(cell) {
    // t231u 本轮补正：0.68 格宽精灵（含腿 / 桶）的半对角线约 0.456 格，
    // 落在引擎足迹半径 0.47 内；原 0.72 格宽的角会略微越过 0.47。
    return Math.max(0.30, Math.min(1, (cell * 0.68) / 17));
  }

  function antLaneOffsetPx(el, offsetScale) {
    // 车道偏移只影响观感，不能把身体推出未填走廊。t233u 允许蚂蚁身体互相
    // 穿过，所以这里把横向偏移压到 0.02 格安全余量内；出巢不整齐仍由每只
    // 自己的出生点微差、步态错相和同长度路线不同侧面来保持。
    const cell = el._cellPx || boardCellSize();
    const maxOffset = Math.max(0, cell * 0.02 - 0.5);
    const lane = Math.max(-maxOffset, Math.min(maxOffset, el._laneOffset || 0));
    const scale = offsetScale == null ? 1 : Math.max(0, Math.min(1, offsetScale));
    return lane * scale;
  }

  function positionAnt(el, point) {
    // 同色多令牌不再需要横向分车道来避免重叠：t233u 明确允许身体穿过。
    // 保留的极小偏移只用于让同路线不完全像素级重合，且不越过足迹安全余量。
    const ox = antLaneOffsetPx(el, el._offsetScale == null ? 1 : el._offsetScale);
    el.style.transform = 'translate(' + Math.round(point.x - ANT_W / 2 + ox) + 'px,' + Math.round(point.y - ANT_H / 2) + 'px)';
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

  function animatePixelSegment(el, from, to, token, offsetScale, guard) {
    return new Promise(function (resolve) {
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      el._offsetScale = offsetScale == null ? 1 : Math.max(0, Math.min(1, offsetScale));
      if (dist < 0.5) { positionAnt(el, to); resolve('ok'); return; }
      let done = 0;
      let last = performance.now();
      function frame(now) {
        if (token !== state.runToken) { resolve(false); return; }
        const dt = Math.min(100, Math.max(0, now - last));
        last = now;
        done = Math.min(dist, done + dt * Math.max(0.001, outSpeed()));
        const t = done / dist;
        // t231u：每一帧都检查蚂蚁当前身体位置是否压进已填格。若有格子
        // 在途中被填上，立刻停在上一安全位置，由调用方重寻路，不再继续穿越。
        if (guard && !guard(t)) { resolve('blocked'); return; }
        positionAnt(el, { x: from.x + dx * t, y: from.y + dy * t });
        if (t >= 1) { resolve('ok'); return; }
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
    const game = state.game;
    const n = game.width * game.height;
    for (let i = 0; i < n; i++) if (game.filled[i]) blocked.add(i);
    const stats = state.coordinator ? state.coordinator.stats() : { reservations: [] };
    stats.reservations.forEach(function (r) {
      if (r.id !== task.id) blocked.add(r.idx);
    });
    return blocked;
  }

  function replanFrom(task, current) {
    // 中途重规划沿用这只蚂蚁自己的路线种子；仍会避开已填格和其他预约目标。
    return AntEngine.planVirtualRoute(state.game, current, task.idx, pathBlockedForTask(task), task.id);
  }

  // t218u：出巢观感的「确定性微差」——每只蚂蚁出生点在巢口内有几像素
  // 不同、步态相位错开、车道偏移带一点自然抖动。不是随机空转，不加停顿，
  // 不改基础移速 / 倍率，也不改任何出发规则；同一只蚂蚁走完始终稳定。
  function antStyleHash(task, salt) {
    const a = (Number(task && task.id) || 0) + 1;
    const b = (Number(task && task.tokenUid) || 0) + 1;
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul((salt | 0) + 1, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function makeAnt(task) {
    const el = document.createElement('div');
    el.className = 'ant facing-right step';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-task-id', String(task.id));
    el._facing = 'right';
    el._laneOffset = Number(task.laneOffset) || 0;
    el._offsetScale = 1;
    el._cellPx = boardCellSize();
    el._scale = antScaleForCell(el._cellPx);
    el.style.setProperty('--ant-scale', el._scale.toFixed(4));
    // 出生点微差：只在巢口内 ±4px / ±2px，不改变路线起点网格与安全约束。
    el._spawnX = (antStyleHash(task, 1) - 0.5) * 8;
    el._spawnY = (antStyleHash(task, 2) - 0.5) * 4;
    // 步态错相：身体起伏 240–300ms、六条腿 190–280ms，相位各自错开；
    // 仍是原来的两帧交替，只是不再全队同拍踏步。
    const gaitDur = 0.24 + antStyleHash(task, 3) * 0.06;
    const legDur = gaitDur * (0.78 + antStyleHash(task, 4) * 0.18);
    const gaitPhase = -antStyleHash(task, 5) * gaitDur;
    el.style.setProperty('--gait-duration', gaitDur.toFixed(3) + 's');
    el.style.setProperty('--leg-duration', legDur.toFixed(3) + 's');
    el.style.setProperty('--gait-phase', gaitPhase.toFixed(3) + 's');
    el.style.setProperty('--paint', color(task.color).hex);
    const visual = document.createElement('span');
    visual.className = 'ant-visual';
    const body = document.createElement('span');
    body.className = 'ant-body';
    const sprite = document.createElement('span');
    sprite.className = 'ant-sprite';
    body.appendChild(sprite);
    const bucket = document.createElement('span');
    bucket.className = 'ant-bucket';
    visual.appendChild(body);
    visual.appendChild(bucket);
    el.appendChild(visual);
    const np = nestPoint();
    positionAnt(el, { x: np.x + el._spawnX, y: np.y + el._spawnY });
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
    const game = state.game;
    const W = game.width, H = game.height;
    const radius = AntEngine.ANT_FOOTPRINT_RADIUS;
    const np = nestPoint();
    // 从这只蚂蚁自己的巢口微差位置出发（不是全队同一个像素点）。
    let point = { x: np.x + (el._spawnX || 0), y: np.y + (el._spawnY || 0) };
    let route = task.route && task.route.length ? task.route.slice() : [];
    if (!route.length) return false;
    let current = route[0];
    // 新路径的第 0 个节点就是巢穴出口（y = H + 1），屏幕位置用本只蚂蚁的
    // 出生点；旧调用若从盘边起步，才走这一小段。
    if (current.y === H + 1) {
      point = { x: np.x + (el._spawnX || 0), y: np.y + (el._spawnY || 0) };
    } else {
      const scale = Math.min(1, Math.max(0, (route.length - 1) / 6));
      const first = await animatePixelSegment(el, point, pathNodePoint(current), token, scale);
      if (first === false) return false;
      point = pathNodePoint(current);
    }
    route = route.slice(1);
    view.status = 'walking';
    view.route = route.slice();
    el.classList.add('step');
    let guard = 900;
    while (guard-- > 0) {
      if (token !== state.runToken) return false;
      if (isBoardNode(current) && current.x + current.y * W === task.idx) break;
      if (!route.length) {
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
      }
      const next = route[0];
      const ni = isBoardNode(next) ? next.y * W + next.x : -1;
      // 斜步还要在真正迈步前再看一眼两侧正交格：如果它们在出发后被别的
      // 蚂蚁填上，就立刻重规划，避免从新填格的角缝里穿过去。
      let cornerFilled = false;
      if (isBoardNode(next) && isBoardNode(current) && next.x !== current.x && next.y !== current.y) {
        const flanks = [{ x: current.x + (next.x - current.x), y: current.y }, { x: current.x, y: current.y + (next.y - current.y) }];
        for (let fi = 0; fi < flanks.length; fi++) {
          const f = flanks[fi];
          if (isBoardNode(f) && game.filled[f.y * W + f.x]) cornerFilled = true;
        }
      }
      // 下一格 / 斜步两侧已被别的蚂蚁填上：原地立刻重规划，不站着干等。
      if ((ni >= 0 && game.filled[ni]) || cornerFilled) {
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
        continue;
      }
      // 出发后若整段真实插值已经压到新填格，也先重规划，不进入这一段。
      if (!AntEngine.segmentClear(game, current, next, radius, null)) {
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
        continue;
      }
      const nextPoint = pathNodePoint(next);
      setAntFacing(el, nextPoint.x - point.x, nextPoint.y - point.y);
      const scale = Math.min(1, Math.max(0, (route.length - 1) / 6));
      const laneGrid = antLaneOffsetPx(el, scale) / Math.max(1, boardCellSize());
      const segGuard = function (t) {
        const gx = current.x + (next.x - current.x) * t + laneGrid;
        const gy = current.y + (next.y - current.y) * t;
        return AntEngine.pointClearOfPaint(game, gx, gy, radius, null);
      };
      const walked = await animatePixelSegment(el, point, nextPoint, token, scale, segGuard);
      if (walked === false) return false;
      if (walked === 'blocked') {
        // 中途格变已填：退回本段起点（最近的安全格中心），立刻重规划。
        // 不继续穿越、不站着死等；若没有合法路线，runAnt 会 abort 并归还令牌计数。
        point = pathNodePoint(current);
        positionAnt(el, point);
        route = replanFrom(task, current);
        if (!route.length) return false;
        if (route[0] && route[0].x === current.x && route[0].y === current.y) route = route.slice(1);
        if (!route.length) return false;
        view.route = route.slice();
        continue;
      }
      current = next;
      point = nextPoint;
      route.shift();
      view.route = route.slice();
      view.idx = isBoardNode(current) ? current.x + current.y * W : null;
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
      // t233u：蚂蚁身体可以重叠穿过；这里不再检查「另一只蚂蚁的路线 / 脚下
      // 是否覆盖本目标格」，不因别的蚂蚁在路径上而等待或顺次避让。目标格
      // 的唯一预约在 dispatch 时已经锁定，提交前只做封口 / 已填 / 预约复核。
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
      state.slotSig = '';
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
    // t232u：每列动画各自结束、各自解锁；只有本列的锁被清掉。
    // renderMaterials 会按 pickLocks 重建 .animating / 队首边框，别的列即使
    // 还在飞入也不会被隐藏或锁住。
    state.incomingSlots.delete(picked.slotIndex);
    state.pickLocks.delete(c);
    state.pickAnimating = state.pickLocks.size > 0;
    state.slotSig = '';
    renderAll();
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
    // 动画一开始就按真实占位刷新：本列队首进入 .animating（第一行边框常驻），
    // 其他列仍保持原样、可立即点击。槽位在 AntEngine.pick 时已写入，容量
    // 判定从这一刻起就包含在途移入，不等动画结束。
    if (!state.press) renderMaterials();
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
    // t230u（2026-11-19 22:15）：每条待令位队列自己的出巢间隔从 1× 约 300ms
    // 适度放慢到约 420ms（频率约 -29%）。倍速仍按倍率缩短，保留 45ms 下限。
    // 这个间隔不是全局节拍：六条队列各自从自己的 nextAt 到点出发，可以同时、
    // 连续出巢；没有等上一批结束、固定批次或共享容量闸门。
    return Math.max(45, AntEngine.DISPATCH_BASE_MS / speed);
  }

  // 保持「每个占用中的待令格一条 lane」的映射：令牌 uid 变了 / 槽位空了，
  // 旧 lane 立刻删除；新令牌到达后下次 tick 立即建 lane，首次 nextAt=0。
  function syncLaunchLanes() {
    if (!state.game) return;
    const slots = state.game.slots;
    Array.from(state.launchLanes.keys()).forEach(function (i) {
      const slot = slots[i];
      const lane = state.launchLanes.get(i);
      if (!slot || !lane || lane.uid !== slot.uid) state.launchLanes.delete(i);
    });
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      if (!state.launchLanes.has(i)) state.launchLanes.set(i, { uid: slot.uid, nextAt: 0 });
    }
  }

  // 可出动令牌 = 占用中、已到达、还有未出发蚂蚁，且此刻至少一个合法可达目标。
  // 同色多令牌各算一路；休眠 / ZZ 令牌不算；运行时没有共享在途上限。
  function launchQueueSlots() {
    if (!state.game || !state.coordinator) return [];
    const out = [];
    for (let i = 0; i < state.game.slots.length; i++) {
      if (slotCanLaunch(i)) out.push(i);
    }
    return out;
  }

  // 给每路出巢队列一个稳定的横向车道偏移：两路同色令牌会并排成两条，
  // 而不是在巢穴口与盘外环路上完全重叠。数量按当前可出动令牌数动态排布。
  function launchQueueOffsets() {
    const slots = launchQueueSlots();
    const map = new Map();
    const n = slots.length;
    if (!n) return map;
    // 车道总宽不超过巢穴口：375 / 390 / 430 档巢穴宽 38 / 48 / 50px。
    let nestW = 44;
    if (nestCanvas) {
      const w = nestCanvas.getBoundingClientRect().width;
      if (w > 0) nestW = w;
    }
    const maxSpan = Math.max(18, Math.min(44, nestW - 8));
    const gap = n <= 1 ? 0 : Math.min(18, maxSpan / (n - 1));
    slots.forEach(function (s, i) {
      // t218u：在均匀车道基础上加一点按令牌 uid 固定的自然抖动，避免六只
      // 排成一把完全对称的尺子；抖动不超过 0.22 个车道间距，仍不叠成一只。
      const slot = state.game.slots[s];
      const jitterKey = antStyleHash({ id: s + 1, tokenUid: slot ? slot.uid : 0 }, 11);
      const jitter = (jitterKey - 0.5) * gap * 0.44;
      map.set(s, Math.round((i - (n - 1) / 2) * gap + jitter));
    });
    return map;
  }

  // t200u：六个待令位各自一条独立出巢队列。每条 lane 到自己的 nextAt
  // 就派 1 只；同一 tick 可以多路同时出发。没有全局 nextDispatchAt、
  // 没有 spawnCursor，也没有「可出动 lane 汇总后从左到右轮转」的总队列。
  // 空 / 休眠 lane 直接跳过，不占别人的拍子；共享的只有目标格预约。
  function dispatchDueLanes() {
    if (state.phase !== 'playing' || state.modalOpen || !state.coordinator) return 0;
    // 召回选格模式：暂停「新派工」，让可召回令牌的在途状态稳定下来；
    // 已在途的蚂蚁继续正常落色，不冻结动画、不改规则。
    if (state.recallMode) return 0;
    if (state.game.filledCount >= state.game.total) return 0;
    syncLaunchLanes();
    const now = performance.now();
    const interval = spawnInterval();
    // 本拍出发的队列按「当前可出动队列」取横向车道偏移；同一拍多路出发
    // 会并排成不同车道，不会在巢穴口叠成一只。
    const offsets = launchQueueOffsets();
    let started = 0;
    let freedAny = false;
    for (let s = 0; s < state.game.slots.length; s++) {
      const lane = state.launchLanes.get(s);
      if (!lane) continue;
      // 正在飞入的槽位先不派工；其他已到达的槽位可以继续派。
      if (state.incomingSlots.has(s)) continue;
      // 每条队列只等自己的下一拍；不到点只跳过这一条，不阻塞其它队列。
      if (lane.nextAt > now) continue;
      // 只看令牌自身是否可出动：休眠 / 无合法可达目标就跳过；
      // 空槽 / 出尽的 lane 已在 syncLaunchLanes 收起。同色多令牌也各走各的。
      if (!state.coordinator.canLaunch(s)) continue;
      const hadSlot = !!state.game.slots[s];
      const task = state.coordinator.dispatch(s);
      if (!task) continue;
      // 这条队列成功派出一只后，才从自己的出发时刻重置自己的 300ms；
      // 其它队列的 nextAt 不受影响，所以不会形成全局串行节拍。
      lane.nextAt = now + interval;
      task.laneOffset = offsets.get(s) || 0;
      started++;
      const token = state.runToken;
      const p = runAnt(task, token).finally(function () {
        state.animating.delete(p);
        if (state.phase === 'playing') scheduleTick(0);
      });
      state.animating.add(p);
      // 开发自测 / 本地交付用：记录这只蚂蚁的路线形状摘要（斜步数、总步数、
      // 路线签名、本拍车道偏移），不参与派工与落块判断。
      let routeDiag = 0;
      let routeSig = 2166136261 >>> 0;
      if (task.route) {
        for (let ri = 1; ri < task.route.length; ri++) {
          const a = task.route[ri - 1], b = task.route[ri];
          if (a.x !== b.x && a.y !== b.y) routeDiag++;
          routeSig = Math.imul(routeSig ^ ((b.x + 3) * 37 + (b.y + 3)), 16777619) >>> 0;
        }
      }
      state.departureLog.push({
        at: Math.round(performance.now()),
        slotIndex: s,
        idx: task.idx,
        color: task.color,
        tokenUid: task.tokenUid,
        routeStart: task.route && task.route[0] ? { x: task.route[0].x, y: task.route[0].y } : null,
        routeSteps: task.route ? task.route.length - 1 : 0,
        routeDiag: routeDiag,
        routeSignature: routeSig.toString(16),
        laneOffset: task.laneOffset || 0,
        inFlight: state.coordinator.activeCount()
      });
      state.lastRouteStart = task.route && task.route[0] ? { x: task.route[0].x, y: task.route[0].y } : null;
      if (state.departureLog.length > 240) state.departureLog.shift();
      if (hadSlot && !state.game.slots[s]) freedAny = true;
    }
    if (!started) return 0;
    state.slotSig = '';
    renderSlots(false);
    // 某一令牌最后一只出巢后槽位会空出来；同步刷新队首可用状态和「满格」标记，
    // 不再让旧 DOM 的 .off 把队首永久置灰。
    if (freedAny && !state.press && state.pickLocks.size === 0) renderMaterials();
    updateHeader();
    drawBoard();
    if (!state.tips['first-parallel'] && !introTipBusy()) {
      const colors = new Set(state.coordinator.stats().reservations.map(function (r) { return r.color; }));
      if (colors.size >= 2) {
        showTip('first-parallel', '每枚可出动令牌各自成队、可以同时在途；待令位越多，同时出巢的队列越多。', 'board', 5200);
      }
    }
    return started;
  }

  // 所有「可出动且已到点 / 快到点」的独立队列里，取最早的 nextAt。
  // 空 / 休眠 lane 不参与，不阻塞其它队列。没有可出动的 lane 时用 70ms 兜底。
  function nextLaneDelay() {
    const now = performance.now();
    let earliest = Infinity;
    state.launchLanes.forEach(function (lane, i) {
      const slot = state.game.slots[i];
      if (!slot || lane.uid !== slot.uid) return;
      if (state.incomingSlots.has(i)) return;
      if (!slotCanLaunch(i)) return;
      const at = lane.nextAt || 0;
      if (at < earliest) earliest = at;
    });
    if (earliest === Infinity) return 70;
    return Math.max(0, earliest - now);
  }

  // 还有「可出动但下一拍未到」的 lane。没有在途蚂蚁时也必须为它排下一拍，
  // 否则短路线先落完、lane 还差几百 ms 才到点，tick 会误以为可以收工而停住。
  function hasPendingLane() {
    let pending = false;
    state.launchLanes.forEach(function (lane, i) {
      if (pending) return;
      const slot = state.game.slots[i];
      if (!slot || lane.uid !== slot.uid) return;
      if (slotCanLaunch(i)) pending = true;
    });
    return pending;
  }

  function tick() {
    if (state.tickRunning) return;
    state.tickRunning = true;
    const token = state.runToken;
    try {
      if (token !== state.runToken || state.phase !== 'playing') return;
      if (state.modalOpen) { scheduleTick(140); return; }
      updateSpeed();
      const started = dispatchDueLanes();
      if (started > 0) { scheduleTick(nextLaneDelay()); return; }
      if (state.coordinator.activeCount() > 0 || state.animating.size > 0 || state.incomingSlots.size > 0) { scheduleTick(nextLaneDelay()); return; }
      if (state.recallMode) {
        if (AntEngine.isWin(state.game)) { finishWin(); return; }
        scheduleTick(120);
        return;
      }
      // 没有在途蚂蚁，但还有可出动 lane 在等自己的下一拍：不能提前 afterSettle 收工。
      if (hasPendingLane()) { scheduleTick(nextLaneDelay()); return; }
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
    const level = state.level || LEVELS[state.levelIndex];
    state.lastStarResult = recordClear(level.no, state.starPropUses);
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
    const tier = levelTier(level);
    const targetSteps = levelTargetSteps(level);
    const mech = String(level.mechanic || '').split(' · ').filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · ');
    return [
      '<div class="modal-kicker">提示 · 当前规则与本关机制</div>',
      '<h2>怎么玩</h2>',
      '<p>首页十季全部从上往下展开：彩色是已画成，灰色是未画成，带锁的关卡要先画成上一关。点四列第一排的纯色令牌，送进待令区；小画家会从巢穴出口直接出发，提同色颜料桶，把盘面上同色的空格逐格填满。</p>',
      '<div class="rule"><b>本关 · 第 ' + level.no + ' 关「' + level.name + '」</b><br>难度 ' + tier + ' / 5 · 目标 ' + targetSteps + ' 步 · 像素 ' + level.pixelUnit + '× · 机制：' + (mech || '像素填色') + '。' +
        (minSteps ? '本关最少 <b>' + minSteps + ' 步</b>（一步 = 点一次队首令牌）。' : '本关最少步数待配置。') +
        '这里只说明规则和机制，不显示整关答案，也不会自动取令。</div>',
      '<div class="rule"><span class="num">1</span><b>只点第一排</b><br>每列只显示三行令牌。第四枚及以后不画出来，只显示「+N令」；N 是隐藏的令牌枚数。只要还有空待令位，队首就能先入区等待，即使暂时没有可派的目标。</div>',
      '<div class="rule"><span class="num">2</span><b>长按看同色</b><br>长按任意可见令牌，或待令区里的令牌，按住时会走一条 4 格像素进度条；激活后盘面亮起同色位置，右下角显示同色格数。松手就收起，不取令、不占格。原图铺满预览时长按同样有效，松开只收起高亮，不退出预览。</div>',
      '<div class="rule"><span class="num">3</span><b>数字、休眠 Zz 和小旗</b><br>待令格默认 5 位（第 3 关道具可临时开第 6 位）。数字是这枚令牌还没出发的蚂蚁数；能出动时右上出现小红旗，真的没有合法可达目标、处于休眠时才显示像素风 Zz；在途满只是排队等容量，不算休眠。空槽不显示 Zz。每个可出动令牌各排一路出巢，同色多令牌也分开；令牌出尽立即腾位收队。五格满了以后，只有你再点队首才会提示「已满」，蚂蚁搬运途中不会自动弹。</div>',
      '<div class="rule"><span class="num">4</span><b>从巢穴出口直接出发、不踩已铺格</b><br>路径从屏幕巢穴出口开始，经盘外环路绕到目标，不先跑到盘面中间，也不直线穿过已铺格。每只蚂蚁在即将出巢时才确认并预约自己的目标；预约会在目标格左上角显示一个小角标，预约不等于已经填色。</div>',
      '<div class="rule"><span class="num">5</span><b>内部未满不封口 · 顶部加速</b><br>最后一枚同色令牌会留在待令区等；内部填完后自动继续。顶部⏩按钮点击循环 1× / 2× / 4× / 8×，重来或换关回到 1×；四列令牌取完会自动 8×，自动 8× 是下限，不会被手动悄悄覆盖。基础移速仍是 1×。</div>' +
      '<div class="rule"><b>道具（本地免费，每关基础次数重置 + 首次解锁赠 1 次）</b><br>到达对应关即解锁：第 3 关「备用巢格」本关多开 1 个待令位（默认仍是 5 格）；第 4 关「预窥令」8 秒看清每列隐藏的下一枚；第 8 关「召回令」把一枚还没出巢的待令令牌退回原列队首（选格期间暂停新派工，再点一次召回令可取消）；第 10 关「照色灯」8 秒点亮待令令牌同色的未填格（只做规划提示，不自动取令）。每种首次解锁额外赠 1 次，按钮角标「赠N」；赠次跨关保留、先用本关基础次数。道具不绕过封口，不加付费 / 广告 / 联网。</div>' +
      '<div class="rule"><b>通关星级（只按计次道具，倍速除外）</b><br>通关后按本关「计次道具」使用次数评 1–3 星：<b>0 次 = 3 星（完美通关）</b>；<b>1–5 次 = 2 星</b>；<b>6 次及以上 = 1 星</b>。计次道具是备用巢格、预窥令、召回令、照色灯这类非倍速道具；顶部⏩加速和以后的倍速都不计数。评星与关卡难度、步数无关。未通关不显示星；重玩只保留本地最好成绩，更高才更新，更低不覆盖。首页关卡入口会同步显示该关最好星级。</div>' +
      '<div class="rule"><b>原图预览</b><br>点洞穴右侧的完整原图缩略图，会把原图铺满盘面；再点缩略图（或盘面）还原。预览只换画面，不改填色进度。</div>' +
      '<div class="rule"><b>签到与画框（本地免费）</b><br>首页「签到 · 画框」按北京时间周一 00:00 到周日 24:00 一轮，每天最多签 1 次，每次送 1 次已解锁的本地道具赠次。签满该周 7 天，额外得一枚原创像素画框；漏签只少当天道具，不倒退已签天数，也不收回以前拿到的画框。画框可「应用全部」，也可逐关「个别」选择或不用；只使用已经获得的画框，设置存在本机。画框出现在首页每关原画入口、关卡右下角原图预览和完成弹层的成品展示上。</div>' +
      '<div class="rule"><b>推荐节奏</b><br>一列一列点：等这一列的小画家基本填完或开始等待，再点下一列，更容易通关；任意顺序失败都可免费重来。</div>',
      '<div class="legend">' +
        '<span><i style="background:#d9c9a3;border-color:#8d7a56"></i>未施工</span>' +
        '<span><i style="background:#6c9659"></i>已填色</span>' +
        '<span><i style="background:#26352c;border-color:#695a42"></i>待令格</span>' +
        '<span><i style="background:#8f231d"></i>可出发小旗</span>' +
      '</div>',
      '<div class="seed-note">' + (state.queueFixed
        ? '本关预选区令牌已在制作期按难度固定保存；进入 / 刷新 / 重试 / 换 seed / 换设备都读取同一份四列队列（seed 仅作数据标识 <b>' + (state.queueSeed >>> 0) + '</b>）。'
        : '本局 seed <b>' + (state.queueSeed >>> 0) + '</b> · 正常换关 / 重试会换新 seed；开发复现可加 <b>?seed=' + (state.queueSeed >>> 0) + '</b>') + '</div>',
      '<div class="modal-actions"><button type="button" class="btn primary" data-action="close-help">知道了</button></div>'
    ].join('');
  }
  function openHelp() { openOverlay(helpHTML()); }

  function drawHomeThumbs() {
    document.querySelectorAll('#levelGrid canvas[data-thumb]').forEach(function (cv) {
      const i = parseInt(cv.getAttribute('data-thumb'), 10);
      if (LEVELS[i]) drawThumb(cv, LEVELS[i]);
    });
  }

  function homeThemeSections() {
    if (!THEME_LIST.length) return [{ name: '全部关卡', blurb: '', start: 1, count: LEVELS.length }];
    return THEME_LIST;
  }

  function setHomeTabActive(i) {
    const idx = Math.max(0, Math.min(homeThemeSections().length - 1, i));
    state.homeTheme = idx;
    document.querySelectorAll('.theme-tab[data-theme]').forEach(function (btn) {
      const on = parseInt(btn.getAttribute('data-theme'), 10) === idx;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function scrollToHomeTheme(i, smooth) {
    const idx = Math.max(0, Math.min(homeThemeSections().length - 1, i));
    const sec = document.querySelector('.season-block[data-theme="' + idx + '"]');
    state.homeTheme = idx;
    if (sec) sec.scrollIntoView({ block: 'start', behavior: smooth === false ? 'auto' : 'smooth' });
    setHomeTabActive(idx);
  }

  function updateHomeTabByScroll() {
    const homeEl = $('home');
    if (!homeEl || homeEl.hidden) return;
    const blocks = Array.from(document.querySelectorAll('.season-block[data-theme]'));
    if (!blocks.length) return;
    const top = homeEl.getBoundingClientRect().top + 74;
    let active = 0;
    blocks.forEach(function (el) {
      if (el.getBoundingClientRect().top <= top) active = parseInt(el.getAttribute('data-theme'), 10) || 0;
    });
    if (active !== state.homeTheme) setHomeTabActive(active);
  }

  function showHomeGuide(markSeen) {
    const el = $('homeGuide');
    if (!el) return;
    el.hidden = false;
    if (markSeen) {
      state.homeGuideSeen = true;
      saveHomeGuideSeen();
    }
  }

  function hideHomeGuide() {
    const el = $('homeGuide');
    if (el) el.hidden = true;
    state.homeGuideSeen = true;
    saveHomeGuideSeen();
  }

  // 玩家可见的难度统一走 5 级；旧 difficulty 1..10 只作为像素档生成数据保留。
  function levelTier(lv) { return AntEngine.difficultyTierForLevel(lv); }
  function levelTargetSteps(lv) {
    const preset = AntEngine.presetQueueOf(lv);
    if (preset && Number(preset.target) > 0) return Number(preset.target);
    return AntEngine.stepTargetForTier(levelTier(lv));
  }

  function renderHome() {
    const total = LEVELS.length;
    const done = doneCount();
    $('homeDone').textContent = String(done);
    $('homeTotal').textContent = String(total);
    $('homeProgressBar').style.width = (done / Math.max(1, total) * 100).toFixed(2) + '%';
    renderHomeCheckinEntry();

    const seasons = homeThemeSections();
    // 季标签只做「跳到该季」：十季全部展开在下面，不靠横滑或截断网格。
    const tabs = [];
    seasons.forEach(function (t, i) {
      let td = 0;
      for (let k = t.start - 1; k < Math.min(LEVELS.length, t.start - 1 + t.count); k++) if (hasDone(LEVELS[k].no)) td++;
      tabs.push('<button type="button" class="theme-tab' + (i === state.homeTheme ? ' on' : '') + '" data-theme="' + i + '" role="tab" aria-selected="' + (i === state.homeTheme ? 'true' : 'false') + '" title="跳到第 ' + (i + 1) + ' 季">' +
        '<span class="theme-tab-name">' + t.name + '</span>' +
        '<span class="theme-tab-count">' + td + '/' + t.count + '</span>' +
      '</button>');
    });
    $('themeTabs').innerHTML = tabs.join('');

    // 十季全部按顺序纵向展开；每季 20 关一行一关，缩略图始终是该关完整原画。
    const sections = [];
    seasons.forEach(function (theme, ti) {
      let td = 0;
      const cards = [];
      for (let k = theme.start - 1; k < Math.min(LEVELS.length, theme.start - 1 + theme.count); k++) {
        const lv = LEVELS[k];
        const unlocked = isUnlocked(lv.no) || hasDone(lv.no);
        const doneLv = hasDone(lv.no);
        const best = doneLv ? bestStars(lv.no) : 0;
        const cls = ['level-card'];
        if (doneLv) cls.push('done');
        if (!unlocked) cls.push('locked');
        if (doneLv) td++;
        // 未通关不渲染星标；已通关只显示本地存档里的最好成绩（0 星的旧存档不伪造星）。
        const starsLine = best > 0 ? starsHTML(best, 'lvl-stars') : '';
        const tier = levelTier(lv);
        const targetSteps = levelTargetSteps(lv);
        const pips = [];
        for (let p = 0; p < 5; p++) pips.push('<i class="' + (p < tier ? 'on' : '') + '"></i>');
        const stateText = doneLv ? '已画成' : (unlocked ? '可进入' : '未解锁');
        const stateCls = doneLv ? 'done' : (unlocked ? 'open' : 'locked');
        const mech = String(lv.mechanic || '像素填色').split(' · ')[0];
        const frameId = frameForLevel(lv.no);
        cards.push('<button type="button" class="' + cls.join(' ') + '" data-level="' + k + '"' + (unlocked ? '' : ' disabled aria-disabled="true"') +
          ' aria-label="第 ' + lv.no + ' 关 ' + lv.name + '，' + stateText + (best > 0 ? '，通关 ' + best + ' 星' : '') + (doneLv ? '，原画彩色' : '，原画置灰') + (frameId ? '，画框 ' + frameName(frameId) : '，未使用画框') + '">' +
          '<span class="lvl-art' + frameClass(frameId) + '"' + frameStyleAttr(frameId) + '>' +
            '<canvas width="30" height="30" data-thumb="' + k + '" aria-hidden="true"></canvas>' +
            '<span class="lvl-no">' + lv.no + '</span>' +
            (doneLv ? '<span class="lvl-done" aria-hidden="true">✓</span>' : '') +
            (unlocked ? '' : '<span class="lvl-lock" aria-hidden="true"></span>') +
          '</span>' +
          '<span class="lvl-body">' +
            '<span class="lvl-line"><span class="lvl-name">' + lv.name + '</span><span class="lvl-state ' + stateCls + '">' + stateText + '</span></span>' +
            '<span class="lvl-sub">第 ' + lv.no + ' 关 · 难度 ' + tier + ' / 5 · 目标 ' + targetSteps + ' 步</span>' +
            starsLine +
            '<span class="lvl-meta"><span class="lvl-diff" aria-label="难度 ' + tier + ' / 5">' + pips.join('') + '</span><span class="lvl-unit">' + mech + '</span></span>' +
          '</span>' +
        '</button>');
      }
      sections.push('<section class="season-block" data-theme="' + ti + '" id="season-' + (ti + 1) + '">' +
        '<div class="season-head">' +
          '<span class="season-count">' + td + ' / ' + theme.count + ' 已画成</span>' +
          '<div class="season-kicker">第 ' + (ti + 1) + ' 季 / ' + seasons.length + ' · 共 ' + theme.count + ' 关</div>' +
          '<h2 class="season-title">' + theme.name + '</h2>' +
          '<p class="season-blurb">' + (theme.blurb || '按顺序从上往下画，画成后自动解锁下一关。') + '</p>' +
        '</div>' +
        '<div class="level-list">' + cards.join('') + '</div>' +
      '</section>');
    });
    $('levelGrid').innerHTML = sections.join('');

    const next = firstUnfinishedUnlocked();
    const nextLevel = LEVELS[next];
    const allDone = done >= total;
    $('homeNext').textContent = allDone ? total + ' 关全部画成' : '继续第 ' + nextLevel.no + ' 关';
    $('homeNext').disabled = allDone;
    $('homeNext').setAttribute('data-level', String(next));
    drawHomeThumbs();
    if (!state.homeGuideSeen) showHomeGuide(false);
  }

  function openHome(opts) {
    const options = opts || {};
    state.homeOpen = true;
    state.checkinOpen = false;
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
    state.lampUntil = 0;
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
    $('checkin').hidden = true;
    document.body.classList.remove('checkin-open');
    document.body.classList.add('home-open');
    renderHome();
    if (!state.homeGuideSeen) {
      showHomeGuide(false);
      // 首次导览在顶部，不自动跳季。
      if ($('home')) $('home').scrollTop = 0;
    } else {
      requestAnimationFrame(function () {
        if (state.homeOpen) scrollToHomeTheme(state.homeTheme, false);
      });
    }
    announce('选关首页：已画成 ' + doneCount() + ' / ' + LEVELS.length + '；彩色是已画成，灰色未画成，带锁的还不能进入');
  }

  // 兼容旧调用：返回 / 选关现在都进入首页。
  function openLevels() {
    openHome();
  }

  // preview 只给本地开发自测 / 截图预览用；正常通关不传参数，按本关实际计次道具次数结算。
  function openWinModal(preview) {
    const level = state.level || LEVELS[state.levelIndex];
    const last = state.levelIndex >= LEVELS.length - 1;
    const allDone = LEVELS.every(function (l) { return hasDone(l.no); });
    const remain = LEVELS.filter(function (l) { return !hasDone(l.no); }).length;
    const tail = allDone ? LEVELS.length + ' 关全部画完。' : (remain === 1 ? '还有 1 关在首页等你。' : '还有 ' + remain + ' 关在首页等你。');
    const frameId = frameForLevel(level.no);
    const pv = preview && typeof preview === 'object' ? preview : null;
    const uses = pv && Number.isFinite(Number(pv.uses))
      ? Math.max(0, Math.floor(Number(pv.uses)))
      : state.starPropUses;
    const stars = pv && Number.isFinite(Number(pv.stars))
      ? Math.max(1, Math.min(STAR_MAX, Math.floor(Number(pv.stars))))
      : starsForPropUses(uses);
    const best = pv && Number.isFinite(Number(pv.best))
      ? Math.max(1, Math.min(STAR_MAX, Math.floor(Number(pv.best))))
      : Math.max(bestStars(level.no), stars);
    const starLabel = stars === STAR_MAX ? '完美通关' : stars + ' 星通关';
    const useText = '本关计次道具 ' + uses + ' 次';
    const html = [
      '<div class="modal-kicker">' + (allDone ? '全部画作完成' : '第 ' + level.no + ' 关 · 完成') + '</div>',
      '<h2>画作完成</h2>',
      '<div class="big-done">' + level.name + ' 画好了。</div>',
      '<div class="win-stars-wrap">' +
        starsHTML(stars, 'win-stars', starLabel + '，' + useText) +
        '<div class="win-stars-label">' + starLabel + '</div>' +
        '<div class="win-stars-note">' + useText + ' · 倍速不计入星级</div>' +
        '<div class="win-stars-best">本地存档最好 ' + best + ' 星</div>' +
      '</div>',
      '<div class="win-art' + frameClass(frameId) + '"' + frameStyleAttr(frameId) + ' aria-label="完成画作' + (frameId ? '，画框 ' + frameName(frameId) : '，未使用画框') + '">' +
        '<canvas id="winArt" width="30" height="30" aria-hidden="true"></canvas>' +
        (frameId ? '<span class="win-art-name">' + frameName(frameId) + '</span>' : '') +
      '</div>',
      '<div class="done-object"><span class="dot"></span><span class="txt"><b>' + state.game.total + ' 格</b>全部填上，原图应绘制的位置都有实际颜色。<br>' + tail + '</span></div>',
      '<div class="modal-actions">' +
        (last ? '' : '<button type="button" class="btn primary" data-action="next-level">下一关</button>') +
        '<button type="button" class="btn" data-action="retry">再画一次</button>' +
        '<button type="button" class="btn" data-action="levels">选关</button>' +
      '</div>'
    ].join('');
    openOverlay(html);
    const winCanvas = $('winArt');
    if (winCanvas) drawThumb(winCanvas, level);
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
  $('speedTopBtn').addEventListener('click', function () {
    cycleManualSpeed();
  });

  $('themeTabs').addEventListener('click', function (ev) {
    const btn = ev.target.closest('.theme-tab[data-theme]');
    if (!btn) return;
    scrollToHomeTheme(parseInt(btn.getAttribute('data-theme'), 10) || 0);
  });

  if ($('homeGuideClose')) {
    $('homeGuideClose').addEventListener('click', function () { hideHomeGuide(); });
  }
  if ($('homeCheckinOpen')) $('homeCheckinOpen').addEventListener('click', openCheckin);
  if ($('homeCheckinStrip')) $('homeCheckinStrip').addEventListener('click', openCheckin);
  if ($('checkinBack')) $('checkinBack').addEventListener('click', closeCheckin);
  if ($('checkinBtn')) $('checkinBtn').addEventListener('click', checkinSignAndRender);
  if ($('frameList')) {
    $('frameList').addEventListener('click', function (ev) {
      const btn = ev.target.closest('.frame-card[data-frame-id]');
      if (!btn || btn.disabled) return;
      const id = btn.getAttribute('data-frame-id');
      const next = state.checkin.frameAll === id ? null : id;
      if (checkinSetFrameAll(next)) {
        showCheckinToast(next ? '全部关卡和首页入口已统一改用「' + frameName(next) + '」' : '全部关卡已取消画框', 2000);
      }
    });
  }
  if ($('frameClear')) {
    $('frameClear').addEventListener('click', function () {
      if (!state.checkin.frameAll) return;
      checkinSetFrameAll(null);
      showCheckinToast('全部关卡已取消画框', 1800);
    });
  }
  if ($('homeGuideOpen')) {
    $('homeGuideOpen').addEventListener('click', function () {
      const el = $('homeGuide');
      if (el && !el.hidden) hideHomeGuide();
      else showHomeGuide(true);
    });
  }
  $('home').addEventListener('scroll', function () {
    if (state.scrollRaf) return;
    state.scrollRaf = requestAnimationFrame(function () {
      state.scrollRaf = 0;
      updateHomeTabByScroll();
    });
  }, { passive: true });

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
    if (state.checkinOpen) {
      if (ev.key === 'Escape') closeCheckin();
      return;
    }
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
        layoutNestForLevel(state.level);
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
    // 2026-11-19 2203：样板入口与旧 200 关入口互相可回，旧关数据 / 存档原样保留。
    const note = document.querySelector('.home-note');
    if (note) note.textContent = SAMPLE_MODE
      ? '前 5 关样板 · 第 1 章（太阳蛋 / 西瓜角 / 糖霜甜甜圈 / 草莓 / 迷你汉堡）· 对照原图可见形态重做 · 每关令牌制作期固定'
      : '开发原型 · 200 关主题与关数为开发草案，等待用户确认';
    const mark = document.querySelector('.desk-mark__en');
    if (mark) mark.textContent = SAMPLE_MODE ? '前 5 关样板 · 固定令牌' : '30 × 30 像素画 · 200 关 · 10 个主题';
    const sw = $('sampleSwitch');
    if (sw) {
      sw.textContent = SAMPLE_MODE ? '返回旧 200 关（本地保留）' : '看前 5 关样板（原图重做版）';
      sw.setAttribute('href', SAMPLE_MODE ? 'index.html' : 'index.html?sample=first5');
    }
    if (SAMPLE_MODE) {
      document.title = '蚂蚁小画家 · 前 5 关样板（原图重做版）';
      document.querySelectorAll('#homeGuide li').forEach(function (li) {
        if (li.textContent.indexOf('每季 20 关') !== -1) {
          li.textContent = '本样板只有第 1 章前 5 关，按顺序画成后解锁下一关；旧 200 关仍从普通入口进入。';
        }
      });
      const kicker = document.querySelector('.home-kicker');
      if (kicker) {
        // 只在首页文案里保留“样板”标记，不改玩家可见游戏名。
        kicker.childNodes.forEach(function (n) {
          if (n.nodeType === 3 && n.nodeValue.indexOf('200') !== -1) n.nodeValue = n.nodeValue.replace('200 关', '前 5 关样板');
        });
      }
    }
    // 2026-11-19 17:23：首页首次打开不再先同步生成 / 绘制第 1 关；
    // 只有带 ?level= 直接进关时才立刻建关。点关卡时仍按正常流程本地重算队列。
    if (bootFromLevelParam) {
      loadLevel(bootLevel, bootSeed ? { seed: bootSeed } : undefined);
    }
    if (params.get('checkin') === '1') {
      if (!state.checkinOpen) openCheckin();
    } else if (!bootFromLevelParam) {
      // 同步打开首页：首帧直接是首页，不再先闪一下空关卡再被首页盖住。
      if (!state.homeOpen && !state.checkinOpen) openHome({ theme: 0 });
    }
  }

  // 供本地开发自测 / 截图脚本使用，不进入玩法。
  window.AntGame = {
    loadLevel: loadLevel,
    pickColumn: pickColumn,
    openLevels: openLevels,
    openHome: openHome,
    openCheckin: openCheckin,
    closeCheckin: closeCheckin,
    previewWinModal: openWinModal,
    isUnlocked: isUnlocked,
    frames: FRAME_SET.map(function (f) { return { id: f.id, name: f.name, src: f.src }; }),
    checkin: {
      open: openCheckin,
      close: closeCheckin,
      sign: checkinSignAndRender,
      weekInfo: beijingWeek,
      snapshot: function () {
        const snap = checkinSnapshot();
        return {
          weekKey: snap.info.key,
          weekLabel: snap.info.label,
          dayIndex: snap.info.index,
          dates: snap.info.dates,
          days: snap.days,
          count: snap.count,
          todaySigned: snap.todaySigned,
          full: snap.full,
          reward: snap.reward ? snap.reward.key : '',
          frameAwarded: snap.frameAwarded
        };
      },
      setNow: function (ms) {
        const n = Number(ms);
        state.checkinNow = Number.isFinite(n) && n > 0 ? n : 0;
        renderCheckin();
        renderHomeCheckinEntry();
      },
      now: function () { return checkinNow(); },
      setMode: checkinSetMode,
      setAll: checkinSetFrameAll,
      clearAll: function () { return checkinSetFrameAll(null); },
      setLevel: checkinSetLevelFrame,
      frameForLevel: frameForLevel,
      state: function () { return JSON.parse(JSON.stringify(state.checkin)); },
      render: renderCheckin
    },
    levelThemes: THEME_LIST,
    showTip: showTip,
    hideTip: hideTip,
    resetTips: function () { state.tips = Object.create(null); saveTips(); hideTip(); },
    getState: function () {
      const stats = state.coordinator ? state.coordinator.stats() : { inFlight: 0, reservations: [], byToken: {} };
      // 首页 / 签到页可以在没有建关的情况下取状态；用空盘面兜底，避免读 null。
      const game = state.game || { filledCount: 0, total: 0, slots: [], columns: [[], [], [], []], colPos: [0, 0, 0, 0], level: null };
      let waiting = [];
      if (state.analysis) {
        waiting = state.analysis.slots
          .filter(function (s) { return !s.empty && s.waiting; })
          .map(function (s) { return { index: s.index, color: s.color, remaining: s.remaining }; });
      } else {
        game.slots.forEach(function (slot, i) {
          if (!slot) return;
          if (AntEngine.legalTargets(state.game, slot.color, null, null).length === 0) {
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
        for (let i = 0; i < game.slots.length; i++) {
          candidateCounts.push(state.coordinator.candidateCount(i));
          legalCounts.push(state.coordinator.legalCount(i));
        }
      }
      const launchSlots = launchQueueSlots();
      const launchQueues = launchSlots.map(function (i) {
        const s = game.slots[i];
        const lane = state.launchLanes.get(i);
        return {
          slotIndex: i,
          uid: s.uid,
          id: s.id,
          color: s.color,
          remaining: s.remaining,
          inFlight: byToken[s.uid] || 0,
          nextAt: lane ? Math.round(lane.nextAt) : 0
        };
      });
      const currentLevel = state.level || LEVELS[state.levelIndex];
      return {
        levelIndex: state.levelIndex,
        levelNo: currentLevel.no,
        levelName: currentLevel.name,
        levelTheme: currentLevel.themeName,
        themeIndex: currentLevel.themeIndex,
        difficulty: levelTier(currentLevel),
        difficultyTier: levelTier(currentLevel),
        legacyDifficulty: currentLevel.difficulty,
        difficultyTargetSteps: levelTargetSteps(currentLevel),
        pixelUnit: currentLevel.pixelUnit,
        levelCount: LEVELS.length,
        queueSeed: state.queueSeed,
        queueTokenCount: state.queueTokenCount,
        queueFixed: !!state.queueFixed,
        presetQueueSource: state.presetQueueSource || '',
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
        queueVerified: !!(state.game && game.level && game.level.queueVerified),
        homeOpen: state.homeOpen,
        unlocked: (function () { const out = []; for (let i = 0; i < LEVELS.length; i++) out.push(isUnlocked(LEVELS[i].no) || hasDone(LEVELS[i].no)); return out; })(),
        doneCount: doneCount(),
        phase: state.phase,
        multiplier: state.multiplier,
        displayMultiplier: state.multiplier,
        manualMultiplier: state.manualMultiplier,
        autoMultiplier: state.autoMultiplier,
        normalMultiplier: 1,
        maxInFlight: IN_FLIGHT_CAP,
        reachedMax: reachedStage(),
        propUses: Object.assign({}, state.propUses),
        starPropUses: state.starPropUses,
        clearStars: starsForPropUses(state.starPropUses),
        bestStars: bestStars(currentLevel.no),
        propGifts: JSON.parse(JSON.stringify(state.propGifts)),
        giftBackfillSkipped: giftBackfillSkipped.slice(),
        props: PROPS.map(function (p) {
          return {
            key: p.key,
            name: p.name,
            unlock: p.unlock,
            uses: p.uses,
            freeLeft: freeRemaining(p),
            gift: giftRemaining(p),
            giftClaimed: !!state.propGifts.claimed[p.key],
            left: propRemaining(p),
            unlocked: propUnlocked(p),
            active: (p.key === 'slot' && state.extraSlot) || (p.key === 'peek' && peekActive()) ||
              (p.key === 'lamp' && lampActive()) || (p.key === 'recall' && state.recallMode)
          };
        }),
        extraSlot: state.extraSlot,
        slotCount: game.slots.length,
        peekActive: peekActive(),
        peekUntil: state.peekUntil,
        peekNext: (function () {
          const out = [];
          for (let c = 0; c < 4; c++) {
            const q = game.columns[c];
            const pos = game.colPos[c];
            const g = q[pos + VISIBLE_ROWS];
            out.push(g ? { color: g.color, n: g.n } : null);
          }
          return out;
        })(),
        lampActive: lampActive(),
        lampUntil: state.lampUntil,
        homeGuideSeen: state.homeGuideSeen,
        recallMode: state.recallMode,
        recallable: recallableSlots(),
        queuesExhausted: state.game ? AntEngine.isQueueExhausted(state.game) : false,
        speedBadge: $('speedBadge').textContent,
        speedNote: $('speedAuto') ? $('speedAuto').textContent : '',
        filled: game.filledCount,
        total: game.total,
        slots: game.slots.map(function (s, i) {
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
        colPos: game.colPos.slice(),
        columnLengths: game.columns.map(function (c) { return c.length; }),
        columnLeft: game.columns.map(function (c, i) { return c.length - game.colPos[i]; }),
        remainingTokens: remainingTokens(),
        hiddenCounts: hiddenCounts,
        deadlock: state.game ? AntEngine.deadlock(state.game) : null,
        waiting: waiting,
        inFlight: stats.inFlight,
        reservations: stats.reservations,
        candidateCounts: candidateCounts,
        legalCounts: legalCounts,
        // 本轮：出巢队列数 = 可出动令牌数；同色多令牌各一路。
        launchQueueCount: launchQueues.length,
        launchQueues: launchQueues,
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
        filledMask: state.game ? Array.from(state.game.filled) : [],
        boardCell: boardCellSize(),
        width: game.width || 0,
        height: game.height || 0,
        antRadius: AntEngine.ANT_FOOTPRINT_RADIUS,
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
        checkinOpen: state.checkinOpen,
        checkin: (function () {
          const snap = checkinSnapshot();
          return {
            weekKey: snap.info.key,
            dayIndex: snap.info.index,
            days: snap.days,
            count: snap.count,
            todaySigned: snap.todaySigned,
            full: snap.full,
            reward: snap.reward ? snap.reward.key : '',
            frameAwarded: snap.frameAwarded,
            frames: state.checkin.frames.slice(),
            frameMode: state.checkin.frameMode,
            frameAll: state.checkin.frameAll,
            frameByLevel: JSON.parse(JSON.stringify(state.checkin.frameByLevel))
          };
        })(),
        currentFrame: (function () {
          const lv = state.level || LEVELS[state.levelIndex];
          const id = lv ? frameForLevel(lv.no) : null;
          return id ? { id: id, name: frameName(id), src: frameSource(id) } : null;
        })(),
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
    // 开发自测 / 截图接口：只改本次运行的计数，不直接写存档；正常玩家流程不可见。
    // 真正写入最好成绩仍由 finishWin -> recordClear 完成。
    rating: {
      starsForUses: starsForPropUses,
      best: bestStars,
      current: function () {
        const lv = state.level || LEVELS[state.levelIndex];
        return {
          levelNo: lv.no,
          uses: state.starPropUses,
          stars: starsForPropUses(state.starPropUses),
          best: bestStars(lv.no)
        };
      },
      setUsesForTest: function (n) {
        state.starPropUses = Math.max(0, Math.floor(Number(n) || 0));
        return state.starPropUses;
      },
      // 只为开发自测缩短 8 秒冷却，让连续 useProp 不必真的等 8 秒；
      // 不改道具次数、不绕过 useProp、不直接改 starPropUses。
      expireTimedPropsForTest: function () {
        state.peekUntil = 0;
        state.lampUntil = 0;
        renderProps();
        return true;
      }
    },
    setMotionScale: function (n) {
      state.motionScale = Math.max(0.25, Math.min(30, Number(n) || 1));
      return state.motionScale;
    },
    // 只给开发自测用：模拟「途中某格被另一只蚂蚁填上」，观察本只是否停止
    // 穿越并重寻路。正常玩家流程不可见，也不写入存档。
    debugFillCellForTest: function (idx) {
      const g = state.game;
      if (!g) return false;
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= g.width * g.height) return false;
      if (g.terrain[i] !== AntEngine.OBJECT || g.filled[i]) return false;
      g.filled[i] = 1;
      g.filledCount++;
      state.analysis = AntEngine.analyze(g);
      drawBoard();
      return true;
    },
    reservedSlotCapacity: SLOT_CAPACITY_RESERVED
  };

  boot();
})();
