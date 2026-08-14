import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://<user>.github.io/kurashi-ritchi/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/kurashi-ritchi/' : '/',
}))
