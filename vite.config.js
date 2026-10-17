import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // A demonstração usa caminhos relativos para funcionar dentro de qualquer pasta.
  base: mode === 'demo' ? './' : '/',
  build: { chunkSizeWarningLimit: 1500, outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
}));
