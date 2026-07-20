// Admin CMS routes: auth, dashboard, equipment CRUD, partners CRUD, gallery CRUD, settings.
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { db, uploadsDir } from '../db.js';
import {
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
  verifyCsrf,
  checkRateLimit,
} from '../auth.js';

const router = Router();

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

// Converts an uploaded file to webp and stores it in the media table, deleting
// the multer temp file afterwards. Returns the '/media/<id>' path.
async function storeUploadAsMedia(file) {
  const webp = await sharp(file.path).rotate().webp({ quality: 82 }).toBuffer();
  await fs.promises.unlink(file.path);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO media (mime, data) VALUES (?, ?)')
    .run('image/webp', webp);
  return `/media/${lastInsertRowid}`;
}

// Removes the media row behind a gallery image, if it was stored in the DB.
function deleteMediaIfOwned(imagePath) {
  if (typeof imagePath === 'string' && imagePath.startsWith('/media/')) {
    const id = imagePath.slice('/media/'.length);
    db.prepare('DELETE FROM media WHERE id = ?').run(id);
  }
}

function notFound(res, message) {
  return res.status(404).render('admin/error.njk', { title: 'Não encontrado', message });
}

// ---------- auth ----------

router.get('/login', (req, res) => {
  if (req.signedCookies.padelexp_session) return res.redirect('/admin');
  res.render('admin/login.njk', { title: 'Entrar — Admin Padel Experience' });
});

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).render('admin/login.njk', {
      title: 'Entrar — Admin Padel Experience',
      error: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
    });
  }

  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());

  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).render('admin/login.njk', {
      title: 'Entrar — Admin Padel Experience',
      error: 'E-mail ou senha inválidos.',
      email,
    });
  }

  createSession(res, user);
  return res.redirect('/admin');
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(res);
  res.redirect('/admin/login');
});

// everything below requires an authenticated session
router.use(requireAuth);

// ---------- dashboard ----------

router.get('/', (req, res) => {
  const equipmentCount = db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n;
  const partnerCount = db.prepare('SELECT COUNT(*) AS n FROM partners').get().n;
  const galleryCount = db.prepare('SELECT COUNT(*) AS n FROM gallery').get().n;
  const settings = res.locals.settings;
  const pending = [];
  if (!settings.booking_url) pending.push('Canal final de reserva (CTA "Reservar quadra" usa o WhatsApp)');
  if (!settings.cancel_policy) pending.push('Regras de cancelamento');
  if (!settings.access_notes) pending.push('Instruções de acesso ao bolsão A');
  const equipmentUnitPending = db.prepare("SELECT COUNT(*) AS n FROM equipment WHERE unit = ''").get().n;
  if (equipmentUnitPending > 0) pending.push('Unidade de cobrança dos equipamentos');

  res.render('admin/dashboard.njk', {
    title: 'Painel — Admin Padel Experience',
    equipmentCount,
    partnerCount,
    galleryCount,
    pending,
  });
});

// ---------- equipment (equipamentos) ----------

router.get('/equipamentos', (req, res) => {
  const items = db.prepare('SELECT * FROM equipment ORDER BY sort ASC, id ASC').all();
  res.render('admin/equipment-list.njk', { title: 'Equipamentos — Admin', items });
});

router.get('/equipamentos/novo', (req, res) => {
  res.render('admin/equipment-form.njk', { title: 'Novo equipamento — Admin', item: null });
});

