// Admin CMS routes: auth, dashboard, equipment CRUD, partners CRUD, gallery CRUD, settings.
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { all, get, run, uploadsDir } from '../db.js';
import {
  verifyPassword,
  dummyVerify,
  createSession,
  destroySession,
  requireAuth,
  verifyCsrf,
  checkRateLimit,
} from '../auth.js';

const router = Router();

// express 4 does not catch rejected promises from async handlers on its own
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Formato de imagem não suportado'), ok);
  },
});

// Partner logos and gallery images may also be provided as a direct link to
// an external source, as an alternative to uploading a file.
function externalImageUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//.test(url) ? url : '';
}

// Validates operator-supplied Google Maps values before they reach the page.
// maps_url feeds an "Abrir no Google Maps" link; maps_embed feeds an <iframe src>
// that runs with scripts. Anything not https:// (javascript:, http:, data:, …) is
// dropped to ''. For the embed we additionally require a Google Maps host, since
// an arbitrary https origin in the iframe is still an untrusted frame. Returning
// '' is safe: the template hides the link/map when the setting is empty.
function safeMapsUrl(value, { embed = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:') return '';
  if (embed) {
    const host = url.hostname.toLowerCase();
    const ok = host === 'www.google.com' || host === 'google.com' || host === 'maps.google.com';
    if (!ok) return '';
  }
  return raw;
}

// Converts an uploaded file to webp and stores it in the media table, deleting
// the multer temp file afterwards. Returns the '/media/<id>' path.
async function storeUploadAsMedia(file) {
  const webp = await sharp(file.path).rotate().webp({ quality: 82 }).toBuffer();
  await fs.promises.unlink(file.path);
  const { insertId } = await run('INSERT INTO media (mime, data) VALUES (?, ?)', ['image/webp', webp]);
  return `/media/${insertId}`;
}

// Removes the media row behind a gallery image, if it was stored in the DB.
async function deleteMediaIfOwned(imagePath) {
  if (typeof imagePath === 'string' && imagePath.startsWith('/media/')) {
    const id = imagePath.slice('/media/'.length);
    await run('DELETE FROM media WHERE id = ?', [id]);
  }
}

// Clamps a body field to a max length, tolerating array bodies (e.g. name=a&name=b).
function field(v, max = 255) {
  const s = Array.isArray(v) ? v[0] : v;
  return String(s ?? '').trim().slice(0, max);
}

function notFound(res, message) {
  return res.status(404).render('admin/error.njk', { title: 'Não encontrado', message });
}

// ---------- auth ----------

router.get('/login', (req, res) => {
  if (req.signedCookies.padelexp_session) return res.redirect('/admin');
  res.render('admin/login.njk', { title: 'Entrar — Admin Padel Experience' });
});

router.post('/login', wrap(async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).render('admin/login.njk', {
      title: 'Entrar — Admin Padel Experience',
      error: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
    });
  }

  const { email, password } = req.body;
  const user = await get('SELECT * FROM users WHERE email = ?', [String(email || '').trim().toLowerCase()]);

  const ok = user ? verifyPassword(password || '', user.password_hash) : dummyVerify(password || '');
  if (!ok) {
    return res.status(401).render('admin/login.njk', {
      title: 'Entrar — Admin Padel Experience',
      error: 'E-mail ou senha inválidos.',
      email,
    });
  }

  createSession(res, user);
  return res.redirect('/admin');
}));

router.post('/logout', requireAuth, (req, res) => {
  destroySession(res);
  res.redirect('/admin/login');
});

// everything below requires an authenticated session
router.use(requireAuth);

// ---------- dashboard ----------

