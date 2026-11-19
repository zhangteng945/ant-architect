/*
 * 《蚂蚁小画家》纯规则引擎 v8.6（2026-11-19 19:56 六队列独立 + 巢穴圆心欧氏距离补差轮）
 * 浏览器挂在 globalThis.AntEngine；Node 端可直接 require。
 *
 * 本版核心：
 *  - 盘面逻辑网格 30 × 30（900 格），不是把旧图用 CSS 拉大。
 *  - 令牌最后一只蚂蚁真正出巢时，待令格立刻释放；在途任务用令牌 uid 解耦。
 *  - 令牌入槽只记颜色和未出发只数；不预约、不把一组目标格预绑死在令牌上。
 *  - 每只蚂蚁在「即将走出巢穴」的 dispatch 时刻才选格、预约；后出发者看得到
 *    已预约 / 已填格，必须另选；没有合法可达目标就不出巢。
 *  - 选格只按「离巢穴实际圆心的欧氏距离」从远到近：不再比较盘边 BFS 深度，
 *    也没有「先外后内」；每只蚂蚁出发时在合法可达、未填、未预约、不封口的
 *    同色格中取 dx²+dy² 最远的一格，近的在后。不是曼哈顿 / 切比雪夫 / 方框。
 *  - 派工前同时确认「合法目标 + 实际可达路线」，不能到了跟前才干等。
 *  - 路线格仍记录为软占用，用于调试 / 可视化，但不再参与目标排序；否则更远的
 *    合法目标会被路线避让降级，破坏「从远到近」。
 *  - 寻路走 30 × 30 盘面外一圈虚拟环路，可绕到最外层色块；不穿越已铺格。
 *  - 2026-11-19 21:32 t213u / t215u：路线改为八向 A*（可斜走、防切角），
 *    同长度路线用极小确定性噪声打散；不再只会直上直下，也不故意绕远。
 *  - 巢穴出口行 y = 31：起点即屏幕巢穴出口，不再先跑到盘面底边中点。
 *  - 队列生成：令牌只输出颜色 + 只数，按「远 → 近」排列；本地校验可解性。
 */
