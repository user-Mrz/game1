// 可拖拽信息卡：支持鼠标/触摸拖动，拖动后记住位置
import { ref, nextTick } from 'vue';

export function useDraggableCard() {
  const cardEl = ref(null);
  const x = ref(0);
  const y = ref(0);
  const dragging = ref(false);
  let initialized = false;
  let sx = 0, sy = 0, ox = 0, oy = 0;

  // 首次显示时摆到默认位置（屏幕居中偏下）
  function ensureInit() {
    if (initialized || !cardEl.value) return;
    const el = cardEl.value;
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 200;
    x.value = Math.max(8, Math.round((window.innerWidth - w) / 2));
    y.value = Math.max(8, window.innerHeight - h - 128);
    initialized = true;
  }

  function onDown(e) {
    ensureInit();
    dragging.value = true;
    sx = e.clientX;
    sy = e.clientY;
    ox = x.value;
    oy = y.value;
    e.preventDefault();
    if (cardEl.value && cardEl.value.setPointerCapture) {
      cardEl.value.setPointerCapture(e.pointerId);
    }
  }

  function onMove(e) {
    if (!dragging.value) return;
    const el = cardEl.value;
    const maxX = window.innerWidth - (el ? el.offsetWidth : 100);
    const maxY = window.innerHeight - (el ? el.offsetHeight : 60);
    x.value = Math.max(0, Math.min(maxX, ox + (e.clientX - sx)));
    y.value = Math.max(0, Math.min(maxY, oy + (e.clientY - sy)));
  }

  function onUp(e) {
    dragging.value = false;
    if (cardEl.value && cardEl.value.releasePointerCapture) {
      cardEl.value.releasePointerCapture(e.pointerId);
    }
  }

  // 内容显示后初始化默认位置
  async function initWhenVisible(visible) {
    if (!visible) return;
    await nextTick();
    ensureInit();
  }

  return { cardEl, x, y, dragging, initWhenVisible, onDown, onMove, onUp };
}
