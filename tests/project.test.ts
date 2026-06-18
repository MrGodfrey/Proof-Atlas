import fs from "node:fs/promises";
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
import { baseClaim, tempDir, writeTestProject } from "./helpers";

describe("project path resolver", () => {
  it("initializes workspace gitignore rules for local Proof Atlas files", async () => {
    const workspace = await tempDir("pa-init-gitignore-");
    await commandInit(workspace);
    await commandInit(workspace);

    const gitignore = await fs.readFile(path.join(workspace, ".gitignore"), "utf8");
    expect(gitignore).toContain("# Proof Atlas local files.");
    expect(gitignore.match(/ProofAtlas\/\.atlas\/local\.yml/g)).toHaveLength(1);
    expect(gitignore.match(/ProofAtlas\/\.atlas\/cache\//g)).toHaveLength(1);
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
  it("deduplicates by atlas root and disambiguates duplicate ids", async () => {
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
    const second = await registerResolvedProject(resolvedB, { project: "same-id", title: "Project B" }, { registryPath });

    const projects = await listRegistryProjects({ registryPath });
    expect(projects).toHaveLength(2);
    expect(projects.some((item) => item.id === "same-id" && item.title === "Project A updated")).toBe(true);
    expect(second.entry.id).toBe("same-id-2");
    expect(second.warning).toContain("same-id");

    await expect(resolveProjectPathOrId("same-id-2", { registryPath })).resolves.toMatchObject({
      atlasRoot: atlasB
    });
    expect(await unregisterProject("same-id", { registryPath })).toBe(true);
    expect(await listRegistryProjects({ registryPath })).toHaveLength(1);
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
});
