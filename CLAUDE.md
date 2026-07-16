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

Admin: `http://localhost:3000/admin/login` — credenciais em `apps/site/.env` (não versionado; sem `ADMIN_PASSWORD` o seed gera uma senha aleatória e imprime no console do primeiro start). Não há testes automatizados; verificação é manual/via curl (rotas: `/`, `/admin/login`, `/admin`).

## Arquitetura

Monorepo npm workspaces, Node 22 (`.nvmrc`), **um único app** em `apps/site`: Express + nunjucks (SSR) + better-sqlite3, sem bundler e sem build step — deliberado, para compatibilidade com o Node.js hosting nativo da Hostinger (deploy futuro na conta do cliente; `padelexperience.com.br` NÃO está na conta Hostinger da RexIA).

- `src/server.js` — entrypoint; `src/db.js` — schema + seeds (roda na 1ª execução; DB em `apps/site/data/site.db`, gitignored — apagar o arquivo reseta os seeds); `src/auth.js` — scrypt + cookie assinado + CSRF + rate limit; `src/routes/{public,admin}.js`.
- Site público é **one-page** (`/` com âncoras `#inicio #reservas #equipamentos #localizacao #experiencia #parceiros`) seguindo a "arquitetura de conteúdo recomendada" do style guide. Navegação principal = **dock** flutuante (scroll-spy via IntersectionObserver em `public/js/main.js`).
- CMS (`/admin`): coleções equipment, partners, gallery + settings (chave/valor). Conteúdo aparece no site imediatamente (SSR lê o banco a cada request).

## Fonte canônica de design e conteúdo

`reference/padel-experience-style-guide(1).html` (v1.1) é a autoridade para **design E conteúdo**:

- Arquivo de ~7 MB: NUNCA ler inteiro (linhas gigantes de base64 no body). O CSS fica no bloco `<style>` do início; a seção `id="guia"` ("07 — Guia de conteúdo") tem os fatos do negócio: preços (promo R$ 120/h até 19/07/2026, regular R$ 150/h), equipamentos Adidas, 4 parceiros com funções exatas, pendências.
- `public/css/site.css` = bloco `<style>` do guia copiado **verbatim** + bloco "Site additions" no fim (adições usam apenas tokens do guia; nenhum hex novo). Não editar o bloco do guia.
- Regras que vieram do guia e devem ser preservadas: card promocional sai automaticamente após `promo_ends`; parceiras são "parceira"/função indicada, nunca "patrocinadora"; dados não confirmados exibem "[A CONFIRMAR]" (canal de reserva, unidade de cobrança da locação, regras de cancelamento, instruções de acesso).
- `reference/padelexp_00.txt` — links oficiais (WhatsApp, lojas, Linktree, parcerias@). Nunca digitar links de memória; os seeds em `db.js` já os carregam.
- Logos do cliente em `reference/init_assets/` (SVGs copiados para `apps/site/public/img/`).

## Convenções

- Conteúdo visível em pt-BR (sem emoji); código e comentários em inglês.
- Reserva de quadra acontece fora do site (app Matchpoint / WhatsApp enquanto `booking_url` estiver vazio) — o site nunca promete reserva própria.
- Números e fatos: só o que está no guia de conteúdo ou confirmado pelo cliente; faltando, marcar `[A CONFIRMAR]`.
- Não é repositório git ainda (`git init` pendente).
