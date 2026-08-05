// 相机 & 视口

export function centerViewOnPlayer(state) {
  const player = state.players[state.currentPlayer];
  if (player && player.alive) {
    state.viewCX = player.hqX;
    state.viewCY = player.hqY;
  }
}

export function centerViewOn(state, x, y) {
  state.viewCX = x;
  state.viewCY = y;
}
