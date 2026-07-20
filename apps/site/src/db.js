// MySQL setup (Hostinger): pool + schema creation + seeds, run once at startup.
// Content model follows the style guide "07 — Guia de conteúdo" (facts only, pending items stay empty).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');

// multer still writes temp files here before sharp converts them to webp
fs.mkdirSync(uploadsDir, { recursive: true });

for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Missing required env var ${name} (see .env)`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,
});

export async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function get(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS equipment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price VARCHAR(64) NOT NULL DEFAULT '',
    unit VARCHAR(64) NOT NULL DEFAULT '',
    sort INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS partners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    instagram_url VARCHAR(512) NOT NULL DEFAULT '',
    announcement_url VARCHAR(512) NOT NULL DEFAULT '',
    logo TEXT,
    sort INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS gallery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image TEXT NOT NULL,
    caption VARCHAR(512) NOT NULL DEFAULT '',
    sort INT NOT NULL DEFAULT 0
  )`,
  // Promo cards on the pricing section: shown on the site only while active.
  `CREATE TABLE IF NOT EXISTS promos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    price VARCHAR(64) NOT NULL DEFAULT '',
    price_note VARCHAR(128) NOT NULL DEFAULT '/ hora / quadra',
    description VARCHAR(512) NOT NULL DEFAULT '',
    active TINYINT NOT NULL DEFAULT 0,
    sort INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(191) PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  // Gallery images uploaded via the admin, stored as webp bytes (no filesystem
  // dependency: Hostinger redeploys wipe the app dir, the DB persists).
  `CREATE TABLE IF NOT EXISTS media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mime VARCHAR(64) NOT NULL,
    data LONGBLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

function placeholderImage(width, height, bg, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect width="100%" height="100%" fill="${bg}"/>`
    + `<text x="50%" y="50%" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#ffffff" `
    + `text-anchor="middle" dominant-baseline="middle" opacity="0.88">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ---------- seeds (run once, only when tables are empty) ----------

async function seed() {
  const userCount = (await get('SELECT COUNT(*) AS n FROM users')).n;
  if (userCount === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@padelexperience.com.br';
    // No hardcoded fallback: without ADMIN_PASSWORD a random one is generated and
    // printed once, so no working credential ever lives in the repository.
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = crypto.randomBytes(9).toString('base64url');
      console.log(`[seed] ADMIN_PASSWORD não definido no .env — senha gerada para ${email}: ${password}`);
    }
    await run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hashPassword(password)]);
  }

  const equipmentCount = (await get('SELECT COUNT(*) AS n FROM equipment')).n;
  if (equipmentCount === 0) {
    const items = [
      { name: 'Raquete iniciante', description: 'Modelos Adidas Match', price: '25,00', unit: '', sort: 1 },
      { name: 'Raquete profissional', description: 'Modelos Adidas Performance', price: '90,00', unit: '', sort: 2 },
      { name: 'Tubo de bolas', description: 'Adidas Padel', price: '10,00', unit: '', sort: 3 },
    ];
    for (const item of items) {
      await run('INSERT INTO equipment (name, description, price, unit, sort) VALUES (?, ?, ?, ?, ?)', [
        item.name, item.description, item.price, item.unit, item.sort,
      ]);
    }
  }

  const partnerCount = (await get('SELECT COUNT(*) AS n FROM partners')).n;
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
    for (const partner of partners) {
      await run(
        'INSERT INTO partners (name, role, description, instagram_url, announcement_url, logo, sort) VALUES (?, ?, ?, ?, ?, NULL, ?)',
        [partner.name, partner.role, partner.description, partner.instagram_url, partner.announcement_url, partner.sort]
      );
    }
  }

  const promoCount = (await get('SELECT COUNT(*) AS n FROM promos')).n;
  if (promoCount === 0) {
    // Launch promo from the style guide; inactive because the promo period ended
    // and promo cards are now toggled manually in the CMS.
    await run(
      'INSERT INTO promos (title, price, price_note, description, active, sort) VALUES (?, ?, ?, ?, 0, 1)',
      ['Inauguração', '120,00', '/ hora / quadra', 'Preço por pessoa: R$ 30,00.']
    );
  }

  const galleryCount = (await get('SELECT COUNT(*) AS n FROM gallery')).n;
  if (galleryCount === 0) {
    const items = [
      { image: placeholderImage(900, 700, '#062b5b', 'Quadras'), caption: 'Quadras — estacionamento do bolsão A', sort: 1 },
      { image: placeholderImage(900, 700, '#001a3f', 'Lounge VIP'), caption: 'Lounge VIP Casa Érgo', sort: 2 },
      { image: placeholderImage(900, 700, '#020a16', 'Estrutura'), caption: 'Estrutura do espaço', sort: 3 },
      { image: placeholderImage(900, 700, '#062b5b', 'Vista noturna'), caption: 'Operação todos os dias, 24 horas', sort: 4 },
    ];
    for (const item of items) {
      await run('INSERT INTO gallery (image, caption, sort) VALUES (?, ?, ?)', [item.image, item.caption, item.sort]);
    }
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
  for (const [key, value] of Object.entries(settingsDefaults)) {
    await run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)', [key, value]);
  }
}

export async function init() {
  for (const ddl of SCHEMA) await run(ddl);
  await seed();
}

export async function getSettings() {
  const rows = await all('SELECT `key`, value FROM settings');
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export { uploadsDir };
