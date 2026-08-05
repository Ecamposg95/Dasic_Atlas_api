import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Config mínima del harness de tests (primer harness del repo, 2026-08).
// Solo lógica pura por ahora (calc.ts del cotizador) — sin jsdom, sin React.
// El alias `@` espeja el de vite.config.ts para que los imports compilen igual.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // El negocio opera en CDMX y varias reglas dependen del DÍA local (fecha
    // de cotización, vigencia, TC del día). Fijar la zona hace la suite
    // determinista y, sobre todo, falsificable: en UTC —donde corre CI— un
    // `toISOString()` mal usado daría el mismo resultado que la versión
    // correcta y los tests de `lib/fechas.ts` no detectarían nada.
    env: { TZ: 'America/Mexico_City' },
  },
});
