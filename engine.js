/*
 * 《蚂蚁小画师》纯规则引擎 v7（2026-11-18 21:27–22:32 反馈版）
 * 浏览器挂在 globalThis.AntEngine；Node 端可直接 require。
 *
 * 本版核心：
 *  - 盘面逻辑网格 30 × 30（900 格），不是把旧图用 CSS 拉大。
 *  - 令牌最后一只蚂蚁真正出巢时，待令格立刻释放；在途任务用令牌 uid 解耦。
 *  - 每只蚂蚁在「即将走出巢穴」的 dispatch 时刻才预约目标；令牌入区不锁整组目标。
 *  - 派工前同时确认「合法目标 + 实际可达路线」，不能到了跟前才干等。
 *  - 目标预约 + 联合封口检查；封口等待、内部填完自动继续。
 *  - 路线软预约只做「优先避让」：若所有合法目标都在别人的路线上，仍允许派工；
 *    不再让整条路线把后续候选永久锁死，避免出几只就无故停一下。
 *  - 寻路走 30 × 30 盘面外一圈虚拟环路，可绕到最外层色块；不穿越已铺格。
 *  - 巢穴出口行 y = 31：起点即屏幕巢穴出口，不再先跑到盘面底边中点。
 *  - 随机队列：令牌可绑定 cells，按深度环 + 颜色分块，并本地校验可解性。
 */
