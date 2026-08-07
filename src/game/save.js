// 存档序列化/反序列化
// 地形数据不再序列化到存档中，由后端 MapService 管理
// 加载存档时通过 mapApi 从后端获取地形

// 把运行中的游戏状态转成可 JSON 化的普通对象
export function serializeGameState(state) {
  return {
    version: 2,
    gameId: state.gameId,
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
    difficulty: state.difficulty || 'easy',
    // terrain 不再序列化，由后端 MapService 按 gameId 查找
    explored: state.explored.map(e => (e ? Array.from(e) : null)),
    buildings: Array.from(state.buildings.entries()).map(([k, v]) => ({
      key: k, type: v.type, owner: v.owner, hp: v.hp,
      ...(v.lastHitBy !== undefined ? { lastHitBy: v.lastHitBy } : {}),
    })),
    players: state.players.map(p => ({ ...p })),
    units: state.units.map(u => ({ ...u })),
  };
}

// 把存档数据还原为游戏运行所需的结构（Uint8Array / Map）
// 注意：terrain 需要异步从后端获取，此处不设置 terrain
export function deserializeGameState(data) {
  return {
    ...data,
    terrain: null, // 由调用方异步从后端获取
    explored: (data.explored || []).map(e => (e ? new Uint8Array(e) : null)),
    buildings: new Map(
      (data.buildings || []).map(b => [b.key, { type: b.type, owner: b.owner, hp: b.hp, lastHitBy: b.lastHitBy }])
    ),
    effects: [], // 反序列化后重置效果队列
  };
}
