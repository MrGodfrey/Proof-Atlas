import path from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import chokidar, { type FSWatcher } from "chokidar";
import { buildRouteExportCommand } from "../core/exportCommand";
import { buildBodyFiles, buildGraph, findObject } from "../core/graph";
import { formatLocalReference, type ReferenceSelection } from "../core/reference";
import { listRegistryProjects, resolveProjectPathOrId } from "../core/registry";
import { DEV_SERVER_HOST } from "../core/serverConfig";
import type { NormalizedGraph, ResolvedAtlasProject } from "../core/types";

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

export async function startDevServer(initialProject: ResolvedAtlasProject | undefined, options: DevServerOptions): Promise<{ vite: ViteDevServer; watcher?: FSWatcher }> {
  let currentProject: ResolvedAtlasProject | undefined = initialProject;
  let graph: NormalizedGraph | null = null;
  let watcher: FSWatcher | undefined;
  let buildVersion = 0;
  const clients = new Set<import("node:http").ServerResponse>();
  let timer: NodeJS.Timeout | undefined;
  let refreshingWatcher = false;

  const emitBuildEvent = (payload: unknown) => {
    const body = JSON.stringify(payload);
    for (const client of clients) client.write(`event: build\ndata: ${body}\n\n`);
  };

  const rebuild = async (reason: string, refreshWatchSet = false) => {
    if (!currentProject) return;
    try {
      graph = await buildGraph(currentProject);
      if (refreshWatchSet && !refreshingWatcher) {
        refreshingWatcher = true;
        await closeWatcher();
        watchProject();
        refreshingWatcher = false;
      }
      buildVersion += 1;
      emitBuildEvent({
        type: "rebuilt",
        version: buildVersion,
        reason,
        builtAt: graph.builtAt,
        problemCount: graph.problems.length
      });
    } catch (error) {
      emitBuildEvent({ type: "error", reason, message: String(error) });
    }
  };

  const closeWatcher = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (watcher) await watcher.close();
    watcher = undefined;
  };

  const watchProject = () => {
    if (!currentProject) return;
    const roots = [
      currentProject.atlasRoot,
      ...(graph?.referenceMounts ?? [])
        .filter((mount) => mount.status === "mounted" && mount.root)
        .map((mount) => mount.root as string)
    ];
    const watchPaths = roots.flatMap((rootPath) => [
      path.join(rootPath, "atlas.yml"),
      path.join(rootPath, "bib-registry.yml"),
      path.join(rootPath, "objects"),
      path.join(rootPath, "views"),
      path.join(rootPath, ".atlas", "aliases.yml"),
      path.join(rootPath, ".atlas", "local.yml")
    ]);
    const bibFiles = Object.values(graph?.bibRegistriesByOwner ?? {})
      .flatMap((registry) => registry.files.map((file) => file.file));
    watchPaths.push(...bibFiles);
    watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 }
    });
    watcher.on("all", (eventName, changedPath) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ownerRoot = roots.find((rootPath) => changedPath.startsWith(rootPath)) ?? currentProject!.atlasRoot;
        void rebuild(`${eventName} ${path.relative(ownerRoot, changedPath)}`, path.basename(changedPath) === "bib-registry.yml");
      }, 180);
    });
  };

  const openProject = async (project: ResolvedAtlasProject, reason: string): Promise<NormalizedGraph> => {
    await closeWatcher();
    currentProject = project;
    graph = await buildGraph(project);
    watchProject();
    buildVersion += 1;
    emitBuildEvent({
      type: "project_opened",
      version: buildVersion,
      reason,
      builtAt: graph.builtAt,
      problemCount: graph.problems.length
    });
    return graph;
  };

  if (currentProject) {
    await openProject(currentProject, "initial");
  }

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

    if (url.pathname === "/api/state") {
      if (graph) {
        sendJson(res, { mode: "project", graph });
      } else {
        sendJson(res, { mode: "launcher", projects: await listRegistryProjects() });
      }
      return;
    }

    if (url.pathname === "/api/projects") {
      sendJson(res, { projects: await listRegistryProjects() });
      return;
    }

    if (url.pathname === "/api/open" && req.method === "POST") {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) as { input?: string } : {};
      if (!parsed.input?.trim()) {
        sendJson(res, { error: "input is required" }, 400);
        return;
      }
      try {
        const opened = await openProject(await resolveProjectPathOrId(parsed.input), "api-open");
        sendJson(res, { mode: "project", graph: opened });
      } catch (error) {
        sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
      }
      return;
    }

    if (url.pathname === "/api/graph") {
      if (graph) {
        sendJson(res, graph);
      } else {
        sendJson(res, { error: "No Proof Atlas project is open.", projects: await listRegistryProjects() }, 404);
      }
      return;
    }

    if (url.pathname.startsWith("/api/object/") && url.pathname.endsWith("/body")) {
      if (!graph) {
        sendJson(res, { error: "No Proof Atlas project is open." }, 409);
        return;
      }
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
      if (!graph) {
        sendJson(res, { error: "No Proof Atlas project is open." }, 409);
        return;
      }
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

    if (url.pathname === "/api/export-command" && req.method === "POST") {
      if (!graph) {
        sendJson(res, { error: "No Proof Atlas project is open." }, 409);
        return;
      }
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) as { routePath?: string } : {};
      if (!parsed.routePath) {
        sendJson(res, { error: "routePath is required" }, 400);
        return;
      }
      const routeView = graph.routeViews.find((view) => view.path === parsed.routePath);
      if (!routeView) {
        sendJson(res, { error: `Route view not found: ${parsed.routePath}` }, 404);
        return;
      }
      try {
        sendJson(res, buildRouteExportCommand({
          atlasRoot: graph.atlasRoot,
          routePath: routeView.path
        }));
      } catch (error) {
        sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
      }
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
      host: DEV_SERVER_HOST,
      port: options.port,
      strictPort: true
    },
    appType: "spa"
  });

  await vite.listen(options.port);
  vite.printUrls();
  const openedGraph = graph as NormalizedGraph | null;
  console.log(openedGraph ? `Proof Atlas project: ${openedGraph.atlasRoot}` : "Proof Atlas launcher: no project open");
  return { vite, watcher };
}
