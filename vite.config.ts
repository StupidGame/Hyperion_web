import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function rssProxyDevServer(): Plugin {
  return {
    name: 'hyperion-rss-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/rss', async (request, response) => {
        try {
          const requestUrl = new URL(request.url ?? '', 'http://127.0.0.1');
          const targetUrl = requestUrl.searchParams.get('url');

          if (!targetUrl) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Missing url parameter.' }));
            return;
          }

          const { fetchRssDocument } = await import('./api/rss.js');
          const payload = await fetchRssDocument(targetUrl);

          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(payload));
        } catch (error) {
          response.writeHead(502, { 'Content-Type': 'application/json' });
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'RSS request failed.',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), rssProxyDevServer()],
});
