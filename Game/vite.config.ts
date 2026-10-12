import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'terser',
    terserOptions: {
      compress: {
        // Buang console.log/debug (tidak ada gunanya di build rilis), tapi
        // pertahankan console.warn/error: itu satu-satunya cara pemain bisa
        // melaporkan masalah yang hanya muncul di build produksi.
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.trace']
      }
    },
    // three.js dipisah ke chunk sendiri lewat code splitting Rolldown (Vite 8);
    // 516 kB mentah (~127 kB gzip) itu normal untuk satu engine 3D, jadi
    // ambang peringatan dinaikkan supaya warning-nya tetap berarti.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Pengganti manualChunks (bentuk objek sudah dihapus di Rolldown):
        // semua modul di node_modules/three masuk satu group chunk.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ }
          ]
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      '@': '/src',
      '@core': '/src/core',
      '@render': '/src/render',
      '@game': '/src/game',
      '@ui': '/src/ui',
      '@puzzles': '/src/puzzles',
      '@data': '/data',
      '@locales': '/locales',
      '@assets': '/assets'
    }
  }
});