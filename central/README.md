# Lista compartilhada de pedidos (Cloudflare)

Está **no ar**: Worker `jana-pedidos` + banco D1 `jana-pedidos`, na conta Cloudflare da Jana.

- URL: https://jana-pedidos.janaabreu.workers.dev (configurada em `data/site.json` → `central`)
- Código: `central/jana-pedidos/src/index.js` · tabelas: `central/jana-pedidos/schema.sql`
- Segredos do Worker (nunca no repositório): `ADMIN_PASSWORD_HASH` (hash PBKDF2 com sal da senha do painel; a senha em si não fica no Cloudflare), `SESSION_SECRET`, `INFINITE_HANDLE` e, para o editor do site, `GITHUB_TOKEN` (token fine-grained só do repositório `site-Confeitaria`, Contents: Read and write; passo a passo em `docs/EDITOR.md`).

## Rotas

| Rota | Quem usa | O que faz |
|---|---|---|
| `POST /pedidos` | carrinho | Cria o pedido (`infinitepay`, `pix` ou `whatsapp`). Recalcula o total com `data/products.json` e a taxa de `data/site.json`. No cartão, o próprio Worker cria o link da InfinitePay já com `webhook_url`. |
| `POST /webhook/infinitepay` | InfinitePay | Aviso de pagamento. **Nunca** marca pago só pelo aviso: confere no `payment_check` (handle, order_nsu, transaction_nsu, slug). Repetições não duplicam. |
| `GET /pedidos/:nsu/status` | página `/pagamento/` | Pago/pendente. Com `transaction_nsu` e `slug` do retorno, o Worker confere na InfinitePay. |
| `POST /admin/login` | painel | Senha → sessão de 12 h. 10 erros seguidos bloqueiam por 15 min. |
| `GET /admin/conteudo`, `POST /admin/conteudo/publicar`, `GET /admin/conteudo/historico`, `POST /admin/conteudo/desfazer`, `GET /admin/conteudo/publicacao` | editor do painel | Lê e grava o conteúdo do site como commits no GitHub (ver `docs/EDITOR.md`). Precisa do segredo `GITHUB_TOKEN`; sem ele responde `configurado: false`. |
| `GET/PATCH/DELETE /admin/pedidos…`, `/admin/clientes…`, `POST /admin/importar` | painel | Lista, edita, exclui; importa pedidos guardados num aparelho. |

CORS: só `alexandrerangel.github.io`, `janaabreuconfeitaria.com.br`, `www.` e localhost (testes).

Se o Worker cair, o carrinho continua abrindo o pagamento direto na InfinitePay, a página de retorno confere pelo navegador e o painel avisa que a lista está fora do ar.

## Testes

- `node tests/check-central.mjs` (sem rede)
- `central/jana-pedidos/test/api.test.mjs` (API; com `MOCK` usa a InfinitePay simulada)
- `central/jana-pedidos/test/conteudo.test.mjs` (API do editor contra o GitHub simulado `mock-github.mjs`)
- `tests/editor-e2e.mjs` (editor no navegador, 390 e 1280 px)
- `central/jana-pedidos/test/run-local.sh` roda tudo isso localmente
- `tests/central-e2e.mjs` (navegador 390 e 1280 px; local com `wrangler dev` + mock, ou `PROD=1`)

Nenhum teste paga nada nem envia WhatsApp de verdade.