(function (root) {
  'use strict';

  const SIZE = 30;
  const SLOTS = 5;
  const PAPER = 0;
  const OBJECT = 1;
  const HOLE = 2;

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // 常态低速；8× 只在这个基准上放大。30×30 下仍保留 0.14 px/ms 的低速手感。
  const NORMAL_PX_PER_MS = 0.14;
  const ENDGAME_MULTIPLIER = 8;

  function idxOf(x, y) { return y * SIZE + x; }
  function xyOf(i) { return { x: i % SIZE, y: Math.floor(i / SIZE) }; }
  function inBoard(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
  function isEdgeCell(i) {
    const p = xyOf(i);
    return p.x === 0 || p.x === SIZE - 1 || p.y === 0 || p.y === SIZE - 1;
  }

  function createState(level) {
    if (!level || !Array.isArray(level.map) || level.map.length !== SIZE) {
      throw new Error('关卡地图必须是 30 行');
    }
    const terrain = new Uint8Array(SIZE * SIZE);
    const color = new Array(SIZE * SIZE).fill(null);
    const blueprint = [];
    const colorCells = Object.create(null);
    let holes = 0;
    for (let y = 0; y < SIZE; y++) {
      const row = level.map[y];
      if (typeof row !== 'string' || row.length !== SIZE) {
        throw new Error('关卡地图每行必须是 30 格：第 ' + (y + 1) + ' 行');
      }
      for (let x = 0; x < SIZE; x++) {
        const ch = row[x];
        const i = idxOf(x, y);
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
    let boundGroups = 0;
    (level.groups || []).forEach(function (g) {
      let cells = null;
      if (g.cells) {
        if (!Array.isArray(g.cells) || !g.cells.length) throw new Error('令牌 cells 不能为空：' + g.id);
        cells = Array.from(new Set(g.cells));
        if (cells.length !== g.n) throw new Error('令牌 ' + g.id + ' 的 cells 数与 n 不一致');
        cells.forEach(function (i) {
          if (!Number.isInteger(i) || i < 0 || i >= SIZE * SIZE) throw new Error('令牌 ' + g.id + ' 的 cells 越界');
          if (color[i] !== g.color) throw new Error('令牌 ' + g.id + ' 的 cells 颜色不一致');
        });
        boundGroups++;
      }
      groups.set(g.id, { id: g.id, color: g.color, n: g.n, cells: cells });
    });
    if (boundGroups > 0 && boundGroups !== groups.size) {
      throw new Error('同一关的令牌要么全部绑定 cells，要么全部不绑定');
    }
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
      size: SIZE,
      terrain: terrain,
      color: color,
      blueprint: blueprint,
      colorCells: colorCells,
      total: blueprint.length,
      holes: holes,
      filled: new Uint8Array(SIZE * SIZE),
      filledCount: 0,
      slots: new Array(SLOTS).fill(null),
      colPos: columns.map(function () { return 0; }),
      columns: columns,
      moves: 0,
      nextTokenUid: 1
    };
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
    // 绑定 cells 的队列必须恰好把每个施工格分给一枚令牌，不能漏格或重复。
    let bound = 0;
    for (const col of state.columns) {
      for (const g of col) if (g.cells) bound++;
    }
    if (bound) {
      const seen = new Uint8Array(SIZE * SIZE);
      for (const col of state.columns) {
        for (const g of col) {
          for (let k = 0; k < g.cells.length; k++) {
            const i = g.cells[k];
            if (seen[i]) throw new Error('关卡 ' + level.id + ' 的令牌 cells 重复分配：' + i);
            seen[i] = 1;
          }
        }
      }
      for (let k = 0; k < state.blueprint.length; k++) {
        if (!seen[state.blueprint[k]]) throw new Error('关卡 ' + level.id + ' 的令牌 cells 漏掉施工格：' + state.blueprint[k]);
      }
    }
  }

  function cloneState(s) {
    return {
      level: s.level,
      size: SIZE,
      terrain: s.terrain,
      color: s.color,
      blueprint: s.blueprint,
      colorCells: s.colorCells,
      total: s.total,
      holes: s.holes,
      filled: s.filled.slice(),
      filledCount: s.filledCount,
      slots: s.slots.map(function (sl) {
        return sl ? { uid: sl.uid, id: sl.id, color: sl.color, n: sl.n, remaining: sl.remaining, cells: sl.cells || null, column: sl.column } : null;
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
    const seen = new Uint8Array(SIZE * SIZE);
    const queue = [];
    function seed(i) {
      if (seen[i]) return;
      if (!isWalkable(state, i, extra)) return;
      seen[i] = 1;
      queue.push(i);
    }
    for (let x = 0; x < SIZE; x++) {
      seed(idxOf(x, 0));
      seed(idxOf(x, SIZE - 1));
    }
    for (let y = 1; y < SIZE - 1; y++) {
      seed(idxOf(0, y));
      seed(idxOf(SIZE - 1, y));
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const p = xyOf(i);
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny)) continue;
        const ni = idxOf(nx, ny);
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
    const N = SIZE * SIZE;
    const disc = new Int32Array(N);
    const low = new Int32Array(N);
    const sealed = new Uint8Array(N);
    disc.fill(-1);
    let timer = 0;

    function neighbors(i) {
      const p = xyOf(i);
      const out = [];
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny)) continue;
        const ni = idxOf(nx, ny);
        if (state.terrain[ni] === HOLE) continue;
        if (state.filled[ni]) continue;
        if (extra && extra.has(ni)) continue;
        out.push(ni);
      }
      return out;
    }

    function dfs(v, parent) {
      disc[v] = low[v] = ++timer;
      let boundary = isEdgeCell(v) ? 1 : 0;
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

    for (let x = 0; x < SIZE; x++) {
      const top = idxOf(x, 0), bottom = idxOf(x, SIZE - 1);
      if (disc[top] === -1 && isWalkable(state, top, extra)) dfs(top, -1);
      if (disc[bottom] === -1 && isWalkable(state, bottom, extra)) dfs(bottom, -1);
    }
    for (let y = 1; y < SIZE - 1; y++) {
      const left = idxOf(0, y), right = idxOf(SIZE - 1, y);
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
    const reach = reachableSet(state, reservedSet);
    const sealed = sealingSet(state, reservedSet);
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
      const targets = legalTargets(state, slot.color, null, slot.cells);
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
    if (slot.cells && slot.cells.indexOf(idx) === -1) throw new Error('目标不属于这枚令牌');
    if (!isLegal(state, idx, slot.color, null, null, slot.cells)) throw new Error('会封死内部，不能落块');
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
      cells: g.cells || null,
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
  // allowPartial=true 时允许「已经填过一部分、但当前没有任何在途蚂蚁」的令牌：
  // 只把尚未填的 cells 和剩余格数退回，已填格不重复计数。
  // 默认 false：没有协调器时不能确认在途，只有完整未出发的令牌可退回。
  function recall(state, slotIndex, allowPartial) {
    if (!state || slotIndex < 0 || slotIndex >= state.slots.length) return null;
    const token = state.slots[slotIndex];
    if (!token || token.remaining <= 0) return null;
    if (!allowPartial && token.remaining !== token.n) return null;
    const c = token.column;
    if (!Number.isInteger(c) || c < 0 || c >= state.columns.length) return null;
    let cells = token.cells || null;
    if (allowPartial && cells) {
      cells = cells.filter(function (i) { return !state.filled[i]; });
      if (cells.length !== token.remaining) return null; // 仍被在途任务占着，不能安全退回
    }
    state.slots[slotIndex] = null;
    const group = { id: token.id, color: token.color, n: token.remaining, cells: cells };
    state.columns[c].splice(state.colPos[c], 0, group);
    return { slotIndex: slotIndex, column: c, group: group, token: token };
  }

  function settle(state, limit) {
    const moved = [];
    let guard = limit || 1200;
    while (guard-- > 0) {
      const m = nextMove(state);
      if (!m) break;
      place(state, m.slotIndex, m.idx);
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
    if (slotsFull(state)) return { reason: 'full', message: state.slots.length + ' 个待令格都被等待的令牌占满了，小画师无处开工。' };
    if (!anyFront(state)) return { reason: 'no-front', message: '待令区里的令牌都够不着，四列也没有可点的队首了。' };
    return null;
  }

  /**
   * 盘面 + 外圈虚拟环路的寻路。坐标允许 -1 .. SIZE，虚拟环四向连通。
   * 用于「出发前确认实际可达路线」以及盘外绕行填最外层色块。
   */
  function planVirtualRoute(state, from, targetIdx, extraBlocked) {
    const extra = normalizeSet(extraBlocked);
    const spanX = SIZE + 2;
    const spanY = SIZE + 3; // 多留一行 y = SIZE + 1：巢穴出口的盘外起步位。
    const min = -1, maxX = SIZE, maxY = SIZE + 1;
    function walkable(x, y) {
      if (x < min || x > maxX || y < min || y > maxY) return false;
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
        const i = idxOf(x, y);
        if (state.terrain[i] === HOLE) return false;
        if (state.filled[i]) return false;
        if (extra && extra.has(i)) return false;
        return true;
      }
      return true; // 盘外虚拟环路（含巢穴出口所在的最下一行）
    }
    const sx = from.x, sy = from.y;
    const gx = targetIdx % SIZE, gy = Math.floor(targetIdx / SIZE);
    if (!walkable(gx, gy)) return [];
    if (!walkable(sx, sy)) return [];
    const start = (sy + 1) * spanX + (sx + 1);
    const goal = (gy + 1) * spanX + (gx + 1);
    const seen = new Uint8Array(spanX * spanY);
    const parent = new Int32Array(spanX * spanY).fill(-1);
    const queue = [start];
    seen[start] = 1;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === goal) break;
      const cx = (cur % spanX) - 1;
      const cy = Math.floor(cur / spanX) - 1;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (!walkable(nx, ny)) continue;
        // 巢穴出口那一行是“月台”：只允许同一列上下，不允许沿月台横移，
        // 否则屏幕上的盘外段会变成贴着盘边瞬移。
        if (cy === SIZE + 1 && nx !== cx) continue;
        if (ny === SIZE + 1 && nx !== cx) continue;
        const ni = (ny + 1) * spanX + (nx + 1);
        if (seen[ni]) continue;
        seen[ni] = 1;
        parent[ni] = cur;
        queue.push(ni);
      }
    }
    if (!seen[goal]) return [];
    const out = [];
    let cur = goal;
    while (cur !== -1) {
      out.push({ x: (cur % spanX) - 1, y: Math.floor(cur / spanX) - 1 });
      cur = parent[cur];
    }
    out.reverse();
    return out;
  }

  function routeFromNest(state, targetIdx, extraBlocked, nestNode) {
    const start = nestNode && Number.isInteger(nestNode.x) && Number.isInteger(nestNode.y)
      ? { x: nestNode.x, y: nestNode.y }
      : { x: Math.floor(SIZE / 2), y: SIZE };
    return planVirtualRoute(state, start, targetIdx, extraBlocked);
  }

  /**
   * 按关卡难度生成一次随机队列（纯本地算法）。
   *
   * 关键安全构造：
   *  - 每个令牌只装「同一深度环 + 同一颜色」的格子；token.cells 明确绑定这些格。
   *  - 令牌按深度从内到外排列，四列是这条全局顺序的连续区段。
   *  - 因为同深度环上的格都还有更外一层的通路，逐列从内到外填一定可解。
   * 这不是“随便打乱”：随机只发生在同深度内的分块、令牌顺序和四列切点。
   */
  const QUEUE_TARGETS = { 1: 40, 2: 46, 3: 54, 4: 62, 5: 72, 6: 84, 7: 98, 8: 112, 9: 130, 10: 148 };

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
    const depth = new Int16Array(SIZE * SIZE);
    depth.fill(-1);
    const q = [];
    function seed(i) { if (depth[i] !== -1) return; depth[i] = 0; q.push(i); }
    for (let x = 0; x < SIZE; x++) { seed(idxOf(x, 0)); seed(idxOf(x, SIZE - 1)); }
    for (let y = 1; y < SIZE - 1; y++) { seed(idxOf(0, y)); seed(idxOf(SIZE - 1, y)); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const p = xyOf(i);
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny)) continue;
        const ni = idxOf(nx, ny);
        if (depth[ni] !== -1) continue;
        depth[ni] = depth[i] + 1;
        q.push(ni);
      }
    }
    return depth;
  }

  function splitCellsByDepthColor(level, seed, options) {
    const opts = options || {};
    const rand = queueRandom(seed);
    const depth = depthMapForLevel(level);
    const bands = new Map();
    for (let i = 0; i < SIZE * SIZE; i++) {
      const ch = level.map[Math.floor(i / SIZE)][i % SIZE];
      if (ch === '.' || ch === '#') continue;
      const d = depth[i];
      if (!bands.has(d)) bands.set(d, new Map());
      const byColor = bands.get(d);
      if (!byColor.has(ch)) byColor.set(ch, []);
      byColor.get(ch).push(i);
    }
    const baseGroups = [];
    Array.from(bands.keys()).sort(function (a, b) { return b - a; }).forEach(function (d) {
      const byColor = bands.get(d);
      byColor.forEach(function (cells, color) {
        baseGroups.push({ depth: d, color: color, cells: cells });
      });
    });
    const difficulty = Math.max(1, Math.min(10, Number(level.difficulty) || 1));
    const target = Math.max(baseGroups.length, QUEUE_TARGETS[difficulty] || 40);
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
        tokens.push({ depth: g.depth, color: g.color, cells: cells, n: cells.length });
      });
    });
    // 同一深度内随机；深度顺序严格从内到外。
    const byDepth = new Map();
    tokens.forEach(function (t) {
      if (!byDepth.has(t.depth)) byDepth.set(t.depth, []);
      byDepth.get(t.depth).push(t);
    });
    const ordered = [];
    Array.from(byDepth.keys()).sort(function (a, b) { return b - a; }).forEach(function (d) {
      const list = byDepth.get(d);
      queueShuffle(list, rand);
      list.forEach(function (t) { ordered.push(t); });
    });
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
        groups.push({ id: id, color: t.color, n: t.n, cells: t.cells });
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

  function prepareLevel(base, seed, options) {
    const opts = options || {};
    let level = buildQueueLevel(base, seed, opts);
    let check = verifyQueueSolution(level);
    if (!check.ok && !opts.fallback) {
      // 理论上不会走到这里；真出现时退回“每个深度色带一枚令牌”的保守构造。
      level = buildQueueLevel(base, seed, { fallback: true });
      check = verifyQueueSolution(level);
    }
    level.queueVerified = !!check.ok;
    level.queueCheck = check;
    return level;
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
    const seen = new Uint8Array(SIZE * SIZE);
    const parent = new Int16Array(SIZE * SIZE).fill(-1);
    const queue = [fromIdx];
    seen[fromIdx] = 1;
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      if (i === targetIdx) break;
      const p = xyOf(i);
      for (let d = 0; d < DIRS.length; d++) {
        const nx = p.x + DIRS[d][0], ny = p.y + DIRS[d][1];
        if (!inBoard(nx, ny)) continue;
        const ni = idxOf(nx, ny);
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
      const targets = legalTargets(state, slot.color, null, slot.cells);
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
    const maxInFlight = Math.max(1, opts.maxInFlight || 10);
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
        if (node.x < 0 || node.x >= SIZE || node.y < 0 || node.y >= SIZE) return;
        const idx = idxOf(node.x, node.y);
        routeCells.set(idx, (routeCells.get(idx) || 0) + 1);
      });
    }
    function releaseRoute(route) {
      if (!route) return;
      route.forEach(function (node) {
        if (node.x < 0 || node.x >= SIZE || node.y < 0 || node.y >= SIZE) return;
        const idx = idxOf(node.x, node.y);
        const n = (routeCells.get(idx) || 0) - 1;
        if (n > 0) routeCells.set(idx, n);
        else routeCells.delete(idx);
      });
    }

    function candidateTargets(slot) {
      // 目标格：排除其他在途蚂蚁已预约的目标。
      // 路线格：作为「软避让」优先避开，避免后来者把车流全堵在一条窄路上；
      // 但软避让只是优先，不是永久封锁——如果所有合法目标都在别人的路线上，
      // 仍然允许派工，否则会出现「明明有大量可填格却停下来」。
      const occupiedTargets = new Set();
      reservations.forEach(function (t) { occupiedTargets.add(t.idx); });
      const legal = legalTargets(state, slot.color, reservedSet(), slot.cells);
      const avoid = new Set();
      routeCells.forEach(function (count, idx) {
        if (count > 0) avoid.add(idx);
      });
      const preferred = [];
      const fallback = [];
      for (let k = 0; k < legal.length; k++) {
        const idx = legal[k];
        if (occupiedTargets.has(idx)) continue;
        if (avoid.has(idx)) fallback.push(idx);
        else preferred.push(idx);
      }
      return preferred.length ? preferred : fallback;
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
      return legalTargets(state, slot.color, null, slot.cells).length;
    }

    function canDispatch(slotIndex) {
      if (slotIndex < 0 || slotIndex >= state.slots.length) return false;
      if (tasks.size >= maxInFlight) return false;
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return false;
      return candidateTargets(slot).length > 0;
    }

    function dispatch(slotIndex) {
      if (slotIndex < 0 || slotIndex >= state.slots.length) return null;
      if (tasks.size >= maxInFlight) return null;
      const slot = state.slots[slotIndex];
      if (!slot || slot.remaining <= 0) return null;
      const targets = candidateTargets(slot);
      for (let k = 0; k < targets.length; k++) {
        const idx = targets[k];
        const blockedForRoute = reservedSet();
        const route = routePlanner ? routePlanner(idx, blockedForRoute) : routeFromNest(state, idx, blockedForRoute);
        if (!route || !route.length) continue;
        const last = route[route.length - 1];
        if (last.x + last.y * SIZE !== idx) continue;
        const task = {
          id: nextId++,
          slotIndex: slotIndex,
          tokenUid: slot.uid,
          token: slot,
          groupId: slot.id,
          color: slot.color,
          idx: idx,
          route: route
        };
        reservations.set(idx, task);
        tasks.set(task.id, task);
        addRoute(route);
        // 最后一只真正出巢：立即腾出待令位；在途任务不再依赖槽位索引。
        slot.remaining--;
        if (slot.remaining <= 0) {
          if (state.slots[slotIndex] === slot) state.slots[slotIndex] = null;
        }
        return task;
      }
      return null;
    }

    // 落块前再做一次联合安全检查；正常流程在派工时已经通过。
    function canCommit(task) {
      if (!task || reservations.get(task.idx) !== task) return false;
      if (state.filled[task.idx]) return false;
      if (task.token && task.token.cells && task.token.cells.indexOf(task.idx) === -1) return false;
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
        maxInFlight: maxInFlight,
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
    SLOT_CAPACITY_RESERVED: SLOTS + 1,
    PAPER: PAPER,
    OBJECT: OBJECT,
    HOLE: HOLE,
    NORMAL_PX_PER_MS: NORMAL_PX_PER_MS,
    ENDGAME_MULTIPLIER: ENDGAME_MULTIPLIER,
    idxOf: idxOf,
    xyOf: xyOf,
    inBoard: inBoard,
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
    verifyQueueSolution: verifyQueueSolution,
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
