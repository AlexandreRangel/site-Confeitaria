# Preview — Jana Abreu Confeitaria

Servidor local: `http://127.0.0.1:8765/` (pasta `site-confeitaria-preview`).

## O que olhar

### Mobile (~375px)
- Header sticky com wordmark oficial; menu hamburger e carrinho com alvo ≥ 44px.
- Carrossel full-bleed com fotos reais e caption em card translúcido.
- Fileira de **categorias** em carrossel de cards quadrados grandes (estilo GoldKo): ~3 visíveis no mobile, seta para o restante, rótulo embaixo, URL limpa (`/bolos/`, `/sobremesas/`, …).
- Home **sem** vitrine mista e **sem** bloco «venha nos visitar»/endereço: só hero, cards de categoria, Instagram e rodapé (WhatsApp, Instagram, pagamento — sem Endereço).
- Sem overflow horizontal (body/`html` com `overflow-x: hidden`).

### Desktop (~1280px)
- Container ~**1120px** nas seções; header com nav horizontal.
- Categorias no mesmo idioma de cards quadrados (~5 visíveis), com seta se houver mais; clique vai para a pasta da categoria.
- Página de categoria: grade de produtos daquela categoria em **4 colunas**.
- Carrossel alto (~520px) full-bleed só na home.

### Brand & conteúdo
- Cores oficiais: texto `#4c553a`, creme `#fdf6ec`, botões/acento `#b86e88`, rosa claro `#f5d5e0`. Sem coral `#FC7E8E`. Hydra só dentro dos botões **Comprar**.
- WhatsApp `5561981246112` · Instagram `@janaabreuconfeitaria`.
- Fotos reais Vendizap em categorias, produtos, carrossel, Instagram e logo (`assets/brand/logo.webp`).
- 15 produtos reais (cestas, bolos, combos, festa personalizada, platter, café fit).

### Brand & fundo
- Logo oficial no topo (`assets/brand/logo-jana-abreu.png`), sem título tipográfico no hero.
- Slogan: **A vida é mais doce quando compartilhada**.
- Fundo: padronagem damask bem suave (`assets/brand/padronagem.svg`).
- Hydra **somente** dentro dos botões **Comprar**; nunca como fundo da página. Painel sem Hydra.

### Área da loja (`/painel/`)
- Pedidos (lista + detalhe: itens, frete, total, endereço, obs, WhatsApp).
- Clientes com **Exportar CSV** (`nome,email,telefone`).
- Demo: `data/orders.json` + `data/clients.json`; novos pedidos do carrinho → `localStorage`.
- Stubs comentados para Google Sheets futuro (sem integração live).
- Link discreto no rodapé: **Área da loja**.

### Smoke checklist
1. Abrir home → carrossel avança sozinho; **não** há grade mista de produtos.
2. Clicar categoria → abre URL limpa (`/bolos/`, `/cestas-presentes/`, …); hard-refresh mantém a página.
3. Clicar produto → `/produto/?slug=…`. No bolo, escolher um dos 17 recheios oficiais (`data/sabores-bolos.json`, nome + descrição no menu e nos rádios). «Mais informações» abre a gaveta WhatsApp. «Comprar» tem Hydra miúdo.
4. Conferir 375px e 1280px (DevTools) sem barra horizontal.
