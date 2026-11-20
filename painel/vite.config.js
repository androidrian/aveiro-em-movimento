import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, os pedidos a /v1 são encaminhados para a API (porta 8000).
// A versão compilada (npm run build) é servida pela própria API em /painel/.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/v1': { target: 'http://localhost:8000', changeOrigin: true } } },
});
