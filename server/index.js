import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { db, pool } from './db/index.js';
import apiRouter from './routes/api.js';
import { supabaseConfigured } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 5000);

app.locals.db = db;
// Behind Cloudflare Tunnel: read the real protocol (https) from X-Forwarded-Proto, used when building invite links
app.set('trust proxy', true);
app.use(express.json({ limit: '12mb' }));

if (!supabaseConfigured) {
  console.warn('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before using protected routes.');
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, supabaseConfigured });
  } catch {
    res.status(503).json({ ok: false, supabaseConfigured, error: 'Database unavailable' });
  }
});
app.use('/api', apiRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(root, 'dist', 'index.html'));
  });
  app.listen(port, '0.0.0.0', () => console.log(`Site selection server listening on ${port}`));
} else {
  // Loaded lazily so the production image doesn't need Vite (a devDependency) installed
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    try {
      const template = await vite.transformIndexHtml(req.originalUrl, await import('node:fs/promises').then(fs => fs.readFile(path.join(root, 'index.html'), 'utf-8')));
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
  app.listen(port, '0.0.0.0', () => console.log(`Site selection dev server listening on ${port}`));
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});