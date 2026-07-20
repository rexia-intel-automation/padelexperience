// Public site: single landing page, content read from MySQL on every request.
import { Router } from 'express';
import { all, get } from '../db.js';

const router = Router();

// Column count for a card grid that never leaves a single card alone on a row
// (e.g. 4 -> 1x4, 5 -> 3+2, 7 -> 4+3). Small counts get one column each.
function gridCols(n) {
  if (n <= 4) return Math.max(n, 1);
  for (const c of [3, 4]) if (n % c === 0 || n % c >= 2) return c;
  return 2;
}

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
    // Promo cards are toggled manually in the CMS.
    const promos = await all('SELECT * FROM promos WHERE active = 1 ORDER BY sort ASC, id ASC');

    // Final booking channel is still pending confirmation; WhatsApp is the fallback CTA.
    const bookingUrl = settings.booking_url || settings.whatsapp_atendimento;

    res.render('public/home.njk', {
      title: 'Padel Experience — Padel no Aeroporto de Brasília',
      metaDescription:
        'Padel no Aeroporto Internacional de Brasília, no estacionamento do bolsão A. Quadras abertas todos os dias, 24 horas. Reserve sua partida.',
      equipment,
      partners,
      gallery,
      promos,
      promoCols: gridCols(promos.length),
      factCols: gridCols(settings.access_notes ? 3 : 2),
      galleryCols: gridCols(gallery.length),
      priceImage: gallery.length ? gallery[0].image : '',
      bookingUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
