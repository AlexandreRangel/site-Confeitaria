// Mock local da API da InfinitePay. Paga apenas transações registradas em /__pay.
import http from "node:http";
const paid = new Map(); // key nsu|txn|slug -> amount
const links = [];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const data = body ? JSON.parse(body) : {};
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/links") {
      if (data.customer && data.customer.name === "E2E Rejeita") {
        res.statusCode = 422;
        return res.end(JSON.stringify({ message: "customer inválido" }));
      }
      links.push(data);
      return res.end(JSON.stringify({ url: "https://checkout.infinitepay.io/mock/" + data.order_nsu }));
    }
    if (req.url === "/payment_check") {
      const k = [data.order_nsu, data.transaction_nsu, data.slug].join("|");
      if (data.handle !== "handle-teste") return res.end(JSON.stringify({ success: false, paid: false }));
      if (paid.has(k)) return res.end(JSON.stringify({ success: true, paid: true, amount: paid.get(k), paid_amount: paid.get(k), installments: 1, capture_method: "credit_card" }));
      return res.end(JSON.stringify({ success: true, paid: false }));
    }
    if (req.url === "/__pay") {
      paid.set([data.order_nsu, data.transaction_nsu, data.slug].join("|"), data.amount);
      return res.end("{}");
    }
    if (req.url === "/__links") return res.end(JSON.stringify(links));
    res.statusCode = 404; res.end("{}");
  });
}).listen(9911, () => console.log("mock on 9911"));
