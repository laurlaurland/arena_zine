import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The lazy-loaded exportPDF chunk is ~1.5 MB because @react-pdf/renderer
    // is monolithic; it only loads on "Export PDF" click, not initial load.
    chunkSizeWarningLimit: 1600,
  },
})
