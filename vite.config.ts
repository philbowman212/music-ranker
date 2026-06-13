import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path: https://<user>.github.io/music-ranker/
export default defineConfig({
  base: '/music-ranker/',
  plugins: [react()],
})
