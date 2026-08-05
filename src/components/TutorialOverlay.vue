<template>
  <div v-if="visible" class="tutorial-overlay" @click.self="onOverlayClick">
    <div class="tutorial-panel">
      <div class="tutorial-header">
        <span class="tutorial-title">教 学 指 引</span>
        <span class="tutorial-progress">{{ step + 1 }} / {{ total }}</span>
      </div>
      <div class="tutorial-body">
        <p class="tutorial-text">{{ currentText }}</p>
      </div>
      <div class="tutorial-actions">
        <button v-if="!isLastStep" class="next-btn" @click="game.nextTutorialStep()">
          下一步
        </button>
        <button v-else class="finish-btn" @click="game.finishTutorial(true)">
          开始游戏
        </button>
        <button class="skip-btn" @click="game.skipTutorial()">跳过教学</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { TUTORIAL_STEPS } from '../game/tutorial.js';

const props = defineProps({ game: Object });

const visible = computed(() => props.game.tutorialActive.value && !props.game.tutorialDone.value);
const step = computed(() => props.game.tutorialStep.value);
const total = TUTORIAL_STEPS.length;
const currentText = computed(() => TUTORIAL_STEPS[step.value]?.text || '');
const isLastStep = computed(() => step.value >= total - 1);

function onOverlayClick() {
  // 点击遮罩不关闭，必须通过按钮操作
}
</script>

<style scoped>
.tutorial-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  pointer-events: auto;
}

.tutorial-panel {
  position: relative;
  width: 88%; max-width: 420px;
  background: #fafaf7;
  border: 2px solid #b03028;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
}

.tutorial-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px;
  background: linear-gradient(90deg, #0d0d0d 0%, #1a1a1a 100%);
  color: #fafaf7;
  border-bottom: 2px solid #b03028;
}

.tutorial-title {
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei',cursive;
  font-size: 18px; letter-spacing: 4px;
}

.tutorial-progress {
  font-family: 'Noto Serif SC',serif;
  font-size: 13px; color: #ccc;
}

.tutorial-body {
  padding: 18px 20px 14px;
  background: #fafaf7;
}

.tutorial-text {
  font-family: 'Noto Serif SC','ZCOOL XiaoWei',serif;
  font-size: 15px; line-height: 1.8;
  color: #2a2a2a;
  letter-spacing: 1px;
}

.tutorial-actions {
  display: flex; gap: 10px;
  padding: 12px 16px;
  background: #f0ede5;
  border-top: 1px solid rgba(0,0,0,0.1);
}

button {
  flex: 1; padding: 10px 14px;
  border-radius: 2px; border: none;
  font-family: 'Noto Serif SC','ZCOOL XiaoWei',serif;
  font-size: 14px; cursor: pointer;
  letter-spacing: 2px;
  transition: all 0.15s;
}

.next-btn, .finish-btn {
  background: #0d0d0d; color: #fafaf7;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei',cursive;
  font-size: 16px; letter-spacing: 4px;
}
.next-btn:active, .finish-btn:active { transform: scale(0.97); opacity: 0.85; }

.skip-btn {
  background: transparent; color: #888;
  border: 1px solid #ccc;
  flex: 0.7;
}
.skip-btn:active { background: #e8e8e0; }
</style>