router.get('/', wrap(async (req, res) => {
  const equipmentCount = (await get('SELECT COUNT(*) AS n FROM equipment')).n;
  const partnerCount = (await get('SELECT COUNT(*) AS n FROM partners')).n;
  const galleryCount = (await get('SELECT COUNT(*) AS n FROM gallery')).n;
  const settings = res.locals.settings;
  const pending = [];
  if (!settings.booking_url) pending.push('Canal final de reserva (CTA "Reservar quadra" usa o WhatsApp)');
  if (!settings.access_notes) pending.push('Instruções de acesso ao bolsão A');

  res.render('admin/dashboard.njk', {
    title: 'Painel — Admin Padel Experience',
    equipmentCount,
    partnerCount,
    galleryCount,
    pending,
  });
}));

// ---------- equipment (equipamentos) ----------

router.get('/equipamentos', wrap(async (req, res) => {
  const items = await all('SELECT * FROM equipment ORDER BY sort ASC, id ASC');
  res.render('admin/equipment-list.njk', { title: 'Equipamentos — Admin', items });
}));

router.get('/equipamentos/novo', (req, res) => {
  res.render('admin/equipment-form.njk', { title: 'Novo equipamento — Admin', item: null });
});

router.post('/equipamentos', verifyCsrf, wrap(async (req, res) => {
  const name = field(req.body.name, 255);
  const description = field(req.body.description, 65535);
  const price = field(req.body.price, 64);
  const sort = req.body.sort ?? 0;
  if (!name.trim()) {
    return res.status(400).render('admin/equipment-form.njk', {
      title: 'Novo equipamento — Admin',
      item: null,
      error: 'Nome é obrigatório.',
    });
  }
  await run('INSERT INTO equipment (name, description, price, sort) VALUES (?, ?, ?, ?)', [
    name.trim(), description, price, Number(sort) || 0,
  ]);
  res.redirect('/admin/equipamentos');
}));

router.get('/equipamentos/:id/editar', wrap(async (req, res) => {
  const item = await get('SELECT * FROM equipment WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  res.render('admin/equipment-form.njk', { title: 'Editar equipamento — Admin', item });
}));

router.post('/equipamentos/:id', verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM equipment WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  const name = field(req.body.name, 255);
  const description = field(req.body.description, 65535);
  const price = field(req.body.price, 64);
  const sort = req.body.sort ?? 0;
  if (!name.trim()) {
    return res.status(400).render('admin/equipment-form.njk', {
      title: 'Editar equipamento — Admin',
      item,
      error: 'Nome é obrigatório.',
    });
  }
  await run('UPDATE equipment SET name = ?, description = ?, price = ?, sort = ? WHERE id = ?', [
    name.trim(), description, price, Number(sort) || 0, item.id,
  ]);
  res.redirect('/admin/equipamentos');
}));

router.get('/equipamentos/:id/excluir', wrap(async (req, res) => {
  const item = await get('SELECT * FROM equipment WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir equipamento — Admin',
    itemLabel: item.name,
    actionUrl: `/admin/equipamentos/${item.id}/excluir`,
    backUrl: '/admin/equipamentos',
  });
}));

router.post('/equipamentos/:id/excluir', verifyCsrf, wrap(async (req, res) => {
  await run('DELETE FROM equipment WHERE id = ?', [req.params.id]);
  res.redirect('/admin/equipamentos');
}));

// ---------- promos (promoções) ----------

router.get('/promocoes', wrap(async (req, res) => {
  const items = await all('SELECT * FROM promos ORDER BY sort ASC, id ASC');
  res.render('admin/promo-list.njk', { title: 'Promoções — Admin', items });
}));

router.get('/promocoes/novo', (req, res) => {
  res.render('admin/promo-form.njk', { title: 'Nova promoção — Admin', item: null });
});

router.post('/promocoes', verifyCsrf, wrap(async (req, res) => {
  const title = field(req.body.title, 255);
  const price = field(req.body.price, 64);
  const price_note = req.body.price_note !== undefined ? field(req.body.price_note, 128) : '/ hora / quadra';
  const description = field(req.body.description, 512);
  const sort = req.body.sort ?? 0;
  if (!title.trim()) {
    return res.status(400).render('admin/promo-form.njk', {
      title: 'Nova promoção — Admin',
      item: null,
      error: 'Título é obrigatório.',
    });
  }
  await run('INSERT INTO promos (title, price, price_note, description, active, sort) VALUES (?, ?, ?, ?, ?, ?)', [
    title.trim(), price, price_note, description, req.body.active ? 1 : 0, Number(sort) || 0,
  ]);
  res.redirect('/admin/promocoes');
}));

