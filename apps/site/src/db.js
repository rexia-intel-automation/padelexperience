// SQLite setup: schema creation + seeds, run once at startup.
// Content model follows the style guide "07 — Guia de conteúdo" (facts only, pending items stay empty).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'site.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    instagram_url TEXT NOT NULL DEFAULT '',
    announcement_url TEXT NOT NULL DEFAULT '',
    logo TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  -- Gallery images uploaded via the admin, stored as webp bytes (no filesystem
  -- dependency for the Hostinger deploy). Maps 1:1 to MySQL: BLOB -> LONGBLOB.
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function placeholderImage(width, height, bg, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="${bg}"/>`
    + `<text x="50%" y="50%" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#ffffff" `
    + `text-anchor="middle" dominant-baseline="middle" opacity="0.88">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ---------- seeds (run once, only when tables are empty) ----------

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@padelexperience.com.br';
    // No hardcoded fallback: without ADMIN_PASSWORD a random one is generated and
    // printed once, so no working credential ever lives in the repository.
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = crypto.randomBytes(9).toString('base64url');
      console.log(`[seed] ADMIN_PASSWORD não definido no .env — senha gerada para ${email}: ${password}`);
    }
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hashPassword(password));
  }

  const equipmentCount = db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n;
  if (equipmentCount === 0) {
    const items = [
      { name: 'Raquete iniciante', description: 'Modelos Adidas Match', price: '25,00', unit: '', sort: 1 },
      { name: 'Raquete profissional', description: 'Modelos Adidas Performance', price: '90,00', unit: '', sort: 2 },
      { name: 'Tubo de bolas', description: 'Adidas Padel', price: '10,00', unit: '', sort: 3 },
    ];
    const insert = db.prepare(
      'INSERT INTO equipment (name, description, price, unit, sort) VALUES (@name, @description, @price, @unit, @sort)'
    );
    for (const item of items) insert.run(item);
  }

  const partnerCount = db.prepare('SELECT COUNT(*) AS n FROM partners').get().n;
  if (partnerCount === 0) {
    const partners = [
      {
        name: 'Adidas Padel Brasil',
        role: 'Materiais esportivos',
        description: 'Parceira oficial de materiais esportivos do Padel Experience. A comunicação de locação cita raquetes Adidas Match, raquetes Adidas Performance e bolas Adidas Padel.',
        instagram_url: 'https://www.instagram.com/allforpadelbr/',
        announcement_url: 'https://www.instagram.com/reel/DaeDnIaRd6r/',
        sort: 1,
      },
      {
        name: 'Playpiso',
        role: 'Construção das quadras',
        description: 'Parceira anunciada como responsável pela construção das quadras. A empresa atua com pisos esportivos desde 1987 e se apresenta como representante exclusiva da Mondo no Brasil.',
        instagram_url: 'https://www.instagram.com/playpiso/',
        announcement_url: 'https://www.instagram.com/p/DZz7fqPRgeG/',
        sort: 2,
      },
      {
        name: 'Arame Cenografia',
        role: 'Cenografia',
        description: 'Parceira de cenografia. O perfil institucional informa atuação em criação, produção e execução de projetos para eventos em Brasília.',
        instagram_url: 'https://www.instagram.com/aramecenografia/',
        announcement_url: 'https://www.instagram.com/p/DaJ-wztMJWL/',
        sort: 3,
      },
      {
        name: 'Casa Érgo',
        role: 'Lounge VIP',
        description: 'Parceira responsável por assinar o Lounge VIP Casa Érgo. A marca se posiciona como ecossistema que conecta design, arquitetura e tecnologia.',
        instagram_url: 'https://www.instagram.com/casaergo/',
        announcement_url: 'https://www.instagram.com/p/DaTH6gkxdKr/',
        sort: 4,
      },
    ];
    const insert = db.prepare(
      'INSERT INTO partners (name, role, description, instagram_url, announcement_url, logo, sort) '
      + 'VALUES (@name, @role, @description, @instagram_url, @announcement_url, NULL, @sort)'
    );
    for (const partner of partners) insert.run(partner);
  }

  const galleryCount = db.prepare('SELECT COUNT(*) AS n FROM gallery').get().n;
  if (galleryCount === 0) {
    const items = [
      { image: placeholderImage(900, 700, '#062b5b', 'Quadras'), caption: 'Quadras — estacionamento do bolsão A', sort: 1 },
      { image: placeholderImage(900, 700, '#001a3f', 'Lounge VIP'), caption: 'Lounge VIP Casa Érgo', sort: 2 },
      { image: placeholderImage(900, 700, '#020a16', 'Estrutura'), caption: 'Estrutura do espaço', sort: 3 },
      { image: placeholderImage(900, 700, '#062b5b', 'Vista noturna'), caption: 'Operação todos os dias, 24 horas', sort: 4 },
    ];
    const insert = db.prepare('INSERT INTO gallery (image, caption, sort) VALUES (@image, @caption, @sort)');
    for (const item of items) insert.run(item);
  }

  // Values below come from the style guide content section; empty values are pending
  // confirmation ("[A CONFIRMAR]" in the UI) and must not be invented.
  const settingsDefaults = {
    whatsapp_atendimento: 'https://api.whatsapp.com/send/?phone=556192927630',
    whatsapp_canal_vip: 'https://www.whatsapp.com/channel/0029VbBqbSQGJP8ETgstVM29',
    app_store: 'https://apps.apple.com/br/app/padel-experience-br/id6780433030',
    google_play: 'https://play.google.com/store/apps/details?id=es.tpc.matchpoint.appclient.padelexperiencebr',
    linktree: 'https://linktr.ee/padel.exp',
    email_parcerias: 'parcerias@padelexperience.com.br',
    instagram: 'https://www.instagram.com/padel.exp',
    booking_url: '',
    promo_price: '120,00',
    promo_per_person: '30,00',
    promo_ends: '2026-07-19',
    regular_price: '150,00',
    regular_per_person: '37,50',
    hours: 'Todos os dias • 24h',
    location: 'Aeroporto Internacional de Brasília — estacionamento do bolsão "A"',
    access_notes: '',
    cancel_policy: '',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settingsDefaults)) {
    insertSetting.run(key, value);
  }
}

seed();

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export { uploadsDir };
