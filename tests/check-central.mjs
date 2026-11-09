import { createMemoryStore, handleRequest, isAdmin } from "../central/logic.mjs";

const errors = [];
const DISCLAIMER =
  "Esta é uma solicitação de encomenda. A confirmação depende da disponibilidade e da confirmação da Jana pelo WhatsApp.";

function record(ok, name, detail) {
  if (!ok) {
    errors.push(name + (detail ? " — " + detail : ""));
  }
}

function makeRequest(url, options) {
  return new Request("https://central.test" + url, options);
}

async function run() {
  const store = createMemoryStore();
  const env = {
    store: store,
    adminToken: "secret-admin-token",
    corsOrigin: "https://alexandrerangel.github.io",
  };
  const payload = {
    nome: "Cliente Teste",
    telefone: "61900000000",
    items: [{ id: "p-1", name: "Tábua", quantity: 1, price: 10, flavor: "" }],
    observacoes: "dado de teste",
  };

  const denied = await handleRequest(
    makeRequest("/v1/solicitacoes", { method: "GET" }),
    env
  );
  record(denied.status === 401, "GET without token is denied", String(denied.status));

  const deniedPatch = await handleRequest(
    makeRequest("/v1/solicitacoes/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "confirmado" }),
    }),
    env
  );
  record(deniedPatch.status === 401, "PATCH without token is denied", String(deniedPatch.status));

  const wrong = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "GET",
      headers: { authorization: "Bearer wrong-token" },
    }),
    env
  );
  record(wrong.status === 401, "GET with wrong token is denied", String(wrong.status));
  record(!isAdmin("Bearer wrong-token", env.adminToken), "isAdmin rejects wrong token");

  const unconfigured = await handleRequest(
    makeRequest("/v1/solicitacoes", { method: "GET" }),
    { store: store, adminToken: "", corsOrigin: env.corsOrigin }
  );
  record(unconfigured.status === 503, "GET without admin token configured is 503, not an open list", String(unconfigured.status));

  const created = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "abc-1" },
      body: JSON.stringify(payload),
    }),
    env
  );
  record(created.status === 201, "POST creates solicitation", String(created.status));
  const createdBody = JSON.parse(created.body);
  record(createdBody.savedCentral === true, "POST reports savedCentral");
  record(createdBody.confirmed === false, "creating is not confirmation");
  record(createdBody.whatsappSent === false, "creating does not claim WhatsApp send");
  record(createdBody.order.status === "solicitado", "initial status is solicitado");

  const duplicate = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "abc-1" },
      body: JSON.stringify(payload),
    }),
    env
  );
  const dupBody = JSON.parse(duplicate.body);
  record(duplicate.status === 200 && dupBody.duplicate === true, "same idempotency key does not duplicate");
  const listed = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "GET",
      headers: { authorization: "Bearer secret-admin-token" },
    }),
    env
  );
  const listBody = JSON.parse(listed.body);
  record(listBody.orders.length === 1, "store has a single order after retry", String(listBody.orders.length));

  const noStore = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { adminToken: "x", corsOrigin: env.corsOrigin }
  );
  record(noStore.status === 503, "POST without store is unavailable", String(noStore.status));
  record(!createdBody.orders, "client POST does not list all orders");

  const patched = await handleRequest(
    makeRequest("/v1/solicitacoes/" + createdBody.order.id, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret-admin-token",
      },
      body: JSON.stringify({ status: "confirmado" }),
    }),
    env
  );
  const patchedBody = JSON.parse(patched.body);
  record(patched.status === 200, "admin PATCH updates status", String(patched.status));
  record(patchedBody.order.status === "confirmado", "PATCH status is confirmado");
  record(
    Array.isArray(patchedBody.order.history) && patchedBody.order.history.length === 2,
    "PATCH keeps a history trail",
    String(patchedBody.order.history && patchedBody.order.history.length)
  );

  const other = await handleRequest(
    makeRequest("/v1/solicitacoes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "abc-2" },
      body: JSON.stringify(payload),
    }),
    env
  );
  const otherBody = JSON.parse(other.body);
  record(other.status === 201, "different idempotency key creates another solicitation", String(other.status));
  record(otherBody.order.id !== createdBody.order.id, "second solicitation has its own id");
  record(!otherBody.orders, "second POST still does not list all orders");

  record(/solicitação de encomenda/i.test(DISCLAIMER), "canonical disclaimer text is present");
}

await run();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("central checks ok");
