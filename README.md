# Padel Experience — site + CMS

Site oficial do **Padel Experience** — espaço de padel no Aeroporto Internacional de Brasília
(estacionamento do bolsão "A"), aberto todos os dias, 24h — com CMS próprio para gestão de
conteúdo. Projeto desenvolvido pela RexIA.

## Stack

- **Monorepo** npm workspaces, **Node 22** (`.nvmrc`)
- Um único app em `apps/site`: **Express + nunjucks (SSR) + MySQL (mysql2) + multer**
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

O banco é MySQL/MariaDB remoto (credenciais em `apps/site/.env`). O schema é criado no boot
(`CREATE TABLE IF NOT EXISTS`) e os seeds do guia de conteúdo rodam uma única vez, controlados
pela flag `content_seeded` no próprio banco.

## CMS

Coleções: **Equipamentos** (locação), **Promoções**, **Parceiros**, **Galeria** e
**Configurações** (links, preços, textos operacionais).

Regras de negócio herdadas do style guide:

- Cards de promoção são manuais: coleção **Promoções** no CMS, exibidos apenas com `active` marcado.
- Parceiras são citadas como "parceira" ou pela função indicada — nunca "patrocinadora".
- Conteúdo pendente de confirmação do cliente é omitido no site público e listado como
  pendência no painel (canal final de reserva, instruções de acesso etc.).

## Estrutura

```
apps/site/
├── src/            # server.js, db.js (schema + seeds), auth.js, routes/
├── views/          # nunjucks (layouts, public, admin)
├── public/         # css/site.css (design system verbatim + adições), js, img
└── (banco MySQL remoto; imagens da galeria vivem na tabela media, servidas por /media/:id)
reference/          # style guide do cliente, logos e links oficiais (fonte canônica)
docs/               # wireframe inicial
```

Documentação detalhada: `apps/site/README.md` e `CLAUDE.md` (guia para agentes).
