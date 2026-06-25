import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandInit } from "../src/cli/atlas";
import { buildGraph } from "../src/core/graph";
import { ProjectError, resolveAtlasProject } from "../src/core/project";
import {
  listRegistryProjects,
  registerResolvedProject,
  resolveProjectPathOrId,
  unregisterProject
} from "../src/core/registry";
import { writeYamlFile } from "../src/core/yaml";
import { startDevServer } from "../src/server/devServer";
import { baseClaim, tempDir, writeTestProject } from "./helpers";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe("project path resolver", () => {
  it("initializes workspace gitignore rules for local Proof Atlas files", async () => {
    const workspace = await tempDir("pa-init-gitignore-");
    await commandInit(workspace);
    await commandInit(workspace);

    const gitignore = await fs.readFile(path.join(workspace, ".gitignore"), "utf8");
    expect(gitignore).toContain("# Proof Atlas local files.");
    expect(gitignore.match(/ProofAtlas\/\.atlas\/local\.yml/g)).toHaveLength(1);
    expect(gitignore.match(/ProofAtlas\/\.atlas\/cache\//g)).toHaveLength(1);
    expect(gitignore.match(/ProofAtlas\/\.atlas\/exports\//g)).toHaveLength(1);
  });

  it("accepts either ProofAtlas/ or the containing workspace directory", async () => {
    const workspace = await tempDir("pa-paths-");
    const atlasRoot = await writeTestProject(workspace, [baseClaim()]);

    const direct = await resolveAtlasProject(atlasRoot);
    expect(direct.atlasRoot).toBe(atlasRoot);
    expect(direct.workspaceRoot).toBe(workspace);
    expect(direct.configPath).toBe(path.join(atlasRoot, "atlas.yml"));

    const nested = await resolveAtlasProject(workspace);
    expect(nested.atlasRoot).toBe(atlasRoot);
    expect(nested.workspaceRoot).toBe(workspace);
  });

  it("reports the two atlas.yml paths it tried", async () => {
    const workspace = await tempDir("pa-missing-");
    await expect(resolveAtlasProject(workspace)).rejects.toMatchObject({
      message: expect.stringContaining(path.join(workspace, "atlas.yml"))
    });
    await expect(resolveAtlasProject(workspace)).rejects.toMatchObject({
      message: expect.stringContaining(path.join(workspace, "ProofAtlas", "atlas.yml"))
    });
  });

  it("merges .atlas/local.yml only for workspace path fields", async () => {
    const workspace = await tempDir("pa-local-");
    const atlasRoot = await writeTestProject(workspace, [baseClaim()], {
      atlas: {
        workspace: {
          root: "..",
          tex_main: "../main.tex",
          bib: ["../references.bib"]
        }
      }
    });
    const externalWorkspace = path.join(workspace, "external paper");
    await fs.mkdir(externalWorkspace, { recursive: true });
    await writeYamlFile(path.join(atlasRoot, ".atlas", "local.yml"), {
      title: "Not allowed",
      workspace: {
        root: externalWorkspace,
        tex_main: "main.tex",
        bib: ["refs.bib"]
      }
    });

    const graph = await buildGraph(atlasRoot);
    expect(graph.workspace.root).toBe(externalWorkspace);
    expect(graph.workspace.texMain).toBe(path.join(externalWorkspace, "main.tex"));
    expect(graph.workspace.bib).toEqual([path.join(externalWorkspace, "refs.bib")]);
    expect(graph.config.title).toBe("Test Project");
    expect(graph.problems.map((item) => item.code)).toContain("invalid_local_override");
  });
});

describe("project registry", () => {
  it("deduplicates by atlas root and rejects duplicate live ids", async () => {
    const registryPath = path.join(await tempDir("pa-registry-"), "projects.yml");
    const workspaceA = await tempDir("pa-reg-a-");
    const workspaceB = await tempDir("pa-reg-b-");
    const atlasA = await writeTestProject(workspaceA, [baseClaim()], {
      atlas: { project: "same-id", title: "Project A" }
    });
    const atlasB = await writeTestProject(workspaceB, [baseClaim("main.claim.b", "obj_20260611_bbbb")], {
      atlas: { project: "same-id", title: "Project B" }
    });
    const resolvedA = await resolveAtlasProject(atlasA);
    const resolvedB = await resolveAtlasProject(atlasB);

    await registerResolvedProject(resolvedA, { project: "same-id", title: "Project A" }, { registryPath });
    await registerResolvedProject(resolvedA, { project: "same-id", title: "Project A updated" }, { registryPath });
    await expect(registerResolvedProject(resolvedB, { project: "same-id", title: "Project B" }, { registryPath }))
      .rejects.toThrow("registry_duplicate_project_id");

    const projects = await listRegistryProjects({ registryPath });
    expect(projects).toHaveLength(1);
    expect(projects.some((item) => item.id === "same-id" && item.title === "Project A updated")).toBe(true);

    expect(await unregisterProject("same-id", { registryPath })).toBe(true);
    expect(await listRegistryProjects({ registryPath })).toHaveLength(0);
  });

  it("marks missing registered projects without deleting them", async () => {
    const registryPath = path.join(await tempDir("pa-reg-missing-"), "projects.yml");
    const workspace = await tempDir("pa-reg-project-");
    const atlasRoot = await writeTestProject(workspace, [baseClaim()]);
    await registerResolvedProject(await resolveAtlasProject(atlasRoot), { project: "gone", title: "Gone" }, { registryPath });
    await fs.rm(atlasRoot, { recursive: true, force: true });

    const projects = await listRegistryProjects({ registryPath });
    expect(projects).toMatchObject([{ id: "gone", missing: true }]);
    await expect(resolveProjectPathOrId("gone", { registryPath })).rejects.toBeInstanceOf(ProjectError);
  });

  it("does not register projects opened through the web server", async () => {
    const workspace = await tempDir("pa-web-open-");
    const atlasRoot = await writeTestProject(workspace, [baseClaim()]);
    const home = await tempDir("pa-web-open-home-");
    const previousHome = process.env.PROOF_ATLAS_HOME;
    process.env.PROOF_ATLAS_HOME = home;

    const port = await freePort();
    const server = await startDevServer(undefined, { port });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: atlasRoot })
      });
      expect(response.ok).toBe(true);
      const data = await response.json() as { mode?: string; graph?: { root?: string } };
      expect(data).toMatchObject({ mode: "project", graph: { root: atlasRoot } });
      expect(await listRegistryProjects()).toEqual([]);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await server.watcher?.close();
      await server.vite.close();
      if (previousHome === undefined) {
        delete process.env.PROOF_ATLAS_HOME;
      } else {
        process.env.PROOF_ATLAS_HOME = previousHome;
      }
    }
  });

  it("copies export commands only for route views in the current web project", async () => {
    const workspace = await tempDir("pa-web-export-");
    const atlasRoot = await writeTestProject(workspace, [baseClaim()], {
      views: {
        "paper.md": "# Paper\n\n![[main.claim.a]]\n",
        "null route.route.yml": [
          `schema_version: "0.1"`,
          "uid: route_20260624_export",
          "type: route",
          "title: Null Route",
          "target: main.claim.a",
          "profile: proof",
          "proof_choices: {}",
          "boundaries: []",
          "representation: {}",
          ""
        ].join("\n")
      }
    });
    const port = await freePort();
    const server = await startDevServer(await resolveAtlasProject(atlasRoot), { port });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/export-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routePath: "views/null route.route.yml" })
      });
      expect(response.ok).toBe(true);
      const data = await response.json() as { command?: string; outputPath?: string; routePath?: string };
      expect(data.routePath).toBe("views/null route.route.yml");
      expect(data.outputPath).toBe(path.join(atlasRoot, ".atlas", "exports", "null route.context.md"));
      expect(data.command).toContain("cd \"$TOOL_ROOT\"");
      expect(data.command).toContain("npm run atlas -- export \"$ROUTE_FILE\" \"$ATLAS_ROOT\" --format markdown --output \"$OUT\"");
      expect(data.command).toContain("pbcopy < \"$OUT\"");
      expect(data.command).not.toContain("npm run atlas -- route");

      const invalid = await fetch(`http://127.0.0.1:${port}/api/export-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routePath: "views/missing.route.yml" })
      });
      expect(invalid.status).toBe(404);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await server.watcher?.close();
      await server.vite.close();
    }
  });
});
