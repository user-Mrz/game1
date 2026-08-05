<template>
  <div class="hud">
    <span class="player" :style="{ color: game.hudPlayerColor.value }">{{ game.hudPlayerName.value }}</span>
    <span class="food">🌾 {{ game.hudFood.value }}</span>
    <span class="turn">回合 {{ game.hudTurn.value }}</span>
    <span>⚔ {{ game.hudUnits.value }}</span>
    <div class="zoom-group">
      <button class="zoom-btn" @click="game.zoomOut()" :title="`缩小 (${s.displayKey(s.settings.keybindings.zoomOut)})`">−</button>
      <span class="zoom-label">{{ Math.round(game.zoomFactor.value * 100) }}%</span>
      <button class="zoom-btn" @click="game.zoomIn()" :title="`放大 (${s.displayKey(s.settings.keybindings.zoomIn)})`">+</button>
      <button class="zoom-btn reset" @click="game.resetZoom()" :title="`重置缩放 (${s.displayKey(s.settings.keybindings.resetZoom)})`">⟲</button>
    </div>
    <div class="hud-btns">
      <button class="save-btn" @click="game.openSaveMenu('save')" :title="`快捷键: ${s.displayKey(s.settings.keybindings.build)} 建造 | ${s.displayKey(s.settings.keybindings.bigMap)} 大地图 | ${s.displayKey(s.settings.keybindings.endTurn)} 结束回合`">存/读</button>
      <button class="settings-btn" @click="s.settingsPanelVisible.value = true" title="快捷键设置">⚙</button>
      <button class="menu-btn" @click="game.returnToMenu()">主菜单</button>
    </div>
  </div>
</template>

<script setup>
import { useSettings } from '../composables/useSettings.js';
defineProps({ game: Object });
const s = useSettings();
</script>

<style scoped>
.hud {
  position: fixed; top: 0; left: 0; right: 0; height: 44px;
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(245,245,240,0.92));
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; z-index: 50; color: #0d0d0d; font-size: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.15); backdrop-filter: blur(4px);
}
.food { color: #333; font-weight: bold; }
.turn { color: #555; font-family: 'Noto Serif SC',serif; }
.player { font-weight: bold; font-size: 14px; font-family: 'Ma Shan Zheng',cursive; }
.save-btn {
  background: #0d0d0d; color: #fafaf7; border: none; border-radius: 2px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
  font-family: 'Noto Serif SC',serif; letter-spacing: 1px;
}
.save-btn:active { opacity: 0.75; }
.save-btn:disabled { opacity: 0.35; }
.hud-btns { display: flex; gap: 6px; flex-shrink: 0; }
.menu-btn {
  background: #fff; color: #b03028; border: 1px solid #b03028; border-radius: 2px;
  padding: 3px 9px; font-size: 12px; cursor: pointer;
  font-family: 'Noto Serif SC',serif; letter-spacing: 1px;
}
.menu-btn:active { opacity: 0.7; }
.settings-btn {
  background: #fff; color: #555; border: 1px solid #aaa; border-radius: 2px;
  padding: 3px 9px; font-size: 14px; cursor: pointer;
  font-family: sans-serif; line-height: 1;
}
.settings-btn:hover { color: #b03028; border-color: #b03028; }
.zoom-group {
  display: flex; align-items: center; gap: 4px;
  padding: 0 6px; border-left: 1px solid rgba(0,0,0,0.15); margin-left: 4px;
}
.zoom-btn {
  width: 24px; height: 24px; border-radius: 2px;
  background: #fff; color: #0d0d0d; border: 1px solid #aaa;
  font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-family: 'Noto Serif SC',serif; line-height: 1;
  padding: 0;
}
.zoom-btn:active { background: #e8e8e0; }
.zoom-btn.reset { font-size: 12px; }
.zoom-label {
  min-width: 36px; text-align: center; font-size: 11px; color: #555;
  font-family: 'Noto Serif SC',serif;
}
</style>
