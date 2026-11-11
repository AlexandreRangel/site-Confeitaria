// Mock local da API do GitHub (só o que o editor usa). Guarda um repositório git em memória,
// semeado a partir de SITE_DIR, e a cada atualização do branch grava os arquivos em SITE_DIR
// (simula o GitHub Pages publicando). Nada sai da máquina.
// Uso: SITE_DIR=/tmp/site PORT=9922 node mock-github.mjs
import http from "node:http";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

const SITE_DIR = process.env.SITE_DIR;
const PORT = Number(process.env.PORT || 9922);
const TOKEN = process.env.TOKEN || "test-token";
const BRANCH = process.env.BRANCH || "preview";
const SKIP = new Set([".git", "node_modules", "screenshots"]);

const blobs = new Map(); // sha -> Buffer
const trees = new Map(); // sha -> [{path, mode, type, sha}]
const commits = new Map(); // sha -> {tree, parents, message, date}
const refs = new Map();
let latestBuild = null;
let mode = { unauthorized: false, pagesForbidden: false };

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");
function putBlob(buf) {
  const sha = sha1(Buffer.concat([Buffer.from("blob " + buf.length + "\0"), buf]));
  blobs.set(sha, buf);
  return sha;
}
function putTree(entries) {
  const sorted = entries.slice().sort((a, b) => a.path.localeCompare(b.path));
  const sha = sha1(Buffer.from("tree " + JSON.stringify(sorted)));
  trees.set(sha, sorted);
  return sha;
}
function putCommit(tree, parents, message) {
  const c = { tree, parents, message, date: new Date().toISOString() };
  const sha = sha1(Buffer.from("commit " + JSON.stringify(c) + Math.random()));
  commits.set(sha, c);
  return sha;
}
function flatten(treeSha, prefix, out) {
  const map = out || new Map();
  for (const e of trees.get(treeSha) || []) {
    const p = prefix ? prefix + "/" + e.path : e.path;
    if (e.type === "tree") flatten(e.sha, p, map);
    else map.set(p, { mode: e.mode, sha: e.sha });
  }
  return map;
}
function build(map) {
  const root = {};
  for (const [p, v] of map) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
    node[parts[parts.length - 1]] = v;
  }
  const make = (node) =>
    putTree(
      Object.keys(node).map((name) => {
        const v = node[name];
        if (v && v.sha && v.mode) return { path: name, mode: v.mode, type: "blob", sha: v.sha };
        return { path: name, mode: "040000", type: "tree", sha: make(v) };
      })
    );
  return make(root);
}
function seed() {
  const map = new Map();
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const r = rel ? rel + "/" + name : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else map.set(r, { mode: "100644", sha: putBlob(readFileSync(full)) });
    }
  };
  walk(SITE_DIR, "");
  const c = putCommit(build(map), [], "estado inicial");
  refs.set(BRANCH, c);
  latestBuild = { status: "built", commit: c };
}
function isAncestor(anc, sha) {
  const seen = new Set();
  const stack = [sha];
  while (stack.length) {
    const s = stack.pop();
    if (s === anc) return true;
    if (seen.has(s) || !commits.has(s)) continue;
    seen.add(s);
    stack.push(...commits.get(s).parents);
  }
  return false;
}
function deploy(oldSha, newSha) {
  const a = flatten(commits.get(oldSha).tree);
  const b = flatten(commits.get(newSha).tree);
  for (const [p, v] of b) {
    if (!a.has(p) || a.get(p).sha !== v.sha) {
      mkdirSync(dirname(join(SITE_DIR, p)), { recursive: true });
      writeFileSync(join(SITE_DIR, p), blobs.get(v.sha));
    }
  }
  for (const p of a.keys()) if (!b.has(p)) rmSync(join(SITE_DIR, p), { force: true });
  latestBuild = { status: "building", commit: newSha };
  setTimeout(() => {
    if (latestBuild.commit === newSha) latestBuild = { status: "built", commit: newSha };
  }, 400);
}
function diffFiles(sha) {
  const c = commits.get(sha);
  const a = c.parents[0] ? flatten(commits.get(c.parents[0]).tree) : new Map();
  const b = flatten(c.tree);
  const files = [];
  for (const [p, v] of b) {
    if (!a.has(p)) files.push({ filename: p, status: "added", sha: v.sha });
    else if (a.get(p).sha !== v.sha) files.push({ filename: p, status: "modified", sha: v.sha });
  }
  for (const [p, v] of a) if (!b.has(p)) files.push({ filename: p, status: "removed", sha: "0".repeat(40) });
  return files;
}
function commitAt(path, content, message) {
  const head = refs.get(BRANCH);
  const map = flatten(commits.get(head).tree);
  map.set(path, { mode: "100644", sha: putBlob(Buffer.from(content)) });
  const c = putCommit(build(map), [head], message);
  refs.set(BRANCH, c);
  deploy(head, c);
  return c;
}