router.get('/promocoes/:id/editar', wrap(async (req, res) => {
  const item = await get('SELECT * FROM promos WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Promoção não encontrada.');
  res.render('admin/promo-form.njk', { title: 'Editar promoção — Admin', item });
}));

router.post('/promocoes/:id', verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM promos WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Promoção não encontrada.');
  const title = field(req.body.title, 255);
  const price = field(req.body.price, 64);
  const price_note = req.body.price_note !== undefined ? field(req.body.price_note, 128) : '/ hora / quadra';
  const description = field(req.body.description, 512);
  const sort = req.body.sort ?? 0;
  if (!title.trim()) {
    return res.status(400).render('admin/promo-form.njk', {
      title: 'Editar promoção — Admin',
      item,
      error: 'Título é obrigatório.',
    });
  }
  await run('UPDATE promos SET title = ?, price = ?, price_note = ?, description = ?, active = ?, sort = ? WHERE id = ?', [
    title.trim(), price, price_note, description, req.body.active ? 1 : 0, Number(sort) || 0, item.id,
  ]);
  res.redirect('/admin/promocoes');
}));

router.get('/promocoes/:id/excluir', wrap(async (req, res) => {
  const item = await get('SELECT * FROM promos WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Promoção não encontrada.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir promoção — Admin',
    itemLabel: item.title,
    actionUrl: `/admin/promocoes/${item.id}/excluir`,
    backUrl: '/admin/promocoes',
  });
}));

router.post('/promocoes/:id/excluir', verifyCsrf, wrap(async (req, res) => {
  await run('DELETE FROM promos WHERE id = ?', [req.params.id]);
  res.redirect('/admin/promocoes');
}));

// ---------- partners (parceiros) ----------

router.get('/parceiros', wrap(async (req, res) => {
  const items = await all('SELECT * FROM partners ORDER BY sort ASC, id ASC');
  res.render('admin/partner-list.njk', { title: 'Parceiros — Admin', items });
}));

router.get('/parceiros/novo', (req, res) => {
  res.render('admin/partner-form.njk', { title: 'Novo parceiro — Admin', item: null });
});

router.post('/parceiros', upload.single('logo'), verifyCsrf, wrap(async (req, res) => {
  const name = field(req.body.name, 255);
  const role = field(req.body.role, 255);
  const description = field(req.body.description, 65535);
  const instagram_url = field(req.body.instagram_url, 512);
  const announcement_url = field(req.body.announcement_url, 512);
  const logo_url = req.body.logo_url;
  const sort = req.body.sort ?? 0;
  if (!name.trim()) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).render('admin/partner-form.njk', {
      title: 'Novo parceiro — Admin',
      item: null,
      error: 'Nome é obrigatório.',
    });
  }

  let logo;
  if (req.file) {
    try {
      logo = await storeUploadAsMedia(req.file);
    } catch {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).render('admin/partner-form.njk', {
        title: 'Novo parceiro — Admin',
        item: null,
        error: 'Não foi possível processar o arquivo enviado. Verifique se é uma imagem válida.',
      });
    }
  } else {
    logo = externalImageUrl(logo_url) || null;
  }

  await run(
    'INSERT INTO partners (name, role, description, instagram_url, announcement_url, logo, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name.trim(), role, description, instagram_url, announcement_url, logo, Number(sort) || 0]
  );
  res.redirect('/admin/parceiros');
}));

router.get('/parceiros/:id/editar', wrap(async (req, res) => {
  const item = await get('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Parceiro não encontrado.');
  res.render('admin/partner-form.njk', { title: 'Editar parceiro — Admin', item });
}));

