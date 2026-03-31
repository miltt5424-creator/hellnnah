import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendHttp = env.VITE_BACKEND_HTTP_TARGET || 'http://localhost:8080'
  const backendWs   = env.VITE_BACKEND_WS_TARGET   || 'ws://localhost:8080'
  const devPort     = Number(env.VITE_PORT || 5174)

  return {
    plugins: [react()],
    server: {
      host: true,
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': { target: backendHttp, changeOrigin: true },
        '/ws':  { target: backendWs, ws: true, changeOrigin: true, rewriteWsOrigin: true },
      },
    },
    preview: { host: true, port: devPort, strictPort: true },
  }
})
