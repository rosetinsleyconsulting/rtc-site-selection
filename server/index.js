import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

// Security headers. The content policy lists every outside origin the client uses: Supabase (auth),
// Google Fonts, and OpenFreeMap (basemap styles, vector tiles, sprites and label glyphs all come from
// tiles.openfreemap.org). Vite's dev server injects inline scripts, so the policy only applies in production.
const isProduction = process.env.NODE_ENV === 'production';
const supabaseOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
const basemapOrigins = ['https://tiles.openfreemap.org'];
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', ...basemapOrigins],
      connectSrc: ["'self'", ...basemapOrigins, ...(supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace(/^https/, 'wss')] : [])],
      workerSrc: ["'self'", 'blob:'],
      childSrc: ['blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
  // Sends only the origin cross-site, never the path (kept from the OSM tile days; harmless for OpenFreeMap).
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Broad per-visitor ceiling on the API. A map pan loads dozens of tiles, so it is generous.
// Behind Cloudflare the real visitor is in CF-Connecting-IP; the app port is loopback-only, so it can't be faked.
const clientKey = req => req.get('cf-connecting-ip') || req.ip;
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 1500, keyGenerator: clientKey, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false, xForwardedForHeader: false } }));
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