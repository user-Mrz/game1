<template>
  <div v-if="game.buildMenuVisible.value" class="build-menu-overlay" @click.self="game.buildMenuVisible.value = false">
    <div class="build-menu">
      <div class="title">{{ game.buildMenuTitle.value }}</div>
      <div class="b-list">
        <button
          v-for="(item, idx) in game.buildMenuItems.value"
          :key="idx"
          class="b-option"
          :disabled="item.disabled"
          @click="item.action()"
        >
          {{ item.label }}{{ item.hint }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ game: Object });
</script>

<style scoped>
.build-menu-overlay {
  position: fixed; inset: 0; z-index: 58;
}
.build-menu {
  position: fixed; bottom: 130px; left: 50%; transform: translateX(-50%);
  background: #fafaf7; border: 1px solid rgba(0,0,0,0.3);
  border-radius: 2px; padding: 12px; z-index: 60;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-width: 220px;
  max-width: 92vw;
}
.title {
  color: #0d0d0d; font-size: 15px; margin-bottom: 8px; text-align: center;
  font-family: 'Ma Shan Zheng',cursive; letter-spacing: 3px;
  border-bottom: 1px dotted rgba(0,0,0,0.2); padding-bottom: 6px;
}
.b-list {
  max-height: 45vh; overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.b-option {
  display: block; width: 100%; padding: 8px 12px; margin: 3px 0;
  background: #fff; color: #0d0d0d; border: 1px solid #ccc;
  border-radius: 2px; font-size: 12px; cursor: pointer; text-align: left;
  font-family: 'Noto Serif SC',serif;
}
.b-option:active { background: #e8e8e0; }
.b-option:disabled { opacity: 0.25; }
</style>