router.post('/parceiros/:id', upload.single('logo'), verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  if (!item) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return notFound(res, 'Parceiro não encontrado.');
  }
  const name = field(req.body.name, 255);
  const role = field(req.body.role, 255);
  const description = field(req.body.description, 65535);
  const instagram_url = field(req.body.instagram_url, 512);
  const announcement_url = field(req.body.announcement_url, 512);
  const logo_url = req.body.logo_url;
  const sort = req.body.sort ?? 0;
  if (!name.trim()) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).render('admin/partner-form.njk', {
      title: 'Editar parceiro — Admin',
      item,
      error: 'Nome é obrigatório.',
    });
  }

  let logo = item.logo;
  if (req.file) {
    try {
      logo = await storeUploadAsMedia(req.file);
    } catch {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).render('admin/partner-form.njk', {
        title: 'Editar parceiro — Admin',
        item,
        error: 'Não foi possível processar o arquivo enviado. Verifique se é uma imagem válida.',
      });
    }
    await deleteMediaIfOwned(item.logo);
  } else if (externalImageUrl(logo_url)) {
    logo = externalImageUrl(logo_url);
    await deleteMediaIfOwned(item.logo);
  }

  await run(
    'UPDATE partners SET name = ?, role = ?, description = ?, instagram_url = ?, announcement_url = ?, logo = ?, sort = ? WHERE id = ?',
    [name.trim(), role, description, instagram_url, announcement_url, logo, Number(sort) || 0, item.id]
  );
  res.redirect('/admin/parceiros');
}));

router.get('/parceiros/:id/excluir', wrap(async (req, res) => {
  const item = await get('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Parceiro não encontrado.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir parceiro — Admin',
    itemLabel: item.name,
    actionUrl: `/admin/parceiros/${item.id}/excluir`,
    backUrl: '/admin/parceiros',
  });
}));

router.post('/parceiros/:id/excluir', verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  if (item) await deleteMediaIfOwned(item.logo);
  await run('DELETE FROM partners WHERE id = ?', [req.params.id]);
  res.redirect('/admin/parceiros');
}));

// ---------- gallery (galeria) ----------

router.get('/galeria', wrap(async (req, res) => {
  const items = await all('SELECT * FROM gallery ORDER BY sort ASC, id ASC');
  res.render('admin/gallery-list.njk', { title: 'Galeria — Admin', items });
}));

router.get('/galeria/novo', (req, res) => {
  res.render('admin/gallery-form.njk', { title: 'Nova imagem — Admin', item: null });
});

router.post('/galeria', upload.single('image'), verifyCsrf, wrap(async (req, res) => {
  const caption = field(req.body.caption, 512);
  const sort = req.body.sort ?? 0;
  const image_url = req.body.image_url;

  let image;
  if (req.file) {
    try {
      image = await storeUploadAsMedia(req.file);
    } catch {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).render('admin/gallery-form.njk', {
        title: 'Nova imagem — Admin',
        item: null,
        error: 'Não foi possível processar o arquivo enviado. Verifique se é uma imagem válida.',
      });
    }
  } else {
    image = externalImageUrl(image_url);
  }

  if (!image) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).render('admin/gallery-form.njk', {
      title: 'Nova imagem — Admin',
      item: null,
      error: 'Envie um arquivo de imagem ou informe uma URL.',
    });
  }

  await run('INSERT INTO gallery (image, caption, sort) VALUES (?, ?, ?)', [image, caption, Number(sort) || 0]);
  res.redirect('/admin/galeria');
}));

router.get('/galeria/:id/editar', wrap(async (req, res) => {
  const item = await get('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Imagem não encontrada.');
  res.render('admin/gallery-form.njk', { title: 'Editar imagem — Admin', item });
}));

