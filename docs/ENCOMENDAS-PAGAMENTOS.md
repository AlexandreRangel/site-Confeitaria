# Encomendas e pagamentos — opções práticas (Brasil)

Contexto: site estático no GitHub Pages, **sem backend próprio** e **sem assinatura de banco pago**.  
Hoje na loja Vendizap: **Pix, cartão e boleto**. O site novo precisa de um caminho concreto de **pedido → confirmação → pagamento**.

---

## Comparativo (3 opções)

### Opção A — WhatsApp como checkout (vitrine → conversa)

**Como funciona**  
Botão “Encomendar” abre `wa.me/55…` com texto pré-preenchido (produto, qtd, data, obs). Janaína confirma valor, prazo e envia cobrança (Pix copia-e-cola, link Mercado Pago, boleto) **na conversa**.

| Prós | Contras |
|------|---------|
| Zero backend, zero mensalidade obrigatória | Pedidos espalhados no WhatsApp |
| Cliente brasileiro já espera esse fluxo | Sem estoque/pedido automático no site |
| Pix instantâneo + humano no atendimento | Cartão/boleto dependem de link externo |
| Ideal para sob-encomenda (bolos, festas) | Relatórios manuais |

**Custo:** gratuito (WhatsApp Business app).  
**Pagamentos:** Pix (chave ou QR), link de pagamento MP/PagBank colado no chat, boleto gerado no banco/MP.

---

### Opção B — Formulário estático → e-mail / planilha (Formspree, Basin, Getform ou Google Forms)

**Como funciona**  
`encomendar.html` posta para um endpoint serverless gratuito/freemium (Formspree free tier, Basin, etc.) ou abre Google Forms embutido. Janaína recebe e-mail e responde com Pix/link.

| Prós | Contras |
|------|---------|
| Pedidos chegam organizados (e-mail/CSV) | Limite free de submissions/mês |
| Ainda sem banco próprio | Cartão não fica “dentro” do site |
| Bom para campos (data festa, sabor) | Mais um serviço para configurar |
| Pode redirecionar “obrigada” no site | Spam se sem captcha |

**Custo:** free tier costuma bastar no início; depois plano barato.  
**Pagamentos:** iguais à opção A (cobrança no follow-up).

---

### Opção C — Link de pagamento Mercado Pago (Checkout Pro / link + Pix)

**Como funciona**  
Para itens com preço fechado, o bot (ou Janaína) gera **link de pagamento** no Mercado Pago (ou usa preferências manuais). O site guarda no JSON um `linkPagamento` opcional **ou** só mostra “Pagar” depois que o pedido foi aprovado no WhatsApp.  
Checkout Pro aceita **Pix, cartão e boleto** — alinhado ao que já usam.

| Prós | Contras |
|------|---------|
| Pix + cartão + boleto oficiais | Conta MP + taxas por venda |
| Experiência de pagamento profissional | Links estáticos no JSON envelhecem |
| Notificação de pagamento no app MP | Checkout “solto” sem pedido estruturado |
| Caminho natural para v2 (API/Preferences) | API completa pede backend ou Function |

**Custo:** sem mensalidade fixa típica; **taxa por transação** (consultar tabela MP vigente).  
**Pagamentos:** nativo MP (Pix/cartão/boleto).

---

## Recomendação v1

**Híbrido A + C (leve): WhatsApp primeiro; Mercado Pago como ferramenta de cobrança.**

1. Site = vitrine + “Encomendar no WhatsApp” (mensagem montada pelo JS).
2. Janaína confirma detalhes na conversa.
3. Cobra com:
   - **Pix** (chave/QR) para pedidos simples/rápidos; ou
   - **Link Mercado Pago** (Checkout/link) quando precisar cartão ou boleto.
4. Opcional no mesmo v1: formulário curto na página que **também** abre WhatsApp (campos → query string na mensagem), sem depender de Formspree no dia 1.

**Por quê:** casa com sob-encomenda, custo zero de infra, cobre os 3 meios de pagamento que já existem, e não exige backend no GitHub Pages.

### Implementação concreta no código v1

- `site.json` → `contato.whatsapp`, `encomenda.mensagemPadrao`, `pagamentos.aceitos`
- `js/encomenda.js` → monta URL WhatsApp; opcionalmente anexa `linkPagamento` do produto se existir
- Página produto: CTA principal **Encomendar**; texto “Aceitamos Pix, cartão e boleto”
- **Não** embutir chave Pix sensível se preferir só enviar no WhatsApp; pode exibir chave pública de recebimento se Janaína quiser

### Checklist de abertura

- [ ] Número WhatsApp Business no `site.json`
- [ ] Conta Mercado Pago (ou PagBank) pronta para gerar links
- [ ] Chave Pix de recebimento definida
- [ ] Texto legal curto: prazo de produção, sinal/adiantamento se houver
- [ ] Pedidos de festa: sempre confirmar data com antecedência mínima (ex.: 48–72h)

---

## Caminho para v2

Evolução sem jogar fora o v1:

| Fase | O que entra | Pagamento |
|------|-------------|-----------|
| **v1** (agora) | WhatsApp + links MP manuais | Pix / cartão / boleto via chat |
| **v1.5** | Formulário → e-mail/Sheets + mesmo WhatsApp | Idem; pedidos mais rastreáveis |
| **v2** | Preferência MP gerada por **Cloud Function** ou serviço mínimo (Worker/Edge) ao clicar “Pagar” | Checkout Pro / Pix automático, webhook → status |
| **v2+** | Painel simples (ou planilha + Zapier/Make) listando pedidos | Push: e-mail ao cliente + notificação WhatsApp Business API (pago) ou só app MP |

### Notas Brasil (v2)

- **Mercado Pago** é o caminho mais direto para Pix + cartão + boleto numa só conta.
- **WhatsApp Business API** (oficial) exige BSP/provedor e tem custo — só vale quando o volume justificar; até lá o app WhatsApp Business basta.
- **Push:** no estático puro não há push nativo confiável; use e-mail (Formspree/MP) + notificação do app MP/WhatsApp.
- Evitar guardar cartão ou processar pagamento em JS no Pages — sempre redirect/link do PSP (MP).

---

## O que **não** fazer no v1

- Firebase/Supabase “só um pouquinho” se a meta é zero assinatura recorrente de DB
- Carrinho completo com estoque server-side
- Hardcodar milhares de links MP no JSON sem processo de regeneração
- Clonar o checkout Vendizap — o site novo é vitrine + encomenda assistida

---

## Resumo em uma frase

**v1:** cliente escolhe no site → chama no WhatsApp → paga com Pix ou link Mercado Pago (cartão/boleto).  
**v2:** mesmo funil, com link/preferência MP gerado automaticamente e registro de pedido em planilha ou function.