seed();

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const path = url.pathname;
      const body = raw ? JSON.parse(raw) : {};
      // ganchos de teste
      if (path === "/__mode") {
        mode = Object.assign(mode, body);
        return send(res, 200, mode);
      }
      if (path === "/__file") {
        const map = flatten(commits.get(refs.get(BRANCH)).tree);
        const e = map.get(url.searchParams.get("path"));
        return e ? send(res, 200, { sha: e.sha, text: blobs.get(e.sha).toString("utf8"), size: blobs.get(e.sha).length }) : send(res, 404, {});
      }
      if (path === "/__commit") return send(res, 200, { sha: commitAt(body.path, body.content, body.message || "commit externo") });
      if (path === "/__head") return send(res, 200, { sha: refs.get(BRANCH), message: commits.get(refs.get(BRANCH)).message, count: commits.size });

      if (mode.unauthorized || req.headers.authorization !== "Bearer " + TOKEN) return send(res, 401, { message: "Bad credentials" });
      if (!req.headers["user-agent"]) return send(res, 403, { message: "User-Agent obrigatório" });
      const m = path.match(/^\/repos\/[^/]+\/[^/]+(\/.*)$/);
      if (!m) return send(res, 404, { message: "Not Found" });
      const p = m[1];
      let x;
      if (req.method === "GET" && (x = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
        const sha = refs.get(decodeURIComponent(x[1]));
        return sha ? send(res, 200, { object: { sha, type: "commit" } }) : send(res, 404, {});
      }
      if (req.method === "GET" && (x = p.match(/^\/git\/commits\/(\w+)$/))) {
        const c = commits.get(x[1]);
        return c ? send(res, 200, { sha: x[1], tree: { sha: c.tree }, parents: c.parents.map((s) => ({ sha: s })), message: c.message }) : send(res, 404, {});
      }
      if (req.method === "GET" && (x = p.match(/^\/git\/trees\/(\w+)$/))) {
        const t = trees.get(x[1]);
        return t ? send(res, 200, { sha: x[1], tree: t }) : send(res, 404, {});
      }
      if (req.method === "GET" && (x = p.match(/^\/git\/blobs\/(\w+)$/))) {
        const b = blobs.get(x[1]);
        return b ? send(res, 200, { sha: x[1], content: b.toString("base64").replace(/(.{60})/g, "$1\n"), encoding: "base64" }) : send(res, 404, {});
      }
      if (req.method === "POST" && p === "/git/blobs") {
        return send(res, 201, { sha: putBlob(Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8")) });
      }
      if (req.method === "POST" && p === "/git/trees") {
        const map = body.base_tree ? flatten(body.base_tree) : new Map();
        for (const e of body.tree || []) {
          if (e.sha === null) map.delete(e.path);
          else if (e.content != null) map.set(e.path, { mode: e.mode, sha: putBlob(Buffer.from(e.content, "utf8")) });
          else if (blobs.has(e.sha)) map.set(e.path, { mode: e.mode, sha: e.sha });
          else return send(res, 422, { message: "blob desconhecido" });
        }
        return send(res, 201, { sha: build(map) });
      }
      if (req.method === "POST" && p === "/git/commits") {
        if (!trees.has(body.tree)) return send(res, 422, { message: "tree desconhecida" });
        return send(res, 201, { sha: putCommit(body.tree, body.parents || [], body.message) });
      }
      if (req.method === "PATCH" && (x = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
        const branch = decodeURIComponent(x[1]);
        const old = refs.get(branch);
        if (!commits.has(body.sha)) return send(res, 422, { message: "commit desconhecido" });
        if (!body.force && !isAncestor(old, body.sha)) return send(res, 422, { message: "Update is not a fast forward" });
        refs.set(branch, body.sha);
        deploy(old, body.sha);
        return send(res, 200, { object: { sha: body.sha } });
      }
      if (req.method === "GET" && p === "/commits") {
        const out = [];
        let s = refs.get(url.searchParams.get("sha") || BRANCH);
        const n = Number(url.searchParams.get("per_page") || 30);
        while (s && out.length < n) {
          const c = commits.get(s);
          out.push({ sha: s, commit: { message: c.message, committer: { date: c.date } } });
          s = c.parents[0];
        }
        return send(res, 200, out);
      }
      if (req.method === "GET" && (x = p.match(/^\/commits\/(\w+)$/))) {
        const c = commits.get(x[1]);
        if (!c) return send(res, 404, {});
        return send(res, 200, { sha: x[1], commit: { message: c.message }, parents: c.parents.map((s) => ({ sha: s })), files: diffFiles(x[1]) });
      }
      if (req.method === "GET" && (x = p.match(/^\/compare\/(\w+)\.\.\.(\w+)$/))) {
        const status = x[1] === x[2] ? "identical" : isAncestor(x[1], x[2]) ? "ahead" : "diverged";
        return send(res, 200, { status });
      }
      if (req.method === "GET" && (x = p.match(/^\/contents\/(.+)$/))) {
        const ref = url.searchParams.get("ref") || refs.get(BRANCH);
        const c = commits.get(ref) || commits.get(refs.get(ref));
        const e = c && flatten(c.tree).get(decodeURIComponent(x[1]));
        return e ? send(res, 200, { sha: e.sha, path: x[1] }) : send(res, 404, { message: "Not Found" });
      }
      if (req.method === "GET" && p === "/pages/builds/latest") {
        if (mode.pagesForbidden) return send(res, 403, { message: "Resource not accessible" });
        return send(res, 200, latestBuild);
      }
      return send(res, 404, { message: "Not Found " + req.method + " " + p });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log("mock github on " + PORT));
