// 地图地形 API 客户端
// 地形数据存储在后端，前端通过此 API 获取/上传地形

// base64 → Uint8Array
function base64ToUint8Array(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Uint8Array → base64
function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function postJson(path, body, timeoutMs = 10000) {
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

async function getJson(path, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const mapApi = {
  /**
   * 生成新地图（后端生成并存储地形）
   * @returns {Promise<{gameId, width, height, terrain: Uint8Array}>}
   */
  async generate(gameId, width, height, seed) {
    const data = await postJson('/api/map/generate', {
      gameId,
      width,
      height,
      seed: seed || Date.now(),
    });
    return {
      gameId: data.gameId,
      width: data.width,
      height: data.height,
      terrain: base64ToUint8Array(data.terrain),
    };
  },

  /**
   * 从后端获取地形
   * @returns {Promise<{gameId, width, height, terrain: Uint8Array} | null>}
   */
  async get(gameId) {
    try {
      const data = await getJson(`/api/map/${gameId}`);
      return {
        gameId: data.gameId,
        width: data.width,
        height: data.height,
        terrain: base64ToUint8Array(data.terrain),
      };
    } catch {
      return null;
    }
  },

  /**
   * 上传地形到后端（用于旧存档加载）
   */
  async upload(gameId, width, height, terrain) {
    await postJson(`/api/map/${gameId}/upload`, {
      width,
      height,
      terrain: bytesToBase64(terrain),
    });
  },

  /**
   * 检查地形是否已存在于后端
   */
  async exists(gameId) {
    try {
      const data = await getJson(`/api/map/${gameId}/exists`);
      return data.exists === true;
    } catch {
      return false;
    }
  },
};
