<template>
  <div v-if="game.saveMenuVisible.value" class="save-overlay" @click.self="game.closeSaveMenu()">
    <div class="save-menu">
      <div class="title">存 档 · 读 档</div>

      <div class="tabs">
        <button :class="{ active: game.saveMenuMode.value === 'save' }" @click="game.switchSaveMode('save')">存档</button>
        <button :class="{ active: game.saveMenuMode.value === 'load' }" @click="game.switchSaveMode('load')">读档</button>
      </div>

      <div class="msg" v-if="game.saveMsg.value">{{ game.saveMsg.value }}</div>
      <div class="msg" v-else-if="game.saveBusy.value">处理中...</div>

      <div class="save-actions" v-if="game.saveMenuMode.value === 'save' && game.phase.value === 'playing'">
        <button class="primary" @click="game.saveCurrentGame()" :disabled="game.saveBusy.value">保存当前进度</button>
      </div>

      <div class="save-list">
        <div v-if="game.saveList.value.length === 0" class="empty">暂无存档</div>
        <div v-for="s in game.saveList.value" :key="s.id" class="save-item">
          <div class="meta">
            <div class="name">{{ s.slotName }}</div>
            <div class="sub">地图{{ s.mapSize }}×{{ s.mapSize }} · 第{{ s.turn }}回合 · {{ fmtTime(s.updatedAt) }}</div>
          </div>
          <button class="load" @click="game.loadSave(s.id)" :disabled="game.saveBusy.value">读取</button>
          <button class="del" @click="game.deleteSave(s.id)" :disabled="game.saveBusy.value">删除</button>
        </div>
      </div>

      <button class="close" @click="game.closeSaveMenu()">关 闭</button>
    </div>
  </div>
</template>

<script setup>
defineProps({ game: Object });

function fmtTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}
</script>

<style scoped>
.save-overlay {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}
.save-menu {
  width: min(88vw, 360px); max-height: 80vh;
  background: #fafaf7; border: 1px solid rgba(0,0,0,0.4);
  border-radius: 2px; padding: 14px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.45);
  display: flex; flex-direction: column; overflow: hidden;
}
.title {
  color: #0d0d0d; font-size: 17px; text-align: center;
  font-family: 'Ma Shan Zheng',cursive; letter-spacing: 4px;
  border-bottom: 1px dotted rgba(0,0,0,0.25); padding-bottom: 8px;
}
.tabs { display: flex; gap: 8px; margin: 10px 0 4px; }
.tabs button {
  flex: 1; padding: 7px 0; border-radius: 2px; cursor: pointer;
  background: #fff; color: #555; border: 1px solid #bbb;
  font-family: 'Noto Serif SC',serif; font-size: 13px;
}
.tabs button.active { background: #0d0d0d; color: #fafaf7; border-color: #0d0d0d; }
.msg {
  color: #8a2a2a; font-size: 12px; min-height: 18px; padding: 2px 0; text-align: center;
  font-family: 'Noto Serif SC',serif;
}
.save-actions { margin: 6px 0; }
.save-actions .primary {
  width: 100%; padding: 10px 0; cursor: pointer;
  background: #0d0d0d; color: #fafaf7; border: none; border-radius: 2px;
  font-family: 'Ma Shan Zheng',cursive; font-size: 15px; letter-spacing: 3px;
}
.save-list {
  flex: 1; overflow-y: auto; margin: 6px 0;
  border-top: 1px solid rgba(0,0,0,0.1);
}
.empty { color: #888; text-align: center; padding: 22px 0; font-size: 13px; }
.save-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 2px; border-bottom: 1px solid rgba(0,0,0,0.08);
}
.save-item .meta { flex: 1; min-width: 0; }
.save-item .name {
  color: #0d0d0d; font-size: 13px; font-weight: bold;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: 'Noto Serif SC',serif;
}
.save-item .sub { color: #777; font-size: 11px; margin-top: 2px; }
.save-item button {
  padding: 5px 8px; border-radius: 2px; cursor: pointer; font-size: 12px;
  background: #fff; border: 1px solid #aaa; color: #0d0d0d;
  font-family: 'Noto Serif SC',serif;
}
.save-item .load { background: #0d0d0d; color: #fafaf7; border-color: #0d0d0d; }
.save-item .del { color: #8a2a2a; border-color: #c99; }
.save-item button:disabled { opacity: 0.35; cursor: default; }
.close {
  margin-top: 8px; padding: 8px 0; cursor: pointer;
  background: #fff; color: #0d0d0d; border: 1px solid #999; border-radius: 2px;
  font-family: 'Ma Shan Zheng',cursive; font-size: 14px; letter-spacing: 3px;
}
</style>
