<template>
  <div v-if="visible" class="tutorial-overlay" @click.self="onOverlayClick">
    <div class="tutorial-panel">
      <div class="tutorial-header">
        <span class="tutorial-title">教 学 指 引</span>
        <span class="tutorial-progress">{{ step + 1 }} / {{ total }}</span>
      </div>
      <div class="tutorial-body">
        <h3 v-if="currentTitle" class="tutorial-section-title">{{ currentTitle }}</h3>
        <div class="tutorial-text">
          <template v-for="(line, idx) in lines" :key="idx">
            <p v-if="line === ''" class="tutorial-empty-line">&nbsp;</p>
            <p v-else class="tutorial-line">{{ line }}</p>
          </template>
        </div>
      </div>
      <div class="tutorial-actions">
        <button v-if="!isFirstStep" class="prev-btn" @click="game.prevTutorialStep()">
          上一步
        </button>
        <button v-if="!isLastStep" class="next-btn" @click="game.nextTutorialStep()">
          下一步
        </button>
        <button v-else class="finish-btn" @click="game.finishTutorial(true)">
          开始游戏
        </button>
        <button class="skip-btn" @click="game.skipTutorial()">跳过</button>
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
const currentStep = computed(() => TUTORIAL_STEPS[step.value] || {});
const currentTitle = computed(() => currentStep.value.title || '');
const lines = computed(() => (currentStep.value.text || '').split('\n'));
const isLastStep = computed(() => step.value >= total - 1);
const isFirstStep = computed(() => step.value <= 0);

function onOverlayClick() {}
</script>

<style scoped>
.tutorial-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  pointer-events: auto;
}

.tutorial-panel {
  position: relative;
  width: 92%; max-width: 480px;
  max-height: 82vh;
  background: #fafaf7;
  border: 2px solid #b03028;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.tutorial-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px;
  background: linear-gradient(90deg, #0d0d0d 0%, #1a1a1a 100%);
  color: #fafaf7;
  border-bottom: 2px solid #b03028;
  flex-shrink: 0;
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
  padding: 16px 20px 12px;
  background: #fafaf7;
  overflow-y: auto;
  flex: 1;
}

.tutorial-section-title {
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei',cursive;
  font-size: 18px;
  color: #b03028;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(176,48,40,0.3);
  letter-spacing: 3px;
}

.tutorial-text {
  font-family: 'Noto Serif SC','ZCOOL XiaoWei',serif;
  font-size: 14px; line-height: 1.75;
  color: #2a2a2a;
  letter-spacing: 0.5px;
}

.tutorial-line {
  margin: 0 0 2px;
  white-space: pre-wrap;
}

.tutorial-empty-line {
  margin: 0;
  height: 6px;
}

.tutorial-actions {
  display: flex; gap: 8px;
  padding: 10px 14px;
  background: #f0ede5;
  border-top: 1px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

button {
  flex: 1; padding: 9px 12px;
  border-radius: 2px; border: none;
  font-family: 'Noto Serif SC','ZCOOL XiaoWei',serif;
  font-size: 14px; cursor: pointer;
  letter-spacing: 2px;
  transition: all 0.15s;
}

.next-btn, .finish-btn {
  background: #0d0d0d; color: #fafaf7;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei',cursive;
  font-size: 15px; letter-spacing: 3px;
}
.next-btn:active, .finish-btn:active { transform: scale(0.97); opacity: 0.85; }

.prev-btn {
  background: #e0ddd5; color: #555;
  border: 1px solid #bbb;
}
.prev-btn:active { background: #d0cdc5; }

.skip-btn {
  background: transparent; color: #888;
  border: 1px solid #ccc;
  flex: 0.6;
}
.skip-btn:active { background: #e8e8e0; }
</style>