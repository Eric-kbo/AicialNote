import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The Go server handles OAuth. Same origin in dev and prod keeps cookies simple.
    proxy: { '/auth': 'http://localhost:8080' },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
