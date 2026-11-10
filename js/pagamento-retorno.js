(function pagamentoRetorno(global) {
  const Jana = global.Jana;

  function paramsFromQuery() {
    const params = new URLSearchParams(location.search);
    return {
      receipt_url: params.get("receipt_url") || "",
      order_nsu: params.get("order_nsu") || "",
      slug: params.get("slug") || "",
      capture_method: params.get("capture_method") || "",
      transaction_nsu: params.get("transaction_nsu") || "",
    };
  }

  function setState(title, text, kind) {
    const main = Jana.qs("#pagamento-conteudo");
    if (main) {
      main.setAttribute("data-state", kind || "");
    }
    Jana.bindText("pagamento-titulo", title);
    Jana.bindText("pagamento-texto", text);
  }

  function showReceipt(url) {
    const link = Jana.qs("[data-bind='pagamento-comprovante']");
    if (!link) {
      return;
    }
    if (url) {
      link.hidden = false;
      link.setAttribute("href", url);
    } else {
      link.hidden = true;
    }
  }

  function showWhatsApp(url) {
    const link = Jana.qs("[data-bind='pagamento-whatsapp']");
    if (!link) {
      return;
    }
    if (url) {
      link.hidden = false;
      link.setAttribute("href", url);
    } else {
      link.hidden = true;
    }
  }

  function openWhatsApp(url) {
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
    if (!coarse) {
      try {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened) {
          return;
        }
      } catch (err) {
        /* fall through */
      }
    }
    window.location.assign(url);
  }

  function alreadySent(nsu) {
    try {
      return sessionStorage.getItem("jana-abreu-wa-paid-" + nsu) === "1";
    } catch (err) {
      return false;
    }
  }

  function markSent(nsu) {
    try {
      sessionStorage.setItem("jana-abreu-wa-paid-" + nsu, "1");
    } catch (err) {
      /* ignore */
    }
  }

  function findOrder(nsu, pending, centralOrder) {
    if (Jana.Store && Jana.Store.findByOrderNsu) {
      const found = Jana.Store.findByOrderNsu(nsu);
      if (found) {
        return found;
      }
    }
    if (centralOrder) {
      return Object.assign({}, centralOrder, { id: "" });
    }
    if (pending && pending.payload) {
      return {
        clientName: pending.payload.nome,
        clientPhone: pending.payload.telefone,
        clientEmail: pending.payload.email,
        modalidade: pending.payload.modalidade,
        address: pending.payload.endereco,
        desiredDate: pending.payload.data,
        items: pending.payload.items || [],
        notes: pending.payload.observacoes,
        subtotal: pending.totals && pending.totals.subtotal,
        taxa: pending.totals && pending.totals.taxa,
        total: pending.totals && pending.totals.total,
        orderNsu: pending.orderNsu || nsu,
      };
    }
    return { orderNsu: nsu, items: [] };
  }

  async function run() {
    const params = paramsFromQuery();
    const site = await Jana.loadJSON("data/site.json").catch(function noSite() {
      return { brandName: "Jana Abreu Confeitaria", contato: { whatsapp: "5561981246112" } };
    });
    const pagamento = await Jana.loadJSON("data/pagamento.json").catch(function noPay() {
      return { infinitepay: { enabled: false, handle: "" } };
    });
    const pending = Jana.loadPendingPay && Jana.loadPendingPay();
    const retry = Jana.qs("[data-bind='pagamento-retry']");
    if (retry) {
      retry.setAttribute("href", Jana.assetUrl("encomendas/"));
    }

    if (!params.order_nsu || !params.slug || !params.transaction_nsu) {
      setState(
        "Não foi possível identificar o pagamento",
        "Faltam dados do retorno da InfinitePay. Volte ao site para tentar de novo, ou fale com a Jana no WhatsApp.",
        "erro"
      );
      const number = (site.contato && site.contato.whatsapp) || "5561981246112";
      showWhatsApp(
        "https://wa.me/" +
          number +
          "?text=" +
          encodeURIComponent("Olá! Tentei pagar no site e não consegui confirmar o pagamento.")
      );
      return;
    }

    // 1) Worker (confere na InfinitePay pelo servidor e grava o pedido como pago).
    // 2) Se o Worker estiver fora do ar ou não conhecer o pedido, consulta o payment_check direto.
    let check = null;
    let centralOrder = null;
    if (Jana.Central && Jana.Central.isEnabled(site)) {
      const token = pending && pending.orderNsu === params.order_nsu ? pending.centralToken || "" : "";
      const status = await Jana.Central.orderStatus(site, params.order_nsu, params, token);
      if (status.ok && status.data && !status.data.checkError) {
        check = {
          success: true,
          paid: status.data.paid === true,
          paid_amount: status.data.paidAmount != null ? Math.round(status.data.paidAmount * 100) : null,
          capture_method: status.data.captureMethod || "",
          source: "worker",
        };
        centralOrder = status.data.order || null;
      }
    }
    if (!check) {
      const handle = Jana.infinitePayHandle(pagamento);
      try {
        check = await Jana.checkInfinitePay({
          handle: handle,
          order_nsu: params.order_nsu,
          transaction_nsu: params.transaction_nsu,
          slug: params.slug,
        });
      } catch (err) {
        setState(
          "Não foi possível confirmar o pagamento",
          "Houve um erro ao consultar a InfinitePay. Se você já pagou, fale com a Jana pelo WhatsApp e envie o comprovante.",
          "erro"
        );
        const number = (site.contato && site.contato.whatsapp) || "5561981246112";
        showWhatsApp(
          "https://wa.me/" +
            number +
            "?text=" +
            encodeURIComponent("Olá! Paguei o pedido " + params.order_nsu + " e o site não confirmou. Pode conferir?")
        );
        return;
      }
    }

    const order = findOrder(params.order_nsu, pending, centralOrder);
    const paid = !!(check && check.success !== false && check.paid === true);
    if (!paid) {
      setState(
        "Pagamento não confirmado",
        "Não encontramos a confirmação deste pagamento. Se você já pagou, fale com a Jana pelo WhatsApp. Se ainda não pagou, volte ao carrinho para tentar de novo.",
        "pendente"
      );
      if (order && Jana.Store && Jana.Store.updateOrder && order.id) {
        order.paymentStatus = "nao_pago";
        Jana.Store.updateOrder(order);
      }
      const number = (site.contato && site.contato.whatsapp) || "5561981246112";
      showWhatsApp(
        "https://wa.me/" +
          number +
          "?text=" +
          encodeURIComponent("Olá! Tentei pagar o pedido " + params.order_nsu + " e não foi confirmado.")
      );
      return;
    }

    const paidReais = (Number(check.paid_amount || check.amount) || 0) / 100;
    if (order) {
      order.status = "pago";
      order.paymentStatus = "pago";
      order.paymentMethod = "infinitepay";
      order.captureMethod = check.capture_method || params.capture_method;
      order.receiptUrl = params.receipt_url;
      order.transactionNsu = params.transaction_nsu;
      order.checkoutSlug = params.slug;
      order.orderNsu = params.order_nsu;
      order.paidAmount = paidReais;
      if (order.id && Jana.Store && Jana.Store.updateOrder) {
        Jana.Store.updateOrder(order);
      }
    }

    setState(
      "Pagamento confirmado",
      "Recebemos a confirmação da InfinitePay. Em seguida abrimos o WhatsApp da Jana com o pedido pago.",
      "ok"
    );
    showReceipt(params.receipt_url);
    const number = (site.contato && site.contato.whatsapp) || "5561981246112";
    const message = Jana.buildPaidWhatsAppMessage(order, site, check, params);
    const wa = "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
    showWhatsApp(wa);
    const details = Jana.qs("[data-bind='pagamento-detalhes']");
    if (details) {
      details.textContent =
        "Pedido " +
        params.order_nsu +
        " · " +
        Jana.formatBRL(paidReais) +
        " · " +
        Jana.captureMethodLabel(check.capture_method || params.capture_method);
    }
    if (!alreadySent(params.order_nsu)) {
      markSent(params.order_nsu);
      window.setTimeout(function later() {
        openWhatsApp(wa);
      }, 900);
    }
  }

  document.addEventListener("DOMContentLoaded", function onReady() {
    run().catch(function onFail() {
      setState(
        "Não foi possível confirmar o pagamento",
        "Tente de novo em instantes ou fale com a Jana no WhatsApp.",
        "erro"
      );
    });
  });
})(window);
