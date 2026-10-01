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

## Cores oficiais

Em `data/site.json` → `colors` (e tokens em `css/base.css`):

- texto `#4c553a`
- creme `#fdf6ec`
- acento e botões `#b86e88`
- rosa claro `#f5d5e0`

Não usar o coral antigo `#FC7E8E`. O Hydra fica só no botão **Adquirir agora**.

## Recheios de bolo

Os 11 sabores da vitrine Vendizap (Bolos → Bolo buttercream G → «recheio bolo») ficam em `data/sabores-bolos.json`. A página do produto mostra o mesmo menu + lista de rádios. Troque só essa lista se o Vendizap mudar.

## Trocar um produto

1. Abra `data/products.json`.
2. Ajuste `name`, `description`, `price` (número, reais) e `images`.
3. Coloque as fotos em `assets/products/` (JPG, PNG ou SVG).
4. Publique no GitHub ou recarregue a página local.

Preço exemplo: `168` vira **R$ 168,00**. Use `168.9` para **R$ 168,90`.

Marque vitrine de teste com `"exemplo"` em `tags`. Quando o item for real, remova essa tag e o texto “(exemplo)” do nome.

## Nova categoria (card quadrado)

1. Adicione um objeto em `data/categories.json` com `id`, `name`, `slug`, `image`, `order`.
2. Ponha a foto quadrada em `assets/categories/`.
3. Nos produtos, use o mesmo `categoryId`.
4. Crie a pasta `{slug}/index.html` (cópia de outra categoria) com `data-category="{slug}"` para a URL `/slug/` funcionar no GitHub Pages. Slug em minúsculas, hífens, sem acento e sem underscore.

## Novo slide do carrossel

Em `data/carousel.json`: `title`, `subtitle`, `image`, `linkCategory` ou `productSlug`, `order`.

## Comandos de exemplo para o assistente

Copie e adapte no chat:

- `Atualize o topo: deixe o Instagram @janaabreuconfeitaria visível no mobile.`
- `No hero-carrossel, troque o primeiro slide para a categoria bolos.`
- `Nas categorias, reordene os cards: Bolos primeiro.`
- `Abra o produto:bolo-chocolate-meio-amargo e troque o preço para 190.`
- `Nos destaques, o card de kits deve filtrar cestas-presentes.`
- `Nas encomendas, o WhatsApp deve continuar 5561981246112.`
- `No rodape, atualize o endereço quando tivermos a rua definitiva.`
- `Siga no Instagram: troque os placeholders pelas fotos reais, mas o link continua https://www.instagram.com/janaabreuconfeitaria/.`

## Espelho Dropbox

Pasta combinada: `/site-confeitaria`. Depois de editar e commitar, copie a mesma árvore para esse caminho se quiser backup visual fora do Git.
