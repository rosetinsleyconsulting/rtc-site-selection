import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db, pool } from './db/index.js';
import { clerkMiddleware } from '@clerk/express';
import apiRouter from './routes/api.js';
import { clerkConfigured, clerkClient, publishableKey } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 5000);

app.locals.db = db;
app.use(express.json({ limit: '12mb' }));

if (clerkConfigured) {
  app.use(clerkMiddleware({
    clerkClient,
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey,
  }));
} else {
  console.warn('Clerk is not configured. Add CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY before using protected routes.');
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, clerkConfigured });
  } catch {
    res.status(503).json({ ok: false, clerkConfigured, error: 'Database unavailable' });
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