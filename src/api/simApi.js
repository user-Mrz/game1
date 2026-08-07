// 后端回合结算 API 客户端
// 把运行状态（不含 terrain/explored/视口等仅前端字段）发给后端，后端结算所有 AI 行动后返回新状态
// 地形数据由后端 MapService 管理，不再随请求传输

export function buildSimRequest(state, seed) {
  return {
    gameId: state.gameId,
    mapW: state.mapW,
    mapH: state.mapH,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    nextUnitId: state.nextUnitId,
    seed,
    tutorialMode: !!state.tutorialMode,
    players: state.players.map(p => ({ ...p })),
    units: state.units.map(u => ({ ...u })),
    buildings: Array.from(state.buildings.entries()).map(([k, v]) => ({
      key: k,
      type: v.type,
      owner: v.owner,
      hp: v.hp,
      ...(v.lastHitBy !== undefined ? { lastHitBy: v.lastHitBy } : {}),
    })),
  };
}

async function postJson(path, body, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const simApi = {
  endTurn(state, seed = (Math.random() * 0x7fffffff) | 0) {
    return postJson('/api/sim/end-turn', buildSimRequest(state, seed));
  },
};
