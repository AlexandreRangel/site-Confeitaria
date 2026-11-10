# Pausar encomendas no site

Use isto quando a Jana não puder aceitar pedidos (muito trabalho, férias, fim de semana). O site continua no ar e dá para navegar. Só o carrinho e o botão **Comprar** ficam bloqueados, com um recado e o WhatsApp.

Tudo começa desligado. Nada precisa ser preenchido até o dia em que vocês quiserem pausar.

## Jeito 1 — o mais rápido (arquivo no GitHub)

Abra o arquivo `data/pausa.json` no GitHub e edite só o que precisar.

Formato:

```json
{
  "ativo": false,
  "inicio": "",
  "fim": "",
  "mensagem": "",
  "periodos": [],
  "fimDeSemana": false,
  "planilhaCsv": ""
}
```

- **Pausa agora, sem data:** `"ativo": true`
- **Pausa até um dia:** `"ativo": true` e `"fim": "2026-01-05"` (o recado vira “até 05/01”)
- **Pausa entre duas datas:** `"ativo": true`, `"inicio": "2026-12-20"` e `"fim": "2027-01-05"` (o recado vira “entre 20/12 e 05/01”). O último dia ainda conta.
- **Texto extra (opcional):** `"mensagem": "Voltamos em breve!"`
- **Férias programadas:** deixe `"ativo": false` e coloque a janela em `"periodos"`:

```json
"periodos": [
  { "inicio": "2026-12-20", "fim": "2027-01-05", "mensagem": "Bom descanso e até já!" }
]
```

O site liga sozinho no dia do início e desliga depois do fim (fuso de Brasília).

- **Pausar todo sábado e domingo:** `"fimDeSemana": true`

As datas são sempre `AAAA-MM-DD`. Depois de salvar no GitHub, aguarde a publicação do Pages (cerca de um minuto) e recarregue o site.

## Jeito 2 — planilha Google (sem pedir para o programador)

Se preferir ligar e desligar numa planilha:

1. No Google Drive, crie uma planilha nova. Nome sugerido: **Pausa de encomendas**.
2. Na primeira linha, escreva exatamente estes títulos: `ativo`, `inicio`, `fim`, `mensagem`.
3. Cada linha abaixo é um período. Exemplo:

   | ativo | inicio     | fim        | mensagem            |
   | ----- | ---------- | ---------- | ------------------- |
   | SIM   | 2026-12-20 | 2027-01-05 | Voltamos em breve!  |
   | NÃO   | 2026-07-01 | 2026-07-15 | (essa linha ignora) |

   - `ativo` = **SIM** para valer, **NÃO** para ignorar.
   - Datas em `AAAA-MM-DD` (ou `20/12/2026`).
   - Uma linha **SIM** sem datas = pausa imediata, sem prazo.

4. Publique a planilha como CSV:
   - Menu **Arquivo → Compartilhar → Publicar na web**
   - Escolha a aba certa e o formato **Valores separados por vírgula (.csv)**
   - Clique em **Publicar** e copie o link.
5. Cole esse link em `data/pausa.json`, no campo `"planilhaCsv": "COLE_O_LINK_AQUI"`.
6. Salve o arquivo no GitHub.

O site consulta a planilha de tempos em tempos. Se a planilha abrir, ela vale no lugar do JSON (o fim de semana do JSON continua valendo). Se a planilha falhar (sem internet, link errado), o site usa o JSON e **não trava**.

## O que a cliente vê

Ao tocar no carrinho ou em **Comprar**, aparece um aviso e os botões **Falar no WhatsApp** e **Fechar**. Nada entra no carrinho enquanto a pausa estiver ligada.
