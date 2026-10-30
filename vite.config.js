import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// Dev/preview-only proxy: POST <base>api/ai → OpenRouter, adding OPEN_ROUTER_KEY server-side so it
// never lands in the bundle. GitHub Pages has no server, so the deployed site uses a key the
// visitor pastes in (see src/ai/client.js).
function openRouterProxy(env) {
  const key = env.OPEN_ROUTER_KEY || env.OPENROUTER_API_KEY
  const handler = async (req, res, next) => {
    if (!req.url?.split('?')[0].endsWith('/api/ai') || req.method !== 'POST') return next()
    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (!key) return send(500, { error: 'OPEN_ROUTER_KEY is not set in .env' })
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const { messages, json = false, model } = JSON.parse(raw || '{}')
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Lepus Solutions' },
        body: JSON.stringify({
          model: model || env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5.5',
          messages,
          ...(json && { response_format: { type: 'json_object' } }),
        }),
      })
      const data = await upstream.json()
      if (!upstream.ok) return send(upstream.status, { error: data?.error?.message || 'OpenRouter request failed' })
      send(200, { content: data.choices?.[0]?.message?.content ?? '' })
    } catch (err) {
      send(500, { error: err.message })
    }
  }
  return {
    name: 'openrouter-proxy',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}

// base matches the GitHub Pages path: https://ahasenbein.github.io/lepus-solutions/
export default defineConfig(({ mode }) => ({
  base: '/lepus-solutions/',
  plugins: [react(), tailwindcss(), openRouterProxy(loadEnv(mode, process.cwd(), ''))],
}))
