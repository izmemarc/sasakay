// Minimal route-edit server for production. Mirrors the dev plugin:
//   POST /__write-route   body = { id, code, name, color, fare, topology, path }
//   POST /__delete-route  ?id=ddl
//
// No auth — matches local dev behavior. Writes straight to the served
// webroot so changes are visible to everyone immediately.

import { createServer } from "node:http";
import {
  readdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT || 3001);
// Webroot that nginx serves. Edits land here directly.
const ROUTES_DIR = process.env.ROUTES_DIR || "/var/www/sasakay/routes";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

function validId(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
}

function rebuildIndex() {
  const files = readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .sort();
  writeFileSync(
    resolve(ROUTES_DIR, "index.json"),
    JSON.stringify({ files }, null, 2) + "\n"
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (req.method === "POST" && url.pathname === "/__write-route") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      if (!validId(body.id)) return json(res, 400, { error: "invalid id" });
      const target = resolve(ROUTES_DIR, `${body.id}.json`);
      writeFileSync(target, JSON.stringify(body, null, 2) + "\n");
      rebuildIndex();
      return json(res, 200, { ok: true, id: body.id });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (req.method === "POST" && url.pathname === "/__delete-route") {
    try {
      const id = url.searchParams.get("id");
      if (!validId(id)) return json(res, 400, { error: "invalid id" });
      const target = resolve(ROUTES_DIR, `${id}.json`);
      if (existsSync(target)) unlinkSync(target);
      rebuildIndex();
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`sasakay edit-server on 127.0.0.1:${PORT}, writing to ${ROUTES_DIR}`);
});
