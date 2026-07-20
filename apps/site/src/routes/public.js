// Public site: single landing page, content read from SQLite on every request.
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Gallery images uploaded via the admin live in the media table, not on disk.
router.get('/media/:id', (req, res) => {
  const row = db.prepare('SELECT mime, data FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(row.data);
});

router.get('/', (req, res) => {
  const settings = res.locals.settings;
  const equipment = db.prepare('SELECT * FROM equipment ORDER BY sort ASC, id ASC').all();
  const partners = db.prepare('SELECT * FROM partners ORDER BY sort ASC, id ASC').all();
  const gallery = db.prepare('SELECT * FROM gallery ORDER BY sort ASC, id ASC').all();

  // Promotional price leaves the page automatically after its end date (style guide rule).
  const today = new Date().toISOString().slice(0, 10);
  const promoActive = Boolean(settings.promo_ends) && today <= settings.promo_ends;

  // Final booking channel is still pending confirmation; WhatsApp is the fallback CTA.
  const bookingUrl = settings.booking_url || settings.whatsapp_atendimento;

  res.render('public/home.njk', {
    title: 'Padel Experience — Padel no Aeroporto de Brasília',
    metaDescription:
      'Padel no Aeroporto Internacional de Brasília, no estacionamento do bolsão A. Quadras abertas todos os dias, 24 horas. Reserve sua partida.',
    equipment,
    partners,
    gallery,
    promoActive,
    bookingUrl,
  });
});

export default router;
