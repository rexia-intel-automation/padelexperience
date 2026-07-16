# Padel Experience — site + CMS

Site oficial do **Padel Experience** — espaço de padel no Aeroporto Internacional de Brasília
(estacionamento do bolsão "A"), aberto todos os dias, 24h — com CMS próprio para gestão de
conteúdo. Projeto desenvolvido pela RexIA.

## Stack

- **Monorepo** npm workspaces, **Node 22** (`.nvmrc`)
- Um único app em `apps/site`: **Express + nunjucks (SSR) + better-sqlite3 + multer**
- **Sem bundler e sem build step** — deliberado, para compatibilidade com o Node.js hosting
  nativo da Hostinger (deploy na conta do cliente)
- Design system do cliente aplicado verbatim a partir do style guide
  (`reference/padel-experience-style-guide(1).html`, v1.1)

## Como rodar

```bash
npm install
npm run dev     # ou npm start
```

- Site: http://localhost:3000 — one-page com as seções Início, Reservas, Equipamentos,
  Localização, Experiência e Parceiros (navegação pelo dock flutuante)
- Admin: http://localhost:3000/admin/login — credenciais em `apps/site/.env`
  (copie de `apps/site/.env.example`)

O banco SQLite (`apps/site/data/site.db`) e a pasta de uploads são criados na primeira
execução com seeds vindos do guia de conteúdo. Apagar o `.db` reseta os seeds.

## CMS

Coleções: **Equipamentos** (locação), **Parceiros**, **Galeria** e **Configurações**
(links, preços, vigência da promoção, textos operacionais).

Regras de negócio herdadas do style guide:

- O card de preço promocional sai do site automaticamente após a data `promo_ends`.
- Parceiras são citadas como "parceira" ou pela função indicada — nunca "patrocinadora".
- Conteúdo pendente de confirmação do cliente exibe **[A CONFIRMAR]** no site e no painel
  (canal final de reserva, unidade de cobrança da locação, cancelamento, acesso).

## Estrutura

```
apps/site/
├── src/            # server.js, db.js (schema + seeds), auth.js, routes/
├── views/          # nunjucks (layouts, public, admin)
├── public/         # css/site.css (design system verbatim + adições), js, img
└── data/           # runtime: SQLite + uploads (gitignored)
reference/          # style guide do cliente, logos e links oficiais (fonte canônica)
docs/               # wireframe inicial
```

Documentação detalhada: `apps/site/README.md` e `CLAUDE.md` (guia para agentes).
