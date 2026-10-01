# Nomenclatura das áreas do site — comandos de chat

Use estes nomes ao falar com o Grok Bot. Assim o bot sabe **exatamente** qual arquivo/JSON alterar.

---

## Glossário rápido

| Nome no chat | Onde aparece | Arquivo / pasta |
|--------------|--------------|-----------------|
| `site` / `configs` | Nome, WhatsApp, Pix, rodapé | `data/site.json` |
| `topo` / `header` | Logo, menu, telefone | `site.json` + HTML header |
| `hero` / `hero-carrossel` | Faixa grande no topo da home | `data/carousel.json` + `assets/carousel/` |
| `slide N` | Um slide do carrossel (1-based) | item em `carousel.json` |
| `categorias` / `fileira-categorias` | Círculos de categoria | `data/categories.json` |
| `categoria:{slug}` | Uma categoria | ex.: `categoria:bolos` |
| `grade` / `vitrine` | Lista de produtos na home ou categoria | filtrado de `products.json` |
| `destaques` | Produtos com `destaque: true` na home | `products.json` |
| `produto:{slug}` | Um produto | ex.: `produto:bolo-cenoura-exemplo` |
| `fotos-produto` | Galeria multi-foto | `assets/products/{slug}/` |
| `capa` | Foto principal (primeira ou marcada) | `fotos[0]` ou `capaIndex` |
| `kits` / `cestas` | Seção Cestas & Presentes | página `kits.html` + cat. `cestas-presentes` |
| `bolos` | Seção Bolos | `bolos.html` + cat. `bolos` |
| `empresas` | Personalizado para Empresas | cat. `personalizado-empresas` |
| `combos` | Combos festa | cat. `combos-festa` |
| `festa-personalizada` | Festa Personalizada | cat. `festa-personalizada` |
| `doces-festa` | Doces festa | cat. `doces-festa` |
| `sobremesas` | Sobremesas | cat. `sobremesas` |
| `casamento` | Doces / kits casamento (seção) | `casamento.html` + tag `casamento` |
| `encomendar` / `pedido` | Fluxo de pedido | `encomendar.html` + `js/encomenda.js` |
| `pagamentos` | Textos Pix / cartão / boleto | `site.json` → `pagamentos` |
| `rodape` / `footer` | Contato, redes, horário | `site.json` |
| `crop` | Recorte de imagem | ImageMagick via chat ou `crop.html` |

---

## Categorias oficiais (slugs)

| Nome na vitrine | Slug no chat / JSON |
|-----------------|---------------------|
| Cestas & Presentes | `cestas-presentes` |
| Personalizado para Empresas | `personalizado-empresas` |
| Combos festa | `combos-festa` |
| Bolos | `bolos` |
| Festa Personalizada | `festa-personalizada` |
| Doces festa | `doces-festa` |
| Sobremesas | `sobremesas` |

Pode falar o **nome completo** ou o **slug**; o bot normaliza.

---

## Exemplos de comandos

### Site / topo / rodapé

- `Atualiza o WhatsApp do site para 11 9XXXX-XXXX`
- `No rodape, coloca o horário: seg a sáb 9h–18h`
- `Em pagamentos, deixa claro que aceita Pix, cartão e boleto`

### Hero / carrossel

- `No hero-carrossel, troca a imagem do slide 1` *(anexa foto)*
- `Adiciona slide no hero com título "Encomendas de Natal" linkando para categoria:cestas-presentes`
- `Remove o slide 3 do hero-carrossel`
- `No slide 2, muda o CTA para "Ver bolos" → categoria:bolos`

### Categorias

- `Reordena categorias: bolos, sobremesas, cestas-presentes, …`
- `Troca o ícone/circular da categoria:doces-festa` *(anexa imagem)*
- `Esconde a categoria:combos-festa (ativo false)`

### Produtos

- `Adiciona produto:bolo-chocolate-exemplo na categoria:bolos, preço 120, sob encomenda` *(anexa 2 fotos)*
- `Em produto:kit-cafe-exemplo, foto 2 como capa`
- `Em produto:brigadeiro-festa-exemplo, adiciona mais uma foto`
- `Remove foto 3 de produto:bolo-chocolate-exemplo`
- `Marca produto:kit-cafe-exemplo como destaque`
- `Desativa produto:bolo-cenoura-exemplo (não mostrar na vitrine)`
- `Muda preço de produto:sobremesa-pote-exemplo para 28,90`
- `Move produto:combo-festa-exemplo para categoria:combos-festa`

### Crop / imagens

- `Na última foto do produto:bolo-chocolate-exemplo, crop quadrado centrado`
- `Aperta o crop: menos fundo, mais perto do bolo`
- `Redimensiona todas as fotos de produto:kit-cafe-exemplo para max 1200px`

### Seções / páginas

- `Atualiza o texto de intro da página kits`
- `Na seção casamento, coloca 3 produtos com tag casamento`
- `O botão Encomendar do produto X deve abrir o WhatsApp com o nome do produto`

### Pedidos

- `No fluxo encomendar, mensagem padrão: olá, quero encomendar {nome}`
- `Inclui no pedido os campos: data da festa, quantidade, observação`

---

## Convenções de slug

- minúsculas, hífens, sem acento: `bolo-cenoura-exemplo`
- produtos de exemplo / placeholder terminam com `-exemplo` até virar item real
- nunca reutilizar slug de produto apagado sem limpar `assets/products/{slug}/`

---

## Resposta esperada do bot

Ao concluir, o bot deve confirmar em uma linha do tipo:

> Atualizei `produto:bolo-chocolate-exemplo` (2 fotos), commit `abc1234`, Dropbox espelhado. No ar em ~1–2 min nas Pages.
