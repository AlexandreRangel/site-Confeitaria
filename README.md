# Jana Abreu Confeitaria

Vitrine estática da confeitaria: HTML, CSS e JavaScript puro. O catálogo vem de arquivos JSON carregados no navegador. Não há backend, banco nem gateway de pagamento — o checkout abre o WhatsApp.

## GitHub Pages

1. No repositório: **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: **`preview`**, pasta **`/` (root)**.
4. Confirme que `index.html` e `.nojekyll` estão na raiz (este projeto **não** usa `/docs` como site).
5. Após o deploy, a URL fica em `https://<usuario>.github.io/<repositorio>/`.

O arquivo `.nojekyll` impede que o GitHub Pages processe a pasta como Jekyll e ignore arquivos que comecem com `_`.

Não é necessário `npm install` nem build. Opcional: para testar no computador, sirva a pasta por HTTP (o `fetch` dos JSON não funciona bem em `file://`):

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Como a dona da loja atualiza o catálogo

Edite os JSON em `data/` e troque as imagens em `assets/`. Recarregue a página (ou aguarde o Pages publicar).

| Arquivo | O que muda |
| --- | --- |
| `data/site.json` | Nome, slogan, WhatsApp, Instagram, endereço, cores oficiais, textos |
| `data/areas.json` | Botões da home e menu Categorias (`/corporate/`, `/bolos/`, …) |
| `data/categories.json` | Categorias de catálogo (Sobremesas fica `hidden: true`) |
| `data/carousel.json` | Slides do `hero-carrossel` |
| `data/products.json` | Produtos das páginas de categoria, preço, fotos, destaque |
| `data/sabores-bolos.json` | 17 recheios oficiais de bolo (nome + descrição no menu e nos rádios) |
| `data/orders.json` / `data/clients.json` | Demo do painel (`/painel/`) — pedidos e clientes |

Produtos com `"active": false` somem das páginas de categoria. Itens de exemplo usam a tag `"exemplo"` e o selo **Exemplo**.

Cada área oficial tem uma pasta com `index.html` (`/corporate/`, `/bolos/`, `/cestas/`, `/doces-personalizados/`). URLs antigas redirecionam. Natal liga/desliga em `data/site.json` → `natal.enabled`.

## WhatsApp

`data/site.json` → `contato.whatsapp` deve ser só dígitos, com DDI 55.

- Número usado no site: **5561981246112**
- Rótulo exibido: **(61) 98124-6112**
- Link de checkout: `https://wa.me/5561981246112?text=...`

A mensagem inclui nome, telefone, data desejada, itens, quantidades, total, observações e o aviso: *Esta é uma solicitação de encomenda. A confirmação depende da disponibilidade e da confirmação da Jana pelo WhatsApp.*

O painel `/painel/` é **legado local** (`localStorage`). O canal compartilhado (`data/site.json` → `central`) fica desligado até haver backend — ver [central/README.md](central/README.md).

## Instagram

`data/site.json` → `contato.instagram`:

```json
"instagram": {
  "handle": "@janaabreuconfeitaria",
  "url": "https://www.instagram.com/janaabreuconfeitaria/"
}
```

O handle aparece no `topo` e no `rodape`. A seção **Siga no Instagram** usa `instagramGallery` (placeholders) e cada foto abre o perfil.

## Espelho Dropbox

Caminho combinado para espelhar este site: **`/site-confeitaria`**.

Copie a pasta publicada (HTML, CSS, JS, `data/`, `assets/`) para esse caminho no Dropbox quando quiser uma cópia fora do GitHub.

## Documentação

- [docs/NOMENCLATURA.md](docs/NOMENCLATURA.md) — nomes das áreas do site
- [docs/COMO-EDITAR.md](docs/COMO-EDITAR.md) — edição de JSON e comandos para o assistente

## O que este projeto não faz

Não há servidor no GitHub Pages, nem Pix/cartão embutidos, nem painel central no ar. Pedidos reais se confirmam só no WhatsApp com a Jana.
