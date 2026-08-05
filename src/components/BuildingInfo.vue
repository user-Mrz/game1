<template>
  <div
    v-if="d"
    ref="cardEl"
    class="building-info-card"
    :class="{ dragging }"
    :style="{ left: x + 'px', top: y + 'px' }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <div class="head">
      <span class="seal">{{ d.name }}</span>
      <span class="owner">{{ d.ownerName }}</span>
    </div>
    <div class="grid">
      <div class="item">
        <label>耐久</label>
        <b>{{ d.hp }} / {{ d.maxHp }}</b>
      </div>
      <div class="item">
        <label>视野</label>
        <b>{{ d.visionRadius }}格</b>
      </div>
      <div class="item" v-if="d.atk > 0">
        <label>攻击力</label>
        <b>{{ d.atk }}</b>
      </div>
      <div class="item" v-if="d.atk > 0">
        <label>攻击距离</label>
        <b>{{ d.atkRange }}格</b>
      </div>
      <div class="item" v-if="d.foodPerTurn > 0">
        <label>粮草产出</label>
        <b>{{ d.foodPerTurn }}/回合</b>
      </div>
      <div class="item">
        <label>建造成本</label>
        <b>🌾{{ d.buildCost }}</b>
      </div>
    </div>

    <div v-if="d.unit" class="unit-sec">
      <div class="unit-title">可产兵种 · {{ d.unit.name }}</div>
      <div class="grid">
        <div class="item">
          <label>兵力</label>
          <b>{{ d.unit.troops }}</b>
        </div>
        <div class="item">
          <label>血量</label>
          <b>{{ d.unit.hp }}</b>
        </div>
        <div class="item">
          <label>攻击力</label>
          <b>{{ d.unit.atk }}</b>
        </div>
        <div class="item">
          <label>粮草上限</label>
          <b>{{ d.unit.foodCap }}</b>
        </div>
        <div class="item">
          <label>移动</label>
          <b>{{ d.unit.move }}格</b>
        </div>
        <div class="item">
          <label>攻击距离</label>
          <b>{{ d.unit.atkRange }}格</b>
        </div>
      </div>
      <div class="cost">生产消耗 🌾{{ d.unit.buildCost }}</div>
    </div>
    <div v-else class="desc">{{ d.desc }}</div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useDraggableCard } from '../composables/useDraggableCard.js';

const props = defineProps({ game: Object });
const d = computed(() => props.game.buildingDetail.value);
const { cardEl, x, y, dragging, initWhenVisible, onDown, onMove, onUp } = useDraggableCard();

watch(d, (val) => initWhenVisible(!!val), { immediate: true });
</script>

<style scoped>
.building-info-card {
  position: fixed; left: 0; top: 0;
  width: min(88vw, 340px);
  background: #fafaf7; border: 1px solid rgba(0,0,0,0.4);
  border-radius: 2px; padding: 10px 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  z-index: 46;
  touch-action: none; cursor: grab; user-select: none;
}
.building-info-card.dragging { cursor: grabbing; }
@media (pointer: coarse) {
  .building-info-card { cursor: default; }
}
.head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 1px dotted rgba(0,0,0,0.25); padding-bottom: 6px; margin-bottom: 8px;
}
.seal {
  color: #0d0d0d; font-size: 17px; font-weight: bold;
  font-family: 'Ma Shan Zheng',cursive; letter-spacing: 2px;
}
.owner { color: #777; font-size: 11px; font-family: 'Noto Serif SC',serif; }
.grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px;
}
.item label {
  display: block; color: #888; font-size: 10px; margin-bottom: 2px;
  font-family: 'Noto Serif SC',serif; letter-spacing: 1px;
}
.item b {
  color: #0d0d0d; font-size: 14px; font-family: 'Noto Serif SC',serif;
}
.unit-sec {
  margin-top: 10px; padding-top: 8px; border-top: 1px dotted rgba(0,0,0,0.25);
}
.unit-title {
  color: #0d0d0d; font-size: 13px; font-weight: bold; text-align: center;
  font-family: 'Ma Shan Zheng',cursive; letter-spacing: 2px; margin-bottom: 8px;
}
.cost {
  margin-top: 8px; color: #8a6d3b; font-size: 11px; text-align: center;
  font-family: 'Noto Serif SC',serif;
}
.desc {
  margin-top: 8px; padding-top: 6px; border-top: 1px dotted rgba(0,0,0,0.2);
  color: #555; font-size: 11px; text-align: center;
  font-family: 'Noto Serif SC',serif;
}
</style>
