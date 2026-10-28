import { defineConfig } from 'tsup';

// Un único archivo de entorno para todo el proyecto: apps/embed/.env.local (o .env).
// `loadEnvFile` no pisa variables ya definidas, así que en CI mandan las del entorno.
for (const file of ['../../apps/embed/.env.local', '../../apps/embed/.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // el archivo no existe
  }
}

// El loader se publica versionado: /widget/v1/loader.js (servido por la app embed).
export default defineConfig({
  entry: { loader: 'src/index.ts' },
  format: ['iife'],
  outDir: '../../apps/embed/public/widget/v1',
  target: 'es2019',
  minify: true,
  clean: false,
  outExtension: () => ({ js: '.js' }),
  noExternal: [/.*/],
  define: { __DEFAULT_API_BASE__: JSON.stringify(process.env.WIDGET_API_BASE ?? '') },
});
