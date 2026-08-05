import { reactive, ref, watch } from 'vue';

const STORAGE_KEY = 'binglin_settings_keybindings';

const DEFAULT_BINDINGS = {
  endTurn: 'e',
  build: 'u',
  bigMap: 'm',
  zoomIn: '+',
  zoomOut: '-',
  resetZoom: '0',
  moveUp: 'ArrowUp',
  moveDown: 'ArrowDown',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
};

const ACTION_LABELS = {
  endTurn: '结束回合',
  build: '建造菜单',
  bigMap: '大地图',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetZoom: '重置缩放',
  moveUp: '视角上移',
  moveDown: '视角下移',
  moveLeft: '视角左移',
  moveRight: '视角右移',
};

// 全局单例 — 允许跨组件共享设置面板可见性
const settingsPanelVisible = ref(false);

const settings = reactive({
  keybindings: { ...DEFAULT_BINDINGS },
  labels: { ...ACTION_LABELS },
});

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        Object.assign(settings.keybindings, DEFAULT_BINDINGS, parsed);
      }
    }
  } catch (e) {}
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.keybindings));
  } catch (e) {}
}

watch(
  () => ({ ...settings.keybindings }),
  () => saveSettings(),
  { deep: true }
);

loadSettings();

export function useSettings() {
  function setBinding(action, key) {
    const normalized = normalizeKey(key);
    // 冲突检测：如果其他动作已使用该键，自动交换
    for (const [act, k] of Object.entries(settings.keybindings)) {
      if (act !== action && k.toLowerCase() === normalized) {
        // 被占用，直接覆盖（简化处理）
      }
    }
    settings.keybindings[action] = normalized;
  }

  function resetBindings() {
    Object.assign(settings.keybindings, DEFAULT_BINDINGS);
  }

  function getKeyForAction(action) {
    return settings.keybindings[action];
  }

  function getActionForKey(key) {
    const normalized = normalizeKey(key);
    for (const [action, k] of Object.entries(settings.keybindings)) {
      if (k.toLowerCase() === normalized) return action;
    }
    return null;
  }

  function isModifierKey(key) {
    return ['Control', 'Shift', 'Alt', 'Meta'].includes(key);
  }

  function normalizeKey(key) {
    // 特殊键保持原样，字母数字转小写
    if (key.length === 1) return key.toLowerCase();
    return key;
  }

  function displayKey(key) {
    if (!key) return '';
    const map = {
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Escape: 'Esc', Control: 'Ctrl', Meta: '⌘',
      '+': '+', '-': '-', '0': '0',
    };
    return map[key] || (key.length === 1 ? key.toUpperCase() : key);
  }

  return {
    settings,
    settingsPanelVisible,
    setBinding,
    resetBindings,
    getKeyForAction,
    getActionForKey,
    isModifierKey,
    normalizeKey,
    displayKey,
  };
}
