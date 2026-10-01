# Como editar a vitrine

Tudo que a loja precisa mudar no dia a dia está em `data/` e `assets/`. Não é preciso reescrever o HTML.

## WhatsApp e Instagram

Em `data/site.json`:

```json
"contato": {
  "whatsapp": "5561981246112",
  "whatsappLabel": "(61) 98124-6112",
  "instagram": {
    "handle": "@janaabreuconfeitaria",
    "url": "https://www.instagram.com/janaabreuconfeitaria/"
  }
}
```

O checkout sempre usa `https://wa.me/{whatsapp}?text=...`. Troque só os dígitos se o número mudar. O rótulo é só visual.

## Trocar um produto

1. Abra `data/products.json`.
2. Ajuste `name`, `description`, `price` (número, reais) e `images`.
3. Coloque as fotos em `assets/products/` (JPG, PNG ou SVG).
4. Publique no GitHub ou recarregue a página local.

Preço exemplo: `168` vira **R$ 168,00**. Use `168.9` para **R$ 168,90`.

Marque vitrine de teste com `"exemplo"` em `tags`. Quando o item for real, remova essa tag e o texto “(exemplo)” do nome.

## Nova categoria (bolinha)

1. Adicione um objeto em `data/categories.json` com `id`, `name`, `slug`, `image`, `order`.
2. Ponha a arte circular em `assets/categories/`.
3. Nos produtos, use o mesmo `categoryId`.

## Novo slide do carrossel

Em `data/carousel.json`: `title`, `subtitle`, `image`, `linkCategory` ou `productSlug`, `order`.

## Comandos de exemplo para o assistente

Copie e adapte no chat:

- `Atualize o topo: deixe o Instagram @janaabreuconfeitaria visível no mobile.`
- `No hero-carrossel, troque o primeiro slide para a categoria bolos.`
- `Nas categorias, reordene as bolinhas: Bolos primeiro.`
- `Abra o produto:bolo-chocolate-meio-amargo e troque o preço para 190.`
- `Nos destaques, o card de kits deve filtrar cestas-presentes.`
- `Nas encomendas, o WhatsApp deve continuar 5561981246112.`
- `No rodape, atualize o endereço quando tivermos a rua definitiva.`
- `Siga no Instagram: troque os placeholders pelas fotos reais, mas o link continua https://www.instagram.com/janaabreuconfeitaria/.`

## Fundo Hydra

O fundo animado vive em `js/hydra-sketch.js` (`runHydraSketch`). Cole um novo sketch Hydra nessa função. O motor otimizado (`js/background-hydra.js`) usa canvas fullscreen, `MAX_DIM 768`, `MAX_DPR 1.5`, DPR 1 em save-data / pouca memória / pointer coarse, resize com throttle e fundo estático se `prefers-reduced-motion`.

Valores atuais do sketch: `speed=1.1`, `contrast=0.45`, `brightness=0.222`. Painéis a **50%** (`--panel`) sobre o Hydra site-wide. Texto creme/marrom (`#3D2E29` / `#5C4033`) em Cormorant também nas labels. Promo e hero **não** levam texto solto na foto; a bolinha dá zoom 1.33 recortado no círculo.

## Painel

Abra `/painel/` para pedidos e clientes (JSON + localStorage). Exporte CSV de clientes (`nome,email,telefone`) e de pedidos. Não há Google Sheets nesta versão — o stub está em `painel/js/sheets-stub.js`.

## Espelho Dropbox

Pasta combinada: `/site-confeitaria`. Depois de editar e commitar, copie a mesma árvore para esse caminho se quiser backup visual fora do Git.
