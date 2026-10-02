import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// El gateway de IA queda del mismo origen para el navegador: /api/* se reenvía al proceso local (npm run api).
const api={target:process.env.DIAGRAMIA_API_URL??'http://127.0.0.1:8787',rewrite:(path:string)=>path.slice('/api'.length)};
export default defineConfig({plugins:[react()], server:{port:5173,strictPort:true,proxy:{'/api':api}}});
