import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Viktig for GitHub Pages: base må settes til "/<repo-navn>/"
// For Vercel/Netlify: base kan stå som "/"
// Sett miljøvariabelen VITE_BASE i build-kommandoen, f.eks.:
//   VITE_BASE=/praksisrom-booking/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
