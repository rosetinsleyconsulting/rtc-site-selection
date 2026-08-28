import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const maplibreSharedChunk = () => ({
  name: 'maplibre-shared-chunk',
  writeBundle(options) {
    const destination = resolve(options.dir, 'assets/maplibre-gl-shared.mjs');
    const source = resolve('node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs');
    if (existsSync(source)) copyFileSync(source, destination);
  },
});

export default defineConfig({
  plugins: [react(), maplibreSharedChunk()],
  server: { allowedHosts: true },
});