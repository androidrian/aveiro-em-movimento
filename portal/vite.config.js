import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, os pedidos a /v1 são encaminhados para a API (porta 8000).
// A versão compilada (construir.bat) é servida pela própria API em /.
// O portal usa o planeador da transportadora (../transportadora/src), por isso o servidor pode ler a pasta acima.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5175, strictPort: true, fs: { allow: ['..'] }, proxy: { '/v1': { target: 'http://localhost:8000', changeOrigin: true } } },
});
