import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Solo lógica pura (cálculos de dinero). No hay tests de componentes, así
    // que no hace falta jsdom ni setup de React.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Mismo alias que tsconfig, para poder importar con '@/...'.
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
