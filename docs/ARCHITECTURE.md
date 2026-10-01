# Arquitetura — Jana Abreu Confeitaria (site estático)

## Visão geral

Site **100% estático** (HTML + CSS + JS vanilla) hospedado no **GitHub Pages**.  
Conteúdo editorial (textos, preços, fotos, carrossel, categorias) vive em arquivos **JSON** + pastas de **imagens**.  
A Janaína edita pelo **chat com o Grok Bot** (“adiciona produto X”, envia fotos); o bot atualiza arquivos, espelha no Dropbox e faz **commit + push** no repositório `AlexandreRangel/site-Confeitaria`.

Não há banco de dados pago. Não há backend próprio no v1.

---

## Árvore de arquivos

### Repositório GitHub (`AlexandreRangel/site-Confeitaria`)

```
site-Confeitaria/
├── index.html                 # Home (hero, categorias, destaques)
├── produto.html               # Página de detalhe (?slug=...)
├── categoria.html             # Grade por categoria (?id=... ou ?slug=...)
├── kits.html                  # Seção Cestas & Presentes / kits
├── bolos.html                 # Seção Bolos
├── casamento.html             # Doces / kits de casamento (quando ativo)
├── encomendar.html            # Fluxo de encomenda (v1: WhatsApp / formulário)
├── crop.html                  # (opcional) crop simples no browser
├── css/
│   ├── tokens.css             # Paleta oficial olive/cream/dusty rose, tipografia
│   ├── base.css
│   ├── layout.css
│   └── components.css         # carrossel, cards, chips de categoria
├── js/
│   ├── config.js              # paths de data/, assets/, WhatsApp
│   ├── data-loader.js         # fetch dos JSONs + cache em memória
│   ├── render-home.js
│   ├── render-produto.js
│   ├── render-categoria.js
│   ├── carousel.js
│   └── encomenda.js           # monta mensagem / link de pagamento
├── data/
│   ├── site.json              # identidade, contato, pagamentos, SEO
│   ├── categories.json        # as 7 categorias da vitrine
│   ├── carousel.json          # slides do hero
│   └── products.json          # catálogo (multi-foto, preços, tags)
├── assets/
│   ├── brand/                 # logo, favicon, padrões
│   ├── carousel/              # imagens dos slides
│   └── products/
│       └── {slug}/
│           ├── 01.jpg
│           ├── 02.jpg
│           └── ...
├── tools/                     # scripts locais do bot (não publicados se preferir)
│   └── README.md              # ImageMagick crop/resize conventions
└── README.md
```

> GitHub Pages publica a raiz do branch `main` (ou `/docs`). Arquivos em `tools/` podem ficar no repo; se não quiser expô-los, use branch separado ou ignore na Pages via pasta fora da raiz publicada.

### Espelho Dropbox (`/site-confeitaria`)

Mesma lógica de conteúdo, para Janaína e o bot terem backup visual e sync:

```
/site-confeitaria/
├── data/
│   ├── site.json
│   ├── categories.json
│   ├── carousel.json
│   └── products.json
├── assets/
│   ├── brand/
│   ├── carousel/
│   └── products/{slug}/
└── docs/                      # planos, glossários, prints de referência
    ├── ARCHITECTURE.md
    ├── NOMENCLATURA.md
    └── ENCOMENDAS-PAGAMENTOS.md
```

**Fonte da verdade para o site público:** GitHub (`data/` + `assets/`).  
**Espelho operacional:** Dropbox (mesmos caminhos relativos). O bot escreve nos dois quando possível; se divergirem, prevalece o último commit no GitHub.

---

## Como o JSON dirige o site

1. No load, `data-loader.js` faz `fetch('/data/site.json')`, `categories.json`, `carousel.json`, `products.json`.
2. Templates HTML têm containers vazios (`#hero-carousel`, `#categorias-row`, `#grade-produtos`).
3. Scripts montam o DOM a partir dos JSON (sem build step, sem framework).
4. Página de produto: `produto.html?slug=bolo-exemplo` → filtra `products.json` pelo `slug`.
5. Página de categoria: `categoria.html?slug=bolos` → filtra produtos com `categoryId` correspondente.
6. Campos `ativo: false` ou `destaque: true` controlam visibilidade e home sem apagar dados.

### Contratos principais

| Arquivo | Papel |
|---------|--------|
| `site.json` | Nome, telefone/WhatsApp, Pix (chave informativa), textos do rodapé, cores opcionais |
| `categories.json` | Ordem da fileira circular + ícone/imagem + slug |
| `carousel.json` | Slides do hero (imagem, título, CTA, link interno) |
| `products.json` | Catálogo: slug, categoria, preço, fotos[], tags, estoque/sob-encomenda |

---

## Fluxo de edição via chat (Grok Bot)

```
Janaína (chat)
    │  "adiciona produto X na categoria Bolos"
    │  + fotos (câmera do celular ou arquivo)
    ▼
Grok Bot
    │  1. Normaliza fotos (ImageMagick: resize, crop se pedido)
    │  2. Grava assets/products/{slug}/0N.jpg
    │  3. Atualiza data/products.json (e categories/carousel se pedido)
    │  4. Espelha em Dropbox /site-confeitaria/...
    │  5. git add + commit + push no site-Confeitaria
    ▼
GitHub Pages (1–2 min)
    │  site atualizado em https://…github.io/site-Confeitaria/
```

### Crop de imagens

- **Preferencial:** Janaína diz no chat *“corta mais perto do bolo”* / *“quadrado centrado”* → bot aplica ImageMagick.
- **Opcional:** `crop.html` local no site para ajuste fino; resultado sobe de novo via chat ou o bot aplica o recorte informado.

### Multi-foto e upload mobile

- Fotos chegam pelo chat (anexo / câmera).
- Ordem das fotos = ordem no array `fotos[]` do produto; comandos: *“foto 2 como capa”*, *“remove foto 3”*.

---

## Publicação GitHub Pages

1. Repo: `AlexandreRangel/site-Confeitaria`
2. Settings → Pages → Source: branch `main` / pasta `/` (raiz)
3. URL típica: `https://alexandrerangel.github.io/site-Confeitaria/`
4. Domínio custom (futuro): CNAME + DNS na Pages
5. Cada push em `main` republica automaticamente

**Checklist pós-commit do bot:** paths relativos corretos (`./data/…`, `./assets/…`), JSON válido, imagens < ~500KB–1MB cada (web), slugs únicos.

---

## Estilo visual (referência)

- Paleta oficial: texto **#4c553a**, fundo **#fdf6ec**, acento/botões **#b86e88**, rosa claro **#f5d5e0**
- Hero com **carrossel**
- Fileira de **categorias circulares**
- Grades de produtos + seções dedicadas (kits/presentes, bolos, doces de festa/casamento)
- Tipografia elegante, cards com sombra leve, CTAs “Encomendar” / “Falar no WhatsApp”

---

## Limites conscientes do v1

- Sem carrinho com checkout server-side
- Sem login de cliente
- Sem painel admin web — o “CMS” é o chat + JSON
- Pagamentos: ver `ENCOMENDAS-PAGAMENTOS.md`
