// Entrypoint: single Express app serving both the public site and the admin CMS.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import nunjucks from 'nunjucks';
import { init, getSettings, uploadsDir } from './db.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

// Fail fast: signed cookies (admin session) must never fall back to a public
// hardcoded secret. Same spirit as the DB_* checks in db.js.
if (!process.env.SESSION_SECRET) {
  throw new Error('Missing required env var SESSION_SECRET (see .env)');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const nunjucksEnv = nunjucks.configure(path.join(__dirname, '..', 'views'), {
  autoescape: true,
  express: app,
  noCache: true,
});
app.set('view engine', 'njk');

// "2026-07-15T10:00:00.000Z" -> "15/07/2026"
nunjucksEnv.addFilter('shortdate', (value) => {
  if (!value) return '';
  const isoDate = String(value).slice(0, 10);
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
});

// Security headers. CSP is tuned for this site's realities: an inline <script>
// in the head (theme FOUC guard), inline styles, data: URI image placeholders,
// and the Google Maps <iframe>. 'unsafe-inline' on script/style is required
// while the FOUC guard has no nonce — revisit if a nonce pipeline is added.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ['maps.google.com', 'google.com', 'www.google.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

// settings + current path available to every view (dock active state, footer links)
app.use(async (req, res, next) => {
  try {
    res.locals.settings = await getSettings();
  } catch (err) {
    return next(err);
  }
  res.locals.currentPath = req.path;
  next();
});

app.use('/admin', adminRoutes);
app.use('/', publicRoutes);

app.use((req, res) => {
  res.status(404).render('public/404.njk', { title: 'Página não encontrada — Padel Experience' });
});

// Central error handler: log server-side, never leak a stack to the client.
// Admin paths get the styled error page; everything else a plain 500.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/admin')) {
    return res.status(500).render('admin/error.njk', {
      title: 'Erro',
      message: 'Não foi possível concluir a operação. Tente novamente.',
    });
  }
  res.status(500).send('Erro interno do servidor.');
});

// No top-level await: Hostinger's runner require()s the entry file, and
// require() cannot load an ESM graph with TLA (ERR_REQUIRE_ASYNC_MODULE).
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Padel Experience rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
