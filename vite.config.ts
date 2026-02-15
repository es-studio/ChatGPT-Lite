import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  plugins: [
    svelte(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true
          }
        }
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true
          }
        }
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts']
  }
});
