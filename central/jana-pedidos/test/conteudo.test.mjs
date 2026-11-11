// Testes do editor do site no Worker (rotas /admin/conteudo*), contra wrangler dev + mock do GitHub.
// Uso: W=http://127.0.0.1:8787 ORIGIN=http://127.0.0.1:8771 ADMIN=senha GH=http://127.0.0.1:9922 node test/conteudo.test.mjs
const W = process.env.W;
const ORIGIN = process.env.ORIGIN;
const ADMIN = process.env.ADMIN;
const GH = process.env.GH;
let fails = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : ""));
  if (!cond) fails++;
};
async function call(method, path, body, headers) {
  const res = await fetch(W + path, {
    method,
    headers: Object.assign({ "Content-Type": "application/json", Origin: ORIGIN }, headers || {}),
    body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
const gh = async (path, body) => (await fetch(GH + path, body ? { method: "POST", body: JSON.stringify(body) } : {})).json();
const file = async (p) => gh("/__file?path=" + encodeURIComponent(p));
// WebP mínimo válido (1x1)
const WEBP = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

let r = await call("GET", "/admin/conteudo");
ok("conteúdo sem login → 401", r.status === 401);
r = await call("POST", "/admin/conteudo/publicar", { arquivos: {} });
ok("publicar sem login → 401", r.status === 401);
r = await call("POST", "/admin/login", { password: ADMIN });
ok("login", r.status === 200 && !!r.data.token);
const auth = { Authorization: "Bearer " + r.data.token };

r = await call("GET", "/admin/conteudo", null, auth);
ok("lê conteúdo do GitHub", r.status === 200 && r.data.configurado === true && Array.isArray(r.data.arquivos["data/products.json"].data));
const loaded = r.data;
const sha = (p) => loaded.arquivos[p].sha;
const products = loaded.arquivos["data/products.json"].data;
ok("traz os 8 arquivos com sha", Object.keys(loaded.arquivos).length === 8 && Object.values(loaded.arquivos).every((f) => /^[0-9a-f]{40}$/.test(f.sha)));
const head0 = (await gh("/__head")).sha;

// validação
const semNome = products.slice();
semNome[0] = Object.assign({}, semNome[0], { name: "  " });
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/products.json": semNome }, bases: { "data/products.json": sha("data/products.json") }, resumo: "teste" }, auth);
ok("produto sem nome → 400 em português", r.status === 400 && /não pode ficar vazio/.test(r.data.error), r.data && r.data.error);
const precoRuim = products.slice();
precoRuim[0] = Object.assign({}, precoRuim[0], { price: "100" });
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/products.json": precoRuim }, bases: { "data/products.json": sha("data/products.json") } }, auth);
ok("preço em texto → 400", r.status === 400 && /preço inválido/.test(r.data.error));
const dup = products.concat([Object.assign({}, products[0])]);
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/products.json": dup }, bases: { "data/products.json": sha("data/products.json") } }, auth);
ok("produto repetido → 400", r.status === 400);
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/pix.json": { enabled: false } } }, auth);
ok("arquivo fora da lista (pix.json) → 400", r.status === 400 && /não permitido/.test(r.data.error));
r = await call("POST", "/admin/conteudo/publicar", { arquivos: {}, imagens: [{ path: "assets/products/x/../../index.webp", base64: WEBP }] }, auth);
ok("caminho de foto malicioso → 400", r.status === 400);
r = await call("POST", "/admin/conteudo/publicar", { arquivos: {}, imagens: [{ path: "assets/products/teste/a.webp", base64: Buffer.from("<script>").toString("base64") }] }, auth);
ok("arquivo que não é imagem → 400", r.status === 400 && /WebP ou JPG/.test(r.data.error));
const xss = JSON.parse(JSON.stringify(loaded.arquivos["data/carousel.json"].data));
xss[0] = Object.assign({}, xss[0], { linkTipo: "url", url: "javascript:alert(1)" });
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/carousel.json": xss }, bases: { "data/carousel.json": sha("data/carousel.json") } }, auth);
ok("link javascript: no banner → 400", r.status === 400);
const areasRuins = JSON.parse(JSON.stringify(loaded.arquivos["data/areas.json"].data));
areasRuins.find((a) => a.id === "natal").ativacao = { modo: "datas", inicio: "2026-12-30", fim: "2026-12-01" };
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/areas.json": areasRuins }, bases: { "data/areas.json": sha("data/areas.json") } }, auth);
ok("Natal com fim antes do início → 400", r.status === 400 && /fim vem antes/.test(r.data.error));
ok("nada foi gravado pelos envios inválidos", (await gh("/__head")).sha === head0);

// publica um produto novo com foto
const novo = { id: "p-teste-editor", slug: "teste-editor", name: "Produto teste editor", description: "Descrição de teste", categoryId: "bolos",
  categoryIds: ["bolos", "personalizado-para-empresas"], category: "Bolos", price: 12.5, images: ["assets/products/teste-editor/foto-1.webp"],
  imagesAlt: ["Foto de teste"], featured: false, active: true, tags: [] };
r = await call("POST", "/admin/conteudo/publicar", {
  arquivos: { "data/products.json": products.concat([novo]) },
  bases: { "data/products.json": sha("data/products.json") },
  imagens: [{ path: "assets/products/teste-editor/foto-1.webp", base64: WEBP }],
  resumo: "produto «Produto teste editor» criado",
}, auth);
ok("publica produto + foto num commit", r.status === 200 && /^[0-9a-f]{40}$/.test(r.data.commit), JSON.stringify(r.data).slice(0, 200));
const c1 = r.data.commit;
let f = await file("data/products.json");
ok("products.json no repositório tem o produto", JSON.parse(f.text).some((p) => p.id === "p-teste-editor"));
ok("sha devolvido bate com o do GitHub", r.data.shas["data/products.json"] === f.sha);
ok("foto gravada", (await file("assets/products/teste-editor/foto-1.webp")).size > 10);
const head1 = await gh("/__head");
ok("mensagem do commit", head1.message === "Editor: produto «Produto teste editor» criado", head1.message);
let shaProducts = r.data.shas["data/products.json"];

// base velha → conflito
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/products.json": products }, bases: { "data/products.json": sha("data/products.json") } }, auth);
ok("base desatualizada → 409 conflito", r.status === 409 && r.data.error === "conflito");

// commit externo em outro arquivo não atrapalha
await gh("/__commit", { path: "README.md", content: "mudou fora do editor\n", message: "commit externo" });
const site = JSON.parse(JSON.stringify(loaded.arquivos["data/site.json"].data));
site.slogan = "Slogan de teste";
site.central = { enabled: true, endpoint: "https://evil.example" };
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/site.json": site }, bases: { "data/site.json": sha("data/site.json") }, resumo: "textos do site" }, auth);
ok("publica textos depois de commit externo", r.status === 200);
const c2 = r.data.commit;
f = JSON.parse((await file("data/site.json")).text);
ok("slogan salvo", f.slogan === "Slogan de teste");
ok("editor não troca o endereço do Worker (central)", f.central.endpoint === loaded.arquivos["data/site.json"].data.central.endpoint);

// histórico e desfazer
r = await call("GET", "/admin/conteudo/historico", null, auth);
ok("histórico lista as alterações do editor", r.status === 200 && r.data.alteracoes.length >= 2 && r.data.alteracoes[0].sha === c2 && !r.data.alteracoes.some((a) => /externo/.test(a.resumo)));
const novoPreco = JSON.parse((await file("data/products.json")).text).map((p) => (p.id === "p-teste-editor" ? Object.assign({}, p, { price: 20 }) : p));
r = await call("POST", "/admin/conteudo/publicar", { arquivos: { "data/products.json": novoPreco }, bases: { "data/products.json": shaProducts }, resumo: "preço" }, auth);
ok("edita preço", r.status === 200);
const c3 = r.data.commit;
r = await call("POST", "/admin/conteudo/desfazer", { sha: c1 }, auth);
ok("desfazer alteração antiga com mudança posterior nos mesmos dados → 409", r.status === 409);
r = await call("POST", "/admin/conteudo/desfazer", { sha: c3 }, auth);
ok("desfaz a última alteração", r.status === 200);
f = JSON.parse((await file("data/products.json")).text);
ok("preço voltou", f.find((p) => p.id === "p-teste-editor").price === 12.5);
r = await call("POST", "/admin/conteudo/desfazer", { sha: c1 }, auth);
ok("agora desfaz a criação do produto", r.status === 200, JSON.stringify(r.data));
f = JSON.parse((await file("data/products.json")).text);
ok("produto de teste sumiu e lista voltou igual", !f.some((p) => p.id === "p-teste-editor") && f.length === products.length);
ok("foto do produto desfeito foi removida", !(await file("assets/products/teste-editor/foto-1.webp")).size);
r = await call("POST", "/admin/conteudo/desfazer", { sha: (await gh("/__head")).sha.replace(/./, "0") }, auth);
ok("desfazer commit inexistente falha sem quebrar", r.status >= 400 && r.status < 600);
r = await call("POST", "/admin/conteudo/desfazer", { sha: c2 }, auth);
ok("desfaz textos", r.status === 200 && JSON.parse((await file("data/site.json")).text).slogan === loaded.arquivos["data/site.json"].data.slogan);

// publicação (Pages)
const last = (await gh("/__head")).sha;
await new Promise((res) => setTimeout(res, 700));
r = await call("GET", "/admin/conteudo/publicacao?commit=" + last, null, auth);
ok("status do Pages: no ar", r.status === 200 && r.data.estado === "no_ar", JSON.stringify(r.data));
await gh("/__mode", { pagesForbidden: true });
r = await call("GET", "/admin/conteudo/publicacao?commit=" + last, null, auth);
ok("sem permissão de Pages → desconhecido (não quebra)", r.status === 200 && r.data.estado === "desconhecido");
await gh("/__mode", { pagesForbidden: false, unauthorized: true });
r = await call("GET", "/admin/conteudo", null, auth);
ok("token inválido → 503 com recado claro", r.status === 503 && /inválida ou venceu/.test(r.data.error));
await gh("/__mode", { unauthorized: false });

// CORS / origem
r = await call("POST", "/admin/conteudo/publicar", { arquivos: {} }, Object.assign({ Origin: "https://evil.example" }, auth));
ok("publicar de origem estranha → 403", r.status === 403);

console.log(fails ? fails + " FALHA(S)" : "TODOS OK");
process.exit(fails ? 1 : 0);
