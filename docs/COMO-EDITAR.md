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
- acento decorativo `#b86e88`
- botões preenchidos (contraste AA) `#9a5870`
- rosa claro `#f5d5e0`

Não usar o coral antigo `#FC7E8E`. O Hydra fica só no botão **Comprar**.
Solicitar no site **não** confirma a encomenda — a Jana confirma no WhatsApp.

## Recheios de bolo

Os 17 recheios oficiais da cliente ficam em `data/sabores-bolos.json` (`nome` + `descricao`). A página do bolo mostra o mesmo menu + lista de rádios. Troque só essa lista se os sabores mudarem.

## Trocar um produto

1. Abra `data/products.json`.
2. Ajuste `name`, `description`, `price` (número, reais) e `images`.
3. Coloque as fotos em `assets/products/` (JPG, PNG ou SVG).
4. Publique no GitHub ou recarregue a página local.

Preço exemplo: `168` vira **R$ 168,00**. Use `168.9` para **R$ 168,90`.

Marque vitrine de teste com `"exemplo"` em `tags`. Quando o item for real, remova essa tag e o texto “(exemplo)” do nome.

## Áreas da home (Corporate, Bolos, Cestas, Doces personalizados)

Os botões da home e o menu **Categorias** vêm de `data/areas.json`. Os produtos continuam com o `categoryId` antigo em `data/products.json`; a área junta esses IDs em `sourceCategoryIds`.

## Ligar a área Natal

1. Em `data/site.json`, mude `"natal": { "enabled": false }` para `"enabled": true`.
2. Recarregue o site. O 5º botão **Natal** aparece na home, entra no menu Categorias e o link `/natal/` passa a ser oferecido.
3. Para sumir de novo, volte `enabled` para `false`. A página `/natal/` continua no repositório, mas não é linkada.
4. Produtos de Natal usam `"categoryId": "natal"` (a categoria existe em `data/categories.json` com `"hidden": true` até haver itens).

Sobremesas está só escondida (`"hidden": true` em `data/categories.json`). Não apague os produtos; para reexibir, tire o `hidden` e recrie o mapeamento da área.

## Menu principal

O menu tem só **Início**, **Categorias** (lista das áreas) e **Sobre nós**. O carrinho fica no ícone do topo, com o número de itens, no celular e no computador.

## Pausar encomendas

Em `data/pausa.json`: `"ativo": true` trava o carrinho e o botão Comprar. Datas opcionais em `AAAA-MM-DD`. Passo a passo da planilha Google: `docs/pausa.md`.

## Pagamento no site (InfinitePay)

Em `data/pagamento.json`, coloque a InfiniteTag em `handle` (sem `$`) e `"enabled": true` quando for cobrar no site. Deixe desligado até a Jana preencher. Pix estático em `data/pix.json` permanece desligado.

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
