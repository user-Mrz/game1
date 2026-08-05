// Canvas 渲染系统 — 黑白水墨画风

import { TERRAIN, TERRAIN_COLORS, UNIT_TYPES, BUILDING_TYPES, PLAYER_COLORS } from './config.js';
import { isVisibleToPlayer, isUnitVisibleToPlayer } from './vision.js';
import { getReachableTiles } from './movement.js';
import { canAttack } from './combat.js';
import { getUnitById } from './units.js';
import { updateTileSize, worldToScreen, clamp, getTerrain, getBuilding } from './utils.js';

// 黑白调色盘
const INK = {
  BLACK:   '#0d0d0d',
  DARK:    '#2a2a2a',
  MID:     '#555555',
  GRAY:    '#888888',
  LIGHT:   '#b0b0b0',
  PAPER:   '#fafaf7',
  SHADOW:  '#e8e4dc',
};

export function render(state, canvas, minimapCanvas) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  updateTileSize(state, w, h);
  const ts = state.tileSize;

  if (state.phase === 'menu') {
    ctx.fillStyle = INK.PAPER;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // 清屏 — 全黑（未探索区域）
  ctx.fillStyle = INK.BLACK;
  ctx.fillRect(0, 0, w, h);

  const humanPlayer = state.players.find(p => p.isHuman && p.alive);
  const viewPlayer = humanPlayer || state.players[state.currentPlayer];
  const viewIdx = viewPlayer ? viewPlayer.index : state.currentPlayer;

  // 可见范围
  const tilesX = Math.ceil(w / ts) + 2;
  const tilesY = Math.ceil((h - 44 - 120) / ts) + 2;
  const startX = Math.floor(state.viewCX - tilesX / 2);
  const startY = Math.floor(state.viewCY - tilesY / 2);

  for (let ty = startY; ty <= startY + tilesY; ty++) {
    for (let tx = startX; tx <= startX + tilesX; tx++) {
      if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) continue;
      const s = worldToScreen(state, tx, ty, w, h);
      const sx = s.x - ts / 2;
      const sy = s.y - ts / 2;
      if (sx > w || sy > h || sx + ts < 0 || sy < 0) continue;

      const explored = state.explored[viewIdx] ? state.explored[viewIdx][ty * state.mapW + tx] : 0;
      const visible = isVisibleToPlayer(state, tx, ty, viewIdx);
      // 未探索：纯黑 + 极暗网格线，不渲染地形/建筑/单位内容
      if (!explored && !visible) {
        ctx.strokeStyle = 'rgba(176,48,40,0.45)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, ts, ts);
        continue;
      }

      const terrain = getTerrain(state, tx, ty);

      // 已探索但当前不可见：暗淡处理
      if (!visible) {
        ctx.fillStyle = INK.DARK;
        ctx.fillRect(sx, sy, ts, ts);
        // 极暗网格
        ctx.strokeStyle = 'rgba(176,48,40,0.18)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, ts, ts);

        // 已探索建筑仍显示（主营）
        const building = getBuilding(state, tx, ty);
        if (building && explored && building.type === 'hq') {
          drawBuildingGhost(ctx, sx, sy, ts, building);
        }
        continue;
      }

      // === 可见区域：黑白水墨渲染 ===
      ctx.fillStyle = TERRAIN_COLORS[terrain];
      ctx.fillRect(sx, sy, ts, ts);

      // 地形水墨纹理
      drawTerrainInk(ctx, sx, sy, ts, terrain);

      // 网格线 — 朱砂红线
      ctx.strokeStyle = 'rgba(176,48,40,0.16)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx, sy, ts, ts);

      // 建筑
      const building = getBuilding(state, tx, ty);
      if (building) {
        drawBuilding(ctx, sx, sy, ts, building, visible);
      }
    }
  }

  // 单位
  const visibleUnits = state.units.filter(u => {
    if (!state.explored[viewIdx]) return false;
    if (!state.explored[viewIdx][u.y * state.mapW + u.x] && !isVisibleToPlayer(state, u.y, u.x, viewIdx)) return false;
    if (!isUnitVisibleToPlayer(state, u, viewIdx)) return false;
    return true;
  });

  visibleUnits.sort((a, b) => {
    if (a.owner === viewIdx && b.owner !== viewIdx) return 1;
    if (a.owner !== viewIdx && b.owner === viewIdx) return -1;
    return 0;
  });

  for (const u of visibleUnits) {
    const s = worldToScreen(state, u.x, u.y, w, h);
    drawUnit(ctx, s.x, s.y, ts, u, viewIdx);
  }

  // 选中单位高亮
  if (state.selectedUnitId) {
    const sel = getUnitById(state, state.selectedUnitId);
    if (sel) {
      // 可到达区域 — 淡墨晕染
      const reachable = getReachableTiles(state, sel, sel.owner);
      for (const [rk] of reachable) {
        if (rk === `${sel.x},${sel.y}`) continue;
        const [rx, ry] = rk.split(',').map(Number);
        const s = worldToScreen(state, rx, ry, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.strokeRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
        ctx.setLineDash([]);
      }

      // 可攻击目标 — 浓墨虚线
      const cfg = UNIT_TYPES[sel.type];
      if (!sel.attacked && cfg.atkRange > 0) {
        for (const enemy of state.units) {
          if (!canAttack(state, sel, enemy)) continue;
          if (!isUnitVisibleToPlayer(state, enemy, viewIdx)) continue;
          const s = worldToScreen(state, enemy.x, enemy.y, w, h);
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 3]);
          ctx.strokeRect(s.x - ts / 2 - 2, s.y - ts / 2 - 2, ts + 4, ts + 4);
          ctx.setLineDash([]);
          // 攻击目标标记 "✕"
          ctx.fillStyle = INK.BLACK;
          ctx.font = `${Math.floor(ts * 0.5)}px "Ma Shan Zheng",cursive`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('伐', s.x, s.y - ts * 0.55);
        }
      }
    }
  }

  // 选中建筑高亮 — 浓墨双线
  if (state.selectedBuilding) {
    const [bx, by] = [state.selectedBuilding.x, state.selectedBuilding.y];
    const s = worldToScreen(state, bx, by, w, h);
    ctx.strokeStyle = INK.BLACK;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
    ctx.setLineDash([]);
  }

  // 操作提示 — 水墨横幅
  if (state.actionMsg) {
    ctx.fillStyle = 'rgba(250,250,247,0.94)';
    ctx.fillRect(0, h - 128, w, 26);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h - 128);
    ctx.lineTo(w, h - 128);
    ctx.stroke();
    ctx.fillStyle = INK.BLACK;
    ctx.font = '13px "Noto Serif SC","ZCOOL XiaoWei",serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.actionMsg, w / 2, h - 112);
  }

  // 放置模式高亮 — 可建造的平原/沃土
  if (state.pendingBuildType && viewIdx === (humanPlayer?.index ?? -1)) {
    const cfg = BUILDING_TYPES[state.pendingBuildType];
    for (let ty = startY; ty <= startY + tilesY; ty++) {
      for (let tx = startX; tx <= startX + tilesX; tx++) {
        if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) continue;
        const explored = state.explored[viewIdx] ? state.explored[viewIdx][ty * state.mapW + tx] : 0;
        const visible = isVisibleToPlayer(state, tx, ty, viewIdx);
        if (!explored && !visible) continue;
        // 检查是否可建造
        const t = getTerrain(state, tx, ty);
        if (t !== TERRAIN.PLAIN && t !== TERRAIN.FERTILE) continue;
        if (getBuilding(state, tx, ty)) continue;
        if (state.units.some(u => u.x === tx && u.y === ty)) continue;
        const s = worldToScreen(state, tx, ty, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
        ctx.setLineDash([]);
      }
    }
    // 建造中提示
    if (cfg) {
      ctx.fillStyle = 'rgba(250,250,247,0.92)';
      ctx.fillRect(0, h - 128, w, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, h - 128); ctx.lineTo(w, h - 128); ctx.stroke();
      ctx.fillStyle = INK.BLACK;
      ctx.font = '13px "Noto Serif SC","ZCOOL XiaoWei",serif';
      ctx.textAlign = 'center';
      ctx.fillText(`放置${cfg.name} — 🌾${cfg.buildCost} — 点虚线格放置 · Esc取消`, w / 2, h - 112);
    }
  }

  // 小地图
  drawMinimap(state, minimapCanvas);
}

