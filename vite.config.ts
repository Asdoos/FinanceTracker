import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Injected at build time from package.json via npm_package_version
const appVersion = process.env.npm_package_version ?? '0.0.0'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
