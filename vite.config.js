import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// base matches the GitHub Pages path: https://ahasenbein.github.io/lepus-solutions/
export default defineConfig({
  base: '/lepus-solutions/',
  plugins: [react(), tailwindcss()],
})