// ========== 地形水墨纹理 ==========
function drawTerrainInk(ctx, sx, sy, ts, terrain) {
  const cx = sx + ts / 2, cy = sy + ts / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (terrain === TERRAIN.MOUNTAIN) {
    // 山：三叠墨峰
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const r = ts * 0.32;
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy + r * 0.2, r * 0.7, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy + r * 0.2, r * 0.55, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r * 0.5, 0, Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = `bold ${Math.floor(ts * 0.45)}px "Ma Shan Zheng",cursive`;
    ctx.fillText('山', cx, cy + ts * 0.05);
  } else if (terrain === TERRAIN.FOREST) {
    // 林：墨点树丛
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const pts = [[-0.25,-0.15],[0.2,-0.2],[-0.1,0.2],[0.25,0.1],[0,0]];
    for (const [dx, dy] of pts) {
      ctx.beginPath(); ctx.arc(cx + dx * ts, cy + dy * ts, ts * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = `bold ${Math.floor(ts * 0.45)}px "Ma Shan Zheng",cursive`;
    ctx.fillText('林', cx, cy + ts * 0.05);
  } else if (terrain === TERRAIN.RIVER) {
    // 川：波浪墨线
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(sx + 2, cy + i * ts * 0.2);
      ctx.quadraticCurveTo(cx, cy + i * ts * 0.35, sx + ts - 2, cy + i * ts * 0.2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = `bold ${Math.floor(ts * 0.45)}px "Ma Shan Zheng",cursive`;
    ctx.fillText('川', cx, cy + ts * 0.05);
  } else if (terrain === TERRAIN.FERTILE) {
    // 田：方格交叉
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx, sy + 3); ctx.lineTo(cx, sy + ts - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 3, cy); ctx.lineTo(sx + ts - 3, cy); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = `bold ${Math.floor(ts * 0.45)}px "Ma Shan Zheng",cursive`;
    ctx.fillText('田', cx, cy + ts * 0.05);
  }
  // 平原：无纹理，留白
}

// ========== 建筑绘制 — 黑白水墨印章 ==========
function drawBuildingGhost(ctx, sx, sy, ts, b) {
  // 已探索不可见区域的建筑残影
  ctx.globalAlpha = 0.25;
  const icon = getBuildingIcon(b.type);
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.floor(ts * 0.4)}px "Ma Shan Zheng",cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, sx + ts / 2, sy + ts / 2);
  ctx.globalAlpha = 1;
}

