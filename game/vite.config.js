import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  base: '/chess-puzzles-pickles/',
  plugins: [react()],
  define: {
    __PUZZLE_DATA_VERSION__: JSON.stringify(createHash('sha256')
      .update(readFileSync(new URL('./public/puzzles.json', import.meta.url)))
      .digest('hex').slice(0, 12))
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: true
  }
})
