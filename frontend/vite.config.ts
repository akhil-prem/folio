import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const django = {
  target: 'http://127.0.0.1:8000',
  changeOrigin: true,
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': django,
    },
  },
  preview: {
    proxy: {
      '/api': django,
    },
  },
})
