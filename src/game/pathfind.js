// AI 寻路：从目标点反向 BFS 生成距离场，避免贪心步进被山地/河流卡死。
// 视野内的小地图（≤200×200）一次 BFS 只有几万次访问，AI 一回合最多几十次，开销可接受。

/**
 * 生成「到 (tx,ty) 的步数场」，不可达处为 -1。
 * passable(x,y) 由调用方决定（AI 用「非山地 + 非敌方建筑」）。
 */
export function buildDistanceField(state, tx, ty, passable) {
  const W = state.mapW, H = state.mapH;
  const field = new Int32Array(W * H).fill(-1);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return field;

  const start = ty * W + tx;
  field[start] = 0;
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  queue[tail++] = start;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % W;
    const cy = (cur - cx) / W;
    const nd = field[cur] + 1;

    // 四方向（与移动规则一致）
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (field[ni] !== -1) continue;
      // 目标格本身允许不可通行（敌方建筑/主营），其余必须可通行
      if (ni !== start && !passable(nx, ny)) continue;
      field[ni] = nd;
      queue[tail++] = ni;
    }
  }
  return field;
}

/**
 * 带缓存的取场：同一 AI 回合内，多个单位打同一个目标时只算一次。
 */
export function getDistanceField(state, tx, ty, passable, cache, playerIdx) {
  const key = `${playerIdx}:${tx},${ty}`;
  let f = cache.get(key);
  if (!f) {
    f = buildDistanceField(state, tx, ty, passable);
    cache.set(key, f);
  }
  return f;
}

export function fieldAt(state, field, x, y) {
  if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) return -1;
  return field[y * state.mapW + x];
}

