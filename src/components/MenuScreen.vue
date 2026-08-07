<template>
  <div class="menu-screen">
    <h1>兵 临 城 下</h1>
    <div class="subtitle">—— 水墨策略战棋 ——</div>
    <div class="seal">运筹帷幄</div>
    <div class="menu-item">
      <label>地图大小</label>
      <select v-model="mapSize">
        <option :value="100">100×100</option>
        <option :value="500">500×500</option>
        <option :value="1000">1000×1000</option>
        <option :value="2000">2000×2000</option>
      </select>
    </div>
    <div class="menu-item">
      <label>AI对手</label>
      <select v-model="aiCount">
        <option v-for="n in 9" :key="n" :value="n">{{ n }}个</option>
      </select>
    </div>
    <div class="menu-item">
      <label>难度</label>
      <select v-model="difficulty">
        <option value="easy">简单 — 普通AI，标准属性</option>
        <option value="normal">普通 — 增强AI，属性+20%</option>
        <option value="hard">困难 — 智能AI，属性+50%</option>
        <option value="extreme">极难 — 巅峰AI，属性翻倍</option>
      </select>
    </div>
    <button class="start-btn" @click="$emit('start', mapSize, aiCount, difficulty)" :disabled="isCreating">
      {{ isCreating ? '挥毫泼墨，绘就山河...' : '进 入 战 局' }}
    </button>
    <button class="tutorial-btn" @click="$emit('tutorial')" :disabled="isCreating">新 手 教 学</button>
    <button class="load-btn" @click="$emit('load')" :disabled="isCreating">读 取 存 档</button>
    <button class="settings-btn" @click="s.settingsPanelVisible.value = true">快 捷 键 设 置</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSettings } from '../composables/useSettings.js';
defineEmits(['start', 'load', 'tutorial']);
defineProps({ isCreating: Boolean });

const s = useSettings();
const mapSize = ref(500);
const aiCount = ref(3);
const difficulty = ref('easy');
</script>

<style scoped>
.menu-screen {
  position: fixed; inset: 0; z-index: 100;
  background: url('/主界面.webp') center/cover no-repeat;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-left: 2px solid #333; border-right: 2px solid #333;
}
.menu-screen::after {
  content: ''; position: absolute; inset: 0;
  background: rgba(250,250,247,0.35);
  pointer-events: none;
}
.menu-screen::before {
  content: ''; position: absolute; top: 20px; bottom: 20px; left: 12px; right: 12px;
  border: 0.5px solid rgba(0,0,0,0.1); pointer-events: none;
}
h1 {
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei','STKaiti','KaiTi',cursive;
  color: #0d0d0d; font-size: 42px; margin-bottom: 4px;
  letter-spacing: 10px; position: relative;
}
h1::after {
  content: ''; position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%);
  width: 60px; height: 2px; background: #0d0d0d;
}
.subtitle {
  color: #555; font-size: 14px; margin-bottom: 36px; margin-top: 12px;
  font-family: 'ZCOOL XiaoWei','Noto Serif SC',serif; letter-spacing: 3px;
}
.seal {
  color: #0d0d0d; font-size: 20px; font-family: 'Ma Shan Zheng',cursive;
  border: 2px solid #0d0d0d; border-radius: 2px; padding: 4px 8px;
  transform: rotate(-8deg); opacity: 0.7; margin-top: 10px;
}
.menu-item {
  margin: 10px 0; display: flex; align-items: center; gap: 12px; color: #2a2a2a; font-size: 15px;
}
.menu-item label {
  min-width: 80px; text-align: right; color: #555;
  font-family: 'ZCOOL XiaoWei','Noto Serif SC',serif; letter-spacing: 2px;
}
select {
  padding: 8px 16px; border-radius: 2px; background: #fff; color: #0d0d0d;
  border: 1px solid #aaa; font-size: 14px; outline: none;
  font-family: 'Noto Serif SC','SimSun',serif;
}
select:focus { border-color: #0d0d0d; }
.start-btn {
  margin-top: 30px; padding: 14px 60px; border-radius: 2px;
  background: #0d0d0d; color: #fafaf7; border: none;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei','STKaiti','KaiTi',cursive;
  font-size: 24px; letter-spacing: 6px; cursor: pointer;
  transition: all 0.2s;
}
.start-btn:active { transform: scale(0.96); opacity: 0.8; }
.start-btn:disabled { opacity: 0.4; }
.load-btn {
  margin-top: 14px; padding: 10px 40px; border-radius: 2px;
  background: #fff; color: #0d0d0d; border: 1px solid #0d0d0d;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei','STKaiti','KaiTi',cursive;
  font-size: 16px; letter-spacing: 4px; cursor: pointer;
  transition: all 0.2s;
}
.load-btn:active { transform: scale(0.96); background: #e8e8e0; }
.load-btn:disabled { opacity: 0.4; }
.tutorial-btn {
  margin-top: 14px; padding: 10px 40px; border-radius: 2px;
  background: #fff; color: #b03028; border: 1px solid #b03028;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei','STKaiti','KaiTi',cursive;
  font-size: 16px; letter-spacing: 4px; cursor: pointer;
  transition: all 0.2s;
}
.tutorial-btn:active { transform: scale(0.96); background: #faf0f0; }
.tutorial-btn:disabled { opacity: 0.4; }
.settings-btn {
  margin-top: 14px; padding: 10px 40px; border-radius: 2px;
  background: #fff; color: #0d0d0d; border: 1px solid #0d0d0d;
  font-family: 'Ma Shan Zheng','ZCOOL XiaoWei','STKaiti','KaiTi',cursive;
  font-size: 16px; letter-spacing: 4px; cursor: pointer;
  transition: all 0.2s;
}
.settings-btn:hover { background: #f5f2ea; border-color: #b03028; color: #b03028; }
.settings-btn:active { transform: scale(0.96); background: #e8e8e0; }
</style>
