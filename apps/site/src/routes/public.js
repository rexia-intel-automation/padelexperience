// Public site: single landing page, content read from MySQL on every request.
import { Router } from 'express';
import { all, get } from '../db.js';

const router = Router();

// Gallery images uploaded via the admin live in the media table, not on disk.
router.get('/media/:id', async (req, res, next) => {
  try {
    const row = await get('SELECT mime, data FROM media WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.data);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const settings = res.locals.settings;
    const equipment = await all('SELECT * FROM equipment ORDER BY sort ASC, id ASC');
    const partners = await all('SELECT * FROM partners ORDER BY sort ASC, id ASC');
    const gallery = await all('SELECT * FROM gallery ORDER BY sort ASC, id ASC');

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
  } catch (err) {
    next(err);
  }
});

export default router;
