// 后端回合结算 API 客户端
// 把运行状态（不含 explored/视口等仅前端字段）发给后端，后端结算所有 AI 行动后返回新状态

// Uint8Array → base64（每 0x8000 字节分块，避免 call stack 溢出）
function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function buildSimRequest(state, seed) {
  // 直接构造请求体：不经过 serializeGameState，避免先拷贝整个 explored 再丢弃造成瞬时内存尖峰
  return {
    mapW: state.mapW,
    mapH: state.mapH,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    nextUnitId: state.nextUnitId,
    seed,
    tutorialMode: !!state.tutorialMode,
    terrain: bytesToBase64(state.terrain),
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
