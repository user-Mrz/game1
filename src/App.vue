<template>
  <MenuScreen v-if="game.phase.value !== 'playing' && !game.gameOverVisible.value" @start="game.startGame" @load="game.openSaveMenu('load')" :isCreating="game.isCreating.value" />
  <GameView v-if="game.phase.value === 'playing' || game.gameOverVisible.value" :game="game" />
  <GameOverScreen v-if="game.gameOverVisible.value" :title="game.gameOverTitle.value" :msg="game.gameOverMsg.value" @restart="game.restartGame" />
  <SaveMenu :game="game" />
</template>

<script setup>
import { provide, onMounted, onBeforeUnmount } from 'vue';
import { useGame } from './composables/useGame.js';
import MenuScreen from './components/MenuScreen.vue';
import SaveMenu from './components/SaveMenu.vue';
import GameView from './components/GameView.vue';
import GameOverScreen from './components/GameOverScreen.vue';

const game = useGame();
provide('game', game);

onMounted(() => {
  window.addEventListener('keydown', game.onKeydown);
  window.addEventListener('resize', game.doRender);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', game.onKeydown);
  window.removeEventListener('resize', game.doRender);
});

// 阻止移动端手势缩放
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
/* 全部边框统一为朱砂红 */
* { border-color: #b03028 !important; outline-color: #b03028 !important; }
html, body {
  width: 100%; height: 100%; overflow: hidden;
  background: #0d0d0d;
  font-family: 'ZCOOL XiaoWei','Noto Serif SC','SimSun','STSong','KaiTi','PingFang SC','Microsoft YaHei',serif;
  touch-action: manipulation; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
}
</style>
