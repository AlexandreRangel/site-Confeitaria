# Arquitetura — Jana Abreu Confeitaria

Vitrine **estática** (HTML + CSS + JS vanilla) no **GitHub Pages**, branch `preview`, pasta `/`.  
Catálogo em `data/*.json` e fotos em `assets/`. **Não há banco no Pages.**

URL: https://alexandrerangel.github.io/site-Confeitaria/

## Árvore atual

```
index.html                 # Home: hero, 4 botões de área, Instagram compacto, rodapé
{area}/index.html          # /corporate/, /bolos/, /cestas/, /doces-personalizados/, /natal/
URLs antigas               # redirect estático p.ex. /sobremesas/ → home
produto/index.html         # /produto/?slug=…
painel/index.html          # Painel legado (localStorage) — não é gestão centralizada
404.html
css/                       # base, layout, components, painel
js/                        # utils, cart, store, central, app, painel, background-hydra
data/                      # site, categories, carousel, products, sabores, orders/clients demo
central/                   # lógica + worker Cloudflare — NÃO implantado
assets/brand|products|…
```

Hydra só dentro dos botões **Comprar**, carregado sob demanda. Painel sem Hydra.

## Pedidos hoje

1. Cliente monta o carrinho (localStorage neste navegador).
2. Vê o aviso: solicitação ≠ encomenda confirmada.
3. Envia texto pré-preenchido no WhatsApp da Jana.
4. Cópia opcional no painel legado deste navegador.
5. **Canal central** (`js/central.js`) permanece `enabled: false` até existir backend. Ver `central/README.md`.

Estados previstos no canal central: solicitado, confirmado, em produção, pronto, entregue, cancelado.

## Paleta

Texto `#4c553a`, creme `#fdf6ec`, rosa decorativo `#b86e88`, rosa claro `#f5d5e0`.  
Botões preenchidos usam variante AA `#9a5870` (5,25:1 no branco); o rosa oficial continua em bordas, anéis e marca.

## O que este projeto não faz sozinho

Sem login de cliente, sem pagamento embutido, sem planilha Google live, sem painel compartilhado até o Worker ser provisionado.
