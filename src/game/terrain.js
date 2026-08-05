// 地形生成

import { TERRAIN } from './config.js';

export function generateTerrain(w, h) {
  const t = new Uint8Array(w * h);
  const seeds = [];
  for (let i = 0; i < 12; i++) {
    seeds.push({ x: Math.random() * w | 0, y: Math.random() * h | 0, r: (w * 0.08 + Math.random() * w * 0.15) | 0 });
  }

  for (let i = 0; i < t.length; i++) t[i] = TERRAIN.PLAIN;

  // 山脉群
  for (const s of seeds.slice(0, 5)) {
    for (let dy = -s.r; dy <= s.r; dy++) {
      for (let dx = -s.r; dx <= s.r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (dx * dx + dy * dy < s.r * s.r * (0.4 + Math.random() * 0.6)) {
          t[y * w + x] = Math.random() < 0.85 ? TERRAIN.MOUNTAIN : TERRAIN.FOREST;
        }
      }
    }
  }

  // 河流
  for (let r = 0; r < 3; r++) {
    let rx = Math.random() * w | 0, ry = Math.random() * h | 0;
    const len = (w + h) * 0.3 + Math.random() * (w + h) * 0.4;
    for (let i = 0; i < len; i++) {
      if (rx >= 0 && ry >= 0 && rx < w && ry < h) {
        if (t[ry * w + rx] !== TERRAIN.MOUNTAIN) t[ry * w + rx] = TERRAIN.RIVER;
        for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = rx + dx2, ny = ry + dy2;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && t[ny * w + nx] !== TERRAIN.MOUNTAIN && Math.random() < 0.3)
            t[ny * w + nx] = TERRAIN.RIVER;
        }
      }
      rx += Math.random() < 0.5 ? (Math.random() < 0.5 ? 1 : -1) : 0;
      ry += Math.random() < 0.5 ? (Math.random() < 0.5 ? 1 : -1) : 0;
    }
  }

  // 森林
  for (const s of seeds.slice(5, 9)) {
    for (let dy = -s.r; dy <= s.r; dy++) {
      for (let dx = -s.r; dx <= s.r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (dx * dx + dy * dy < s.r * s.r * 0.5 && t[y * w + x] === TERRAIN.PLAIN)
          t[y * w + x] = TERRAIN.FOREST;
      }
    }
  }

  // 沃土
  for (const s of seeds.slice(9)) {
    for (let dy = -s.r / 2; dy <= s.r / 2; dy++) {
      for (let dx = -s.r / 2; dx <= s.r / 2; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (t[y * w + x] === TERRAIN.PLAIN && Math.random() < 0.5)
          t[y * w + x] = TERRAIN.FERTILE;
      }
    }
  }

  return t;
}
