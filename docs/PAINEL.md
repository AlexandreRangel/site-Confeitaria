# Plano do painel (`/painel/`)

Painel interno da loja, no mesmo site estático. Sem backend e **sem Google Sheets ao vivo**.

## O que esta versão faz

- Lista e detalhe de pedidos (clima Vendizap: nº, itens, frete, total, endereço, observações, WhatsApp)
- Cadastro simples de clientes
- Persistência de demonstração em `data/orders.json` + `data/clients.json` (semente) e `localStorage` (alterações no navegador)
- Botões para **baixar JSON** (backup) e **CSV de clientes**
- Stub comentado para Sheets no futuro — **não chama APIs do Google**

## Persistência (padrão baixável)

1. Ao abrir `/painel/`, o app lê os JSON de `data/`.
2. Se houver cópia em `localStorage` (`jana-abreu-orders-v1`, `jana-abreu-clients-v1`), ela prevalece (demo).
3. Pedidos feitos na vitrine (`encomendas` → WhatsApp) também gravam nesse `localStorage`.
4. “Baixar JSON” exporta o estado atual para o computador.
5. Para publicar de verdade no GitHub, cole o JSON baixado em `data/` e faça commit (não há gravação automática no servidor).

GitHub Pages é só arquivos estáticos: o navegador **não consegue sobrescrever** `data/*.json` no repositório.

## Clientes → CSV

Um cliente por linha. Colunas obrigatórias:

`nome,email,telefone`

Extras opcionais no mesmo arquivo: `bairro,notas,id`.

## Google Sheets (futuro — NÃO ligar agora)

Ver `painel/js/sheets-stub.js`. Quando for a hora:

1. Definir planilha (aba Clientes: nome | email | telefone).
2. Apps Script ou webhook — nunca expor chave no front público.
3. Sync manual ou unidirecional (exportar CSV → colar na planilha já resolve o v1).

## Pedido (UI estilo Vendizap)

- Cabeçalho: `#JA-1001`, status, data do pedido, data desejada
- Cliente + botão WhatsApp
- Itens (qtd × nome × valor)
- Subtotal, frete, total
- Endereço / retirada
- Observações

## Nomenclatura

| Área | URL / seletor |
| --- | --- |
| `painel` | `/painel/` |
| `painel-pedidos` | `#pedidos` |
| `painel-pedido:id` | `#pedido:JA-1001` |
| `painel-clientes` | `#clientes` |

## Fora de escopo (v1)

- Login/senha (o caminho `/painel/` é “secreto” só por não estar no menu)
- Gateway de pagamento
- Integração Google
