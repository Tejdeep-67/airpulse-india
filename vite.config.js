import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // the forecast model is one ~1.4 MB JSON chunk on purpose (loaded lazily on city pages)
    chunkSizeWarningLimit: 1500,
  },
})