function drawBuilding(ctx, sx, sy, ts, b, visible) {
  const icon = getBuildingIcon(b.type);
  const cx = sx + ts / 2, cy = sy + ts / 2;
  const r = ts * 0.42;

  // 圆形底色 — 归属者墨色
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const ownerColor = PLAYER_COLORS[b.owner];
  ctx.fillStyle = rgbaFromHex(ownerColor, b.owner === 0 ? 0.12 : 0.18);
  ctx.fill();
  ctx.strokeStyle = rgbaFromHex(ownerColor, 0.45);
  ctx.lineWidth = b.owner === 0 ? 1.5 : 1;
  ctx.stroke();

  // 建筑汉字
  ctx.fillStyle = INK.BLACK;
  ctx.font = `bold ${Math.floor(ts * 0.48)}px "Ma Shan Zheng","ZCOOL XiaoWei","STKaiti","KaiTi",cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, cx, cy - ts * 0.02);

  // HP条 — 浓淡三段式
  const bCfg = BUILDING_TYPES[b.type];
  if (bCfg && bCfg.hp > 0 && b.hp < bCfg.hp) {
    const hpPct = b.hp / bCfg.hp;
    const barW = ts * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(sx + ts * 0.1, sy + ts - 6, barW, 3);
    ctx.fillStyle = hpPct > 0.5 ? 'rgba(0,0,0,0.5)' : hpPct > 0.25 ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.8)';
    ctx.fillRect(sx + ts * 0.1, sy + ts - 6, barW * hpPct, 3);
    // HP条墨线边框
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx + ts * 0.1, sy + ts - 6, barW, 3);
  }
}

function getBuildingIcon(type) {
  const icons = {
    hq: '帅', farm: '粮', infantry_barracks: '步营', archer_barracks: '弓营',
    lc_barracks: '骑营', hc_barracks: '重营', supply_barracks: '补营',
    arrow_tower: '塔', wall: '墙', watchtower: '哨', granary: '仓'
  };
  return icons[type] || '□';
}

// ========== 单位绘制 — 黑白印章 ==========
function drawUnit(ctx, cx, cy, ts, u, viewIdx) {
  const color = PLAYER_COLORS[u.owner];
  const icons = { light_cavalry: '骑', infantry: '步', archer: '弓', heavy_cavalry: '重', supply: '补' };
  const r = ts * 0.4;
  const isOwn = u.owner === viewIdx;

  // 墨色晕染阴影
  ctx.beginPath();
  ctx.arc(cx + 1, cy + 1, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fill();

  // 底色 — 白底黑边印章
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (isOwn) {
    ctx.fillStyle = INK.PAPER;
  } else {
    ctx.fillStyle = rgbaFromHex(color, 0.15);
  }
  ctx.fill();

  // 边框 — 浓淡区分敌我
  ctx.strokeStyle = isOwn ? INK.BLACK : rgbaFromHex(color, 0.6);
  ctx.lineWidth = isOwn ? 2.5 : 1.5;
  ctx.stroke();

  // 内圈 — 己方双圈
  if (isOwn) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 行动过标记 — 半墨遮盖
  if (u.moved && u.attacked) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
  }

  // 兵种汉字 — 浓墨
  ctx.fillStyle = INK.BLACK;
  ctx.font = `bold ${Math.floor(ts * 0.48)}px "Ma Shan Zheng","ZCOOL XiaoWei","STKaiti","KaiTi",cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icons[u.type] || '?', cx, cy - ts * 0.05);

  // 兵力 — 小字
  ctx.fillStyle = INK.BLACK;
  ctx.font = `bold ${Math.floor(ts * 0.26)}px "Noto Serif SC","SimSun",serif`;
  ctx.fillText(u.troops, cx, cy + ts * 0.32);
}

