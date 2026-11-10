# Preview — Jana Abreu Confeitaria

Servidor local: `http://127.0.0.1:8765/` (pasta `site-confeitaria-preview`).

## O que olhar

### Mobile (~375px)
- Header sticky com wordmark oficial; menu hamburger e carrinho com alvo ≥ 44px.
- Carrossel full-bleed com fotos reais e caption em card translúcido.
- Quatro botões grandes arredondados iguais no mobile e no desktop: Corporate, Bolos, Cestas, Doces personalizados. Natal só se `natal.enabled` for true.
- Home **sem** vitrine mista, **sem** GoldKo, **sem** destaques: hero, botões de área, faixa compacta de Instagram e rodapé enxuto (Brasília/DF, Instagram, WhatsApp, © 2026 Jana Abreu).
- Sem overflow horizontal (body/`html` com `overflow-x: hidden`).

### Desktop (~1280px)
- Container ~**1120px** nas seções; header com nav horizontal.
- Os mesmos quatro botões de área, sem carrossel GoldKo.
- Página de área: título, carrossel mais baixo, grade de produtos em **4 colunas**.
- Carrossel da home ~416px no desktop (20% mais baixo); mobile mantém a altura.

### Brand & conteúdo
- Cores oficiais: texto `#4c553a`, creme `#fdf6ec`, rosa decorativo `#b86e88`, rosa claro `#f5d5e0`. Botões preenchidos em variante AA `#9a5870`. Sem coral `#FC7E8E`. Hydra só dentro dos botões **Comprar**.
- WhatsApp `5561981246112` · Instagram `@janaabreuconfeitaria`.
- Fotos reais Vendizap em categorias, produtos, carrossel, Instagram e logo (`assets/brand/logo.webp`).
- 15 produtos reais (cestas, bolos, combos, festa personalizada, platter, café fit).

### Brand & fundo
- Logo oficial no topo (`assets/brand/logo-jana-abreu.png`), sem título tipográfico no hero.
- Slogan: **A vida é mais doce quando compartilhada**.
- Fundo: padronagem damask bem suave (`assets/brand/padronagem.svg`).
- Hydra **somente** dentro dos botões **Comprar**; nunca como fundo da página. Painel sem Hydra.

### Área da loja (`/painel/`)
- Painel **legado** deste navegador (`localStorage` + demo JSON). Não é gestão centralizada.
- Canal compartilhado desligado (`central.enabled: false`) até backend provisionado.
- Link discreto no rodapé: **Área da loja**.

### Checkout
- Aviso visível e no WhatsApp: solicitação ≠ encomenda confirmada.

### Smoke checklist
1. Abrir home → carrossel avança sozinho; **não** há grade mista de produtos.
2. Clicar categoria → abre URL limpa (`/bolos/`, `/cestas-presentes/`, …); hard-refresh mantém a página.
3. Clicar produto → `/produto/?slug=…`. No bolo, escolher um dos 17 recheios oficiais (`data/sabores-bolos.json`, nome + descrição no menu e nos rádios). «Mais informações» abre a gaveta WhatsApp. «Comprar» tem Hydra miúdo.
4. Conferir 375px e 1280px (DevTools) sem barra horizontal.
