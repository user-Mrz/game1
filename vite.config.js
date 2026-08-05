import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    // 允许 ngrok 等外部域名访问开发服务器
    allowedHosts: ['.ngrok-free.dev', 'lankiness-mule-bankbook.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
