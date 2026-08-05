// 存档序列化/反序列化

// 把运行中的游戏状态转成可 JSON 化的普通对象
export function serializeGameState(state) {
  return {
    version: 1,
    mapW: state.mapW,
    mapH: state.mapH,
    turn: state.turn,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    winner: state.winner ?? null,
    nextUnitId: state.nextUnitId,
    viewCX: state.viewCX,
    viewCY: state.viewCY,
    tileSize: state.tileSize,
    zoomFactor: state.zoomFactor,
    terrain: Array.from(state.terrain),
    explored: state.explored.map(e => Array.from(e)),
    buildings: Array.from(state.buildings.entries()).map(([k, v]) => ({
      key: k, type: v.type, owner: v.owner, hp: v.hp,
      ...(v.lastHitBy !== undefined ? { lastHitBy: v.lastHitBy } : {}),
    })),
    players: state.players.map(p => ({ ...p })),
    units: state.units.map(u => ({ ...u })),
  };
}

// 把存档数据还原为游戏运行所需的结构（Uint8Array / Map）
export function deserializeGameState(data) {
  return {
    ...data,
    terrain: data.terrain ? new Uint8Array(data.terrain) : null,
    explored: (data.explored || []).map(e => new Uint8Array(e)),
    buildings: new Map(
      (data.buildings || []).map(b => [b.key, { type: b.type, owner: b.owner, hp: b.hp, lastHitBy: b.lastHitBy }])
    ),
  };
}
