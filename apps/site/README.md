# Padel Experience — site + CMS

App único Node/Express que serve o site público (one-page) e o admin (CMS) do Padel Experience —
espaço de padel no Aeroporto Internacional de Brasília (estacionamento do bolsão "A").
Sem bundler, sem build step — pronto para o Node.js hosting nativo da Hostinger.

## Como rodar

```bash
npm install     # na raiz do monorepo
npm run dev     # ou npm start
```

Acesse http://localhost:3000

O banco é MySQL/MariaDB remoto (credenciais `DB_*` em `.env`). O schema é criado no boot e os
seeds — vindos do guia de conteúdo do style guide (`reference/padel-experience-style-guide(1).html`,
seção "07 — Guia de conteúdo") — rodam uma única vez, controlados pela flag `content_seeded`.
Imagens da galeria são armazenadas no banco (tabela `media`) e servidas por `/media/:id`.

## Admin

http://localhost:3000/admin/login — credenciais do `.env` (sem `ADMIN_PASSWORD` definido, o seed gera uma senha aleatória e a imprime no console do primeiro start).

Coleções: **Equipamentos** (locação), **Promoções**, **Parceiros**, **Galeria** e
**Configurações** (links, preços de reserva, textos operacionais).

Regras de negócio: cards de promoção são manuais — só aparecem no site com `active`
marcado (não há auto-hide por data). Campos pendentes de confirmação do cliente são
omitidos no site público e listados como pendências no painel.

## Configuração

Copie `.env.example` para `.env` e ajuste se necessário:

- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` — conexão MySQL (obrigatórias)
- `PORT` — porta do servidor (default 3000)
- `SESSION_SECRET` — segredo usado para assinar o cookie de sessão do admin
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — credenciais do usuário admin criado no seed

## Design system

`public/css/site.css` começa com o bloco `<style>` do style guide v1.1 copiado **verbatim**
(tokens, temas dark/light, dock, cards, price-cards, partner-cards etc.). Adições específicas
do site ficam no bloco marcado "Site additions" no fim do arquivo e usam apenas tokens do guia.
Não editar o bloco do guia — se o guia mudar, re-extrair.
