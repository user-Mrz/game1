<template>
  <div class="bottom-panel">
    <div class="unit-info" v-html="formatInfo(game.actionMsg.value || game.unitInfoText.value)"></div>
    <div class="action-btns" v-if="!game.isPlacing.value">
      <button class="primary" :disabled="game.btnEndTurnDisabled.value" @click="game.playerEndTurn()">
        {{ game.isHumanTurn.value ? '结束回合' : '等待中' }}
      </button>
      <button :disabled="game.btnBuildDisabled.value" @click="game.showBuildMenu()">建造</button>
      <button :disabled="game.btnProduceDisabled.value" @click="game.showProduceMenu()">生产兵种</button>
      <button :disabled="game.btnDemolishDisabled.value" @click="game.showDemolishMenu()">拆除建筑</button>
      <button :disabled="game.btnSkipDisabled.value" @click="game.skipUnit()">跳过单位</button>
    </div>
    <div class="action-btns" v-else>
      <button class="danger" @click="game.cancelPlacement()">取消建造</button>
    </div>
  </div>
</template>

<script setup>
defineProps({ game: Object });

function formatInfo(text) {
  if (!text) return '';
  return text.replace(
    /^(.*?)(兵力|粮草|移动|攻击|HP|所属)/,
    '<span class="name">$1</span>$2'
  );
}
</script>

<style scoped>
.bottom-panel {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: linear-gradient(0deg, rgba(255,255,255,0.96), rgba(248,248,243,0.93));
  z-index: 50; padding: 10px; border-top: 1px solid rgba(0,0,0,0.15); backdrop-filter: blur(4px);
}
.unit-info {
  color: #2a2a2a; font-size: 11px; min-height: 34px; padding: 4px 0;
  font-family: 'Noto Serif SC',serif; line-height: 1.5;
}
.unit-info :deep(.name) { color: #0d0d0d; font-size: 15px; font-weight: bold; font-family: 'Ma Shan Zheng',cursive; }
.action-btns { display: flex; gap: 6px; flex-wrap: wrap; }
button {
  flex: 1; min-width: 50px; padding: 8px 4px; border-radius: 2px;
  border: 1px solid #888; background: #fff; color: #0d0d0d;
  font-size: 11px; cursor: pointer; white-space: nowrap;
  font-family: 'Noto Serif SC','SimSun',serif;
}
button:active { background: #e8e8e0; }
button.primary {
  background: #0d0d0d; color: #fafaf7; border-color: #0d0d0d; font-weight: bold;
}
button.danger {
  background: #e8e0e0; color: #0d0d0d; border-color: #888;
}
button:disabled { opacity: 0.25; }
</style>
