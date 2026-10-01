# Jana Abreu Confeitaria

Vitrine estática da confeitaria: HTML, CSS e JavaScript puro. O catálogo vem de arquivos JSON carregados no navegador. Não há backend, banco nem gateway de pagamento — o checkout abre o WhatsApp.

## GitHub Pages

1. No repositório: **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: `main` (ou a branch publicada), pasta **`/` (root)**.
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
| `data/site.json` | Nome, slogan, WhatsApp, Instagram, endereço, cores, textos |
| `data/categories.json` | Bolinhas de categoria (`categorias`) |
| `data/carousel.json` | Slides do `hero-carrossel` |
| `data/products.json` | Produtos da vitrine, preço, fotos, destaque |

Produtos com `"active": false` somem da vitrine. Itens de exemplo usam a tag `"exemplo"` e o selo **Exemplo**.

## WhatsApp

`data/site.json` → `contato.whatsapp` deve ser só dígitos, com DDI 55.

- Número usado no site: **5561981246112**
- Rótulo exibido: **(61) 98124-6112**
- Link de checkout: `https://wa.me/5561981246112?text=...`

A mensagem inclui nome, telefone, data desejada, itens, quantidades, total e observações. O texto na interface lembra: *Após confirmar no WhatsApp, combinamos Pix, cartão ou boleto.*

## Fundo Hydra

Canvas fullscreen (`#jana-hydra`) com o mesmo padrão de otimização do portfólio (MAX_DIM 768, MAX_DPR 1.5, DPR 1 em save-data / low-memory / coarse pointer, resize com throttle, estático se `prefers-reduced-motion`, `detectAudio: false`).

Sketch atual: `speed=1.1`, `contrast=0.45`, `brightness=0.222`. Para trocar o visual: edite **`js/hydra-sketch.js`** → `runHydraSketch()`.

## Marca

Cores da loja ao vivo: **#FC7E8E** (coral), **#F5D5E0** (blush), creme **#FFF6EF** e texto marrom **#5A3D36**. Painéis frosting translúcidos sobre o Hydra, com barras coral saturadas. Ajuste em `data/site.json` → `colors`.

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

## Painel (`/painel/`)

Área interna de demonstração: pedidos estilo Vendizap e clientes. Dados em `data/orders.json` + `data/clients.json`, com overlay em `localStorage`. Exportar CSV de clientes (`nome,email,telefone`). **Google Sheets não está ligado** — ver [docs/PAINEL.md](docs/PAINEL.md).

## Documentação

- [docs/NOMENCLATURA.md](docs/NOMENCLATURA.md) — nomes das áreas do site
- [docs/COMO-EDITAR.md](docs/COMO-EDITAR.md) — edição de JSON e comandos para o assistente
- [docs/PAINEL.md](docs/PAINEL.md) — plano do painel (JSON local, CSV, stub Sheets)

## O que este projeto não faz

Não há servidor, banco de dados nem integração de Pix/cartão/boleto além da nota no WhatsApp.
