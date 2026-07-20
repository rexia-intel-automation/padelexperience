// Password hashing (scrypt) + signed-cookie session + CSRF + login rate limiting.
import crypto from 'node:crypto';
import fs from 'node:fs';

const SESSION_COOKIE = 'padelexp_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h

// scrypt cost parameters for NEW hashes. Bumped above the Node default
// (N=16384) for a stronger work factor. Params are embedded in the stored
// string ("N:r:p:salt:hash") so old-format hashes ("salt:hash") from before
// this change still verify — see verifyPassword. maxmem must be raised because
// scrypt needs ~128*N*r bytes, which exceeds the 32 MB default at N=32768.
const KEYLEN = 64;
const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2; // headroom over the minimum

function scrypt(password, salt, { N, r, p }) {
  return crypto.scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: SCRYPT_MAXMEM });
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = scrypt(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
  return `${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split(':');
  let params;
  let salt;
  let hash;
  if (parts.length === 5) {
    // New format: N:r:p:salt:hash
    const [n, r, p, s, h] = parts;
    params = { N: Number(n), r: Number(r), p: Number(p) };
    salt = s;
    hash = h;
  } else if (parts.length === 2) {
    // Legacy format: salt:hash (Node scrypt defaults, N=16384/r=8/p=1)
    [salt, hash] = parts;
    params = { N: 16384, r: 8, p: 1 };
  } else {
    return false;
  }
  if (!salt || !hash || !Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedBuffer = scrypt(password, salt, params);
  return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

// Constant-time defense against user enumeration: when the login flow finds no
// matching user, it should still spend the same work as a real verify instead
// of returning early. Call this in that branch so response timing does not
// reveal whether the e-mail exists. Uses a throwaway hash generated at module
// load, and always returns false.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function dummyVerify(password) {
  verifyPassword(password || '', DUMMY_HASH);
  return false;
}

export function createSession(res, user) {
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify({ userId: user.id, email: user.email, csrfToken });
  res.cookie(SESSION_COOKIE, payload, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
    // multer runs before this middleware on upload routes, so a rejected
    // request may already have a temp file on disk. Remove it so failed CSRF
    // checks do not leak orphaned uploads. No-op when there is no upload.
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
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