(function (root) {
  'use strict';

  // 固定队列计划（开发数据）：只服务于 200 张固定地图的早/中期关卡。
  // 浏览器由 index.html 先加载 queue-plans.js；Node 端直接 require。
  const QUEUE_PLANS = (typeof module !== 'undefined' && module.exports)
    ? require('./queue-plans.js').QUEUE_PLANS
    : (root.QUEUE_PLANS || {});

  // 30×30 是旧 200 关的默认尺寸；新关卡可以带自己的 width / height。
  // 所有真实数组、坐标、寻路、巢穴距离都读同一套 state.width / state.height，
  // 不是把某个固定 30 的数组靠 CSS 拉伸裁切。
  const SIZE = 30;
  const SLOTS = 5;
  const PAPER = 0;
  const OBJECT = 1;
  const HOLE = 2;

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // 2026-11-19 t230u：在 2132 的低速基准上再降一档，真实移动速度从
  // 0.14 px/ms 降到 0.10 px/ms（约 -29%）；各独立车道的逐只派发间隔由
  // game.js 的 DISPATCH_BASE_MS 同步从 300ms 调到 420ms（约 -29% 频率）。
  // 倍率仍只放大这个基准；没有恢复共享在途 / 锁定 / 固定批次闸门。
  const NORMAL_PX_PER_MS = 0.10;
  const ENDGAME_MULTIPLIER = 8;
  const DISPATCH_BASE_MS = 420;
  // 蚂蚁身体在「格」坐标系里的安全半径。1 格见方；0.47 覆盖放大后身体
  // （含腿 / 桶）的半对角线，仍小于到相邻格边界的 0.5，所以只要蚂蚁中心
  // 在未填格中心、且斜步两翼未填，身体就不会压进已填格。
  // t231u 的本轮补正：原 0.38 没有覆盖 0.72 格宽精灵的半对角线，且横向
  // 车道偏移 0.14 格会吃掉安全余量；现在精灵缩到 0.68 格宽、偏移压到
  // 0.02 格以内，半径按真实身体取 0.47。
  const ANT_FOOTPRINT_RADIUS = 0.47;

  function dimsOf(obj) {
    const width = Math.max(1, Math.floor(Number(obj && obj.width) || SIZE));
    let height = Math.floor(Number(obj && obj.height) || 0);
    if (!height) height = (obj && Array.isArray(obj.map) && obj.map.length) || width;
    return { width: width, height: Math.max(1, height) };
  }
  function idxOf(x, y, width) {
    const w = Number(width) || SIZE;
    return y * w + x;
  }
  function xyOf(i, width) {
    const w = Number(width) || SIZE;
    return { x: i % w, y: Math.floor(i / w) };
  }
  function inBoard(x, y, width, height) {
    const w = Number(width) || SIZE;
    const h = Number(height) || w;
    return x >= 0 && x < w && y >= 0 && y < h;
  }
  function isEdgeCell(i, width, height) {
    const w = Number(width) || SIZE;
    const h = Number(height) || w;
    const p = xyOf(i, w);
    return p.x === 0 || p.x === w - 1 || p.y === 0 || p.y === h - 1;
  }

  // 关卡深度只算一次：0 = 最外层（盘边），数字越大越靠内。
  const DEPTH_CACHE = new WeakMap();
  const ANCHOR_CACHE = new WeakMap();

  // 「从远到近」的唯一选格口径（2026-11-19 19:56 t201u 补明确，2203 扩到矩形盘）：
  //  1) 原点取屏幕巢穴的实际圆心（洞口暗区的视觉中心），不是棋盘中心，
  //     不是盘底中点，也不是「巢穴所在列 + 棋盘底行」的格点替身。
  //     旧 30×30 关沿用实测代表值 (11.25, 34.0)；其它尺寸按实际盘面取
  //     (width × 0.375, height + 2.8) 格，game.js 把巢穴 DOM 摆到同一坐标，
  //     保证「实际圆心」在逻辑网格和屏幕上一致。
  //  2) 用欧氏直线距离平方 dx² + dy²（不开放，比较远近等价）。横向、纵向
  //     都用同一套「格」单位；矩形盘不会把 x / y 拉伸成不同比例，格宽 = 格高。
  //  3) 不采用曼哈顿菱形、切比雪夫方形圈、矩形层级、路径长度或棋盘中心。
  //  4) 距离相同按格号稳定排序。欧氏距离下不同格可能真正等距，这是稳定
  //     并列，不是行优先主规则。
  const NEST_CENTER = { x: 11.25, y: 34.0 };
  // 兼容旧调用 / 旧测试的列名；新代码请用 nestCenterFor 的二维坐标。
  const NEST_COL = NEST_CENTER.x;
  function nestCenterFor(obj) {
    if (obj && obj.nestCenter && Number.isFinite(obj.nestCenter.x) && Number.isFinite(obj.nestCenter.y)) {
      return { x: Number(obj.nestCenter.x), y: Number(obj.nestCenter.y) };
    }
    const dim = dimsOf(obj);
    if (dim.width === SIZE && dim.height === SIZE) return { x: NEST_CENTER.x, y: NEST_CENTER.y };
    return { x: Math.round(dim.width * 0.375 * 1000) / 1000, y: dim.height + 2.8 };
  }
  function nestDistanceSqFor(obj, i) {
    const dim = dimsOf(obj);
    const center = nestCenterFor(obj);
    const x = i % dim.width;
    const y = Math.floor(i / dim.width);
    const dx = x - center.x;
    const dy = y - center.y;
    return dx * dx + dy * dy;
  }
  function nestDistanceSq(i) { return nestDistanceSqFor({ width: SIZE, height: SIZE }, i); }
  // 继续叫 nestDistance，但返回欧氏距离平方；排序 / 比较语义与开方完全一致。
  function nestDistance(i) { return nestDistanceSq(i); }

  // 每种颜色的「最远格距离」：用于把令牌集合排成远 → 近。
  function colorAnchorForLevel(level) {
    if (ANCHOR_CACHE.has(level)) return ANCHOR_CACHE.get(level);
    const dim = dimsOf(level);
    const anchor = Object.create(null);
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = level.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch === '.' || ch === '#') continue;
      const d = nestDistanceSqFor(level, i);
      if (anchor[ch] === undefined || d > anchor[ch]) anchor[ch] = d;
    }
    ANCHOR_CACHE.set(level, anchor);
    return anchor;
  }

  function compareTargets(level, a, b) {
    const fa = nestDistanceSqFor(level, a), fb = nestDistanceSqFor(level, b);
    if (fa !== fb) return fb - fa;
    return a - b;
  }
  function compareTargetsForState(state, a, b) {
    const fa = nestDistanceSqFor(state, a), fb = nestDistanceSqFor(state, b);
    if (fa !== fb) return fb - fa;
    return a - b;
  }

  function createState(level) {
    if (!level || !Array.isArray(level.map) || !level.map.length) {
      throw new Error('关卡地图不能为空');
    }
    const dim = dimsOf(level);
    const W = dim.width, H = dim.height;
    if (level.width !== undefined && Math.floor(Number(level.width)) !== W) {
      throw new Error('关卡 width 与地图行宽不一致');
    }
    if (level.height !== undefined && Math.floor(Number(level.height)) !== H) {
      throw new Error('关卡 height 与地图行数不一致');
    }
    const terrain = new Uint8Array(W * H);
    const color = new Array(W * H).fill(null);
    const blueprint = [];
    const colorCells = Object.create(null);
    let holes = 0;
    for (let y = 0; y < H; y++) {
      const row = level.map[y];
      if (typeof row !== 'string' || row.length !== W) {
        throw new Error('关卡地图第 ' + (y + 1) + ' 行必须是 ' + W + ' 格');
      }
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        const i = idxOf(x, y, W);
        if (ch === '.') {
          terrain[i] = PAPER;
        } else if (ch === '#') {
          terrain[i] = HOLE;
          holes++;
        } else {
          terrain[i] = OBJECT;
          color[i] = ch;
          blueprint.push(i);
          if (!colorCells[ch]) colorCells[ch] = [];
          colorCells[ch].push(i);
        }
      }
    }
    const groups = new Map();
    (level.groups || []).forEach(function (g) {
      // 兼容旧数据里可能出现的 cells：只做数据完整性校验，绝不带进运行时令牌。
      // 出巢选中改成每只蚂蚁出发时现选，不再按 depth/color 预绑一组格。
      if (g.cells) {
        if (!Array.isArray(g.cells) || !g.cells.length) throw new Error('令牌 cells 不能为空：' + g.id);
        const oldCells = Array.from(new Set(g.cells));
        if (oldCells.length !== g.n) throw new Error('令牌 ' + g.id + ' 的 cells 数与 n 不一致');
        oldCells.forEach(function (i) {
          if (!Number.isInteger(i) || i < 0 || i >= W * H) throw new Error('令牌 ' + g.id + ' 的 cells 越界');
          if (color[i] !== g.color) throw new Error('令牌 ' + g.id + ' 的 cells 颜色不一致');
        });
      }
      groups.set(g.id, { id: g.id, color: g.color, n: g.n });
    });
    const columns = (level.columns || []).map(function (col) {
      return col.map(function (id) {
        const g = groups.get(id);
        if (!g) throw new Error('队列引用了不存在的令牌：' + id);
        return g;
      });
    });
    if (columns.length !== 4) throw new Error('必须有四列令牌');

    const state = {
      level: level,
      size: W,
      width: W,
      height: H,
      nestCenter: nestCenterFor(level),
      terrain: terrain,
      color: color,
      blueprint: blueprint,
      colorCells: colorCells,
      total: blueprint.length,
      holes: holes,
      filled: new Uint8Array(W * H),
      filledCount: 0,
      slots: new Array(SLOTS).fill(null),
      colPos: columns.map(function () { return 0; }),
      columns: columns,
      moves: 0,
      nextTokenUid: 1
    };
    // 每种颜色的可填格在入关时排好「从远到近」，之后 legalTargets 只需过滤，
    // 不再每次重排；同一关的所有克隆状态共用这份稳定顺序。
    Object.keys(colorCells).forEach(function (ch) {
      colorCells[ch].sort(function (a, b) { return compareTargetsForState(state, a, b); });
    });
    validateCounts(state, level);
    return state;
  }

  function validateCounts(state, level) {
    const want = Object.create(null);
    for (let i = 0; i < state.color.length; i++) {
      if (state.color[i]) want[state.color[i]] = (want[state.color[i]] || 0) + 1;
    }
    const have = Object.create(null);
    for (const col of state.columns) {
      for (const g of col) {
        have[g.color] = (have[g.color] || 0) + g.n;
      }
    }
    for (const k of Object.keys(want)) {
      if ((want[k] || 0) !== (have[k] || 0)) {
        throw new Error('关卡 ' + level.id + ' 令牌数量不匹配：' + k + ' 需要 ' + want[k] + '，给了 ' + (have[k] || 0));
      }
    }
    for (const k of Object.keys(have)) {
      if (!want[k]) throw new Error('关卡 ' + level.id + ' 有盘面不存在的颜色：' + k);
    }
    // 令牌现在只记颜色 + 只数，不再校验 cells 覆盖；可解性由逐只派工与本地复验保证。
  }

  function cloneState(s) {
    return {
      level: s.level,
      size: s.width,
      width: s.width,
      height: s.height,
      nestCenter: s.nestCenter,
      terrain: s.terrain,
      color: s.color,
      blueprint: s.blueprint,
      colorCells: s.colorCells,
      total: s.total,
      holes: s.holes,
      filled: s.filled.slice(),
      filledCount: s.filledCount,
      slots: s.slots.map(function (sl) {
        return sl ? { uid: sl.uid, id: sl.id, color: sl.color, n: sl.n, remaining: sl.remaining, column: sl.column } : null;
      }),
      colPos: s.colPos.slice(),
      columns: s.columns,
      moves: s.moves,
      nextTokenUid: s.nextTokenUid
    };
  }

  function normalizeSet(extra) {
    if (!extra) return null;
    if (extra instanceof Set) return extra;
    if (extra instanceof Map) return new Set(extra.keys());
    if (typeof extra === 'number') return new Set([extra]);
    if (Array.isArray(extra)) return new Set(extra);
    return null;
  }

  function isWalkable(state, i, extraFilled) {
    if (state.terrain[i] === HOLE) return false;
    if (state.filled[i]) return false;
    if (extraFilled && extraFilled.has(i)) return false;
    return true;
  }

  /**
   * 从盘面四边的未铺格出发做四向连通搜索。
   * extraFilled：额外视为“已铺”的格子（在途预约 / 联合封口模拟）。
   */
  function reachableSet(state, extraFilled) {
    const extra = normalizeSet(extraFilled);
    const W = state.width, H = state.height;
    const seen = new Uint8Array(W * H);
    const queue = [];
    function seed(i) {
      if (seen[i]) return;
      if (!isWalkable(state, i, extra)) return;
      seen[i] = 1;
      queue.push(i);
    }
    for (let x = 0; x < W; x++) {
      seed(idxOf(x, 0, W));
      seed(idxOf(x, H - 1, W));
    }
    for (let y = 1; y < H - 1; y++) {
      seed(idxOf(0, y, W));
      seed(idxOf(W - 1, y, W));
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const p = xyOf(i, W);
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny, W, H)) continue;
        const ni = idxOf(nx, ny, W);
        if (seen[ni]) continue;
        if (!isWalkable(state, ni, extra)) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    return seen;
  }

  function allRemainingReachable(state, seen, ignored) {
    const skip = normalizeSet(ignored);
    for (let k = 0; k < state.blueprint.length; k++) {
      const i = state.blueprint[k];
      if (state.filled[i]) continue;
      if (skip && skip.has(i)) continue;
      if (!seen[i]) return false;
    }
    return true;
  }

  /**
   * 一次性算出「当前剩余格」里，哪些格一旦铺上就会把别的剩余格封死。
   * 用 Tarjan 割点：删除候选格后，若某个子树分量不含盘边格，就会失去盘外通路。
   * 比逐格 BFS 快很多，30×30 下仍是 O(格数)。
   */
  function sealingSet(state, extraFilled) {
    const extra = normalizeSet(extraFilled);
    const W = state.width, H = state.height;
    const N = W * H;
    const disc = new Int32Array(N);
    const low = new Int32Array(N);
    const sealed = new Uint8Array(N);
    disc.fill(-1);
    let timer = 0;

    function neighbors(i) {
      const p = xyOf(i, W);
      const out = [];
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny, W, H)) continue;
        const ni = idxOf(nx, ny, W);
        if (state.terrain[ni] === HOLE) continue;
        if (state.filled[ni]) continue;
        if (extra && extra.has(ni)) continue;
        out.push(ni);
      }
      return out;
    }

    function dfs(v, parent) {
      disc[v] = low[v] = ++timer;
      let boundary = isEdgeCell(v, W, H) ? 1 : 0;
      const ns = neighbors(v);
      for (let k = 0; k < ns.length; k++) {
        const u = ns[k];
        if (u === parent) continue;
        if (disc[u] === -1) {
          const childBoundary = dfs(u, v);
          if (low[u] < low[v]) low[v] = low[u];
          // 去掉 v 后，u 的子树单独成块；若子树里没有盘边格，就会被封死。
          if (low[u] >= disc[v] && childBoundary === 0) sealed[v] = 1;
          boundary += childBoundary;
        } else if (disc[u] < low[v]) {
          low[v] = disc[u];
        }
      }
      return boundary;
    }

    for (let x = 0; x < W; x++) {
      const top = idxOf(x, 0, W), bottom = idxOf(x, H - 1, W);
      if (disc[top] === -1 && isWalkable(state, top, extra)) dfs(top, -1);
      if (disc[bottom] === -1 && isWalkable(state, bottom, extra)) dfs(bottom, -1);
    }
    for (let y = 1; y < H - 1; y++) {
      const left = idxOf(0, y, W), right = idxOf(W - 1, y, W);
      if (disc[left] === -1 && isWalkable(state, left, extra)) dfs(left, -1);
      if (disc[right] === -1 && isWalkable(state, right, extra)) dfs(right, -1);
    }
    return sealed;
  }

  function wouldTrap(state, i) {
    if (state.terrain[i] !== OBJECT || state.filled[i]) return false;
    return sealingSet(state)[i] === 1;
  }

  /**
   * 目标能不能落。reserved 是已被其他在途蚂蚁预约的目标集合。
   * 联合模拟：把预约目标与当前候选一起视为已铺，确认剩余未施工格仍全部可从盘外到达。
   */
  function cellFilterSet(onlyCells) {
    if (!onlyCells || !onlyCells.length) return null;
    return onlyCells instanceof Set ? onlyCells : new Set(onlyCells);
  }

  function isLegal(state, i, color, seen, reserved, onlyCells) {
    if (state.terrain[i] !== OBJECT || state.filled[i]) return false;
    if (state.color[i] !== color) return false;
    const allow = cellFilterSet(onlyCells);
    if (allow && !allow.has(i)) return false;
    const reservedSet = normalizeSet(reserved);
    if (reservedSet && reservedSet.has(i)) return false;
    const reach = seen || reachableSet(state, reservedSet);
    if (!reach[i]) return false;
    const sealed = sealingSet(state, reservedSet);
    return sealed[i] !== 1;
  }

  function legalTargets(state, color, reserved, onlyCells) {
    const reservedSet = normalizeSet(reserved);
    const allow = cellFilterSet(onlyCells);
    // 无预约时，同一落色版本内复用 reachable / sealed；每落一格 filledCount 变化，
    // 缓存自动失效。开发自测的求解器每步会调很多次，避免重复 BFS。
    let reach, sealed;
    if (!reservedSet) {
      const ctx = state._legalCtx;
      if (!ctx || ctx.version !== state.filledCount) {
        state._legalCtx = { version: state.filledCount, reach: reachableSet(state, null), sealed: sealingSet(state, null) };
      }
      reach = state._legalCtx.reach;
      sealed = state._legalCtx.sealed;
    } else {
      reach = reachableSet(state, reservedSet);
      sealed = sealingSet(state, reservedSet);
    }
    const cells = state.colorCells[color] || [];
    const out = [];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      if (allow && !allow.has(i)) continue;
      if (state.filled[i]) continue;
      if (reservedSet && reservedSet.has(i)) continue;
      if (!reach[i]) continue;
      if (sealed[i]) continue;
      out.push(i);
    }
    return out;
  }

  function nextMove(state) {
    for (let s = 0; s < state.slots.length; s++) {
      const slot = state.slots[s];
      if (!slot || slot.remaining <= 0) continue;
      const targets = legalTargets(state, slot.color, null, null);
      if (targets.length) {
        return { slotIndex: s, slot: slot, color: slot.color, idx: targets[0] };
      }
    }
    return null;
  }

  // 顺序版落块（求解器与规则测试使用；动画层用 createCoordinator）。
  function place(state, slotIndex, idx) {
    const slot = state.slots[slotIndex];
    if (!slot || slot.remaining <= 0) throw new Error('空待令格不能落块');
    if (state.terrain[idx] !== OBJECT || state.filled[idx]) throw new Error('目标格不可填');
    if (state.color[idx] !== slot.color) throw new Error('颜色不匹配');
    if (!isLegal(state, idx, slot.color, null, null)) throw new Error('会封死内部，不能落块');
    state.filled[idx] = 1;
    state.filledCount++;
    state.moves++;
    slot.remaining--;
    if (slot.remaining === 0) state.slots[slotIndex] = null;
    return { done: state.filledCount >= state.total };
  }

  function pick(state, columnIndex) {
    if (columnIndex < 0 || columnIndex >= 4) return null;
    const pos = state.colPos[columnIndex];
    if (pos >= state.columns[columnIndex].length) return null;
    let empty = -1;
    for (let s = 0; s < state.slots.length; s++) {
      if (!state.slots[s]) { empty = s; break; }
    }
    if (empty < 0) return null;
    const g = state.columns[columnIndex][pos];
    const token = {
      uid: state.nextTokenUid++,
      id: g.id,
      color: g.color,
      n: g.n,
      remaining: g.n,
      column: columnIndex
    };
    state.slots[empty] = token;
    state.colPos[columnIndex] = pos + 1;
    return { slotIndex: empty, group: g, token: token };
  }

  // 道具「备用巢格」：当前局临时把待令位从 5 扩到 6。
  // 默认状态仍是 5 格；容量上限预留为 6，不改变 createState 的默认值。
  function addSlot(state, capacity) {
    const cap = Math.max(SLOTS, Math.min(SLOTS + 1, Number(capacity) || SLOTS + 1));
    if (!state || state.slots.length >= cap) return false;
    state.slots.push(null);
    return true;
  }

  // 道具「召回令」：把一枚待令令牌退回它原列的下一个队首。
  // 令牌只记颜色 + 剩余只数，退回时不需要重建 cells；已填格不会被重复计数。
  // allowPartial=true 时允许「已经填过一部分、但当前没有任何在途蚂蚁」的令牌。
  // 默认 false：没有协调器时不能确认在途，只有完整未出发的令牌可退回。
  function recall(state, slotIndex, allowPartial) {
    if (!state || slotIndex < 0 || slotIndex >= state.slots.length) return null;
    const token = state.slots[slotIndex];
    if (!token || token.remaining <= 0) return null;
    if (!allowPartial && token.remaining !== token.n) return null;
    const c = token.column;
    if (!Number.isInteger(c) || c < 0 || c >= state.columns.length) return null;
    state.slots[slotIndex] = null;
    // cells: null 只作为旧字段占位；运行时不再按召回时的格子预绑。
    const group = { id: token.id, color: token.color, n: token.remaining, cells: null };
    state.columns[c].splice(state.colPos[c], 0, group);
    return { slotIndex: slotIndex, column: c, group: group, token: token };
  }

  function settle(state, limit) {
    const moved = [];
    let guard = limit || 1200;
    while (guard-- > 0) {
      const m = nextMove(state);
      if (!m) break;
      // 目标已经过 legalTargets 的封口 / 可达检查；这里直接落块，
      // 避免 place() 再跑一次 BFS（动画层仍走 coordinator.canCommit）。
      const slot = state.slots[m.slotIndex];
      if (!slot || slot.remaining <= 0) break;
      state.filled[m.idx] = 1;
      state.filledCount++;
      state.moves++;
      slot.remaining--;
      if (slot.remaining === 0) state.slots[m.slotIndex] = null;
      moved.push(m);
      if (state.filledCount >= state.total) break;
    }
    return moved;
  }

  function isWin(state) { return state.filledCount >= state.total; }

  function anyFront(state) {
    for (let c = 0; c < 4; c++) {
      if (state.colPos[c] < state.columns[c].length) return true;
    }
    return false;
  }

  function isQueueExhausted(state) { return !anyFront(state); }

  // 8× 的唯一触发点：下方四列已没有任何未取的令牌。
  function speedMultiplier(state) {
    return isQueueExhausted(state) ? ENDGAME_MULTIPLIER : 1;
  }

  // 手动倍速与自动 8× 的显式合成：自动 8× 是下限，手动只能把它保持或更高。
  // 这样「取完令牌自动 8×」不会被手动 1/2/4× 悄悄盖掉，徽标也能说明来源。
  function effectiveMultiplier(state, manual) {
    const m = [1, 2, 4, 8].indexOf(Number(manual)) >= 0 ? Number(manual) : 1;
    return Math.max(m, speedMultiplier(state));
  }

  function slotsFull(state) { return state.slots.every(Boolean); }

  function deadlock(state) {
    if (isWin(state)) return null;
    if (nextMove(state)) return null;
    if (slotsFull(state)) return { reason: 'full', message: state.slots.length + ' 个待令格都被等待的令牌占满了，小画家无处开工。' };
    if (!anyFront(state)) return { reason: 'no-front', message: '待令区里的令牌都够不着，四列也没有可点的队首了。' };
    return null;
  }

  // 2026-11-19 21:32 t213u / t215u：八向寻路方向。前四个是正交步，后四个是
  // 斜步；斜步只在目标格和两侧正交格都可走时允许（防切角 / 穿墙）。
  const ROUTE_DIRS = [
    [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
    [1, -1, Math.SQRT2], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];
  // 同长度路线之间的确定性选择噪声：按 4×4 格小块取值，让路线出现几段
  // 自然的长斜线 / 长直段，而不是每格抖一下。幅度上限（约 0.1）远小于
  // 「多走一格」的最小额外代价（√2-1 ≈ 0.414），所以它只打散同长度路线，
  // 不会把蚂蚁带去更远的路。
  const ROUTE_STYLE_BLOCK = 4;
  const ROUTE_STYLE_NOISE = 0.002;
  function routeStyleHash(x, y, seed) {
    let h = (Math.imul(x + 101, 374761393) + Math.imul(y + 211, 668265263) + Math.imul((seed >>> 0) + 1, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /**
   * 盘面 + 外圈虚拟环路的寻路。坐标允许 -1 .. SIZE，虚拟环八向连通。
   * 用于「出发前确认实际可达路线」以及盘外绕行填最外层色块。
   *
   * 2026-11-19 21:32 t213u / t215u：
   *  - 从四向 BFS（只会直上直下 / 横折）改为八向 A*，允许斜走；
   *  - 斜走禁止切角：目标斜格及两侧正交格都必须可走，仍不穿墙、不踩已填；
   *  - 同长度路线用 routeSeed 做极小确定性打散，让不同蚂蚁 / 不同队列
   *    走不同侧面，出巢不再是一条整齐的竖线；
   *  - 打散幅度远小于多走一格的代价，A* 仍取最短几何路线，不故意绕远。
   *
   * 保留：盘外虚拟环可绕行、巢穴出口 y = SIZE + 1 只允许同列上下（月台，
   * 不横移瞬移）、目标格必须可走、路线不穿已填 / 洞 / 其他蚂蚁的预约格。
   */
  function planVirtualRoute(state, from, targetIdx, extraBlocked, routeSeed) {
    const extra = normalizeSet(extraBlocked);
    const W = state.width, H = state.height;
    const spanX = W + 2;
    const spanY = H + 3; // 多留一行 y = H + 1：巢穴出口的盘外起步位。
    const min = -1, maxX = W, maxY = H + 1;
    const styleSeed = Number(routeSeed) >>> 0;
    function walkable(x, y) {
      if (x < min || x > maxX || y < min || y > maxY) return false;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        const i = idxOf(x, y, W);
        if (state.terrain[i] === HOLE) return false;
        if (state.filled[i]) return false;
        if (extra && extra.has(i)) return false;
        return true;
      }
      return true; // 盘外虚拟环路（含巢穴出口所在的最下一行）
    }
    const sx = from.x, sy = from.y;
    const gx = targetIdx % W, gy = Math.floor(targetIdx / W);
    if (!walkable(gx, gy)) return [];
    if (!walkable(sx, sy)) return [];
    const start = (sy + 1) * spanX + (sx + 1);
    const goal = (gy + 1) * spanX + (gx + 1);
    const total = spanX * spanY;
    const gScore = new Float64Array(total);
    gScore.fill(Infinity);
    const parent = new Int32Array(total);
    parent.fill(-1);
    const closed = new Uint8Array(total);

    // 八向 A* 的 octile 启发：斜步代价 √2，正交步 1；可采纳且一致。
    function heuristic(x, y) {
      const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    }
    // 小根堆（节点索引 + f 值）。路线规模最多约 1k 节点，堆足够轻。
    const heapNode = [];
    const heapScore = [];
    function heapPush(node, score) {
      heapNode.push(node); heapScore.push(score);
      let i = heapNode.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapScore[p] <= heapScore[i]) break;
        const tn = heapNode[p], ts = heapScore[p];
        heapNode[p] = heapNode[i]; heapScore[p] = heapScore[i];
        heapNode[i] = tn; heapScore[i] = ts;
        i = p;
      }
    }
    function heapPop() {
      const node = heapNode[0];
      const lastNode = heapNode.pop(), lastScore = heapScore.pop();
      if (heapNode.length) {
        heapNode[0] = lastNode; heapScore[0] = lastScore;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let small = i;
          if (l < heapNode.length && heapScore[l] < heapScore[small]) small = l;
          if (r < heapNode.length && heapScore[r] < heapScore[small]) small = r;
          if (small === i) break;
          const tn = heapNode[small], ts = heapScore[small];
          heapNode[small] = heapNode[i]; heapScore[small] = heapScore[i];
          heapNode[i] = tn; heapScore[i] = ts;
          i = small;
        }
      }
      return node;
    }

    gScore[start] = 0;
    heapPush(start, heuristic(sx, sy));
    let found = false;
    while (heapNode.length) {
      const cur = heapPop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const cx = (cur % spanX) - 1;
      const cy = Math.floor(cur / spanX) - 1;
      for (let d = 0; d < ROUTE_DIRS.length; d++) {
        const dx = ROUTE_DIRS[d][0], dy = ROUTE_DIRS[d][1], step = ROUTE_DIRS[d][2];
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(nx, ny)) continue;
        // 斜步防切角：两侧正交格都必须可走，不能从两个障碍的角缝里穿过去。
        if (dx !== 0 && dy !== 0 && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
        // 巢穴出口那一行是“月台”：只允许同一列上下，不允许沿月台横移，
        // 否则屏幕上的盘外段会变成贴着盘边瞬移。
        if (cy === H + 1 && nx !== cx) continue;
        if (ny === H + 1 && nx !== cx) continue;
        const ni = (ny + 1) * spanX + (nx + 1);
        if (closed[ni]) continue;
        const noise = ROUTE_STYLE_NOISE * routeStyleHash(
          Math.floor((nx + 1) / ROUTE_STYLE_BLOCK),
          Math.floor((ny + 2) / ROUTE_STYLE_BLOCK),
          styleSeed
        );
        const ng = gScore[cur] + step + noise;
        if (ng < gScore[ni] - 1e-12) {
          gScore[ni] = ng;
          parent[ni] = cur;
          heapPush(ni, ng + heuristic(nx, ny));
        }
      }
    }
    if (!found) return [];
    const out = [];
    let cur = goal;
    while (cur !== -1) {
      out.push({ x: (cur % spanX) - 1, y: Math.floor(cur / spanX) - 1 });
      cur = parent[cur];
    }
    out.reverse();
    return out;
  }

  // 19:56 巢穴圆心补正：离线队列模拟 / 可解性复验的默认起点必须与网页
  // nestExitNode() 同源，都是屏幕巢穴出口那一列（逻辑列 floor(11.25)=11）
  // 和盘外最下一行 y=31；否则会出现「离线按 x=15 验证可解、网页按 x=11
  // 派工却封死」的同源偏差。起点是走路出口，不是距离圆心。
  const NEST_EXIT_NODE = { x: Math.floor(NEST_COL), y: SIZE + 1 };
  function routeFromNest(state, targetIdx, extraBlocked, nestNode, routeSeed) {
    const start = nestNode && Number.isInteger(nestNode.x) && Number.isInteger(nestNode.y)
      ? { x: nestNode.x, y: nestNode.y }
      : { x: Math.floor(nestCenterFor(state).x), y: state.height + 1 };
    return planVirtualRoute(state, start, targetIdx, extraBlocked, routeSeed);
  }

  // 离线队列复验的「旅行时间」按正交格数计（斜步按 2 格），与 2032 之前
  // 四向 BFS 路线长度口径一致。路线改成八向后，复验节奏不能因为节点数变少
  // 而改变，否则同一个 seed 会生成出不同的队列 —— 本轮是路径观感补差，
  // 不重算玩家队列。只在引擎内部复验使用，不是网页运行时限制。
  function routeTravelCells(route) {
    if (!route || route.length < 2) return 0;
    let cells = 0;
    for (let i = 1; i < route.length; i++) {
      cells += Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y);
    }
    return cells;
  }

  /**
   * 按关卡难度生成一次随机队列（纯本地算法）。
   *
   * 17:23 归并后的口径：
   *  - 令牌只输出「颜色 + 只数」，不再带 cells 预绑定；
   *  - 队列顺序只按「离巢穴从远到近」，不再按盘边深度由外到内；
   *  - 真正涂哪一格由每只蚂蚁出发时现选，选格同样只按从远到近。
   * 这不是“随便打乱”：随机只发生在分块、令牌顺序和四列切点。
   */
  // 200 关按用户确认的 5 级难度生成；每级固定一个目标步数锚点。
  // 这与 1040 已落地的通关评星完全独立，也不是旧的 7 级星级步数表。
  // 一步 = 点一次某列队首令牌。目标 T = 这一关的令牌枚数。
  const DIFFICULTY_TIERS = [
    { difficulty: 1, minSteps: 0, maxSteps: 10, generationTargetSteps: 10 },
    { difficulty: 2, minSteps: 11, maxSteps: 30, generationTargetSteps: 30 },
    { difficulty: 3, minSteps: 31, maxSteps: 60, generationTargetSteps: 60 },
    { difficulty: 4, minSteps: 61, maxSteps: 100, generationTargetSteps: 100 },
    { difficulty: 5, minSteps: 101, maxSteps: 150, generationTargetSteps: 150 }
  ];
  const QUEUE_TARGETS = { 1: 10, 2: 30, 3: 60, 4: 100, 5: 150 };
  const STEP_TARGETS = QUEUE_TARGETS;
  const STEP_DEFINITION = '一次取令（点击队首令牌一次）= 1 步；不是像素格数，不是蚂蚁只数。';

  // 关卡数据里保留旧的 pixelUnit 生成难度 1..10；玩家可见和队列生成统一折算成 5 级。
  // 10 步以内 = 1 级，11–30 = 2 级，31–60 = 3 级，61–100 = 4 级，101–150 = 5 级。
  // 超过 150 步仍记 5 级；不启用旧 7 级对照，也不与通关评星混用。
  function difficultyTierForLegacy(d) {
    const legacy = Math.max(1, Math.min(10, Number(d) || 1));
    return Math.min(5, Math.ceil(legacy / 2));
  }
  function difficultyTierForLevel(level) {
    const explicit = Number(level && level.difficultyTier);
    if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 5) return explicit;
    return difficultyTierForLegacy(level && level.difficulty);
  }
  function stepTargetForTier(tier) {
    const t = Math.max(1, Math.min(5, Number(tier) || 1));
    return QUEUE_TARGETS[t] || QUEUE_TARGETS[1];
  }
  function stepTargetForLevel(level) { return stepTargetForTier(difficultyTierForLevel(level)); }

  function queueRandom(seed) {
    let s = (Number(seed) || 1) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function queueShuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function depthMapForLevel(level) {
    if (DEPTH_CACHE.has(level)) return DEPTH_CACHE.get(level);
    const dim = dimsOf(level);
    const W = dim.width, H = dim.height;
    const depth = new Int16Array(W * H);
    depth.fill(-1);
    const q = [];
    function seed(i) { if (depth[i] !== -1) return; depth[i] = 0; q.push(i); }
    for (let x = 0; x < W; x++) { seed(idxOf(x, 0, W)); seed(idxOf(x, H - 1, W)); }
    for (let y = 1; y < H - 1; y++) { seed(idxOf(0, y, W)); seed(idxOf(W - 1, y, W)); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const p = xyOf(i, W);
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny, W, H)) continue;
        const ni = idxOf(nx, ny, W);
        if (depth[ni] !== -1) continue;
        depth[ni] = depth[i] + 1;
        q.push(ni);
      }
    }
    DEPTH_CACHE.set(level, depth);
    return depth;
  }

  function splitCellsByDepthColor(level, seed, options) {
    const opts = options || {};
    const rand = queueRandom(seed);
    const depth = depthMapForLevel(level);
    const dim = dimsOf(level);
    const bands = new Map();
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = level.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch === '.' || ch === '#') continue;
      const d = depth[i];
      if (!bands.has(d)) bands.set(d, new Map());
      const byColor = bands.get(d);
      if (!byColor.has(ch)) byColor.set(ch, []);
      byColor.get(ch).push(i);
    }
    const baseGroups = [];
    Array.from(bands.keys()).forEach(function (d) {
      const byColor = bands.get(d);
      byColor.forEach(function (cells, color) {
        baseGroups.push({ depth: d, color: color, cells: cells, far: cells.reduce(function (m, i) { return Math.max(m, nestDistanceSqFor(level, i)); }, 0) });
      });
    });
    // 分组仍按深度环+颜色求安全切分，但队列顺序只按远 → 近。
    baseGroups.sort(function (a, b) { return b.far - a.far || a.depth - b.depth; });
    const target = Math.max(baseGroups.length, stepTargetForLevel(level));
    const scale = opts.fallback ? 0 : target / Math.max(1, baseGroups.length);
    const tokens = [];
    baseGroups.forEach(function (g) {
      let k = 1;
      if (!opts.fallback) {
        const jitter = 0.65 + rand() * 0.7;
        k = Math.max(1, Math.min(g.cells.length, Math.round(scale * jitter)));
      }
      const parts = [];
      for (let i = 0; i < k; i++) parts.push([]);
      const order = queueShuffle(g.cells.slice(), rand);
      order.forEach(function (i, at) { parts[at % k].push(i); });
      parts.forEach(function (cells) {
        if (!cells.length) return;
        tokens.push({ depth: g.depth, color: g.color, n: cells.length });
      });
    });
    // 令牌顺序只按远 → 近；同距离内按 seed 打乱，保留每局差异。
    const ordered = shuffleWith(tokens.slice(), rand);
    const anchor = colorAnchorForLevel(level);
    ordered.sort(function (a, b) { return anchor[b.color] - anchor[a.color]; });
    return ordered;
  }

  function buildQueueLevel(base, seed, options) {
    const opts = options || {};
    const rand = queueRandom((Number(seed) || 1) ^ (Number(base.no) || 1) * 2654435761);
    const tokens = splitCellsByDepthColor(base, (Number(seed) || 1) ^ 0x9E3779B9, opts);
    if (tokens.length < 16) throw new Error('随机队列令牌过少：' + tokens.length);
    // 四列是全局安全顺序的连续区段；切点随机，但每列至少 4 枚，保证三行 + 隐藏行。
    const total = tokens.length;
    const cuts = [0];
    for (let i = 1; i <= 3; i++) {
      const ideal = Math.round(total * i / 4 + (rand() * 2 - 1) * total * 0.08);
      const min = cuts[cuts.length - 1] + 4;
      const max = total - (4 - i) * 4;
      cuts.push(Math.max(min, Math.min(max, ideal)));
    }
    cuts.push(total);
    const groups = [];
    const columns = [[], [], [], []];
    let q = 0;
    for (let c = 0; c < 4; c++) {
      for (let k = cuts[c]; k < cuts[c + 1]; k++) {
        const t = tokens[k];
        const id = 'q' + (++q);
        groups.push({ id: id, color: t.color, n: t.n });
        columns[c].push(id);
      }
    }
    return Object.assign({}, base, {
      groups: groups,
      columns: columns,
      queueSeed: Number(seed) >>> 0,
      queueTokenCount: total
    });
  }

  function verifyQueueSolution(level) {
    let state;
    try { state = createState(level); } catch (err) { return { ok: false, reason: 'invalid', error: String(err && err.message || err) }; }
    for (let c = 0; c < 4; c++) {
      while (state.colPos[c] < state.columns[c].length) {
        if (!state.slots.some(function (x) { return !x; })) return { ok: false, reason: 'no-slot', filled: state.filledCount, column: c };
        const picked = pick(state, c);
        if (!picked) return { ok: false, reason: 'no-pick', filled: state.filledCount, column: c };
        const moved = settle(state, 4000);
        if (!moved.length && state.slots.some(Boolean) && state.filledCount < state.total) {
          return { ok: false, reason: 'waiting', filled: state.filledCount, column: c };
        }
      }
      settle(state, 4000);
    }
    settle(state, 4000);
    return { ok: state.filledCount === state.total && isWin(state), reason: state.filledCount === state.total ? 'ok' : 'short', filled: state.filledCount, total: state.total };
  }

  /**
   * 更严格的「真实网页调度」证书：8 只在途、逐只预约、目标提交前再检查、
   * 出巢腾位、逐列顺序取令。用于早/中期随机拆分候选的复验；比
   * verifyQueueSolution 的顺序落块更接近动画层，避免「顺序解可解、8 只在途会卡」。
   */
  const MAX_IN_FLIGHT_VERIFY = 8;
  function verifyQueuePlaythrough(level, maxLimit) {
    let state;
    try { state = createState(level); } catch (err) { return { ok: false, reason: 'invalid', error: String(err && err.message || err) }; }
    const MAX = Math.max(1, Math.min(18, Number(maxLimit) || MAX_IN_FLIGHT_VERIFY));
    const co = createCoordinator(state, {
      maxInFlight: MAX,
      routePlanner: function (target, reserved) { return routeFromNest(state, target, reserved); }
    });
    const order = [];
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < level.columns[c].length; i++) order.push(c);
    }
    let time = 0;
    let pickIdx = 0;
    let cursor = 0;
    let ticks = 0;
    let maxInFlight = 0;
    const active = [];
    while (ticks++ < 400000) {
      for (let k = active.length - 1; k >= 0; k--) {
        if (active[k].at > time) continue;
        const task = active[k].task;
        if (!co.canCommit(task)) return { ok: false, reason: 'unsafe-commit', filled: state.filledCount, step: pickIdx };
        co.commit(task);
        active.splice(k, 1);
      }
      let did = false;
      while (active.length < MAX) {
        let task = null;
        for (let k = 0; k < 5; k++) {
          const si = (cursor + k) % 5;
          task = co.dispatch(si);
          if (task) { cursor = (si + 1) % 5; break; }
        }
        if (!task) break;
        const travel = Math.max(2, routeTravelCells(task.route)) + 2;
        active.push({ task: task, at: time + travel });
        did = true;
        if (active.length > maxInFlight) maxInFlight = active.length;
      }
      if (pickIdx < order.length && state.slots.some(function (x) { return !x; })) {
        if (!pick(state, order[pickIdx])) return { ok: false, reason: 'bad-pick', filled: state.filledCount, step: pickIdx };
        pickIdx++;
        continue;
      }
      if (isWin(state)) {
        return {
          ok: true,
          reason: 'ok',
          filled: state.filledCount,
          total: state.total,
          steps: pickIdx,
          maxInFlight: maxInFlight
        };
      }
      if (active.length === 0 && !did) {
        return { ok: false, reason: pickIdx >= order.length ? 'no-picks' : 'stuck', filled: state.filledCount, step: pickIdx };
      }
      let next = time + 1;
      for (let k = 0; k < active.length; k++) if (active[k].at > time && active[k].at < next) next = active[k].at;
      time = next;
    }
    return { ok: false, reason: 'timeout', filled: state.filledCount, step: pickIdx };
  }

  // 兼容旧的「关卡 difficulty 1..10」调用：先折算 5 级，再取该级目标步数。
  function stepTargetForDifficulty(difficulty) {
    return stepTargetForTier(difficultyTierForLegacy(difficulty));
  }

  // 盘面每个「深度环 + 颜色」的安全分组；组间按离巢距离从远到近排。
  // 同组令牌只取同一深度、同一颜色的格；是否可落仍由逐只目标选择 + 封口检查决定。
  function depthColorGroups(level) {
    const depth = depthMapForLevel(level);
    const dim = dimsOf(level);
    const byKey = new Map();
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = level.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch === '.' || ch === '#') continue;
      const d = depth[i];
      const key = d + ':' + ch;
      if (!byKey.has(key)) byKey.set(key, { depth: d, color: ch, cells: [] });
      byKey.get(key).cells.push(i);
    }
    const groups = Array.from(byKey.values());
    groups.forEach(function (g) {
      g.cells.sort(function (a, b) { return a - b; });
      g.far = g.cells.reduce(function (m, i) { return Math.max(m, nestDistanceSqFor(level, i)); }, 0);
    });
    groups.sort(function (a, b) {
      if (a.far !== b.far) return b.far - a.far;
      if (a.color !== b.color) return a.color < b.color ? -1 : 1;
      return b.cells.length - a.cells.length;
    });
    return groups;
  }

  // 把 total 枚令牌分给每组，每组至少 1 枚、至多 cells 枚；
  // 优先分给「每枚平均格数最大」的组，得到尽量均衡的令牌大小。
  function allocateTokenCounts(caps, total) {
    if (total < caps.length) throw new Error('目标步数低于安全分组数：' + total + ' < ' + caps.length);
    const counts = caps.map(function () { return 1; });
    let left = total - caps.length;
    while (left > 0) {
      let best = -1;
      let bestScore = -1;
      for (let i = 0; i < caps.length; i++) {
        if (counts[i] >= caps[i]) continue;
        const score = caps[i] / counts[i];
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0) throw new Error('目标步数超过可切分令牌数');
      counts[best]++;
      left--;
    }
    return counts;
  }

  function balancedColumnCuts(total) {
    const cuts = [0];
    for (let i = 1; i <= 3; i++) cuts.push(Math.round(total * i / 4));
    cuts.push(total);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] < cuts[i - 1]) cuts[i] = cuts[i - 1];
    }
    return cuts;
  }

  function packQueueLevel(base, groups, target, mode, seed, generation, cuts) {
    groups.forEach(function (g, i) { g.id = 'q' + (i + 1); });
    const useCuts = cuts || balancedColumnCuts(groups.length);
    const columns = [[], [], [], []];
    for (let c = 0; c < 4; c++) {
      for (let k = useCuts[c]; k < useCuts[c + 1]; k++) {
        if (groups[k]) columns[c].push(groups[k].id);
      }
    }
    return Object.assign({}, base, {
      groups: groups,
      columns: columns,
      queueSeed: Number(seed) >>> 0 || ((Number(base.no) * 2654435761) >>> 0),
      queueTokenCount: target,
      queueTarget: target,
      minimumSteps: target,
      stepDefinition: STEP_DEFINITION,
      queueMode: mode,
      queueGeneration: generation || null
    });
  }

  // 随机四列切点。只改变「哪几枚令牌同列」，不改变全局取令顺序，
  // 因此不会影响可解性；每列至少 1 枚。
  function randomColumnCuts(total, rand) {
    // 四列保持接近均衡：每列不少于 floor(T/4)-1、不多于 ceil(T/4)+1。
    // 这样 10 步关仍是 2–3 枚/列、全部 10 枚可见，不会出现「1 枚 + 4 枚」
    // 把令牌藏到 +N 里；高步数关也只是轻微抖动，不改变全局取令顺序。
    const minPer = Math.max(1, Math.floor(total / 4) - 1);
    const maxPer = Math.max(minPer, Math.ceil(total / 4) + 1);
    const cuts = [0];
    let used = 0;
    for (let i = 1; i <= 3; i++) {
      const leftCols = 4 - i;
      const min = Math.max(minPer, total - used - leftCols * maxPer);
      const max = Math.min(maxPer, total - used - leftCols * minPer);
      const ideal = total / 4 + (rand() * 2 - 1) * Math.max(1, total * 0.03);
      const len = Math.max(min, Math.min(max, Math.round(ideal)));
      used += len;
      cuts.push(used);
    }
    cuts.push(total);
    return cuts;
  }

  // 把 total 随机拆成 parts 份正整数，每份不超过 cap。
  // 用确定性 PRNG，不用 Math.random，保证同一 seed 可复现。
  function randomComposition(total, parts, cap, rand) {
    if (parts <= 0 || total < parts) return null;
    const maxPart = Math.max(cap || total, Math.ceil(total / parts));
    if (total > parts * maxPart) return null;
    const out = new Array(parts).fill(1);
    let left = total - parts;
    let guard = total * 8 + 64;
    while (left > 0 && guard-- > 0) {
      const i = Math.floor(rand() * parts);
      if (out[i] >= maxPart) continue;
      out[i]++;
      left--;
    }
    return left === 0 ? out : null;
  }

  function shuffleWith(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function shuffleWindows(tokens, rand) {
    const width = 3 + Math.floor(rand() * 5);
    for (let start = 0; start < tokens.length; start += width) {
      const end = Math.min(tokens.length, start + width);
      const seg = tokens.slice(start, end);
      shuffleWith(seg, rand);
      for (let i = 0; i < seg.length; i++) tokens[start + i] = seg[i];
    }
    return tokens;
  }

  // 早/中期关：queue-plans.js 里的计划是「T 枚令牌、顺序取完可解」的
  // 可行性证书/骨架，不是每次直接入关的固定队列表。
  // 每次入关按 seed 重新拆分同色令牌的格数、重新排序、重新切四列，再本地复验。
  function buildPlanCandidate(base, plan, target, seed, attempt) {
    const seq = String(plan.seq || '');
    const ns = plan.ns || [];
    if (seq.length !== target || ns.length !== target) return null;
    const rand = queueRandom((Number(seed) ^ (Number(base.no) * 2654435761) ^ ((attempt + 1) * 0x85EBCA6B)) >>> 0);
    const tokens = [];
    for (let i = 0; i < target; i++) tokens.push({ color: seq[i], n: Number(ns[i]) });
    const byColor = new Map();
    tokens.forEach(function (t, i) {
      if (!byColor.has(t.color)) byColor.set(t.color, []);
      byColor.get(t.color).push(i);
    });
    let resplit = false;
    byColor.forEach(function (idxs) {
      if (idxs.length < 2) return;
      const total = idxs.reduce(function (sum, i) { return sum + tokens[i].n; }, 0);
      const maxOrig = idxs.reduce(function (m, i) { return Math.max(m, tokens[i].n); }, 0);
      const parts = randomComposition(total, idxs.length, maxOrig, rand);
      if (!parts) return;
      shuffleWith(parts, rand);
      idxs.forEach(function (i, j) { tokens[i].n = parts[j]; });
      resplit = true;
    });
    let orderMode = 'sizes-only';
    // 8 次都失败才会退回证书原序；前面的候选尽量换真实队列顺序。
    if (attempt === 0 || attempt === 2 || attempt === 4 || attempt === 6) {
      shuffleWith(tokens, rand);
      orderMode = 'shuffle';
    } else if (attempt === 1 || attempt === 3) {
      shuffleWindows(tokens, rand);
      orderMode = 'window';
    } else {
      orderMode = resplit ? 'sizes-only' : 'shuffle';
      if (!resplit) shuffleWith(tokens, rand);
    }
    const cuts = randomColumnCuts(tokens.length, rand);
    if (orderMode === 'shuffle' || orderMode === 'window') {
      // 第一排至少放一枚小令牌，避免四个大队列同时占住待令区、很久不腾位。
      // 只交换位置，不改变颜色总量 / 令牌数；仍由严格调度复验决定是否采用。
      const starts = [cuts[0], cuts[1], cuts[2], cuts[3]];
      let small = 0;
      for (let i = 1; i < tokens.length; i++) if (tokens[i].n < tokens[small].n) small = i;
      if (starts.indexOf(small) === -1) {
        const j = starts[Math.floor(rand() * starts.length)];
        const tmp = tokens[j]; tokens[j] = tokens[small]; tokens[small] = tmp;
      }
    }
    const groups = tokens.map(function (t) { return { color: t.color, n: t.n }; });
    return packQueueLevel(base, groups, target, 'generated-plan', seed, {
      source: 'plan',
      attempt: attempt + 1,
      orderMode: orderMode,
      resplit: resplit,
      fallback: false
    }, cuts);
  }

  function randomPlanQueueLevel(base, plan, target, seed) {
    // 先试窗口换序（既换真实队列顺序，又比整队换序稳），再试整队换序、
    // 只重拆格数；通常 1 次、最多 3 次本地复验就能过。
    const ORDER = [3, 2, 5, 7, 6, 1, 4, 0];
    for (let round = 0; round < 2; round++) {
      const roundSeed = round === 0 ? (Number(seed) >>> 0) : (((Number(seed) >>> 0) ^ 0x9E3779B9) >>> 0);
      for (let oi = 0; oi < ORDER.length; oi++) {
        const candidate = buildPlanCandidate(base, plan, target, roundSeed, ORDER[oi]);
        if (!candidate) continue;
        // 用与网页一致的 8 只在途 / 逐只预约 / 列首取令模拟复验；
        // 这比顺序落块更严格，避免「静态可解但动画调度会卡」的候选。
        const play = verifyQueuePlaythrough(candidate);
        if (play.ok) {
          candidate.queueVerified = true;
          candidate.queueCheck = play;
          candidate.queuePlaythroughCheck = play;
          candidate.queueGeneration.round = round + 1;
          return candidate;
        }
      }
    }
    // 极少数 seed 可能连续 16 次都碰不到可解拆分；此时用证书原序（仍用本次
    // seed 重切四列，仍精确 T 枚、颜色守恒、可解），并在报告/测试里显式标出。
    const exact = planQueueLevel(base, plan, target);
    if (!exact) return null;
    exact.queueSeed = Number(seed) >>> 0;
    exact.queueMode = 'certificate-fallback';
    exact.queueGeneration = { source: 'plan', attempts: ORDER.length * 2, fallback: true, orderMode: 'certificate', round: 2 };
    const check = verifyQueuePlaythrough(exact);
    exact.queueVerified = !!check.ok;
    exact.queueCheck = check;
    exact.queuePlaythroughCheck = check;
    return exact;
  }

  // 高/中难度关：按「深度环 + 颜色」求安全切分，再切成恰好 T 枚。
  // 令牌不再绑定 cells；组间只按远 → 近排列，目标仍由出发时现选。
  function randomDepthSplitLevel(base, seed, target) {
    const rand = queueRandom((Number(seed) ^ (Number(base.no) * 40503) ^ 0x27D4EB2D) >>> 0);
    const depth = depthMapForLevel(base);
    const dim = dimsOf(base);
    const byKey = new Map();
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = base.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch === '.' || ch === '#') continue;
      const d = depth[i];
      const key = d + ':' + ch;
      if (!byKey.has(key)) byKey.set(key, { depth: d, color: ch, cells: [] });
      byKey.get(key).cells.push(i);
    }
    const source = Array.from(byKey.values());
    if (target < source.length) return null;
    source.forEach(function (g) {
      g.far = g.cells.reduce(function (m, i) { return Math.max(m, nestDistanceSqFor(base, i)); }, 0);
    });
    const ordered = shuffleWith(source.slice(), rand);
    ordered.sort(function (a, b) { return b.far - a.far; });
    const caps = ordered.map(function (g) { return g.cells.length; });
    const alloc = caps.map(function () { return 1; });
    let left = target - caps.length;
    let guard = target * 16 + 64;
    while (left > 0 && guard-- > 0) {
      const eligible = [];
      for (let i = 0; i < caps.length; i++) if (alloc[i] < caps[i]) eligible.push(i);
      if (!eligible.length) return null;
      const pick = eligible[Math.floor(rand() * eligible.length)];
      alloc[pick]++;
      left--;
    }
    if (left !== 0) return null;
    const tokens = [];
    ordered.forEach(function (g, gi) {
      const parts = randomComposition(g.cells.length, alloc[gi], g.cells.length, rand);
      if (!parts) return;
      parts.forEach(function (n) {
        tokens.push({ color: g.color, n: n });
      });
    });
    if (tokens.length !== target) return null;
    return packQueueLevel(base, tokens, target, 'generated-depth', seed, {
      source: 'depth',
      attempt: 1,
      orderMode: 'far-safe',
      resplit: true,
      fallback: false
    }, randomColumnCuts(tokens.length, rand));
  }

  // 固定计划：只用于已离线证明「顺序取完四列」有 T 步解的早/中期关。
  function planQueueLevel(base, plan, target) {
    const seq = String(plan.seq || '');
    const ns = plan.ns || [];
    if (seq.length !== target || ns.length !== target) return null;
    const want = Object.create(null);
    const dim = dimsOf(base);
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = base.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch !== '.' && ch !== '#') want[ch] = (want[ch] || 0) + 1;
    }
    const have = Object.create(null);
    const groups = [];
    for (let i = 0; i < target; i++) {
      const color = seq[i];
      const n = Number(ns[i]);
      if (!want[color] || !Number.isInteger(n) || n <= 0) return null;
      have[color] = (have[color] || 0) + n;
      groups.push({ color: color, n: n });
    }
    for (const k of Object.keys(want)) if (have[k] !== want[k]) return null;
    return packQueueLevel(base, groups, target, 'plan-exact');
  }

  // 高难度关：安全分组后再切成恰好 T 枚。
  // 只保留每枚的只数，不把同深度同色的具体格预绑给某枚令牌。
  function splitSafeQueueLevel(base, target) {
    const source = depthColorGroups(base);
    if (target < source.length) return null;
    const caps = source.map(function (g) { return g.cells.length; });
    const alloc = allocateTokenCounts(caps, target);
    const groups = [];
    source.forEach(function (g, gi) {
      const cells = g.cells;
      let pos = 0;
      for (let j = 0; j < alloc[gi]; j++) {
        const n = j === alloc[gi] - 1
          ? cells.length - pos
          : Math.ceil((cells.length - pos) / (alloc[gi] - j));
        groups.push({ color: g.color, n: n });
        pos += n;
      }
    });
    return packQueueLevel(base, groups, target, 'depth-split');
  }

  // 保守回退：每个「深度环 + 颜色」一枚令牌，保证逐列可解。
  function safeQueueLevel(base) {
    const groups = depthColorGroups(base).map(function (g) {
      return { color: g.color, n: g.cells.length };
    });
    return packQueueLevel(base, groups, groups.length, 'safe-fallback');
  }


  // ---------------------------------------------------------------------
  // 13:41 轮：不预绑 cell 的队列生成。
  // 令牌只有「颜色 + 只数」；先生成一份远 → 近的候选令牌表，再在本地
  // 用逐只派工模拟排出一条真正能走完的取令顺序。遇到外层封口等待时，
  // 把仍能落色的内层令牌提前，保证不死锁；最后按取令顺序均衡分到四列。
  // 运行时不调用 AI / LLM，也不做无界搜索。
  // ---------------------------------------------------------------------
  const COLOR_TOTAL_CACHE = new WeakMap();

  function colorTotalsForLevel(level) {
    if (COLOR_TOTAL_CACHE.has(level)) return COLOR_TOTAL_CACHE.get(level);
    const totals = Object.create(null);
    const dim = dimsOf(level);
    for (let i = 0; i < dim.width * dim.height; i++) {
      const ch = level.map[Math.floor(i / dim.width)][i % dim.width];
      if (ch === '.' || ch === '#') continue;
      totals[ch] = (totals[ch] || 0) + 1;
    }
    COLOR_TOTAL_CACHE.set(level, totals);
    return totals;
  }

  function sortTokensFarToNear(level, tokens, seed) {
    if (!tokens) return null;
    const anchor = colorAnchorForLevel(level);
    const base = tokens.slice();
    // 先按 seed 打乱，再按颜色最远格距离降序稳定排序；
    // 这样不同 seed 得到不同拆分 / 队列，但「远 → 近」的主顺序不变。
    if (seed) queueShuffle(base, queueRandom(seed));
    return base.sort(function (a, b) {
      const da = anchor[a.color], db = anchor[b.color];
      if (da !== db) return db - da;
      // 同一距离内保留 seed 打乱后的顺序，不同 seed 仍有可见的队列差异。
      return 0;
    });
  }

  // 按「深度环 + 颜色」切分，但只输出颜色 + 只数；组数 <= 目标步数时可用。
  function depthGroupTokensForLevel(base, target, seed) {
    const groups = depthColorGroups(base);
    if (target < groups.length) return null;
    const caps = groups.map(function (g) { return g.cells.length; });
    const alloc = allocateTokenCounts(caps, target);
    const rand = queueRandom(seed);
    const tokens = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const parts = randomComposition(groups[gi].cells.length, alloc[gi], groups[gi].cells.length, rand);
      if (!parts) return null;
      for (let k = 0; k < parts.length; k++) tokens.push({ color: groups[gi].color, n: parts[k] });
    }
    return tokens.length === target ? sortTokensFarToNear(base, tokens, seed) : null;
  }

  // 按颜色分配令牌枚数，再随机拆每色格数；用于深度分组难解时的候选。
  function colorTokensForLevel(base, target, seed, mode) {
    const totals = colorTotalsForLevel(base);
    const colors = Object.keys(totals).sort();
    if (target < colors.length) return null;
    const rand = queueRandom(seed);
    const counts = Object.create(null);
    colors.forEach(function (c) { counts[c] = 1; });
    let extra = target - colors.length;
    while (extra > 0) {
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        if (counts[c] >= totals[c]) continue;
        let score;
        if (mode === 'balanced') score = totals[c] / counts[c];
        else if (mode === 'largest') score = totals[c];
        else if (mode === 'smallest') score = 1 / (totals[c] - counts[c] + 1);
        else score = rand();
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) return null;
      counts[best]++;
      extra--;
    }
    const tokens = [];
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const parts = randomComposition(totals[c], counts[c], totals[c], rand);
      if (!parts) return null;
      for (let k = 0; k < parts.length; k++) tokens.push({ color: c, n: parts[k] });
    }
    return tokens.length === target ? sortTokensFarToNear(base, tokens, seed) : null;
  }

  /**
   * 本机模拟一条可完成的取令顺序（不是手机上的通用求解器）：
   *  - 每步先 settle 当前待令令牌的所有合法目标；
   *  - 从剩余令牌里选一枚此刻有合法同色格的令牌放入待令区；
   *  - mode='first' 尽量按远 → 近的队列顺序取；被外层封口挡住时才跳到
   *    第一个仍能落色的内层令牌。mode='min' 先取合法格最少的令牌，专门
   *    用来解少数端局互锁。
   * 返回的顺序不是按颜色分组，而是实际取令顺序；后面按这个顺序发四列。
   */
  // 用 coordinator 的同一套「实际可达路线 + 路线软避让」落掉当前所有合法目标。
  // 这样生成的取令顺序和网页派工使用同一套选格口径，不再出现
  // 「离线 settle 解得出、网页线程一快就换格」的偏差。
  function settleThroughCoordinator(state, co) {
    let guard = 8000;
    let did = true;
    while (did && guard-- > 0) {
      did = false;
      for (let s = 0; s < state.slots.length; s++) {
        let task;
        while ((task = co.dispatch(s))) {
          co.commit(task);
          did = true;
        }
      }
    }
    return guard > 0;
  }

  function solveLaunchSequence(base, tokens, mode) {
    if (!tokens || !tokens.length) return { ok: false, reason: 'no-tokens' };
    const ids = tokens.map(function (t, i) { return 'q' + (i + 1); });
    const level = Object.assign({}, base, {
      groups: tokens.map(function (t, i) { return { id: ids[i], color: t.color, n: t.n }; }),
      columns: [ids, [], [], []]
    });
    let state;
    try { state = createState(level); } catch (err) { return { ok: false, reason: 'invalid', error: String(err && err.message || err) }; }
    // 规划模拟仍用 8 只在途（比网页 18 更严格），并等上一批落完再取下一枚。
    const MAX = MAX_IN_FLIGHT_VERIFY;
    const co = createCoordinator(state, {
      maxInFlight: MAX,
      routePlanner: function (target, reserved) { return routeFromNest(state, target, reserved); }
    });
    const remain = tokens.slice();
    const sequence = [];
    const active = [];
    let time = 0;
    let cursor = 0;
    let ticks = 0;
    while (ticks++ < 300000) {
      for (let k = active.length - 1; k >= 0; k--) {
        if (active[k].at > time) continue;
        const task = active[k].task;
        if (!co.canCommit(task)) {
          return { ok: false, reason: 'unsafe-commit', filled: state.filledCount, sequence: sequence };
        }
        co.commit(task);
        active.splice(k, 1);
      }
      let did = false;
      while (active.length < MAX) {
        let task = null;
        for (let k = 0; k < 5; k++) {
          const si = (cursor + k) % 5;
          task = co.dispatch(si);
          if (task) { cursor = (si + 1) % 5; break; }
        }
        if (!task) break;
        active.push({ task: task, at: time + Math.max(2, routeTravelCells(task.route)) + 2 });
        did = true;
      }
      // 规划策略：等上一批在途全部落色后再取下一枚，避免新令牌和外层封口
      // 检查在「刚出发、还没落色」的中间态互相卡住。玩家也可以这样等。
      if (active.length === 0 && state.slots.some(function (x) { return !x; }) && remain.length) {
        const reserved = co.reservedSet();
        const candidates = [];
        for (let i = 0; i < remain.length; i++) {
          const legal = legalTargets(state, remain[i].color, reserved, null).length;
          if (legal > 0) candidates.push({ i: i, legal: legal });
        }
        if (candidates.length) {
          if (mode === 'first') {
            candidates.sort(function (a, b) { return a.i - b.i; });
          } else {
            candidates.sort(function (a, b) { return a.legal - b.legal || a.i - b.i; });
          }
          const picked = remain.splice(candidates[0].i, 1)[0];
          sequence.push(picked);
          const slotIndex = state.slots.findIndex(function (x) { return !x; });
          state.slots[slotIndex] = {
            uid: 100000 + sequence.length,
            id: 'sim' + sequence.length,
            color: picked.color,
            n: picked.n,
            remaining: picked.n,
            column: 0
          };
          continue;
        }
      }
      if (isWin(state)) break;
      if (active.length === 0 && !did) {
        return { ok: false, reason: 'stuck', filled: state.filledCount, sequence: sequence };
      }
      let next = time + 1;
      for (let k = 0; k < active.length; k++) {
        if (active[k].at > time && active[k].at < next) next = active[k].at;
      }
      time = next;
    }
    const ok = isWin(state) && sequence.length === tokens.length;
    return {
      ok: ok,
      reason: ok ? 'ok' : 'timeout',
      filled: state.filledCount,
      total: state.total,
      sequence: sequence
    };
  }

  function packLaunchSequence(base, sequence, target, seed, info) {
    const groups = sequence.map(function (t, i) {
      return { id: 'q' + (i + 1), color: t.color, n: t.n };
    });
    // 四列是这条实际取令顺序的连续区段：从左到右逐列点，正好按模拟顺序取令。
    // 这样「逐列规划」仍可完成，同时第一排四枚来自外 / 中 / 内不同深度，
    // 外层封口等待时玩家仍有内层列可点。
    const cuts = randomColumnCuts(groups.length, queueRandom((Number(seed) || 1) ^ 0xC2B2AE35));
    const columns = [[], [], [], []];
    for (let c = 0; c < 4; c++) {
      for (let k = cuts[c]; k < cuts[c + 1]; k++) columns[c].push(groups[k].id);
    }
    const total = groups.reduce(function (sum, g) { return sum + g.n; }, 0);
    return Object.assign({}, base, {
      groups: groups,
      columns: columns,
      queueSeed: Number(seed) >>> 0,
      queueTokenCount: groups.length,
      queueTarget: target,
      minimumSteps: groups.length,
      stepDefinition: STEP_DEFINITION,
      queueMode: info && info.name ? ('far-to-near-' + info.name) : 'far-to-near-sequence',
      queueVerified: true,
      queueCheck: {
        ok: true,
        reason: 'ok',
        filled: total,
        total: total,
        tokens: groups.length,
        order: info && info.name || 'sequence',
        solver: info && info.solver || 'sim'
      },
      queueGeneration: {
        source: 'launch-sequence',
        attempt: info && info.index || 1,
        orderMode: 'far-to-near',
        solver: info && info.solver || 'sim',
        safety: !!(info && info.safety),
        fallback: !!(info && info.fallback)
      }
    });
  }

  // 生成候选：先按远 → 近的深度 / 证书骨架；若端局互锁，再试按颜色重新分配。
  // 所有候选都只输出颜色 + 只数，候选内部仍先排外层。
  function buildLaunchQueueLevel(base, seed, options) {
    const opts = options || {};
    const useSeed = (Number(seed) || 1) >>> 0;
    const target = Math.max(1, Math.round(Number(opts.targetSteps) || stepTargetForLevel(base)));
    const plan = base.sample ? null : QUEUE_PLANS[base.no];
    const attempts = [];
    function add(name, tokens, solver, safety, fallback, fixedShuffleSeed) {
      // 固定安全候选不跟用户 seed 打乱，保证它在任何一局都是同一个已知可解候选；
      // 普通候选仍按本局 seed 打乱，保留每次入关的队列差异。
      const shuffleSeed = fixedShuffleSeed === undefined ? (useSeed ^ 0xA5A5A5A5) : fixedShuffleSeed;
      const sorted = sortTokensFarToNear(base, tokens, shuffleSeed);
      if (sorted && sorted.length) attempts.push({ name: name, tokens: sorted, solver: solver, safety: !!safety, fallback: !!fallback });
    }
    if (plan && plan.t === target && String(plan.seq || '').length === target && (plan.ns || []).length === target) {
      add('plan-first', plan.seq.split('').map(function (c, i) { return { color: c, n: plan.ns[i] }; }), 'first', false, false);
      // 19:07 补正：plan-first 在少数 seed 上会被运行时的远 → 近选格判失败；
      // plan-min 是更保守的「最少合法目标优先」候选，紧跟在后面试，
      // 不再等 depth / fixed 候选全部失败，避免早期关卡进关多绕几百毫秒。
      add('plan-min', plan.seq.split('').map(function (c, i) { return { color: c, n: plan.ns[i] }; }), 'min', false, false);
    }
    // 17:23 只按远近后，100 步以上长队列更容易遇到局部互锁；高步数先试
    // 「最少合法目标优先」的候选，通常第一条就能走完，避免进关同步耗时拖到 3–4 秒。
    // 60 步及以下仍先试保持远 → 近原序的 first 候选；候选令牌本身都先按远 → 近排。
    if (target >= 100) {
      add('depth-min', depthGroupTokensForLevel(base, target, useSeed ^ 0x85EBCA6B), 'min', false, false);
      add('depth-first', depthGroupTokensForLevel(base, target, useSeed ^ 0x9E3779B9), 'first', false, false);
    } else {
      add('depth-first', depthGroupTokensForLevel(base, target, useSeed ^ 0x9E3779B9), 'first', false, false);
      add('depth-min', depthGroupTokensForLevel(base, target, useSeed ^ 0x85EBCA6B), 'min', false, false);
    }
    // 深度安全候选在少数 seed 上比随机拆分更稳；放在前几条，避免极端 seed 试满十几条。
    add('fixed-depth1', depthGroupTokensForLevel(base, target, 1), 'first', true, true, 1);
    add('balanced1', colorTokensForLevel(base, target, useSeed ^ 0x9E3779B9, 'balanced'), 'min', false, false);
    add('balanced2', colorTokensForLevel(base, target, useSeed ^ 0x85EBCA6B, 'balanced'), 'min', false, false);
    add('smallest', colorTokensForLevel(base, target, useSeed ^ 0xC2B2AE35, 'smallest'), 'min', false, false);
    add('random1', colorTokensForLevel(base, target, useSeed ^ 0x27D4EB2D, 'random'), 'min', false, false);
    add('random2', colorTokensForLevel(base, target, (useSeed + 0x6D2B79F5) >>> 0, 'random'), 'min', false, false);
    // 固定安全候选：只在前面的随机候选都解不出时兜底；仍会重新模拟取令顺序。
    add('fixed-balanced5', colorTokensForLevel(base, target, 5, 'balanced'), 'min', true, true, 5);
    add('fixed-smallest1', colorTokensForLevel(base, target, 1, 'smallest'), 'min', true, true, 1);
    add('fixed-balanced1', colorTokensForLevel(base, target, 1, 'balanced'), 'min', true, true, 1);
    add('fixed-random3', colorTokensForLevel(base, target, 3, 'random'), 'min', true, true, 3);
    add('fixed-balanced7', colorTokensForLevel(base, target, 7, 'balanced'), 'min', true, true, 7);
    add('fixed-smallest3', colorTokensForLevel(base, target, 3, 'smallest'), 'min', true, true, 3);
    add('fixed-random5', colorTokensForLevel(base, target, 5, 'random'), 'min', true, true, 5);
    add('fixed-depth3', depthGroupTokensForLevel(base, target, 3), 'first', true, true, 3);
    add('fixed-depth5', depthGroupTokensForLevel(base, target, 5), 'first', true, true, 5);
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const solved = solveLaunchSequence(base, a.tokens, a.solver);
      if (!solved.ok) continue;
      const packed = packLaunchSequence(base, solved.sequence, target, useSeed, {
        name: a.name,
        solver: a.solver,
        index: i + 1,
        safety: a.safety,
        fallback: a.fallback
      });
      // 19:07 补正：solveLaunchSequence 是「一次只放一枚令牌、等上一批落完」的
      // 保守模拟；网页是四列顺序取令 + 18 只在途，两者可能在后半盘分叉。
      // 这里再用与网页同源的「逐列顺序取令 + 18 只在途」复验一次，避免出现
      // 离线判定可解、网页 819 / 900 封死的同源偏差。单次复验约 0.15 秒，
      // 通常第一条候选就通过；不通过才继续试下一条，不会把 150 步关拖成数秒。
      const playthrough = verifyQueuePlaythrough(packed, 18);
      if (!playthrough.ok) continue;
      packed.queuePlaythrough = playthrough;
      return packed;
    }
    return null;
  }

  function buildExactQueueLevel(base, seed, options) {
    const opts = options || {};
    const useSeed = (Number(seed) || 1) >>> 0;
    const target = Math.max(1, Math.round(Number(opts.targetSteps) || stepTargetForLevel(base)));
    const generated = buildLaunchQueueLevel(base, useSeed, { targetSteps: target });
    if (generated) return generated;
    // 极少数地图 / seed 连固定安全候选也排不出顺序：退回每个「深度环 + 颜色」
    // 一枚令牌的保守构造，并明确标记未通过本地顺序复验，绝不假装没回退。
    const safe = safeQueueLevel(base);
    safe.queueSeed = useSeed;
    safe.queueMode = 'safe-fallback';
    safe.queueTarget = target;
    safe.minimumSteps = safe.queueTokenCount;
    safe.queueVerified = false;
    safe.queueCheck = { ok: false, reason: 'no-launch-sequence', filled: 0, total: 900 };
    safe.queueGeneration = { source: 'safe', attempts: 18, fallback: true, orderMode: 'safe' };
    return safe;
  }

  // ---------------------------------------------------------------------
  // 2008 t203u：预选区颜色打散。
  //
  // 13:41–1945 的队列把「实际取令顺序」连续切成四列，这个顺序又主要按
  // 颜色最远格（远 → 近）排列，所以一列常常整段都是同一种颜色。
  // 本轮只重排「令牌进入四列的先后」，不改变：
  //  - 每枚令牌的真实颜色 / 蚂蚁只数；
  //  - 令牌总数 = 5 级目标步数；
  //  - 四列队首取令、每次入关 seed 重算；
  //  - 每只蚂蚁出发时才按巢穴圆心欧氏从远到近选合法格。
  //
  // 打散不是在显示层改色，而是把同一批令牌重新分到四列，并用与网页同源的
  // 8 只在途 / 逐列顺序取令模拟复验；只有真的 900 / 900 才采用。若分散候选
  // 都过不了复验，保留原队列并把 queueScatter.applied 记为 false，绝不假装
  // 已保证所有种子都能完全打散。
  function flattenQueueTokens(level) {
    const byId = new Map();
    (level.groups || []).forEach(function (g) { byId.set(g.id, g); });
    const tokens = [];
    (level.columns || []).forEach(function (col) {
      col.forEach(function (id) {
        const g = byId.get(id);
        if (g) tokens.push({ id: g.id, color: g.color, n: g.n });
      });
    });
    return tokens;
  }

  function scatterColumnSizes(level) {
    return (level.columns || []).map(function (col) { return col.length; });
  }

  // 颜色均衡发牌：先给四列各挑一枚不同颜色的队首，再把剩下的令牌按原队列
  // 顺序放进「同色最少、当前负载最低」的列。第一枚固定在最左列队首，保持
  // 1444 已确认的「第一枚离巢最远」观感；不改变任何令牌的颜色 / 只数。
  function scatterColumnsByColor(tokens, sizes, seed) {
    const n = tokens.length;
    const totalByColor = Object.create(null);
    tokens.forEach(function (t) { totalByColor[t.color] = (totalByColor[t.color] || 0) + 1; });
    const cols = sizes.map(function () { return []; });
    const colorCounts = sizes.map(function () { return Object.create(null); });
    const loads = sizes.map(function () { return 0; });
    const used = new Set();
    const headColors = new Set();
    const rand = queueRandom((Number(seed) || 1) ^ 0x5C3A2B1D);
    // 队首：尽量让四列第一排颜色不同，避免视觉上四列又从同一色开头。
    // 第 0 列固定第 1 枚（最远色）；其余三列在「尚未作为队首的颜色」里
    // 按 seed 挑一枚靠前的令牌，所以不同 seed 的四列头色也会变化。
    for (let c = 0; c < 4; c++) {
      if (loads[c] >= sizes[c]) continue;
      let pick = -1;
      if (c === 0) {
        pick = used.has(0) ? -1 : 0;
      } else {
        const candidates = [];
        const seenColors = new Set();
        for (let i = 0; i < tokens.length; i++) {
          if (used.has(i)) continue;
          const col = tokens[i].color;
          if (headColors.size < 4 && headColors.has(col)) continue;
          if (seenColors.has(col)) continue;
          seenColors.add(col);
          candidates.push(i);
        }
        if (candidates.length) pick = candidates[Math.floor(rand() * candidates.length)];
      }
      if (pick < 0) {
        for (let i = 0; i < tokens.length; i++) {
          if (used.has(i)) continue;
          if (c === 0 && i !== 0) continue;
          pick = i;
          break;
        }
      }
      if (pick < 0) break;
      const t = tokens[pick];
      used.add(pick);
      cols[c].push(t);
      colorCounts[c][t.color] = (colorCounts[c][t.color] || 0) + 1;
      loads[c]++;
      headColors.add(t.color);
    }
    // 其余令牌按原队列先后发到各列，优先补「该色在列内低于期望值」的列。
    tokens.forEach(function (t, index) {
      if (used.has(index)) return;
      let best = -1;
      let bestScore = Infinity;
      for (let c = 0; c < 4; c++) {
        if (loads[c] >= sizes[c]) continue;
        const same = colorCounts[c][t.color] || 0;
        const expected = (totalByColor[t.color] || 0) * sizes[c] / Math.max(1, n);
        const score = (same - expected) * 100 +
          (loads[c] / Math.max(1, sizes[c])) * 10 +
          rand() * 0.01;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      if (best < 0) {
        // 容量兜底：只选还有空位的列；不会丢令牌。
        for (let c = 0; c < 4; c++) if (loads[c] < sizes[c] && (best < 0 || loads[c] < loads[best])) best = c;
      }
      cols[best].push(t);
      colorCounts[best][t.color] = (colorCounts[best][t.color] || 0) + 1;
      loads[best]++;
    });
    return cols;
  }

  // 列内打破同色连排：只在同一列里交换两枚令牌，列大小和每列颜色总量不变。
  // 从第 2 枚开始处理，第 1 枚（队首、最远色）保持不动。
  function smoothScatterRuns(cols, passes) {
    const out = cols.map(function (col) { return col.slice(); });
    for (let p = 0; p < passes; p++) {
      for (let c = 0; c < out.length; c++) {
        const col = out[c];
        for (let i = 1; i < col.length; i++) {
          if (col[i].color !== col[i - 1].color) continue;
          let best = -1;
          let bestScore = Infinity;
          for (let j = i + 1; j < col.length; j++) {
            if (col[j].color === col[i - 1].color) continue;
            let score = Math.abs(j - i) * 0.001;
            if (j > 0 && col[j - 1] && col[j - 1].color === col[j].color) score += 2;
            if (j + 1 < col.length && col[j + 1].color === col[j].color) score += 2;
            if (col[j].color === col[i].color) score += 1;
            if (score < bestScore) { bestScore = score; best = j; }
          }
          if (best >= 0) {
            const tmp = col[i]; col[i] = col[best]; col[best] = tmp;
          }
        }
      }
    }
    return out;
  }

  function shuffleScatterColumns(cols, seed) {
    const rand = queueRandom((Number(seed) || 1) ^ 0x1B873593);
    return cols.map(function (col) {
      if (col.length <= 2) return col.slice();
      const head = col[0];
      const rest = col.slice(1);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
      }
      return [head].concat(rest);
    });
  }

  // 按颜色轮流发一枚，得到一条颜色高度交替的整队序列；再按原列大小连续切列。
  // 只在候选层使用，绝不动真实颜色 / 只数。
  function colorRoundRobinTokens(tokens, seed) {
    const byColor = new Map();
    tokens.forEach(function (t) {
      if (!byColor.has(t.color)) byColor.set(t.color, []);
      byColor.get(t.color).push(t);
    });
    const rand = queueRandom((Number(seed) || 1) ^ 0x27D4EB2D);
    const order = Array.from(byColor.keys()).sort();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const out = [];
    // 第一枚固定为原队列第一枚，保住「第一枚离巢最远」的稳定观感。
    if (tokens.length) {
      const first = tokens[0];
      out.push(first);
      byColor.get(first.color).shift();
    }
    while (out.length < tokens.length) {
      let added = false;
      for (let k = 0; k < order.length; k++) {
        const arr = byColor.get(order[k]);
        if (!arr.length) continue;
        out.push(arr.shift());
        added = true;
        if (out.length >= tokens.length) break;
      }
      if (!added) break;
      // 每轮轻微换一下颜色顺序，避免高步数关出现机械的四列循环。
      if (rand() < 0.55) {
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
      }
    }
    return out;
  }

  function cutTokenSequence(tokens, sizes) {
    const cols = [[], [], [], []];
    let at = 0;
    for (let c = 0; c < 4; c++) {
      for (let k = 0; k < sizes[c] && at < tokens.length; k++) cols[c].push(tokens[at++]);
    }
    return cols;
  }

  function scatterMetrics(cols) {
    let distinctSum = 0;
    let sameColorColumns = 0;
    let maxRun = 1;
    let visibleDistinctSum = 0;
    cols.forEach(function (col) {
      const colors = col.map(function (t) { return t.color; });
      const distinct = new Set(colors).size;
      distinctSum += distinct;
      if (distinct <= 1 && colors.length > 1) sameColorColumns++;
      let run = 1;
      for (let i = 1; i < colors.length; i++) {
        run = colors[i] === colors[i - 1] ? run + 1 : 1;
        if (run > maxRun) maxRun = run;
      }
      visibleDistinctSum += new Set(colors.slice(0, 3)).size;
    });
    return {
      distinctPerColumnAvg: Math.round((distinctSum / 4) * 100) / 100,
      visibleDistinctPerColumnAvg: Math.round((visibleDistinctSum / 4) * 100) / 100,
      sameColorColumns: sameColorColumns,
      maxSameColorRun: maxRun
    };
  }

  function makeScatterCandidate(level, cols, meta) {
    const groups = [];
    const columns = cols.map(function (col) {
      return col.map(function (t) {
        const id = 'q' + (groups.length + 1);
        groups.push({ id: id, color: t.color, n: t.n });
        return id;
      });
    });
    const candidate = Object.assign({}, level, {
      groups: groups,
      columns: columns,
      queueTokenCount: groups.length,
      queueTarget: groups.length,
      minimumSteps: groups.length,
      queueVerified: false
    });
    candidate.queueScatter = meta;
    candidate.queueGeneration = Object.assign({}, level.queueGeneration || {}, { colorScatter: meta });
    return candidate;
  }

  function scatterQueueColors(level, seed, options) {
    if (!level || !level.queueVerified || !Array.isArray(level.columns) || level.columns.length !== 4) return level;
    const opts = options || {};
    // 制作期固定队列用 preferQuality：把所有通过复验的分散候选都算一遍，
    // 取「可见行颜色更多、同色连排更短」的一份再保存。玩家运行期不传这个
    // 选项，旧 200 关的每局 seed 行为保持不变。
    const preferQuality = !!opts.preferQuality;
    const tokens = flattenQueueTokens(level);
    const sizes = scatterColumnSizes(level);
    if (!tokens.length || sizes.some(function (s) { return s < 0; })) return level;
    const attempts = [];
    let best = null;
    const baseSeed = (Number(seed) || 1) ^ 0xA5A5A5A5;
    // 先试颜色均衡发牌 / 列内洗牌，再用按颜色轮流出令的候选兜底。
    const candidates = [];
    // 先试颜色均衡发牌：每列都能拿到多种颜色，且列内大体保留原先后。
    // 列内打破连排放在最前（视觉最好）；如果复验不过，再退回只均衡分列的版本。
    const raw0 = scatterColumnsByColor(tokens, sizes, baseSeed);
    candidates.push({ variant: 'balanced-smooth', cols: smoothScatterRuns(raw0, 2) });
    candidates.push({ variant: 'balanced-deal-0', cols: raw0 });
    const rawBySeed = [raw0];
    for (let k = 1; k <= 2; k++) {
      const seedK = (baseSeed ^ (k * 0x9E3779B9)) >>> 0;
      const raw = scatterColumnsByColor(tokens, sizes, seedK);
      rawBySeed.push(raw);
      candidates.push({ variant: 'balanced-deal-' + k, cols: raw });
    }
    // 列内洗牌：保留四列队首（不同色）和每列颜色总量，只打散列内先后。
    // 这比整队按色轮转更接近「只打散排布、不改真实颜色」的观感。
    for (let k = 0; k < rawBySeed.length; k++) {
      candidates.push({
        variant: 'balanced-shuffle-' + k,
        cols: shuffleScatterColumns(rawBySeed[k], (baseSeed ^ (k * 0x27D4EB2D)) >>> 0)
      });
    }
    // 最后用按颜色轮流出令的候选兜底；高步数 / 单色很多的关更常需要它。
    for (let k = 1; k <= 4; k++) {
      const seq = colorRoundRobinTokens(tokens, (baseSeed ^ (k * 0x85EBCA6B)) >>> 0);
      candidates.push({ variant: 'color-rr-' + k, cols: cutTokenSequence(seq, sizes) });
    }
    for (let i = 0; i < candidates.length; i++) {
      const def = candidates[i];
      const metrics = scatterMetrics(def.cols);
      const meta = {
        applied: true,
        variant: def.variant,
        attempt: i + 1,
        seed: baseSeed >>> 0,
        metrics: metrics
      };
      const candidate = makeScatterCandidate(level, def.cols, meta);
      const check = verifyQueuePlaythrough(candidate);
      if (!check.ok) {
        attempts.push({ variant: def.variant, ok: false, reason: check.reason, metrics: metrics });
        continue;
      }
      const finalMeta = Object.assign({}, meta, {
        attempts: attempts.concat([{ variant: def.variant, ok: true, reason: check.reason, metrics: metrics }])
      });
      candidate.queueScatter = finalMeta;
      candidate.queueGeneration = Object.assign({}, candidate.queueGeneration, { colorScatter: finalMeta });
      candidate.queueVerified = true;
      candidate.queueCheck = check;
      candidate.queuePlaythrough = check;
      candidate.queuePlaythroughCheck = check;
      if (!preferQuality) return candidate;
      const score = metrics.visibleDistinctPerColumnAvg * 10 +
        metrics.distinctPerColumnAvg * 2 -
        metrics.maxSameColorRun * 0.5;
      if (!best || score > best.score) best = { candidate: candidate, score: score, check: check };
      if (metrics.sameColorColumns === 0 &&
          metrics.visibleDistinctPerColumnAvg >= 2 &&
          metrics.maxSameColorRun <= 3) {
        return candidate;
      }
    }
    if (preferQuality && best) {
      // 没有候选同时满足「无单色列 / 可见行多色 / 连排 ≤3」时，返回质量分最高
      // 且仍通过完整复验的那一份；不返回未验证候选。
      return best.candidate;
    }
    // 所有分散候选都过不了真实复验：保留原队列，但如实记录，不写「已保证」。
    const originalCols = level.columns.map(function (col) {
      return col.map(function (id) {
        const g = level.groups.find(function (x) { return x.id === id; });
        return { color: g ? g.color : '' };
      });
    });
    const fallbackMeta = {
      applied: false,
      variant: 'original',
      reason: 'no-verified-scatter',
      attempts: attempts,
      metrics: scatterMetrics(originalCols)
    };
    level.queueScatter = fallbackMeta;
    level.queueGeneration = Object.assign({}, level.queueGeneration || {}, { colorScatter: fallbackMeta });
    return level;
  }

  // t235u：预选区令牌只在制作关卡时生成并固定，运行期只读。
  // ---------------------------------------------------------------------
  // 关卡数据里的固定队列字段统一叫 presetQueue；fixedQueue 只是兼容别名。
  // 固定数据包含完整四列顺序、每枚令牌颜色 / 只数、制作期难度、复验证书和
  // 打散指标。运行期 prepareLevel 只校验并复制这份数据，不按 seed 重算，
  // 也不在玩家进入 / 刷新 / 重试时调用颜色打散。
  function presetQueueOf(base) {
    if (!base || typeof base !== 'object') return null;
    const p = base.presetQueue || base.fixedQueue;
    return p && typeof p === 'object' ? p : null;
  }

  function validatePresetQueue(base, preset) {
    const p = preset || presetQueueOf(base);
    if (!p || typeof p !== 'object') return { ok: false, reason: 'missing-preset' };
    if (!Array.isArray(p.groups) || !Array.isArray(p.columns) || p.columns.length !== 4) {
      return { ok: false, reason: 'groups-or-columns-shape' };
    }
    const totals = colorTotalsForLevel(base);
    let totalCells = 0;
    for (const color of Object.keys(totals)) totalCells += totals[color];
    if (!totalCells) return { ok: false, reason: 'empty-map' };
    const byId = new Map();
    const have = Object.create(null);
    let cells = 0;
    for (let i = 0; i < p.groups.length; i++) {
      const g = p.groups[i];
      if (!g || typeof g.id !== 'string' || !g.id) return { ok: false, reason: 'bad-group-id-' + i };
      if (byId.has(g.id)) return { ok: false, reason: 'duplicate-group-id-' + g.id };
      if (!totals[g.color]) return { ok: false, reason: 'unknown-color-' + g.id };
      const n = Number(g.n);
      if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'bad-group-count-' + g.id };
      byId.set(g.id, g);
      have[g.color] = (have[g.color] || 0) + n;
      cells += n;
    }
    if (cells !== totalCells) return { ok: false, reason: 'cell-total-' + cells + '-' + totalCells };
    for (const color of Object.keys(totals)) {
      if ((have[color] || 0) !== totals[color]) return { ok: false, reason: 'color-total-' + color };
    }
    const seen = new Set();
    for (let c = 0; c < 4; c++) {
      const col = p.columns[c];
      if (!Array.isArray(col)) return { ok: false, reason: 'column-shape-' + c };
      for (let i = 0; i < col.length; i++) {
        const id = col[i];
        if (!byId.has(id)) return { ok: false, reason: 'column-unknown-id-' + id };
        if (seen.has(id)) return { ok: false, reason: 'column-duplicate-id-' + id };
        seen.add(id);
      }
    }
    if (seen.size !== byId.size) return { ok: false, reason: 'column-missing-id' };
    if (p.target != null && Number(p.target) !== byId.size) return { ok: false, reason: 'target-mismatch' };
    if (p.verified === false) return { ok: false, reason: 'marked-unverified' };
    return { ok: true, cells: cells, tokenCount: byId.size };
  }

  function applyPresetQueue(base, preset) {
    const check = validatePresetQueue(base, preset);
    if (!check.ok) throw new Error('固定队列校验失败：' + check.reason);
    const groups = preset.groups.map(function (g) { return { id: g.id, color: g.color, n: Number(g.n) }; });
    const columns = preset.columns.map(function (col) { return col.slice(); });
    const generation = preset.generation && typeof preset.generation === 'object'
      ? JSON.parse(JSON.stringify(preset.generation))
      : { source: 'preset' };
    return Object.assign({}, base, {
      groups: groups,
      columns: columns,
      queueSeed: (Number(preset.seed) || 1) >>> 0,
      queueTokenCount: groups.length,
      queueTarget: Number(preset.target) || groups.length,
      minimumSteps: Number(preset.target) || groups.length,
      stepDefinition: STEP_DEFINITION,
      queueMode: preset.mode || 'preset-fixed',
      queueVerified: true,
      queueFixed: true,
      presetQueueSource: preset.source || 'level.presetQueue',
      queueGeneration: generation,
      queueScatter: preset.scatter || null,
      queueCheck: preset.check || null,
      queuePlaythrough: preset.check || null,
      queuePlaythroughCheck: preset.check || null
    });
  }

  // 只在制作关卡时运行：按该关难度取目标步数，生成候选、制作期颜色打散，
  // 再用与网页同源的逐列取令 + 最多 18 只在途复验。返回可直接写入关卡数据的
  // 纯 JSON 固定队列。
  function buildPresetQueue(base, options) {
    const opts = options || {};
    const tier = difficultyTierForLevel(base);
    const target = Math.max(1, Math.round(Number(opts.targetSteps) || stepTargetForTier(tier)));
    const seedBase = (0x9E3779B9 ^ Math.imul((Number(base.no) || 1) >>> 0, 2654435761)) >>> 0;
    const seeds = [seedBase];
    for (let k = 1; k <= 11; k++) seeds.push((seedBase ^ Math.imul(k, 0x85EBCA6B)) >>> 0);
    let best = null;
    for (let si = 0; si < seeds.length; si++) {
      const seed = seeds[si];
      const gen = buildLaunchQueueLevel(base, seed, { targetSteps: target });
      if (!gen || !gen.queueVerified) continue;
      const scattered = scatterQueueColors(gen, seed, { preferQuality: true });
      if (!scattered.queueVerified || !scattered.queueScatter || !scattered.queueScatter.applied) continue;
      const check = verifyQueuePlaythrough(scattered, 18);
      if (!check.ok) continue;
      const metrics = scattered.queueScatter.metrics;
      const score = metrics.visibleDistinctPerColumnAvg * 10 +
        metrics.distinctPerColumnAvg * 2 -
        metrics.maxSameColorRun * 0.5;
      if (!best || score > best.score) {
        best = { seed: seed, scattered: scattered, check: check, metrics: metrics, score: score };
      }
      if (metrics.sameColorColumns === 0 &&
          metrics.visibleDistinctPerColumnAvg >= 2 &&
          metrics.maxSameColorRun <= 3) {
        break;
      }
    }
    if (!best) throw new Error('固定队列生成失败：第 ' + base.no + ' 关无通过复验的候选');
    const sc = best.scattered;
    const method = '难度 ' + tier + ' 级 → 目标 ' + target + ' 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)';
    const generation = Object.assign({}, sc.queueGeneration || {}, {
      preset: {
        schema: 'ant-architect-preset-queue-v1',
        builder: 'tools/build-first5-levels.js',
        generatedForLevel: base.no,
        difficultyTier: tier,
        target: target,
        method: method,
        seed: best.seed >>> 0,
        verifiedAtBuild: true
      }
    });
    return {
      schema: 'ant-architect-preset-queue-v1',
      version: 1,
      source: 'levels-sample-first5.js:presetQueue',
      levelNo: base.no,
      difficultyTier: tier,
      difficultyMethod: method,
      target: target,
      seed: best.seed >>> 0,
      mode: sc.queueMode || 'preset-fixed',
      groups: sc.groups.map(function (g) { return { id: g.id, color: g.color, n: Number(g.n) }; }),
      columns: sc.columns.map(function (col) { return col.slice(); }),
      verified: true,
      check: {
        ok: !!best.check.ok,
        reason: best.check.reason || 'ok',
        filled: best.check.filled,
        total: best.check.total,
        tokens: best.check.tokens,
        maxInFlight: best.check.maxInFlight
      },
      scatter: sc.queueScatter,
      generation: generation
    };
  }

  function prepareLevel(base, seed, options) {
    const preset = presetQueueOf(base);
    if (preset) return applyPresetQueue(base, preset);
    const useSeed = (Number(seed) || 1) >>> 0;
    const level = buildExactQueueLevel(base, useSeed, options);
    return scatterQueueColors(level, useSeed);
  }

  /**
   * 单格间寻路：从 fromIdx 走到 targetIdx，只走未铺格。
   * 保留给规则测试与旧调用方；游戏动画使用 planVirtualRoute。
   */
  function pathFrom(state, fromIdx, targetIdx, extraBlocked) {
    const extra = normalizeSet(extraBlocked);
    if (fromIdx === targetIdx) return [targetIdx];
    function blocked(i) {
      if (state.terrain[i] === HOLE || state.filled[i]) return true;
      return !!(extra && extra.has(i));
    }
    if (blocked(fromIdx)) return [];
    const W = state.width, H = state.height;
    const seen = new Uint8Array(W * H);
    const parent = new Int16Array(W * H).fill(-1);
    const queue = [fromIdx];
    seen[fromIdx] = 1;
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      if (i === targetIdx) break;
      const p = xyOf(i, W);
      for (let d = 0; d < DIRS.length; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny, W, H)) continue;
        const ni = idxOf(nx, ny, W);
        if (seen[ni] || blocked(ni)) continue;
        seen[ni] = 1;
        parent[ni] = i;
        queue.push(ni);
      }
    }
    if (!seen[targetIdx]) return [];
    const path = [];
    let cur = targetIdx;
    while (cur !== -1) { path.push(cur); cur = parent[cur]; }
    path.reverse();
    return path;
  }

  // 2026-11-19 t231u：整条真实轨迹都不能穿过已填色格。
  // 路线节点是格坐标，渲染时格中心是 (x + 0.5, y + 0.5)。这里在同一套
  // 「格」坐标系里，用蚂蚁足迹半径对整条线段做采样 + 到格矩形的最近距离
  // 检查。半径小于 0.5 格时，只要线段沿未填格中心走、斜步两翼未填，
  // 蚂蚁身体就不会压进已填格；动画层每帧再查一次，格在途中变已填就停步重规划。
  function cellBlockedForBody(state, px, py, radius, extra) {
    const r = Math.max(0.01, Number(radius) || ANT_FOOTPRINT_RADIUS);
    const W = state.width, H = state.height;
    const x0 = Math.max(0, Math.floor(px - r - 0.5));
    const x1 = Math.min(W - 1, Math.ceil(px + r - 0.5));
    const y0 = Math.max(0, Math.floor(py - r - 0.5));
    const y1 = Math.min(H - 1, Math.ceil(py + r - 0.5));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = idxOf(x, y, W);
        if (state.terrain[i] !== HOLE && !state.filled[i] && !(extra && extra.has(i))) continue;
        const nx = Math.max(x, Math.min(px, x + 1));
        const ny = Math.max(y, Math.min(py, y + 1));
        const dx = px - nx, dy = py - ny;
        if (dx * dx + dy * dy < r * r - 1e-12) return true;
      }
    }
    return false;
  }

  function pointClearOfPaint(state, x, y, radius, extra) {
    return !cellBlockedForBody(state, x + 0.5, y + 0.5, radius, extra);
  }

  function segmentClear(state, from, to, radius, extra) {
    if (!from || !to) return false;
    const ax = from.x + 0.5, ay = from.y + 0.5;
    const bx = to.x + 0.5, by = to.y + 0.5;
    const dx = bx - ax, dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 0.18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (cellBlockedForBody(state, ax + dx * t, ay + dy * t, radius, extra)) return false;
    }
    return true;
  }

  function routeClear(state, route, radius, extra) {
    if (!route || !route.length) return false;
    for (let i = 1; i < route.length; i++) {
      if (!segmentClear(state, route[i - 1], route[i], radius, extra)) return false;
    }
    return true;
  }

  function analyze(state) {
    const reach = reachableSet(state);
    const sealed = sealingSet(state);
    const unreachable = [];
    const sealedList = [];
    for (let i = 0; i < state.blueprint.length; i++) {
      const idx = state.blueprint[i];
      if (state.filled[idx]) continue;
      if (!reach[idx]) unreachable.push(idx);
      if (sealed[idx]) sealedList.push(idx);
    }
    const slotInfo = state.slots.map(function (slot, index) {
      if (!slot) return { index: index, empty: true };
      const targets = legalTargets(state, slot.color, null, null);
      return {
        index: index,
        empty: false,
        uid: slot.uid,
        id: slot.id,
        color: slot.color,
        remaining: slot.remaining,
        total: slot.n,
        legal: targets.length,
        waiting: targets.length === 0,
        targets: targets
      };
    });
    return { reachable: reach, sealed: sealedList, unreachable: unreachable, slots: slotInfo };
  }

  /**
   * 并行调度器：
   *  - 目标格从派工那一刻起被预约，直到落块完成；
   *  - 路线上的盘内格做软预约，后来者不把在途路线上的格选作新目标；
   *  - 派工前调用 routePlanner 确认实际可达路线，找不到路线就不出发；
   *  - 最后一只出发时立刻从 state.slots 移除令牌，在途任务只认 token uid。
   */
  function createCoordinator(state, options) {
    const opts = options || {};
    // 2026-11-19 20:37 t207u：运行时不再有「共享在途 / 同时锁定格数」上限。
    // 传 null（或 Infinity）表示不限；离线队列复验仍显式传 8，作为可解性模拟，
    // 不是网页派工闸门。每只蚂蚁仍只在自己的 dispatch 时刻锁一个目标。
    const unlimitedInFlight = opts.maxInFlight === null || opts.maxInFlight === Infinity;
    const maxInFlight = unlimitedInFlight ? Infinity : Math.max(1, Number(opts.maxInFlight) || 10);
    const routePlanner = typeof opts.routePlanner === 'function' ? opts.routePlanner : null;
    const reservations = new Map(); // target idx -> task
    const tasks = new Map(); // task id -> task
    const routeCells = new Map(); // board idx -> refcount
    let nextId = 1;

    function reservedSet() { return new Set(reservations.keys()); }
    function routeCellSet() { return new Set(routeCells.keys()); }
    function addRoute(route) {
      if (!route) return;
      route.forEach(function (node) {
        if (node.x < 0 || node.x >= state.width || node.y < 0 || node.y >= state.height) return;
        const idx = idxOf(node.x, node.y, state.width);
        routeCells.set(idx, (routeCells.get(idx) || 0) + 1);
      });
    }
    function releaseRoute(route) {
      if (!route) return;
      route.forEach(function (node) {
        if (node.x < 0 || node.x >= state.width || node.y < 0 || node.y >= state.height) return;
        const idx = idxOf(node.x, node.y, state.width);
        const n = (routeCells.get(idx) || 0) - 1;
        if (n > 0) routeCells.set(idx, n);
        else routeCells.delete(idx);
      });
    }

    function candidateTargets(slot) {
      // 目标格严格保持 legalTargets 的「离巢从远到近」顺序：
      // legalTargets 已排除已填、不可达、会封口、以及被其他在途蚂蚁预约的目标。
      // 这里不再按「路线格是否被占用」把更远的合法目标降级到 fallback；
      // 路线软占用只用于调试 / 可视化，不能改变 t189u 的远 → 近选格。
      return legalTargets(state, slot.color, reservedSet(), null);
    }

    // 开发自测 / 后台校验用：候选数与合法数分开，便于判断是「确实没目标」
    // 还是「调度器自己把可填目标挡掉了」。不改变游戏状态。
    function candidateCount(slotIndex) {
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return 0;
      return candidateTargets(slot).length;
    }
    function legalCount(slotIndex) {
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return 0;
      return legalTargets(state, slot.color, null, null).length;
    }

    // 一枚令牌此刻真正可派工的目标：候选格按优先级逐个确认「从巢穴出口
    // 到目标存在实际可达路线」。只检查可达性，不改预约 / 任务 / 计数。
    function findDispatchableTarget(slot) {
      if (!slot || slot.remaining <= 0) return null;
      const targets = candidateTargets(slot);
      for (let k = 0; k < targets.length; k++) {
        const idx = targets[k];
        const blockedForRoute = reservedSet();
        // t213u：第三个参数是路线样式种子。这里用「下一只任务 id」，同一只
        // 蚂蚁从候选检查到真正 dispatch 都用同一个种子；每只蚂蚁的路线可在
        // 同长度路线里选不同侧面，但不会因为调用次数不同而闪变。
        const route = routePlanner ? routePlanner(idx, blockedForRoute, nextId) : routeFromNest(state, idx, blockedForRoute, null, nextId);
        if (!route || !route.length) continue;
        const last = route[route.length - 1];
        if (last.x + last.y * state.width !== idx) continue;
        // 出发前整条真实线段（含插值/斜步）再按足迹半径查一次，不能只看节点。
        if (!routeClear(state, route, ANT_FOOTPRINT_RADIUS, blockedForRoute)) continue;
        return { idx: idx, route: route };
      }
      return null;
    }

    // 「可出动」只描述令牌自身：还有未出发蚂蚁，并且此刻至少有一个合法可达目标。
    // 故意不看在途总数上限：上限只是暂时排队，不是令牌休眠 / ZZ。
    function canLaunch(slotIndex) {
      if (slotIndex < 0 || slotIndex >= state.slots.length) return false;
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return false;
      return !!findDispatchableTarget(slot);
    }

    function launchableSlots() {
      const out = [];
      for (let i = 0; i < state.slots.length; i++) {
        if (canLaunch(i)) out.push(i);
      }
      return out;
    }

    function canDispatch(slotIndex) {
      if (slotIndex < 0 || slotIndex >= state.slots.length) return false;
      if (tasks.size >= maxInFlight) return false;
      return canLaunch(slotIndex);
    }

    function dispatch(slotIndex) {
      if (slotIndex < 0 || slotIndex >= state.slots.length) return null;
      if (tasks.size >= maxInFlight) return null;
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return null;
      const found = findDispatchableTarget(slot);
      if (!found) return null;
      const task = {
        id: nextId++,
        slotIndex: slotIndex,
        tokenUid: slot.uid,
        token: slot,
        groupId: slot.id,
        color: slot.color,
        idx: found.idx,
        route: found.route
      };
      reservations.set(found.idx, task);
      tasks.set(task.id, task);
      addRoute(found.route);
      // 最后一只真正出巢：立即腾出待令位；在途任务不再依赖槽位索引。
      slot.remaining--;
      if (slot.remaining <= 0) {
        if (state.slots[slotIndex] === slot) state.slots[slotIndex] = null;
      }
      return task;
    }

    // 落块前再做一次联合安全检查；正常流程在派工时已经通过。
    function canCommit(task) {
      if (!task || reservations.get(task.idx) !== task) return false;
      if (state.filled[task.idx]) return false;
      const union = reservedSet();
      const seen = reachableSet(state, union);
      return allRemainingReachable(state, seen, union);
    }

    function commit(task) {
      if (!canCommit(task)) {
        const err = new Error('封口安全检查未通过，拒绝落块');
        err.code = 'UNSAFE_COMMIT';
        throw err;
      }
      state.filled[task.idx] = 1;
      state.filledCount++;
      state.moves++;
      reservations.delete(task.idx);
      tasks.delete(task.id);
      releaseRoute(task.route);
      task.route = null;
      return { done: state.filledCount >= state.total };
    }

    // 取消一只尚未落块的在途蚂蚁：令牌格数要还回去，不能静默丢格。
    function abort(task) {
      if (!task || reservations.get(task.idx) !== task) return false;
      reservations.delete(task.idx);
      tasks.delete(task.id);
      releaseRoute(task.route);
      task.route = null;
      const token = task.token;
      if (token) {
        token.remaining++;
        // 若令牌已经因“最后一只出巢”从槽位移除，尝试放回空槽，保证计数不丢。
        const inSlot = state.slots.some(function (s) { return s && s.uid === token.uid; });
        if (!inSlot) {
          for (let s = 0; s < state.slots.length; s++) {
            if (!state.slots[s]) { state.slots[s] = token; break; }
          }
        }
      }
      return true;
    }

    function stats() {
      const byToken = Object.create(null);
      tasks.forEach(function (t) { byToken[t.tokenUid] = (byToken[t.tokenUid] || 0) + 1; });
      return {
        inFlight: tasks.size,
        maxInFlight: unlimitedInFlight ? null : maxInFlight,
        reservations: Array.from(reservations.values()).map(function (t) {
          return { id: t.id, idx: t.idx, slotIndex: t.slotIndex, tokenUid: t.tokenUid, color: t.color, groupId: t.groupId };
        }),
        byToken: byToken
      };
    }

    return {
      dispatch: dispatch,
      canCommit: canCommit,
      commit: commit,
      abort: abort,
      stats: stats,
      canDispatch: canDispatch,
      canLaunch: canLaunch,
      launchableSlots: launchableSlots,
      candidateCount: candidateCount,
      legalCount: legalCount,
      hasActive: function () { return tasks.size > 0; },
      activeCount: function () { return tasks.size; },
      reservedSet: reservedSet,
      routeCellSet: routeCellSet
    };
  }

  const Engine = {
    SIZE: SIZE,
    SLOTS: SLOTS,
    DISPATCH_BASE_MS: DISPATCH_BASE_MS,
    ANT_FOOTPRINT_RADIUS: ANT_FOOTPRINT_RADIUS,
    dimsOf: dimsOf,
    nestCenterFor: nestCenterFor,
    nestDistanceSqFor: nestDistanceSqFor,
    compareTargetsForState: compareTargetsForState,
    segmentClear: segmentClear,
    pointClearOfPaint: pointClearOfPaint,
    routeClear: routeClear,
    SLOT_CAPACITY_RESERVED: SLOTS + 1,
    PAPER: PAPER,
    OBJECT: OBJECT,
    HOLE: HOLE,
    NORMAL_PX_PER_MS: NORMAL_PX_PER_MS,
    ENDGAME_MULTIPLIER: ENDGAME_MULTIPLIER,
    idxOf: idxOf,
    xyOf: xyOf,
    inBoard: inBoard,
    NEST_COL: NEST_COL,
    NEST_CENTER: NEST_CENTER,
    nestDistance: nestDistance,
    nestDistanceSq: nestDistanceSq,
    createState: createState,
    cloneState: cloneState,
    reachableSet: reachableSet,
    sealingSet: sealingSet,
    wouldTrap: wouldTrap,
    isLegal: isLegal,
    legalTargets: legalTargets,
    nextMove: nextMove,
    place: place,
    pick: pick,
    addSlot: addSlot,
    recall: recall,
    settle: settle,
    isWin: isWin,
    deadlock: deadlock,
    analyze: analyze,
    anyFront: anyFront,
    slotsFull: slotsFull,
    pathFrom: pathFrom,
    planVirtualRoute: planVirtualRoute,
    routeFromNest: routeFromNest,
    depthMapForLevel: depthMapForLevel,
    buildQueueLevel: buildQueueLevel,
    prepareLevel: prepareLevel,
    presetQueueOf: presetQueueOf,
    validatePresetQueue: validatePresetQueue,
    applyPresetQueue: applyPresetQueue,
    buildPresetQueue: buildPresetQueue,
    buildExactQueueLevel: buildExactQueueLevel,
    buildPlanCandidate: buildPlanCandidate,
    randomPlanQueueLevel: randomPlanQueueLevel,
    randomDepthSplitLevel: randomDepthSplitLevel,
    verifyQueueSolution: verifyQueueSolution,
    verifyQueuePlaythrough: verifyQueuePlaythrough,
    stepTargetForDifficulty: stepTargetForDifficulty,
    stepTargetForTier: stepTargetForTier,
    stepTargetForLevel: stepTargetForLevel,
    difficultyTierForLevel: difficultyTierForLevel,
    difficultyTierForLegacy: difficultyTierForLegacy,
    DIFFICULTY_TIERS: DIFFICULTY_TIERS,
    STEP_TARGETS: STEP_TARGETS,
    STEP_DEFINITION: STEP_DEFINITION,
    QUEUE_TARGETS: QUEUE_TARGETS,
    validateCounts: validateCounts,
    createCoordinator: createCoordinator,
    isQueueExhausted: isQueueExhausted,
    speedMultiplier: speedMultiplier,
    effectiveMultiplier: effectiveMultiplier
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.AntEngine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
