# Canal central de pedidos (ainda não provisionado)

O GitHub Pages **não** oferece banco nem login. Neste repositório **não há** endpoint, Worker, Supabase, Firebase nem secretos configurados. A vitrine publica com `data/site.json` → `central.enabled: false`. O atendimento continua no WhatsApp.

Nada disto está no ar. Não trate o painel local (`localStorage`) como gestão centralizada.

## O que já está pronto no código

- Cliente (`js/central.js`): só chama rede se `enabled === true` **e** `endpoint` começa com `https://`.
- Regras (`central/logic.mjs`): POST público cria `solicitado`; GET/PATCH exigem `Authorization: Bearer`; token vazio ⇒ 503, não lista aberta; mesma `Idempotency-Key` não duplica; estados `solicitado → confirmado → em_producao → pronto → entregue` (+ `cancelado`) com histórico.
- Worker (`central/worker.mjs`): adaptador Cloudflare, **não implantado**.

Registrar uma solicitação **não** prova envio de WhatsApp nem confirmação da Jana.

## Recomendação objetiva para ligar

Serviço: **Cloudflare Workers + KV** (conta gratuita costuma bastar no volume desta confeitaria).

| Item | Exigência |
|---|---|
| Conta | Cloudflare no e-mail do Alexandre (dona do site). **Não criar a conta por agente.** |
| Plano | Free Workers + KV: 100 mil req/dia no free; KV 1 GB / 100 k reads/dia. Sem custo fixo no uso atual. Pago só se crescer acima do free. |
| Privacidade | Dados de clientes (nome, telefone) ficam na conta Cloudflare (EUA por padrão). Se precisar residência no Brasil/UE, **não ligue** sem decidir isso — a integração fica pronta e a escolha é sua. |
| Segredo | `ADMIN_TOKEN` forte, só em variável de ambiente do Worker. **Nunca** no JS, JSON ou repo. |
| CORS | `CORS_ORIGIN=https://alexandrerangel.github.io` |
| KV | namespace `ORDERS` ligado ao Worker |
| URL | `https://<worker>.<subdomínio>.workers.dev` (ou domínio próprio) |
| Site | Só então preencher `central.endpoint` e `central.enabled: true` num commit consciente |

Passos (você executa no painel Cloudflare):

1. Criar Worker a partir de `central/worker.mjs` + `central/logic.mjs`.
2. Criar KV `ORDERS` e bind.
3. Definir `ADMIN_TOKEN` e `CORS_ORIGIN`.
4. Testar POST de **dados fictícios** e GET sem token (deve 401).
5. Apagar os dados de teste.
6. Colocar a URL em `data/site.json` e ligar `enabled`.
7. No `/painel/`, entrar com o token (fica só em `sessionStorage` deste navegador).

## O que não fazer

- Não commitar token.
- Não expor GET de pedidos sem auth.
- Não apontar a vitrine para mock.
- Não subir pedidos do `localStorage` em silêncio.
- Não contratar plano pago sem olhar o limite free.

Custo/privacidade mudam se você escolher outro provedor (Supabase, Apps Script, etc.). A integração Cloudflare está pronta; a decisão de ligar é sua.