router.post('/equipamentos', verifyCsrf, (req, res) => {
  const { name = '', description = '', price = '', unit = '', sort = 0 } = req.body;
  if (!name.trim()) {
    return res.status(400).render('admin/equipment-form.njk', {
      title: 'Novo equipamento — Admin',
      item: null,
      error: 'Nome é obrigatório.',
    });
  }
  db.prepare('INSERT INTO equipment (name, description, price, unit, sort) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), description, price, unit, Number(sort) || 0);
  res.redirect('/admin/equipamentos');
});

router.get('/equipamentos/:id/editar', (req, res) => {
  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  res.render('admin/equipment-form.njk', { title: 'Editar equipamento — Admin', item });
});

router.post('/equipamentos/:id', verifyCsrf, (req, res) => {
  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  const { name = '', description = '', price = '', unit = '', sort = 0 } = req.body;
  if (!name.trim()) {
    return res.status(400).render('admin/equipment-form.njk', {
      title: 'Editar equipamento — Admin',
      item,
      error: 'Nome é obrigatório.',
    });
  }
  db.prepare('UPDATE equipment SET name = ?, description = ?, price = ?, unit = ?, sort = ? WHERE id = ?')
    .run(name.trim(), description, price, unit, Number(sort) || 0, item.id);
  res.redirect('/admin/equipamentos');
});

router.get('/equipamentos/:id/excluir', (req, res) => {
  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Equipamento não encontrado.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir equipamento — Admin',
    itemLabel: item.name,
    actionUrl: `/admin/equipamentos/${item.id}/excluir`,
    backUrl: '/admin/equipamentos',
  });
});

router.post('/equipamentos/:id/excluir', verifyCsrf, (req, res) => {
  db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  res.redirect('/admin/equipamentos');
});

// ---------- partners (parceiros) ----------

router.get('/parceiros', (req, res) => {
  const items = db.prepare('SELECT * FROM partners ORDER BY sort ASC, id ASC').all();
  res.render('admin/partner-list.njk', { title: 'Parceiros — Admin', items });
});

router.get('/parceiros/novo', (req, res) => {
  res.render('admin/partner-form.njk', { title: 'Novo parceiro — Admin', item: null });
});

router.post('/parceiros', upload.single('logo'), verifyCsrf, (req, res) => {
  const { name = '', role = '', description = '', instagram_url = '', announcement_url = '', logo_url = '', sort = 0 } = req.body;
  if (!name.trim()) {
    return res.status(400).render('admin/partner-form.njk', {
      title: 'Novo parceiro — Admin',
      item: null,
      error: 'Nome é obrigatório.',
    });
  }
  const logo = req.file ? `/uploads/${req.file.filename}` : (externalImageUrl(logo_url) || null);
  db.prepare(
    'INSERT INTO partners (name, role, description, instagram_url, announcement_url, logo, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), role, description, instagram_url, announcement_url, logo, Number(sort) || 0);
  res.redirect('/admin/parceiros');
});

router.get('/parceiros/:id/editar', (req, res) => {
  const item = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Parceiro não encontrado.');
  res.render('admin/partner-form.njk', { title: 'Editar parceiro — Admin', item });
});

router.post('/parceiros/:id', upload.single('logo'), verifyCsrf, (req, res) => {
  const item = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Parceiro não encontrado.');
  const { name = '', role = '', description = '', instagram_url = '', announcement_url = '', logo_url = '', sort = 0 } = req.body;
  if (!name.trim()) {
    return res.status(400).render('admin/partner-form.njk', {
      title: 'Editar parceiro — Admin',
      item,
      error: 'Nome é obrigatório.',
    });
  }
  const logo = req.file ? `/uploads/${req.file.filename}` : (externalImageUrl(logo_url) || item.logo);
  db.prepare(
    'UPDATE partners SET name = ?, role = ?, description = ?, instagram_url = ?, announcement_url = ?, logo = ?, sort = ? WHERE id = ?'
  ).run(name.trim(), role, description, instagram_url, announcement_url, logo, Number(sort) || 0, item.id);
  res.redirect('/admin/parceiros');
});

router.get('/parceiros/:id/excluir', (req, res) => {
  const item = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Parceiro não encontrado.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir parceiro — Admin',
    itemLabel: item.name,
    actionUrl: `/admin/parceiros/${item.id}/excluir`,
    backUrl: '/admin/parceiros',
  });
});

router.post('/parceiros/:id/excluir', verifyCsrf, (req, res) => {
  db.prepare('DELETE FROM partners WHERE id = ?').run(req.params.id);
  res.redirect('/admin/parceiros');
});

