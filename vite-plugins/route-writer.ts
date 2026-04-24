import {
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";

// Dev-only endpoint. Accepts POST /__write-route with body { id, code, name,
// color, fare, ways } → writes public/routes/<id>.json and rebuilds
// routes/index.json. Not wired in production builds.
export function routeWriter(): Plugin {
  return {
    name: "route-writer",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      function rebuildIndex(routesDir: string) {
        const files = readdirSync(routesDir)
          .filter((f) => f.endsWith(".json") && f !== "index.json")
          .sort();
        writeFileSync(
          resolve(routesDir, "index.json"),
          JSON.stringify({ files }, null, 2)
        );
      }

      server.middlewares.use("/__delete-route", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        const url = new URL(req.url ?? "", "http://localhost");
        const id = url.searchParams.get("id");
        if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
          res.statusCode = 400;
          res.end("bad id");
          return;
        }
        const routesDir = resolve(server.config.root, "public", "routes");
        const filePath = resolve(routesDir, `${id}.json`);
        try {
          if (existsSync(filePath)) unlinkSync(filePath);
          rebuildIndex(routesDir);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.statusCode = 500;
          res.end(`${e instanceof Error ? e.message : e}`);
        }
      });

      server.middlewares.use("/__write-route", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!body.id || typeof body.id !== "string") {
              res.statusCode = 400;
              res.end("id required");
              return;
            }
            if (!/^[a-z0-9_-]+$/i.test(body.id)) {
              res.statusCode = 400;
              res.end("id must be alphanumeric/dash/underscore");
              return;
            }
            const routesDir = resolve(
              server.config.root,
              "public",
              "routes"
            );
            if (!existsSync(routesDir)) mkdirSync(routesDir, { recursive: true });
            const filePath = resolve(routesDir, `${body.id}.json`);
            const out = {
              id: body.id,
              code: body.code ?? body.id.toUpperCase(),
              name: body.name ?? body.id,
              color: body.color ?? "#dc2626",
              fare: typeof body.fare === "number" ? body.fare : 13,
              topology:
                body.topology === "loop" ? "loop" : "corridor",
              path: Array.isArray(body.path)
                ? body.path.filter((n: unknown) => typeof n === "number")
                : [],
            };
            writeFileSync(filePath, JSON.stringify(out, null, 2));
            rebuildIndex(routesDir);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, file: `${body.id}.json` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(`bad request: ${e instanceof Error ? e.message : e}`);
          }
        });
      });
    },
  };
}
