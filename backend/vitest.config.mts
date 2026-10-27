import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (not esbuild) so decorator metadata works for Nest DI and TypeORM, as in CIP.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { setupFiles: ['reflect-metadata'], environment: 'node', include: ['test/**/*.test.ts'] },
});