// ========== 小地图 ==========
function drawMinimap(state, mc) {
  if (!mc) return;
  drawMapOverlay(state, mc, 80, 80, true);
}

// ========== 通用地图总览 — 黑白版 ==========
export function drawMapOverlay(state, canvas, cw, ch, isMini = false) {
  if (!canvas) return;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const scaleX = cw / state.mapW, scaleY = ch / state.mapH;
  const viewIdx = state.players.find(p => p.isHuman && p.alive)?.index ?? state.currentPlayer;

  // 底色 — 全黑（未探索）
  ctx.fillStyle = INK.BLACK;
  ctx.fillRect(0, 0, cw, ch);

  // 地形 — 只绘制已探索区域
  const step = isMini
    ? Math.max(2, Math.floor(state.mapW / cw) * 2)
    : Math.max(1, Math.floor(state.mapW / cw));
  for (let y = 0; y < state.mapH; y += step) {
    for (let x = 0; x < state.mapW; x += step) {
      // 检查是否已探索或可见
      const explored = state.explored[viewIdx] ? state.explored[viewIdx][y * state.mapW + x] : 0;
      const visible = isVisibleToPlayer(state, x, y, viewIdx);
      if (!explored && !visible) continue; // 未探索→留黑

      const t = getTerrain(state, x, y);
      ctx.fillStyle = visible ? TERRAIN_COLORS[t] : INK.DARK;
      ctx.fillRect(
        Math.floor(x * scaleX), Math.floor(y * scaleY),
        Math.ceil(scaleX * step) + 1, Math.ceil(scaleY * step) + 1
      );
    }
  }

  // 可见区域精确标注 — 与主地图视野规则一致（单位/建筑3×3，哨塔曼哈顿3格）
  // 地形抽样会漏掉小视野区域，这里按真实规则补全可见范围
  ctx.fillStyle = isMini ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)';
  for (const u of state.units) {
    if (u.owner !== viewIdx) continue;
    ctx.fillRect((u.x - 1) * scaleX, (u.y - 1) * scaleY, scaleX * 3 + 0.5, scaleY * 3 + 0.5);
  }
  for (const [bkey, b] of state.buildings) {
    if (b.owner !== viewIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    if (b.type === 'watchtower') {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 3) {
            ctx.fillRect((bx + dx) * scaleX, (by + dy) * scaleY, scaleX + 0.5, scaleY + 0.5);
          }
        }
      }
    } else {
      ctx.fillRect((bx - 1) * scaleX, (by - 1) * scaleY, scaleX * 3 + 0.5, scaleY * 3 + 0.5);
    }
  }

  // 网格线（仅大地图）
  if (!isMini && cw > 200) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= state.mapW; x += Math.ceil(state.mapW / 20)) {
      ctx.beginPath(); ctx.moveTo(x * scaleX, 0); ctx.lineTo(x * scaleX, ch); ctx.stroke();
    }
    for (let y = 0; y <= state.mapH; y += Math.ceil(state.mapH / 20)) {
      ctx.beginPath(); ctx.moveTo(0, y * scaleY); ctx.lineTo(cw, y * scaleY); ctx.stroke();
    }
  }

  // 建筑标注
  const buildingSizes = isMini ? { hq: 5, watchtower: 3 } : { hq: 10, watchtower: 7 };
  for (const [bkey, b] of state.buildings) {
    if (b.type === 'hq' || b.type === 'watchtower') {
      const [bx, by] = bkey.split(',').map(Number);
      // 只显示已探索区域的建筑
      const bexp = state.explored[viewIdx]?.[by * state.mapW + bx];
      if (!bexp && !isVisibleToPlayer(state, bx, by, viewIdx)) continue;
      const bs = buildingSizes[b.type] || 3;
      ctx.fillStyle = PLAYER_COLORS[b.owner];
      ctx.fillRect(bx * scaleX - bs / 2, by * scaleY - bs / 2, bs, bs);

      if (!isMini && b.type === 'hq') {
        ctx.fillStyle = INK.BLACK;
        ctx.font = `bold ${Math.max(9, cw / 35)}px "Noto Serif SC","SimSun",serif`;
        ctx.textAlign = 'center';
        ctx.fillText(state.players[b.owner]?.name || '?', bx * scaleX, by * scaleY - bs);
      }
    }
  }

  // 己方可见单位
  const dotSize = isMini ? 2 : Math.max(3, cw / 120);
  for (const u of state.units) {
    if (!isUnitVisibleToPlayer(state, u, viewIdx) && u.owner !== viewIdx) continue;
    ctx.fillStyle = PLAYER_COLORS[u.owner];
    ctx.fillRect(u.x * scaleX - dotSize / 2, u.y * scaleY - dotSize / 2, dotSize, dotSize);

    if (!isMini && u.owner === viewIdx) {
      const icons = { light_cavalry: '骑', infantry: '步', archer: '弓', heavy_cavalry: '重', supply: '补' };
      ctx.fillStyle = PLAYER_COLORS[u.owner];
      ctx.font = `${Math.max(8, cw / 40)}px "Noto Serif SC",serif`;
      ctx.textAlign = 'left';
      ctx.fillText(icons[u.type] || '?', u.x * scaleX + dotSize, u.y * scaleY + dotSize);
    }
  }

  // 视口框
  const { w, h } = { w: window.innerWidth, h: window.innerHeight };
  const availH = h - 44 - 120;
  const ts = state.tileSize;
  const vwPx = Math.min(cw, (w / ts) / state.mapW * cw);
  const vhPx = Math.min(ch, (availH / ts) / state.mapH * ch);
  const vx = clamp((state.viewCX / state.mapW) * cw - vwPx / 2, 0, cw - vwPx);
  const vy = clamp((state.viewCY / state.mapH) * ch - vhPx / 2, 0, ch - vhPx);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(vx + 1, vy + 1, vwPx, vhPx);
  ctx.strokeStyle = '#b03028';
  ctx.lineWidth = isMini ? 1 : 2;
  ctx.strokeRect(vx, vy, vwPx, vhPx);

  // 视口四角（仅大地图）
  if (!isMini) {
    const cl = 8;
    ctx.strokeStyle = '#b03028';
    ctx.lineWidth = 2;
    [[vx, vy, 1, 1], [vx + vwPx, vy, -1, 1], [vx, vy + vhPx, 1, -1], [vx + vwPx, vy + vhPx, -1, -1]]
      .forEach(([cx2, cy2, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx2, cy2 + dy * cl);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2 + dx * cl, cy2);
        ctx.stroke();
      });
  }

  // 外框
  ctx.strokeStyle = isMini ? 'rgba(176,48,40,0.6)' : '#b03028';
  ctx.lineWidth = isMini ? 1 : 2;
  ctx.strokeRect(0, 0, cw, ch);
}

// ========== 辅助 ==========
function rgbaFromHex(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mapClickToWorld(state, canvas, clientX, clientY, cw, ch) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = ((clientX - rect.left) / cw) * state.mapW;
  const my = ((clientY - rect.top) / ch) * state.mapH;
  return { x: Math.round(mx), y: Math.round(my) };
}
