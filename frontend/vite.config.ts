import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    exclude: ['@capacitor/core'],
  },

  build: {
    rollupOptions: {
      external: ['@capacitor/core'],

      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'zod', 'react-hook-form', '@hookform/resolvers'],
        },
      },
    },
  },
});