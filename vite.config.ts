import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_REPOSITORY === 'nathansenn/graphify-wiki-brain' ? '/graphify-wiki-brain/' : '/',
  build: {
    chunkSizeWarningLimit: 1300,
  },
  plugins: [react()],
})
