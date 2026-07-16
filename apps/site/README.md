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

O banco SQLite (`data/site.db`) e a pasta de uploads (`data/uploads/`) são criados
automaticamente na primeira execução, com seeds vindos do guia de conteúdo do style guide
(`reference/padel-experience-style-guide(1).html`, seção "07 — Guia de conteúdo").

## Admin

http://localhost:3000/admin/login — credenciais do `.env` (sem `ADMIN_PASSWORD` definido, o seed gera uma senha aleatória e a imprime no console do primeiro start).

Coleções: **Equipamentos** (locação), **Parceiros**, **Galeria** e **Configurações**
(links, preços de reserva, vigência da promoção, textos operacionais).

Regra de negócio importante: o card de preço promocional sai do site automaticamente
quando a data atual passa de `promo_ends` (Configurações), como exige o style guide.
Campos vazios marcados como pendentes exibem "[A CONFIRMAR]" no site e no painel.

## Configuração

Copie `.env.example` para `.env` e ajuste se necessário:

- `PORT` — porta do servidor (default 3000)
- `SESSION_SECRET` — segredo usado para assinar o cookie de sessão do admin
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — credenciais do usuário admin criado no seed

## Design system

`public/css/site.css` começa com o bloco `<style>` do style guide v1.1 copiado **verbatim**
(tokens, temas dark/light, dock, cards, price-cards, partner-cards etc.). Adições específicas
do site ficam no bloco marcado "Site additions" no fim do arquivo e usam apenas tokens do guia.
Não editar o bloco do guia — se o guia mudar, re-extrair.
