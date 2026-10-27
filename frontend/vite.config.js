import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://10.1.1.2:4000',
        changeOrigin: true,
      },
      '/cozinha': {
        target: 'http://10.1.1.2:4000',
        changeOrigin: true,
      },
    },
  },
})
