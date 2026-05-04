import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',

  resolve: {
    dedupe: ['react', 'react-dom'],
  },

  plugins: [react()],

  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-store';
          });
        },
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'recharts', 'lucide-react'],
    esbuildOptions: { target: 'es2020' },
  },

  esbuild: {
    target: 'es2020',
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/recharts')) return 'vendor-recharts';
        },
      },
    },
  },
});
