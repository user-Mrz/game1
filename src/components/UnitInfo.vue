<template>
  <div
    v-if="d"
    ref="cardEl"
    class="unit-info-card"
    :class="{ dragging }"
    :style="{ left: x + 'px', top: y + 'px' }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <div class="head">
      <span class="seal">{{ d.name }}</span>
      <span class="owner" :style="{ color: d.ownerColor }">{{ d.ownerName }}</span>
      <span class="close-btn" @pointerdown.stop.prevent="close">×</span>
    </div>
    <div class="grid">
      <div class="item">
        <label>兵力</label>
        <b>{{ d.troops }} / {{ d.maxTroops }}</b>
      </div>
      <div class="item">
        <label>血量</label>
        <b>{{ d.hp }} / {{ d.maxHp }}</b>
      </div>
      <div class="item">
        <label>攻击力</label>
        <b>{{ d.atkPower }}</b>
      </div>
      <div class="item">
        <label>剩余粮草</label>
        <b>{{ d.supplies }} / {{ d.foodCap }}</b>
      </div>
    </div>
    <div class="sub">
      移动{{ d.move }}格 · 攻击距离{{ d.atkRange }}格 ·
      {{ d.moved ? '已行动' : '可移动' }} · {{ d.attacked ? '已攻击' : '可攻击' }}
    </div>
    <div v-if="d.note" class="note">{{ d.note }}</div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useDraggableCard } from '../composables/useDraggableCard.js';

const props = defineProps({ game: Object });
const d = computed(() => props.game.unitDetail.value);
const { cardEl, x, y, dragging, initWhenVisible, onDown, onMove, onUp } = useDraggableCard();

function close() {
  props.game.unitDetail.value = null;
}

watch(d, (val) => initWhenVisible(!!val), { immediate: true });
</script>

<style scoped>
.unit-info-card {
  position: fixed; left: 0; top: 0;
  width: min(88vw, 340px);
  background: #fafaf7; border: 1px solid rgba(0,0,0,0.4);
  border-radius: 2px; padding: 10px 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  z-index: 46;
  touch-action: none; cursor: grab; user-select: none;
}
.unit-info-card.dragging { cursor: grabbing; }
@media (pointer: coarse) {
  .unit-info-card { cursor: default; }
}
.head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 1px dotted rgba(0,0,0,0.25); padding-bottom: 6px; margin-bottom: 8px;
  position: relative; padding-right: 20px;
}
.close-btn {
  position: absolute; right: 0; top: -4px;
  font-size: 20px; color: #999; cursor: pointer; line-height: 1;
  font-family: sans-serif; user-select: none;
}
.close-btn:active { color: #333; }
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
.sub {
  margin-top: 8px; padding-top: 6px; border-top: 1px dotted rgba(0,0,0,0.2);
  color: #555; font-size: 11px; text-align: center;
  font-family: 'Noto Serif SC',serif;
}
.note {
  margin-top: 6px; color: #b03028; font-size: 11px; text-align: center;
  font-family: 'Noto Serif SC',serif;
}
</style>
