/**
 * Cloudflare Worker adapter — NOT deployed.
 * Do not point the live site here until ADMIN_TOKEN + store are provisioned.
 */
import { handleRequest } from "./logic.mjs";

function kvStore(namespace) {
  return {
    get: async function get(key) {
      const raw = await namespace.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    put: async function put(key, value) {
      await namespace.put(key, JSON.stringify(value));
    },
    list: async function list(prefix) {
      const listed = await namespace.list({ prefix: prefix });
      const orders = [];
      for (const key of listed.keys) {
        const raw = await namespace.get(key.name);
        if (raw) {
          orders.push(JSON.parse(raw));
        }
      }
      return orders;
    },
  };
}

export default {
  async fetch(request, env) {
    return fetchFromEnv(request, env);
  },
};

export async function fetchFromEnv(request, env) {
  const result = await handleRequest(request, {
    adminToken: env && env.ADMIN_TOKEN,
    corsOrigin: (env && env.CORS_ORIGIN) || "https://alexandrerangel.github.io",
    store: env && env.ORDERS ? kvStore(env.ORDERS) : null,
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
