# Preview — Jana Abreu Confeitaria

Servidor local: `http://127.0.0.1:8765/` (pasta `site-confeitaria-preview`).

## O que olhar

### Mobile (~375px)
- Header sticky com logo circular + nome; menu hamburger e carrinho com alvo ≥ 44px.
- Carrossel full-bleed com fotos reais e caption em card translúcido.
- Fileira de **categorias** em scroll horizontal (bolinhas com fotos WebP).
- Grade de produtos em 1 coluna; botões “Ver mais / Adicionar” com 44px de altura.
- Sem overflow horizontal (body/`html` com `overflow-x: hidden`).

### Desktop (~1280px)
- Container ~**1120px** nas seções; header com nav horizontal.
- Categorias em **linha centralizada** (wrap), sem scroller.
- Vitrine em **4 colunas**; destaques de bolos em grade multi-coluna.
- Carrossel alto (~520px) full-bleed.

### Brand & conteúdo
- Cores: ink `#2A1F24`, muted `#6B4F58`, primary `#FC7E8E`, panels frosted white over Hydra.
- WhatsApp `5561981246112` · Instagram `@janaabreuconfeitaria`.
- Fotos reais Vendizap em categorias, produtos, carrossel, Instagram e logo (`assets/brand/logo.webp`).
- 15 produtos reais (cestas, bolos, combos, festa personalizada, platter, café fit).

### Hydra background
- Fullscreen canvas `#hydra-background` (fixed, z-index 0, pointer-events none).
- Same performance caps as alexandrerangel.art.br: MAX_DIM 768, MAX_DPR 1.5, DPR 1 on save-data / low memory / coarse pointer; throttled resize; `prefers-reduced-motion` → soft fill `#e8d4dc`.
- Sketch: soft RGB noise field (light pastels, high luminance).
- UI palette is **dark on light**: ink `#2a1f24`, muted `#6b4f58`, panels `rgba(255,255,255,0.88)`, accent coral `#FC7E8E`.
- Color notes: `scripts/sample-hydra-colors.html` (observed R/G/B soft pastels ~0.55–0.95).

### Smoke checklist
1. Abrir home → carrossel avança sozinho.
2. Clicar categoria → filtra vitrine.
3. Abrir produto → modal com foto; adicionar → gaveta WhatsApp.
4. Conferir 375px e 1280px (DevTools) sem barra horizontal.
