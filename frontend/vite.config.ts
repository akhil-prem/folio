import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const django = {
    target: env.VITE_API_URL || 'http://127.0.0.1:8000',
    changeOrigin: true,
  }

  return {
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
  }
})
