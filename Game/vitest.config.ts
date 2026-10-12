import { defineConfig } from 'vitest/config';

// Unit test logika core (state, settings, events, endings) di environment
// node murni: tanpa DOM/Canvas/WebGL. localStorage disediakan stub di
// src/test/setup.ts supaya singleton (settingsManager) yang membaca
// penyimpanan saat evaluasi modul tetap bisa diimpor.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts']
  }
});