// ---------- gallery (galeria) ----------

router.get('/galeria', (req, res) => {
  const items = db.prepare('SELECT * FROM gallery ORDER BY sort ASC, id ASC').all();
  res.render('admin/gallery-list.njk', { title: 'Galeria — Admin', items });
});

router.get('/galeria/novo', (req, res) => {
  res.render('admin/gallery-form.njk', { title: 'Nova imagem — Admin', item: null });
});

router.post('/galeria', upload.single('image'), verifyCsrf, async (req, res) => {
  const { caption = '', sort = 0, image_url = '' } = req.body;

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
    return res.status(400).render('admin/gallery-form.njk', {
      title: 'Nova imagem — Admin',
      item: null,
      error: 'Envie um arquivo de imagem ou informe uma URL.',
    });
  }

  db.prepare('INSERT INTO gallery (image, caption, sort) VALUES (?, ?, ?)').run(image, caption, Number(sort) || 0);
  res.redirect('/admin/galeria');
});

router.get('/galeria/:id/editar', (req, res) => {
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Imagem não encontrada.');
  res.render('admin/gallery-form.njk', { title: 'Editar imagem — Admin', item });
});

router.post('/galeria/:id', upload.single('image'), verifyCsrf, async (req, res) => {
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Imagem não encontrada.');
  const { caption = '', sort = 0, image_url = '' } = req.body;

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
    deleteMediaIfOwned(item.image);
  } else if (externalImageUrl(image_url)) {
    image = externalImageUrl(image_url);
    deleteMediaIfOwned(item.image);
  }

  db.prepare('UPDATE gallery SET image = ?, caption = ?, sort = ? WHERE id = ?').run(image, caption, Number(sort) || 0, item.id);
  res.redirect('/admin/galeria');
});

router.get('/galeria/:id/excluir', (req, res) => {
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!item) return notFound(res, 'Imagem não encontrada.');
  res.render('admin/confirm-delete.njk', {
    title: 'Excluir imagem — Admin',
    itemLabel: item.caption || `Imagem #${item.id}`,
    actionUrl: `/admin/galeria/${item.id}/excluir`,
    backUrl: '/admin/galeria',
  });
});

router.post('/galeria/:id/excluir', verifyCsrf, (req, res) => {
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (item) deleteMediaIfOwned(item.image);
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.redirect('/admin/galeria');
});

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
  { key: 'promo_price', label: 'Preço promocional (R$/hora/quadra)', hint: 'Somente o número, ex.: 120,00' },
  { key: 'promo_per_person', label: 'Referência por pessoa (promocional)', hint: 'Ex.: 30,00' },
  { key: 'promo_ends', label: 'Fim da promoção (AAAA-MM-DD)', hint: 'Após esta data o card promocional sai do site automaticamente.' },
  { key: 'regular_price', label: 'Preço regular (R$/hora/quadra)', hint: 'Ex.: 150,00' },
  { key: 'regular_per_person', label: 'Referência por pessoa (regular)', hint: 'Ex.: 37,50' },
  { key: 'hours', label: 'Funcionamento', hint: '' },
  { key: 'location', label: 'Localização', hint: '' },
  { key: 'access_notes', label: 'Instruções de acesso', hint: 'Pendente de confirmação — vazio exibe [A CONFIRMAR] no site.' },
  { key: 'cancel_policy', label: 'Regras de cancelamento', hint: 'Pendente de confirmação — vazio exibe [A CONFIRMAR] no site.' },
];

router.get('/configuracoes', (req, res) => {
  res.render('admin/settings.njk', {
    title: 'Configurações — Admin',
    fields: SETTINGS_FIELDS,
    values: res.locals.settings,
  });
});

router.post('/configuracoes', verifyCsrf, (req, res) => {
  const update = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const field of SETTINGS_FIELDS) {
      update.run(field.key, String(req.body[field.key] ?? ''));
    }
  });
  tx();
  res.redirect('/admin/configuracoes');
});

export default router;
