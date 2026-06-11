import path from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import chokidar, { type FSWatcher } from "chokidar";
import { buildBodyFiles, buildGraph, findObject } from "../core/graph";
import { formatLocalReference, type ReferenceSelection } from "../core/reference";
import type { NormalizedGraph } from "../core/types";

interface DevServerOptions {
  port: number;
}

function sendJson(res: import("node:http").ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendSse(res: import("node:http").ServerResponse): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(": connected\n\n");
}

export async function startDevServer(projectRoot: string, options: DevServerOptions): Promise<{ vite: ViteDevServer; watcher: FSWatcher }> {
  let graph: NormalizedGraph = await buildGraph(projectRoot);
  let buildVersion = 0;
  const clients = new Set<import("node:http").ServerResponse>();
  const rebuild = async (reason: string) => {
    try {
      graph = await buildGraph(projectRoot);
      buildVersion += 1;
      const payload = JSON.stringify({
        type: "rebuilt",
        version: buildVersion,
        reason,
        builtAt: graph.builtAt,
        problemCount: graph.problems.length
      });
      for (const client of clients) client.write(`event: build\ndata: ${payload}\n\n`);
    } catch (error) {
      const payload = JSON.stringify({ type: "error", reason, message: String(error) });
      for (const client of clients) client.write(`event: build\ndata: ${payload}\n\n`);
    }
  };

  const watcher = chokidar.watch([
    path.join(projectRoot, "atlas.yml"),
    path.join(projectRoot, "objects"),
    path.join(projectRoot, "views"),
    path.join(projectRoot, ".atlas", "aliases.yml")
  ], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 }
  });
  let timer: NodeJS.Timeout | undefined;
  watcher.on("all", (eventName, changedPath) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild(`${eventName} ${path.relative(projectRoot, changedPath)}`);
    }, 180);
  });

  const apiMiddleware = async (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    next: () => void
  ) => {
    if (!req.url) return next();
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/api/events") {
      sendSse(res);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (url.pathname === "/api/graph") {
      sendJson(res, graph);
      return;
    }

    if (url.pathname.startsWith("/api/object/") && url.pathname.endsWith("/body")) {
      const uid = decodeURIComponent(url.pathname.slice("/api/object/".length, -"/body".length));
      const object = findObject(graph, uid);
      if (!object) {
        sendJson(res, { error: `Object not found: ${uid}` }, 404);
        return;
      }
      sendJson(res, { object: object.uid, files: await buildBodyFiles(graph, object) });
      return;
    }

    if (url.pathname === "/api/reference" && req.method === "POST") {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) as { uid?: string; selection?: ReferenceSelection } : {};
      if (!parsed.uid) {
        sendJson(res, { error: "uid is required" }, 400);
        return;
      }
      const object = findObject(graph, parsed.uid);
      if (!object) {
        sendJson(res, { error: `Object not found: ${parsed.uid}` }, 404);
        return;
      }
      sendJson(res, { text: formatLocalReference(graph, object, parsed.selection) });
      return;
    }

    next();
  };

  const vite = await createViteServer({
    configFile: false,
    root: process.cwd(),
    plugins: [{
      name: "proof-atlas-api",
      configureServer(server) {
        server.middlewares.use(apiMiddleware);
      }
    }, react()],
    server: {
      host: "127.0.0.1",
      port: options.port
    },
    appType: "spa"
  });

  await vite.listen(options.port);
  vite.printUrls();
  console.log(`Proof Atlas project: ${projectRoot}`);
  return { vite, watcher };
}
