<template>
  <div class="game-over-overlay">
    <h2>{{ title }}</h2>
    <p>{{ msg }}</p>
    <button @click="$emit('restart')">重整旗鼓</button>
  </div>
</template>

<script setup>
defineProps({ title: String, msg: String });
defineEmits(['restart']);
</script>

<style scoped>
.game-over-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92);
  display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 200;
}
h2 {
  font-family: 'Ma Shan Zheng',cursive; color: #fafaf7; font-size: 48px;
  margin-bottom: 20px; letter-spacing: 6px;
}
p { color: #999; margin-bottom: 28px; font-family: 'Noto Serif SC',serif; font-size: 16px; }
button {
  padding: 12px 40px; border-radius: 2px;
  background: #fafaf7; color: #0d0d0d; border: none;
  font-size: 18px; font-family: 'Ma Shan Zheng',cursive; letter-spacing: 4px; cursor: pointer;
}
</style>