router.post('/galeria/:id', upload.single('image'), verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
  if (!item) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return notFound(res, 'Imagem não encontrada.');
  }
  const caption = field(req.body.caption, 512);
  const sort = req.body.sort ?? 0;
  const image_url = req.body.image_url;

  let image = item.image;
  if (req.file) {
    try {
      image = await storeUploadAsMedia(req.file);
    } catch {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).render('admin/gallery-form.njk', {
        title: 'Editar imagem — Admin',
        item,
        error: 'Não foi possível processar o arquivo enviado. Verifique se é uma imagem válida.',
      });
    }
    await deleteMediaIfOwned(item.image);
  } else if (externalImageUrl(image_url)) {
    image = externalImageUrl(image_url);
    await deleteMediaIfOwned(item.image);
  }

  await run('UPDATE gallery SET image = ?, caption = ?, sort = ? WHERE id = ?', [image, caption, Number(sort) || 0, item.id]);
  res.redirect('/admin/galeria');
}));

router.get('/galeria/:id/excluir', wrap(async (req, res) => {
  const item = await get('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
  if (!item) return notFound(res, 'Imagem não encontrada.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir imagem — Admin',
    itemLabel: item.caption || `Imagem #${item.id}`,
    actionUrl: `/admin/galeria/${item.id}/excluir`,
    backUrl: '/admin/galeria',
  });
}));

router.post('/galeria/:id/excluir', verifyCsrf, wrap(async (req, res) => {
  const item = await get('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
  if (item) await deleteMediaIfOwned(item.image);
  await run('DELETE FROM gallery WHERE id = ?', [req.params.id]);
  res.redirect('/admin/galeria');
}));

// ---------- settings (configurações) ----------

const SETTINGS_FIELDS = [
  { key: 'booking_url', label: 'URL de reserva (CTA "Reservar quadra")', hint: 'Pendente de confirmação. Vazio = CTA aponta para o WhatsApp de atendimento.' },
  { key: 'whatsapp_atendimento', label: 'WhatsApp de atendimento', hint: '' },
  { key: 'whatsapp_canal_vip', label: 'Canal VIP no WhatsApp', hint: '' },
  { key: 'app_store', label: 'App Store', hint: '' },
  { key: 'google_play', label: 'Google Play', hint: '' },
  { key: 'linktree', label: 'Linktree', hint: '' },
  { key: 'instagram', label: 'Instagram', hint: '' },
  { key: 'email_parcerias', label: 'E-mail de parcerias', hint: '' },
  { key: 'regular_price', label: 'Preço regular (R$/hora/quadra)', hint: 'Ex.: 150,00' },
  { key: 'regular_per_person', label: 'Preço por pessoa (regular)', hint: 'Ex.: 37,50' },
  { key: 'hours', label: 'Funcionamento', hint: '' },
  { key: 'location', label: 'Localização', hint: '' },
  { key: 'maps_url', label: 'Link do Google Maps', hint: 'Link de compartilhamento usado em "Abrir no Google Maps".' },
  { key: 'maps_embed', label: 'URL de embed do mapa', hint: 'URL do iframe do mapa na seção Localização. Vazio = sem mapa.' },
  { key: 'access_notes', label: 'Instruções de acesso', hint: 'Vazio = o card "Acesso" não aparece no site.' },
];

router.get('/configuracoes', (req, res) => {
  res.render('admin/settings.njk', {
    title: 'Configurações — Admin',
    fields: SETTINGS_FIELDS,
    values: res.locals.settings,
  });
});

router.post('/configuracoes', verifyCsrf, wrap(async (req, res) => {
  for (const field of SETTINGS_FIELDS) {
    let value = String(req.body[field.key] ?? '');
    // The only two settings that flow into an active surface (iframe / link) get
    // scheme (and host, for the embed) validation; an invalid value saves as ''.
    if (field.key === 'maps_embed') value = safeMapsUrl(value, { embed: true });
    else if (field.key === 'maps_url') value = safeMapsUrl(value);
    await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [
      field.key, value,
    ]);
  }
  res.redirect('/admin/configuracoes');
}));

export default router;
