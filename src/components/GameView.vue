<template>
  <div class="game-view">
    <!-- 主游戏画布 -->
    <canvas
      ref="gameCanvasEl"
      class="game-canvas"
      @pointerdown.prevent="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
    ></canvas>

    <!-- 小地图 -->
    <canvas
      ref="minimapCanvasEl"
      class="minimap-canvas"
      @click.stop="game.onMinimapClick"
      title="点击展开大地图"
    ></canvas>

    <!-- 大地图覆盖层 -->
    <div v-if="game.bigMapVisible.value" class="bigmap-overlay" @click.self="game.closeBigMap()">
      <div class="bigmap-container" :style="{ width: game.bigMapW.value + 'px', height: game.bigMapH.value + 'px' }">
        <canvas
          ref="bigMapCanvasEl"
          :width="game.bigMapW.value"
          :height="game.bigMapH.value"
          class="bigmap-canvas"
          @click="game.onBigMapClick"
          @pointerdown.prevent="game.onBigMapPointerDown"
          @pointermove="game.onBigMapPointerMove"
          @pointerup="game.onBigMapPointerUp"
        ></canvas>
        <div class="bigmap-hint">点击跳转视野 · 点外部或按Esc关闭</div>
      </div>
    </div>

    <HudBar :game="game" />
    <BottomPanel :game="game" />
    <UnitInfo :game="game" />
    <BuildingInfo :game="game" />
    <BuildMenu :game="game" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import HudBar from './HudBar.vue';
import BottomPanel from './BottomPanel.vue';
import UnitInfo from './UnitInfo.vue';
import BuildingInfo from './BuildingInfo.vue';
import BuildMenu from './BuildMenu.vue';

const props = defineProps({ game: Object });

const gameCanvasEl = ref(null);
const minimapCanvasEl = ref(null);
const bigMapCanvasEl = ref(null);

// 绑定 canvas refs 到 composable
onMounted(() => {
  props.game.gameCanvas.value = gameCanvasEl.value;
  props.game.minimapCanvas.value = minimapCanvasEl.value;
  props.game.bigMapCanvas.value = bigMapCanvasEl.value;
  nextTick(() => {
    props.game.doRender();
  });
});

// 确保 canvas refs 同步
watch([gameCanvasEl, minimapCanvasEl, bigMapCanvasEl], () => {
  props.game.gameCanvas.value = gameCanvasEl.value;
  props.game.minimapCanvas.value = minimapCanvasEl.value;
  props.game.bigMapCanvas.value = bigMapCanvasEl.value;
});

// 大地图打开时首次绘制
watch(() => props.game.bigMapVisible.value, (val) => {
  if (val) {
    nextTick(() => {
      props.game.bigMapCanvas.value = bigMapCanvasEl.value;
      props.game.drawBigMap();
    });
  }
});

function onDown(e) { props.game.onPointerDown(e); }
function onMove(e) { props.game.onPointerMove(e); }
function onUp(e) { props.game.onPointerUp(e); }
</script>

<style scoped>
.game-view { position: fixed; inset: 0; }
.game-canvas { position: absolute; top: 0; left: 0; display: block; }

.minimap-canvas {
  position: fixed; right: 4px; top: 50px; width: 80px; height: 80px;
  border: 1px solid rgba(255,255,255,0.3); border-radius: 2px; z-index: 45; opacity: 0.85;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;
  transition: opacity 0.2s;
}
.minimap-canvas:hover { opacity: 1; border-color: rgba(255,255,255,0.6); }

/* 大地图覆盖层 */
.bigmap-overlay {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}

.bigmap-container {
  position: relative;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 2px;
  box-shadow: 0 8px 48px rgba(0,0,0,0.5);
  background: #0d0d0d;
}

.bigmap-canvas {
  display: block; cursor: crosshair; touch-action: none;
}

.bigmap-hint {
  position: absolute; bottom: -30px; left: 0; right: 0; text-align: center;
  color: #888; font-size: 12px;
  font-family: 'Noto Serif SC', 'ZCOOL XiaoWei', serif;
  letter-spacing: 2px;
}
</style>
