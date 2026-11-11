# Editor do site (painel)

Endereço: **https://janaabreuconfeitaria.com.br/painel/** — mesma senha da loja (a do painel de pedidos).

Abas: **Pedidos**, **Produtos**, **Carrossel**, **Datas**, **Textos**, **Histórico**, **Clientes**.

## Como funciona

```
painel (navegador) ──senha──> Worker jana-pedidos (Cloudflare) ──token──> GitHub (repo site-Confeitaria, branch preview)
                                                                             │
                                                         GitHub Pages publica o site em ~1 min
```

- Cada salvamento vira **um commit** no GitHub com mensagem `Editor: …`. O site continua estático, rápido e versionado.
- O navegador nunca vê a chave do GitHub: ela fica só no Worker, como segredo.
- Fotos são reduzidas e comprimidas no próprio aparelho (WebP, ou JPG se o navegador não fizer WebP) antes de enviar.
- Se alguém salvou o mesmo arquivo entre você abrir e salvar, o editor avisa e não sobrescreve.
- **Histórico** desfaz uma alteração com um novo commit (nada se perde).
- Produtos: cada salvamento/exclusão publica na hora. Carrossel, Datas e Textos juntam alterações e publicam com **Salvar e publicar**.

## Falta configurar: a chave do GitHub (uma vez)

Sem ela o editor abre só para consulta e avisa «Falta configurar a publicação». Pedidos, pagamento e painel funcionam normalmente.

1. Entre no GitHub com a conta **AlexandreRangel** → https://github.com/settings/personal-access-tokens/new
2. **Token name**: `editor-site-jana`. **Expiration**: 1 ano (anote a data para renovar).
3. **Repository access** → *Only select repositories* → `AlexandreRangel/site-Confeitaria`.
4. **Permissions → Repository permissions**:
   - **Contents: Read and write** (obrigatório)
   - **Pages: Read-only** (opcional; mostra «No ar ✓» quando o GitHub termina de publicar)
5. **Generate token** e copie (começa com `github_pat_`). Não mande por chat nem e-mail.
6. Cloudflare (conta da Jana) → **Workers & Pages** → `jana-pedidos` → **Settings** → **Variables and Secrets** → **Add** → tipo **Secret**, nome `GITHUB_TOKEN`, cole o token → **Deploy**.
7. Abra o painel, entre com a senha: o aviso some e o botão salvar fica ativo.

Renovar: gere um token novo igual e troque o valor do segredo `GITHUB_TOKEN`.

Variáveis opcionais do Worker (já têm padrão): `GITHUB_REPO` (`AlexandreRangel/site-Confeitaria`), `GITHUB_BRANCH` (`preview`).

## Datas comemorativas (Natal e Páscoa)

Na aba **Datas**: *Desligada*, *Ligada agora* ou *Ligar só entre duas datas* (inclui os dois dias, horário de Brasília).
Ligada: aparece a caixinha na home, o item no menu Categorias e a página (`/natal/`, `/pascoa/`) mostra os produtos marcados.
Desligada: some da home e do menu; a página avisa que não está disponível. Os produtos continuam marcados para o ano seguinte.
Fica gravado em `data/areas.json` → `ativacao` (`modo`: `desligado` | `ligado` | `datas`, `inicio`, `fim`).

## Banners

Tamanhos: página inicial **2400 × 700** (computador) e **1200 × 800** (celular); páginas de categoria **2400 × 800** e **1200 × 860**.
Sem imagem de celular, o celular usa a do computador. Cada banner pode abrir um produto, uma categoria ou um endereço (links de fora abrem em nova aba).
Os banners antigos (fotos de produto) continuam como estavam; quando todos os banners de uma página são do formato novo, eles aparecem inteiros, sem cortes.
Em `data/carousel.json`: `image`, `imageMobile`, `title` (texto alternativo), `linkTipo` (`produto` | `categoria` | `url` | `nenhum`), `productSlug` / `linkCategory` / `url`, `pagina` (vazio = home, ou id da área), `formato: "banner"`, `order`.

## Rotas do Worker usadas pelo editor (todas pedem a sessão do painel)

| Rota | O que faz |
|---|---|
| `GET /admin/conteudo` | Lê os arquivos de `data/` do branch (com o `sha` de cada um). Sem token: `configurado: false, motivo: "falta_token"`. |
| `POST /admin/conteudo/publicar` | Valida, grava imagens e JSON num único commit. Recusa se o arquivo mudou desde a leitura (409). |
| `GET /admin/conteudo/historico` | Últimos commits do editor. |
| `POST /admin/conteudo/desfazer` | Commit que desfaz um commit do editor (se nada depois mexeu nos mesmos arquivos). |
| `GET /admin/conteudo/publicacao?commit=` | Situação do GitHub Pages para aquele commit. |

Arquivos que o editor pode gravar: `data/products.json`, `carousel.json`, `areas.json`, `pausa.json`, `site.json` (menos `central` e `colors`, que ficam sempre como no repositório), `sobre.json`, `sabores.json` e imagens em `assets/products/<slug>/`, `assets/carousel/`, `assets/areas/`, `assets/sobre/` (WebP/JPG, até 1,6 MB cada). Pix e pagamento não são editáveis pelo editor.

## Testes

`WRANGLER=… PW_DIR=… bash central/jana-pedidos/test/run-local.sh` sobe Worker local, InfinitePay e GitHub simulados e roda:
API de pedidos, API do editor (`conteudo.test.mjs`) e o editor no navegador em 390 e 1280 px (`tests/editor-e2e.mjs`). Nada real é publicado.
