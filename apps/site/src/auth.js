// Password hashing (scrypt) + signed-cookie session + CSRF + login rate limiting.
import crypto from 'node:crypto';

const SESSION_COOKIE = 'padelexp_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedBuffer = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

export function createSession(res, user) {
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify({ userId: user.id, email: user.email, csrfToken });
  res.cookie(SESSION_COOKIE, payload, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
  return csrfToken;
}

export function destroySession(res) {
  res.clearCookie(SESSION_COOKIE);
}

export function requireAuth(req, res, next) {
  const raw = req.signedCookies[SESSION_COOKIE];
  if (!raw) return res.redirect('/admin/login');
  try {
    const session = JSON.parse(raw);
    req.session = session;
    res.locals.csrfToken = session.csrfToken;
    res.locals.currentUser = { email: session.email };
    return next();
  } catch {
    return res.redirect('/admin/login');
  }
}

export function verifyCsrf(req, res, next) {
  if (!req.session || req.body.csrf !== req.session.csrfToken) {
    return res.status(403).render('admin/error.njk', {
      title: 'Erro de seguranca',
      message: 'Token de seguranca invalido ou expirado. Volte e tente novamente.',
    });
  }
  return next();
}

// ---------- in-memory login rate limit: 5 attempts / minute per IP ----------

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

export function checkRateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}
