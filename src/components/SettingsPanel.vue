<template>
  <div v-if="visible" class="settings-overlay" @click.self="close">
    <div class="settings-panel">
      <div class="panel-header">
        <span class="panel-title">快捷键设置</span>
        <span class="panel-close" @click="close">×</span>
      </div>
      <div class="panel-body">
        <div v-for="(label, action) in s.settings.labels" :key="action" class="bind-row">
          <span class="bind-label">{{ label }}</span>
          <button
            class="bind-key"
            :class="{ listening: listeningAction === action, conflict: getConflict(action) }"
            @click="startListening(action)"
          >
            {{ listeningAction === action ? '请按键...' : s.displayKey(s.settings.keybindings[action]) }}
          </button>
          <span v-if="getConflict(action)" class="conflict-warn">与「{{ getConflictLabel(action) }}」冲突</span>
        </div>
      </div>
      <div class="panel-footer">
        <button class="reset-btn" @click="resetDefaults">恢复默认</button>
        <button class="close-btn" @click="close">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useSettings } from '../composables/useSettings.js';

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['update:visible']);

const s = useSettings();
const listeningAction = ref(null);

function close() {
  listeningAction.value = null;
  emit('update:visible', false);
}

function startListening(action) {
  listeningAction.value = action;
}

function onKeydown(e) {
  if (!listeningAction.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    listeningAction.value = null;
    return;
  }

  if (s.isModifierKey(e.key)) {
    // 只按修饰键不设置
    return;
  }

  s.setBinding(listeningAction.value, e.key);
  listeningAction.value = null;
}

function getConflict(action) {
  const myKey = s.settings.keybindings[action];
  if (!myKey) return null;
  for (const [act, key] of Object.entries(s.settings.keybindings)) {
    if (act !== action && key.toLowerCase() === myKey.toLowerCase()) {
      return act;
    }
  }
  return null;
}

function getConflictLabel(action) {
  const conflictAction = getConflict(action);
  return conflictAction ? s.settings.labels[conflictAction] : '';
}

function resetDefaults() {
  s.resetBindings();
  listeningAction.value = null;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
});
</script>

<style scoped>
.settings-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
.settings-panel {
  background: #fafaf7; border: 1px solid #b03028;
  border-radius: 2px; width: 90%; max-width: 400px; max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.15);
  background: #f5f2ea;
}
.panel-title {
  font-family: 'Ma Shan Zheng', cursive; font-size: 20px;
  color: #0d0d0d; letter-spacing: 3px;
}
.panel-close {
  font-size: 24px; color: #666; cursor: pointer; line-height: 1;
  font-family: sans-serif; user-select: none;
}
.panel-close:hover { color: #0d0d0d; }
.panel-body {
  flex: 1; overflow-y: auto; padding: 8px 16px;
}
.bind-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px dotted rgba(0,0,0,0.1);
}
.bind-label {
  flex: 1; font-size: 13px; color: #333;
  font-family: 'Noto Serif SC', serif;
}
.bind-key {
  min-width: 80px; padding: 4px 10px;
  background: #fff; color: #0d0d0d;
  border: 1px solid #aaa; border-radius: 2px;
  font-size: 13px; cursor: pointer; text-align: center;
  font-family: 'Noto Serif SC', serif;
}
.bind-key:hover { border-color: #0d0d0d; }
.bind-key.listening {
  background: #fff3f0; border-color: #b03028; color: #b03028;
  animation: pulse 0.8s infinite;
}
.bind-key.conflict {
  background: #fff5e6; border-color: #e89b00; color: #b86e00;
}
.conflict-warn {
  font-size: 11px; color: #b86e00;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.panel-footer {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.15);
}
.reset-btn, .close-btn {
  flex: 1; padding: 8px 16px; border-radius: 2px; cursor: pointer;
  font-family: 'Noto Serif SC', serif; font-size: 14px; letter-spacing: 2px;
}
.reset-btn {
  background: #fff; color: #555; border: 1px solid #aaa;
}
.reset-btn:hover { background: #f0ede5; }
.close-btn {
  background: #0d0d0d; color: #fafaf7; border: 1px solid #0d0d0d;
}
.close-btn:hover { opacity: 0.85; }
</style>
