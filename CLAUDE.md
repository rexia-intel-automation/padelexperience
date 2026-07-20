# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

Site + CMS próprio do cliente **Padel Experience** (`www.padelexperience.com.br`) — espaço de padel no Aeroporto Internacional de Brasília (estacionamento do bolsão "A"), aberto todos os dias, 24h. Projeto da RexIA em `D:\RexIA\projetos\`. O papel definido em `D:\RexIA\CLAUDE.md` (criador de propostas) **não se aplica aqui**, e o design system RexIA também não — a identidade visual é 100% a do cliente.

## Comandos

```bash
npm install     # raiz (npm workspaces)
npm run dev     # sobe http://localhost:3000 com --watch
npm start       # idem, sem watch
```

Admin: `http://localhost:3000/admin/login` — credenciais em `apps/site/.env` (não versionado; sem `ADMIN_PASSWORD` o seed gera uma senha aleatória e imprime no console do primeiro start — o seed só roda com o banco vazio). Não há testes automatizados; verificação é manual/via curl (rotas: `/`, `/admin/login`, `/admin`).

## Arquitetura

Monorepo npm workspaces, Node 22 (`.nvmrc`), **um único app** em `apps/site`: Express + nunjucks (SSR) + MySQL (mysql2), sem bundler e sem build step — deliberado, para compatibilidade com o Node.js hosting nativo da Hostinger (deploy futuro na conta do cliente; `padelexperience.com.br` NÃO está na conta Hostinger da RexIA).

- `src/server.js` — entrypoint (`server.js` na raiz do repo é só o shim que o preset Express da Hostinger exige); `src/db.js` — pool mysql2 + schema + seeds (CREATE TABLE IF NOT EXISTS + seed quando vazio, no boot); `src/auth.js` — scrypt + cookie assinado + CSRF + rate limit; `src/routes/{public,admin}.js`.
- Banco: MySQL/MariaDB remoto da Hostinger — env vars `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` obrigatórias em `apps/site/.env` (dev local usa o MESMO banco do staging; credenciais e conexão SSH do staging em `apps/site/.env.staging`, ambos gitignored). Uploads da galeria viram webp (sharp) e vivem na tabela `media` (LONGBLOB), servidos por `/media/:id` — nada de imagem no filesystem; o banco sobrevive aos redeploys (que apagam o dir do app, ver `scripts/staging-sync-env.sh`).
- Site público é **one-page** (`/` com âncoras `#inicio #reservas #equipamentos #localizacao #experiencia #parceiros`) seguindo a "arquitetura de conteúdo recomendada" do style guide. Navegação principal = **dock** flutuante (scroll-spy via IntersectionObserver em `public/js/main.js`).
- CMS (`/admin`): coleções equipment, partners, gallery + settings (chave/valor). Conteúdo aparece no site imediatamente (SSR lê o banco a cada request).

## Fonte canônica de design e conteúdo

`reference/padel-experience-style-guide(1).html` (v1.1) é a autoridade para **design E conteúdo**:

- Arquivo de ~7 MB: NUNCA ler inteiro (linhas gigantes de base64 no body). O CSS fica no bloco `<style>` do início; a seção `id="guia"` ("07 — Guia de conteúdo") tem os fatos do negócio: preços (promo R$ 120/h até 19/07/2026, regular R$ 150/h), equipamentos Adidas, 4 parceiros com funções exatas, pendências.
- `public/css/site.css` = bloco `<style>` do guia copiado **verbatim** + bloco "Site additions" no fim (adições usam apenas tokens do guia; nenhum hex novo). Não editar o bloco do guia.
- Regras vivas (guia + decisões do cliente em 2026-07-19): parceiras são "parceira"/função indicada, nunca "patrocinadora"; cards de promoção são manuais — coleção `promos` no CMS, só aparecem com `active` marcado (o auto-hide por `promo_ends` foi removido); o site não exibe mais "[A CONFIRMAR]" — locação é sempre por hora, regras de cancelamento ficam no app de agendamento e o card "Acesso" só aparece se `access_notes` estiver preenchido; grids de cards nunca deixam um card sozinho na linha (classes `.grid-cols-N` calculadas por `gridCols()` em `routes/public.js`).
- `reference/padelexp_00.txt` — links oficiais (WhatsApp, lojas, Linktree, parcerias@). Nunca digitar links de memória; os seeds em `db.js` já os carregam.
- Logos do cliente em `reference/init_assets/` (SVGs copiados para `apps/site/public/img/`).

## Convenções

- Conteúdo visível em pt-BR (sem emoji); código e comentários em inglês.
- Reserva de quadra acontece fora do site (app Matchpoint / WhatsApp enquanto `booking_url` estiver vazio) — o site nunca promete reserva própria.
- Números e fatos: só o que está no guia de conteúdo ou confirmado pelo cliente; faltando, marcar `[A CONFIRMAR]`.
- Repo: https://github.com/rexia-intel-automation/padelexperience (público — nunca commitar credenciais; `apps/site/.env` é ignorado e o seed gera senha aleatória sem `ADMIN_PASSWORD`). Branches: `main` (estável) e `dev` (trabalho).
