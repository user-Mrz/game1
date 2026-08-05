// 存档后端 API 客户端

const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.message) msg = data.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const saveApi = {
  list: () => request('/saves'),
  get: (id) => request(`/saves/${id}`),
  create: (payload) => request('/saves', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/saves/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id) => request(`/saves/${id}`, { method: 'DELETE' }),
};
